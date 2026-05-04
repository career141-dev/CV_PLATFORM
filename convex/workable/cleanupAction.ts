"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";

// Run cleanup: delete non-ready CVs, clear import jobs, recompute stats
// Runs in multiple passes to avoid hitting limits
export const runCleanup = action({
  args: {},
  handler: async (ctx): Promise<{ message: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    // Run multiple passes to delete all non-ready CVs (100 at a time)
    let totalDeleted = 0;
    for (let i = 0; i < 200; i++) {
      const result = await ctx.runMutation(internal.workable.cleanup.deleteNonReadyCvsBatch, {});
      totalDeleted += result.deleted;
      if (result.deleted === 0) break;
    }

    // Delete all import jobs
    let importJobsDeleted = 0;
    for (let i = 0; i < 10; i++) {
      const result = await ctx.runMutation(internal.workable.cleanup.deleteAllImportJobs, {});
      importJobsDeleted += result.deleted;
      if (result.deleted === 0) break;
    }

    // Recompute stats
    const stats = await ctx.runMutation(internal.workable.cleanup.recomputeStats, {});

    return {
      message: `Deleted ${totalDeleted} non-ready CVs, ${importJobsDeleted} import jobs. Stats: ${stats.ready} ready CVs remaining.`,
    };
  },
});
