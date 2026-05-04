import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel.d.ts";

type CvStatus = Doc<"cvs">["status"];
type StatsField = "ready" | "processing" | "errors" | "paused";

function statusToField(status: CvStatus): StatsField {
  if (status === "ready") return "ready";
  if (status === "error") return "errors";
  if (status === "paused") return "paused";
  return "processing"; // uploading | processing
}

async function adjustStats(
  ctx: MutationCtx,
  oldStatus: CvStatus | null,
  newStatus: CvStatus
) {
  const stats = await ctx.db.query("cvStats").first();
  if (!stats) {
    // Bootstrap the stats document
    await ctx.db.insert("cvStats", { total: 1, ready: 0, processing: 1, errors: 0, paused: 0 });
    return;
  }

  const patch: Partial<{ total: number; ready: number; processing: number; errors: number; paused: number }> = {};

  if (oldStatus === null) {
    patch.total = stats.total + 1;
    const f = statusToField(newStatus);
    patch[f] = stats[f] + 1;
  } else {
    const oldF = statusToField(oldStatus);
    const newF = statusToField(newStatus);
    if (oldF !== newF) {
      patch[oldF] = Math.max(0, stats[oldF] - 1);
      patch[newF] = stats[newF] + 1;
    }
  }

  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(stats._id, patch);
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

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

    const cvId = await ctx.db.insert("cvs", {
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      status: "uploading",
      uploadedBy: user._id,
    });

    await adjustStats(ctx, null, "uploading");
    return cvId;
  },
});

export const updateCvStatus = mutation({
  args: {
    cvId: v.id("cvs"),
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error"),
      v.literal("paused")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cv = await ctx.db.get(args.cvId);
    const oldStatus = cv?.status ?? null;
    await ctx.db.patch(args.cvId, {
      status: args.status,
      errorMessage: args.errorMessage,
    });
    if (oldStatus) await adjustStats(ctx, oldStatus, args.status);
  },
});

export const getPausedCvs = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("cvs")
      .withIndex("by_status", (q) => q.eq("status", "paused"))
      .collect();
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
    const cv = await ctx.db.get(cvId);
    const oldStatus = cv?.status ?? null;
    await ctx.db.patch(cvId, { ...data, status: "ready" });
    if (oldStatus) await adjustStats(ctx, oldStatus, "ready");
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

    const q = ctx.db.query("cvs").order("desc");
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

    // O(1) read — stats are maintained by mutations
    const stats = await ctx.db.query("cvStats").first();
    if (!stats) return { total: 0, ready: 0, processing: 0, errors: 0, paused: 0 };
    return {
      total: stats.total,
      ready: stats.ready,
      processing: stats.processing,
      errors: stats.errors,
      paused: stats.paused,
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

    const textSearch = ctx.db
      .query("cvs")
      .withSearchIndex("search_text", (q) => {
        const s = q.search("rawText", args.query).eq("status", "ready");
        return s;
      });

    const textResults = await textSearch.take(limit);

    const summaryResults = await ctx.db
      .query("cvs")
      .withSearchIndex("search_summary", (q) =>
        q.search("summary", args.query).eq("status", "ready")
      )
      .take(limit);

    const seen = new Set<string>();
    const merged = [];
    for (const cv of [...textResults, ...summaryResults]) {
      if (!seen.has(cv._id)) {
        seen.add(cv._id);
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
    const oldStatus = cv.status;
    await ctx.storage.delete(cv.storageId);
    await ctx.db.delete(args.cvId);
    // Decrement stats
    const stats = await ctx.db.query("cvStats").first();
    if (stats) {
      const f = statusToField(oldStatus);
      await ctx.db.patch(stats._id, {
        total: Math.max(0, stats.total - 1),
        [f]: Math.max(0, stats[f] - 1),
      });
    }
  },
});
