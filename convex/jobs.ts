import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";

async function getAuthUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

const matchResultValidator = v.object({
  cvId: v.string(),
  overallScore: v.number(),
  breakdown: v.object({
    skills: v.number(),
    experience: v.number(),
    seniority: v.number(),
    industry: v.number(),
    location: v.number(),
  }),
  matchedSkills: v.array(v.string()),
  missingSkills: v.array(v.string()),
  reason: v.string(),
});

const jobRequirementsValidator = v.object({
  title: v.string(),
  requiredSkills: v.array(v.string()),
  preferredSkills: v.array(v.string()),
  minYearsExperience: v.union(v.number(), v.null()),
  industry: v.union(v.string(), v.null()),
  seniority: v.union(v.string(), v.null()),
  location: v.union(v.string(), v.null()),
  education: v.union(v.string(), v.null()),
  summary: v.string(),
});

export const createJob = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    industry: v.optional(v.string()),
    seniority: v.optional(v.string()),
    location: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
    disqualifyThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    return await ctx.db.insert("jobs", {
      title: args.title,
      description: args.description,
      industry: args.industry,
      seniority: args.seniority,
      location: args.location,
      keywords: args.keywords,
      disqualifyThreshold: args.disqualifyThreshold,
      createdBy: user._id,
    });
  },
});

export const updateJob = mutation({
  args: {
    jobId: v.id("jobs"),
    title: v.string(),
    description: v.string(),
    industry: v.optional(v.string()),
    seniority: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { jobId, ...fields } = args;
    await ctx.db.patch(jobId, fields);
  },
});

export const deleteJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.db.delete(args.jobId);
  },
});

export const saveMatchResults = mutation({
  args: {
    jobId: v.id("jobs"),
    matchResults: v.array(matchResultValidator),
    jobRequirements: jobRequirementsValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      matchResults: args.matchResults,
      jobRequirements: args.jobRequirements,
      lastMatchedAt: new Date().toISOString(),
    });
  },
});

export const listJobs = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return [];
    return await ctx.db
      .query("jobs")
      .withIndex("by_created_by", (q) => q.eq("createdBy", user._id))
      .order("desc")
      .collect();
  },
});

export const getJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});
