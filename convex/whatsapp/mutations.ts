// V8 runtime — WhatsApp DB mutations and queries
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";

export const getApplicationByWaId = internalQuery({
  args: { waId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("whatsappApplications")
      .withIndex("by_wa_id", (q) => q.eq("waId", args.waId))
      .first();
  },
});

export const createApplication = internalMutation({
  args: {
    waId: v.string(),
    from: v.string(),
    messageText: v.optional(v.string()),
    status: v.union(
      v.literal("received"),
      v.literal("no_cv"),
      v.literal("no_job_match"),
      v.literal("scored"),
      v.literal("disqualified"),
      v.literal("error")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("whatsappApplications", {
      ...args,
      receivedAt: new Date().toISOString(),
    });
  },
});

export const updateApplication = internalMutation({
  args: {
    appId: v.id("whatsappApplications"),
    jobId: v.optional(v.id("jobs")),
    cvId: v.optional(v.id("cvs")),
    score: v.optional(v.number()),
    status: v.union(
      v.literal("received"),
      v.literal("no_cv"),
      v.literal("no_job_match"),
      v.literal("scored"),
      v.literal("disqualified"),
      v.literal("error")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { appId, ...fields } = args;
    await ctx.db.patch(appId, fields);
  },
});

export const getAllJobs = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("jobs").collect();
  },
});

export const getSystemUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").first();
  },
});

export const addCvToPipeline = internalMutation({
  args: { jobId: v.id("jobs"), cvId: v.id("cvs"), stage: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pipeline")
      .withIndex("by_job_and_cv", (q) =>
        q.eq("jobId", args.jobId).eq("cvId", args.cvId)
      )
      .first();
    if (existing) return;
    await ctx.db.insert("pipeline", {
      jobId: args.jobId,
      cvId: args.cvId,
      stage: args.stage as "new" | "shortlisted" | "interview" | "offered" | "hired" | "rejected",
      movedAt: new Date().toISOString(),
    });
  },
});

export const insertCv = internalMutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    rawText: v.optional(v.string()),
    uploadedBy: v.id("users"),
  },
  handler: async (ctx, args): Promise<Id<"cvs">> => {
    return await ctx.db.insert("cvs", {
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      rawText: args.rawText,
      status: args.rawText && args.rawText.length > 10 ? "ready" : "processing",
      uploadedBy: args.uploadedBy,
    });
  },
});
