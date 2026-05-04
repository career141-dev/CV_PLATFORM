"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";

// Fix stale cvStats — recomputes counts from actual CV records
export const fixStats = action({
  args: {},
  handler: async (ctx): Promise<{ message: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const stats = await ctx.runMutation(internal.workable.cleanup.recomputeStatsSafe, {});
    return {
      message: `Stats updated: ${stats.ready} ready, ${stats.processing} processing, ${stats.errors} errors, ${stats.paused} paused.`,
    };
  },
});

// Run cleanup: delete non-ready CVs, clear import jobs, recompute stats
// Runs in multiple passes to avoid hitting limits
export const runCleanup = action({
  args: {},
  handler: async (ctx): Promise<{ message: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    // Run multiple passes to delete all non-ready CVs (50 at a time)
    let totalDeleted = 0;
    for (let i = 0; i < 400; i++) {
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

    // Recompute stats from scratch after cleanup
    await ctx.runMutation(internal.workable.cleanup.recomputeStatsSafe, {});

    return {
      message: `Deleted ${totalDeleted} non-ready CVs and ${importJobsDeleted} import jobs. Your processed CVs are intact.`,
    };
  },
});
