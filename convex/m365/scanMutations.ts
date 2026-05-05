// V8 runtime — internal mutation for creating CV records from m365 import
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel.d.ts";

export const createCvRecord = internalMutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    tokenIdentifier: v.string(),
    fileHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"cvs">> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Update stats
    const stats = await ctx.db.query("cvStats").first();
    if (stats) {
      await ctx.db.patch(stats._id, {
        total: (stats.total ?? 0) + 1,
      });
    }

    return ctx.db.insert("cvs", {
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      status: "uploading",
      uploadedBy: user._id,
      fileHash: args.fileHash,
    });
  },
});

export const findByFileHash = internalMutation({
  args: { fileHash: v.string() },
  handler: async (ctx, args): Promise<Id<"cvs"> | null> => {
    const existing = await ctx.db
      .query("cvs")
      .withIndex("by_file_hash", (q) => q.eq("fileHash", args.fileHash))
      .first();
    return existing?._id ?? null;
  },
});
