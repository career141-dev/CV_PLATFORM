import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";

const STAGES = ["new", "shortlisted", "interview", "offered", "hired", "rejected"] as const;
type Stage = typeof STAGES[number];

const stageValidator = v.union(
  v.literal("new"),
  v.literal("shortlisted"),
  v.literal("interview"),
  v.literal("offered"),
  v.literal("hired"),
  v.literal("rejected")
);

export const setPipelineStage = mutation({
  args: {
    jobId: v.id("jobs"),
    cvId: v.id("cvs"),
    stage: stageValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    // Upsert — update existing entry or insert new one
    const existing = await ctx.db
      .query("pipeline")
      .withIndex("by_job_and_cv", (q) => q.eq("jobId", args.jobId).eq("cvId", args.cvId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        stage: args.stage,
        notes: args.notes ?? existing.notes,
        movedAt: new Date().toISOString(),
      });
    } else {
      await ctx.db.insert("pipeline", {
        jobId: args.jobId,
        cvId: args.cvId,
        stage: args.stage,
        notes: args.notes,
        movedAt: new Date().toISOString(),
      });
    }
  },
});

export const getPipelineForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("pipeline")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});

export const removePipelineEntry = mutation({
  args: { jobId: v.id("jobs"), cvId: v.id("cvs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const existing = await ctx.db
      .query("pipeline")
      .withIndex("by_job_and_cv", (q) => q.eq("jobId", args.jobId).eq("cvId", args.cvId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
