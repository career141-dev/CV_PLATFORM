import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.storage.generateUploadUrl();
  },
});

export const createCv = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    return await ctx.db.insert("cvs", {
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      status: "uploading",
      uploadedBy: user._id,
    });
  },
});

export const updateCvStatus = mutation({
  args: {
    cvId: v.id("cvs"),
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.cvId, {
      status: args.status,
      errorMessage: args.errorMessage,
    });
  },
});

export const saveCvData = mutation({
  args: {
    cvId: v.id("cvs"),
    rawText: v.string(),
    candidateName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    currentTitle: v.optional(v.string()),
    industry: v.optional(v.string()),
    sector: v.optional(v.string()),
    seniority: v.optional(v.string()),
    yearsOfExperience: v.optional(v.number()),
    skills: v.optional(v.array(v.string())),
    languages: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { cvId, ...data } = args;
    await ctx.db.patch(cvId, { ...data, status: "ready" });
  },
});

export const listCvs = query({
  args: {
    paginationOpts: v.object({ numItems: v.number(), cursor: v.union(v.string(), v.null()) }),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: null };

    let q = ctx.db.query("cvs").order("desc");
    return await q.paginate(args.paginationOpts);
  },
});

export const getCv = query({
  args: { cvId: v.id("cvs") },
  handler: async (ctx, args) => {
    const cv = await ctx.db.get(args.cvId);
    if (!cv) return null;
    const url = await ctx.storage.getUrl(cv.storageId);
    return { ...cv, fileUrl: url };
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const all = await ctx.db.query("cvs").collect();
    const ready = all.filter((c) => c.status === "ready");
    const processing = all.filter((c) => c.status === "processing" || c.status === "uploading");
    const errors = all.filter((c) => c.status === "error");

    return {
      total: all.length,
      ready: ready.length,
      processing: processing.length,
      errors: errors.length,
    };
  },
});

export const searchCvs = query({
  args: {
    query: v.string(),
    industry: v.optional(v.string()),
    seniority: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    if (!args.query.trim()) return [];

    const limit = args.limit ?? 20;

    // Search across raw text
    let textSearch = ctx.db
      .query("cvs")
      .withSearchIndex("search_text", (q) => {
        let s = q.search("rawText", args.query).eq("status", "ready");
        return s;
      });

    const textResults = await textSearch.take(limit);

    // Also search summary
    const summaryResults = await ctx.db
      .query("cvs")
      .withSearchIndex("search_summary", (q) =>
        q.search("summary", args.query).eq("status", "ready")
      )
      .take(limit);

    // Merge and deduplicate
    const seen = new Set<string>();
    const merged = [];
    for (const cv of [...textResults, ...summaryResults]) {
      if (!seen.has(cv._id)) {
        seen.add(cv._id);
        // Apply filters
        if (args.industry && cv.industry !== args.industry) continue;
        if (args.seniority && cv.seniority !== args.seniority) continue;
        merged.push(cv);
      }
    }

    return merged.slice(0, limit);
  },
});

export const deleteCv = mutation({
  args: { cvId: v.id("cvs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const cv = await ctx.db.get(args.cvId);
    if (!cv) throw new ConvexError({ message: "CV not found", code: "NOT_FOUND" });
    await ctx.storage.delete(cv.storageId);
    await ctx.db.delete(args.cvId);
  },
});
