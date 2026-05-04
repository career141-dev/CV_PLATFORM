// V8 runtime — cleanup mutations for non-ready CVs and import history
import { internalMutation } from "../_generated/server";

// Delete all non-ready CVs (processing, paused, error, uploading) in batches of 50.
// Also removes workableCandidateLookup entries and updates cvStats incrementally —
// avoids .collect() on large tables which would exceed Convex scan limits.
export const deleteNonReadyCvsBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const statuses = ["processing", "paused", "error", "uploading"] as const;
    let deleted = 0;
    let processingDeleted = 0;
    let errorDeleted = 0;
    let pausedDeleted = 0;

    for (const status of statuses) {
      const cvs = await ctx.db
        .query("cvs")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(50);

      for (const cv of cvs) {
        // Remove lookup entry if present
        if (cv.workableCandidateId) {
          const lookup = await ctx.db
            .query("workableCandidateLookup")
            .withIndex("by_workable_candidate_id", (q) =>
              q.eq("workableCandidateId", cv.workableCandidateId!)
            )
            .first();
          if (lookup) await ctx.db.delete(lookup._id);
        }

        await ctx.db.delete(cv._id);
        deleted++;
        if (status === "processing") processingDeleted++;
        else if (status === "error") errorDeleted++;
        else if (status === "paused") pausedDeleted++;
      }
    }

    // Update cvStats incrementally — no full table scan needed
    if (deleted > 0) {
      const stats = await ctx.db.query("cvStats").first();
      if (stats) {
        await ctx.db.patch(stats._id, {
          total: Math.max(0, stats.total - deleted),
          processing: Math.max(0, stats.processing - processingDeleted),
          errors: Math.max(0, stats.errors - errorDeleted),
          paused: Math.max(0, stats.paused - pausedDeleted),
        });
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
