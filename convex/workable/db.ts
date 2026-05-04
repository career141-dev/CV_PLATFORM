// V8 runtime — mutations and queries for Workable import tracking
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

export const createImportJob = internalMutation({
  args: {
    userId: v.id("users"),
    totalCandidates: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("workableImports", {
      status: "running",
      totalCandidates: args.totalCandidates,
      imported: 0,
      skipped: 0,
      failed: 0,
      userId: args.userId,
      startedAt: new Date().toISOString(),
    });
  },
});

export const updateImportJob = internalMutation({
  args: {
    importId: v.id("workableImports"),
    imported: v.optional(v.number()),
    skipped: v.optional(v.number()),
    failed: v.optional(v.number()),
    totalCandidates: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("running"), v.literal("done"), v.literal("error"))
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { importId, ...rest } = args;
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(importId, patch);
  },
});

export const getImportJob = internalQuery({
  args: { importId: v.id("workableImports") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.importId);
  },
});

export const insertCv = internalMutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("cvs", {
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      status: "uploading",
      uploadedBy: args.userId,
    });
  },
});
