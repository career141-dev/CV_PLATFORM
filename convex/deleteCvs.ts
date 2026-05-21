import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError } from "convex/values";

export const deleteLastN = action({
  args: { n: v.number() },
  handler: async (ctx, args): Promise<{ deleted: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let totalDeleted = 0;
    let cursor: string | undefined = undefined;
    let done = false;

    while (!done && totalDeleted < args.n) {
      const result: { deleted: number; continueCursor: string | null; isDone: boolean } = await ctx.runMutation(internal.deleteCvs.deleteBatch, {
        cursor,
        maxItems: Math.min(200, args.n - totalDeleted),
      });
      totalDeleted += result.deleted;
      cursor = result.continueCursor ?? undefined;
      done = result.isDone;

      if (result.deleted === 0) break;
    }

    return { deleted: totalDeleted };
  },
});

export const deleteBatch = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    maxItems: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("cvs")
      .order("desc")
      .paginate({ numItems: args.maxItems, cursor: args.cursor ?? null });

    for (const cv of page.page) {
      if (cv.storageId) {
        try { await ctx.storage.delete(cv.storageId); } catch { /* skip */ }
      }
      await ctx.db.delete(cv._id);
    }

    return {
      deleted: page.page.length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
