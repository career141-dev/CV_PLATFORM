// V8 runtime — cleanup mutations for non-ready CVs and import history
import { internalMutation } from "../_generated/server";

// Delete all non-ready CVs (processing, paused, error) in batches
// Also deletes their workableCandidateLookup entries
export const deleteNonReadyCvsBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const statuses = ["processing", "paused", "error", "uploading"] as const;
    let deleted = 0;

    for (const status of statuses) {
      const cvs = await ctx.db
        .query("cvs")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(100);

      for (const cv of cvs) {
        // Remove lookup entry if exists
        const lookup = await ctx.db
          .query("workableCandidateLookup")
          .withIndex("by_workable_candidate_id", (q) =>
            q.eq("workableCandidateId", cv.workableCandidateId ?? "")
          )
          .first();
        if (lookup) await ctx.db.delete(lookup._id);

        await ctx.db.delete(cv._id);
        deleted++;
      }
    }

    return { deleted };
  },
});

// Delete all workableImports records
export const deleteAllImportJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("workableImports").take(100);
    for (const job of jobs) {
      await ctx.db.delete(job._id);
    }
    return { deleted: jobs.length };
  },
});

// Recompute cvStats from scratch based on actual CV records
export const recomputeStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ready = await ctx.db.query("cvs").withIndex("by_status", (q) => q.eq("status", "ready")).collect();
    const processing = await ctx.db.query("cvs").withIndex("by_status", (q) => q.eq("status", "processing")).collect();
    const errors = await ctx.db.query("cvs").withIndex("by_status", (q) => q.eq("status", "error")).collect();
    const paused = await ctx.db.query("cvs").withIndex("by_status", (q) => q.eq("status", "paused")).collect();

    const total = ready.length + processing.length + errors.length + paused.length;

    const existing = await ctx.db.query("cvStats").first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        total,
        ready: ready.length,
        processing: processing.length,
        errors: errors.length,
        paused: paused.length,
      });
    } else {
      await ctx.db.insert("cvStats", {
        total,
        ready: ready.length,
        processing: processing.length,
        errors: errors.length,
        paused: paused.length,
      });
    }

    return { total, ready: ready.length, processing: processing.length, errors: errors.length, paused: paused.length };
  },
});
