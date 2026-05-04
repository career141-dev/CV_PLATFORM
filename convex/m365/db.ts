// V8 runtime — DB helpers for M365 accounts
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// ─── OAuth State ──────────────────────────────────────────────────────────────

export const createOAuthState = internalMutation({
  args: { state: v.string(), userId: v.id("users"), expiresAt: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("oauthStates", args);
  },
});

export const getOAuthState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
  },
});

export const deleteOAuthState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});

// ─── Accounts ─────────────────────────────────────────────────────────────────

export const upsertAccount = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    displayName: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.string(),
    tenantId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("m365Accounts")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        displayName: args.displayName,
        tenantId: args.tenantId,
      });
      return existing._id;
    }
    return await ctx.db.insert("m365Accounts", args);
  },
});

export const getAccountsByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("m365Accounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const getAccountById = internalQuery({
  args: { accountId: v.id("m365Accounts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.accountId);
  },
});

export const deleteAccount = internalMutation({
  args: { accountId: v.id("m365Accounts") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.accountId);
  },
});

export const updateTokens = internalMutation({
  args: {
    accountId: v.id("m365Accounts"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
    });
  },
});
