import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

const breakdownValidator = v.object({
  skills: v.number(),
  experience: v.number(),
  seniority: v.number(),
  industry: v.number(),
  location: v.number(),
});

const matchResultValidator = v.object({
  cvId: v.string(),
  overallScore: v.number(),
  breakdown: breakdownValidator,
  matchedSkills: v.array(v.string()),
  missingSkills: v.array(v.string()),
  reason: v.string(),
});

const interpretationValidator = v.object({
  searchText: v.string(),
  industry: v.optional(v.string()),
  seniority: v.optional(v.string()),
  minYears: v.optional(v.number()),
  interpretation: v.string(),
  keywords: v.array(v.string()),
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

const searchResultValidator = v.object({
  cvId: v.string(),
  score: v.number(),
  reason: v.string(),
});

export const saveSearch = mutation({
  args: {
    query: v.string(),
    type: v.union(v.literal("natural_language"), v.literal("job_description")),
    resultCount: v.number(),
    results: v.optional(v.array(searchResultValidator)),
    interpretation: v.optional(interpretationValidator),
    jobRequirements: v.optional(jobRequirementsValidator),
    matchResults: v.optional(v.array(matchResultValidator)),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Keep only last 20 searches per user — delete oldest if over limit
    const existing = await ctx.db
      .query("searchHistory")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    if (existing.length >= 20) {
      const toDelete = existing.slice(19);
      for (const old of toDelete) {
        await ctx.db.delete(old._id);
      }
    }

    await ctx.db.insert("searchHistory", {
      userId: user._id,
      query: args.query,
      type: args.type,
      resultCount: args.resultCount,
      results: args.results,
      interpretation: args.interpretation,
      jobRequirements: args.jobRequirements,
      matchResults: args.matchResults,
    });
  },
});

export const getSearchHistory = query({
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
      .query("searchHistory")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(20);
  },
});

export const deleteSearch = mutation({
  args: { searchId: v.id("searchHistory") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const record = await ctx.db.get(args.searchId);
    if (!record) throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || record.userId !== user._id) {
      throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    }

    await ctx.db.delete(args.searchId);
  },
});
