// V8 runtime — mutations for ZIP import job management
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel.d.ts";

// ─── Create a new ZIP import job ──────────────────────────────────────────────

export const createJob = mutation({
  args: {
    urls: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"zipImportJobs">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    if (user.role !== "admin") throw new ConvexError({ message: "Admin only", code: "FORBIDDEN" });

    const now = new Date().toISOString();
    return ctx.db.insert("zipImportJobs", {
      userId: user._id,
      urls: args.urls,
      currentUrlIndex: 0,
      currentFileIndex: 0,
      status: "running",
      totalFound: 0,
      imported: 0,
      duplicates: 0,
      notCv: 0,
      errors: 0,
      startedAt: now,
      updatedAt: now,
    });
  },
});

// ─── Pause / resume / stop ────────────────────────────────────────────────────

export const setStatus = mutation({
  args: {
    jobId: v.id("zipImportJobs"),
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("done"),
      v.literal("error")
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.db.patch(args.jobId, { status: args.status, updatedAt: new Date().toISOString() });
  },
});

// ─── Public: update progress (called from frontend during import loop) ────────

export const updateProgressPublic = mutation({
  args: {
    jobId: v.id("zipImportJobs"),
    currentUrlIndex: v.number(),
    currentFileIndex: v.number(),
    totalFound: v.number(),
    imported: v.number(),
    duplicates: v.number(),
    notCv: v.number(),
    errors: v.number(),
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("done"),
      v.literal("error"),
      v.literal("stopped")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.db.patch(args.jobId, {
      currentUrlIndex: args.currentUrlIndex,
      currentFileIndex: args.currentFileIndex,
      totalFound: args.totalFound,
      imported: args.imported,
      duplicates: args.duplicates,
      notCv: args.notCv,
      errors: args.errors,
      status: args.status,
      updatedAt: new Date().toISOString(),
      errorMessage: args.errorMessage,
    });
  },
});

// ─── Internal: update cursor + counters after each batch ─────────────────────

export const updateProgress = internalMutation({
  args: {
    jobId: v.id("zipImportJobs"),
    currentUrlIndex: v.number(),
    currentFileIndex: v.number(),
    totalFound: v.number(),
    imported: v.number(),
    duplicates: v.number(),
    notCv: v.number(),
    errors: v.number(),
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("done"),
      v.literal("error"),
      v.literal("stopped")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.jobId, {
      currentUrlIndex: args.currentUrlIndex,
      currentFileIndex: args.currentFileIndex,
      totalFound: args.totalFound,
      imported: args.imported,
      duplicates: args.duplicates,
      notCv: args.notCv,
      errors: args.errors,
      status: args.status,
      updatedAt: new Date().toISOString(),
      errorMessage: args.errorMessage,
    });
  },
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export const getJobInternal = internalQuery({
  args: { jobId: v.id("zipImportJobs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.jobId);
  },
});

export const getJob = query({
  args: { jobId: v.id("zipImportJobs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.jobId);
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
    return ctx.db
      .query("zipImportJobs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(20);
  },
});
