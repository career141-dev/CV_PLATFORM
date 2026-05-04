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

// Delete ALL CVs (regardless of status) in batches of 50, plus their lookups
export const deleteAllCvsBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cvs = await ctx.db.query("cvs").take(50);
    for (const cv of cvs) {
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
    }
    return { deleted: cvs.length };
  },
});

// Reset cvStats to zero
export const resetStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stats = await ctx.db.query("cvStats").first();
    if (stats) {
      await ctx.db.patch(stats._id, { total: 0, ready: 0, processing: 0, errors: 0, paused: 0 });
    }
  },
});

// Safely recompute cvStats by counting CVs per status in small batches.
// Uses take(500) per pass to stay well under Convex scan limits.
export const recomputeStatsSafe = internalMutation({
  args: {},
  handler: async (ctx) => {
    let ready = 0, processing = 0, errors = 0, paused = 0;
    const statuses = ["ready", "processing", "error", "paused"] as const;

    for (const status of statuses) {
      // Count using repeated take() passes to avoid scan limits
      let cursor: string | null = null;
      let done = false;
      while (!done) {
        const page = await ctx.db
          .query("cvs")
          .withIndex("by_status", (q) => q.eq("status", status))
          .paginate({ numItems: 500, cursor });
        if (status === "ready") ready += page.page.length;
        else if (status === "processing") processing += page.page.length;
        else if (status === "error") errors += page.page.length;
        else if (status === "paused") paused += page.page.length;
        cursor = page.continueCursor;
        done = page.isDone;
      }
    }

    const total = ready + processing + errors + paused;
    const existing = await ctx.db.query("cvStats").first();
    if (existing) {
      await ctx.db.patch(existing._id, { total, ready, processing, errors, paused });
    } else {
      await ctx.db.insert("cvStats", { total, ready, processing, errors, paused });
    }
    return { total, ready, processing, errors, paused };
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
