import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel.d.ts";
import type { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel.d.ts";

const HARDCODED_ADMIN_EMAIL = "uzmaan@career141.com";

type Role = "admin" | "recruiter" | "viewer";
type AnyCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

// Helper: get the current user record from identity
async function getCurrentUserFromCtx(ctx: AnyCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

// Called by auth callback on every sign-in — upserts user and checks approval
export const updateCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "User not logged in" });
    }

    const email = identity.email ?? "";
    const isHardcodedAdmin = email.toLowerCase() === HARDCODED_ADMIN_EMAIL.toLowerCase();

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      // Hardcoded admin always stays approved + admin role
      if (isHardcodedAdmin && (existing.role !== "admin" || !existing.isApproved)) {
        await ctx.db.patch(existing._id, { role: "admin", isApproved: true });
      }
      return existing._id;
    }

    // New user — check approved list
    let role: Role = "viewer";
    let isApproved = false;

    if (isHardcodedAdmin) {
      role = "admin";
      isApproved = true;
    } else {
      const approval = await ctx.db
        .query("approvedEmails")
        .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
        .unique();
      if (approval) {
        role = approval.role;
        isApproved = true;
      }
    }

    return await ctx.db.insert("users", {
      name: identity.name,
      email,
      tokenIdentifier: identity.tokenIdentifier,
      role,
      isApproved,
    });
  },
});

// Reactive query — frontend watches this to detect revocation
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
  },
});

export const getUserByToken = query({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
  },
});

export const getUserByTokenInternal = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
  },
});

// ─── Admin: list all approved emails + joined users ──────────────────────────

export const listApprovedEmails = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user || user.role !== "admin") {
      throw new ConvexError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    return ctx.db.query("approvedEmails").collect();
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user || user.role !== "admin") {
      throw new ConvexError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    return ctx.db.query("users").collect();
  },
});

// ─── Admin: add an approved email ────────────────────────────────────────────

export const addApprovedEmail = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("recruiter"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user || user.role !== "admin") {
      throw new ConvexError({ code: "FORBIDDEN", message: "Admin access required" });
    }

    const email = args.email.toLowerCase().trim();

    const existing = await ctx.db
      .query("approvedEmails")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) {
      // Update role if already exists
      await ctx.db.patch(existing._id, { role: args.role });
      return existing._id;
    }

    const id = await ctx.db.insert("approvedEmails", {
      email,
      role: args.role,
      addedBy: user._id,
      addedAt: new Date().toISOString(),
    });

    // If the user has already signed in, update their record too
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existingUser) {
      await ctx.db.patch(existingUser._id, { role: args.role, isApproved: true });
    }

    return id;
  },
});

// ─── Admin: remove access ─────────────────────────────────────────────────────

export const removeApprovedEmail = mutation({
  args: { approvedEmailId: v.id("approvedEmails") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user || user.role !== "admin") {
      throw new ConvexError({ code: "FORBIDDEN", message: "Admin access required" });
    }

    const entry = await ctx.db.get(args.approvedEmailId);
    if (!entry) throw new ConvexError({ code: "NOT_FOUND", message: "Entry not found" });

    // Prevent removing the hardcoded admin
    if (entry.email.toLowerCase() === HARDCODED_ADMIN_EMAIL.toLowerCase()) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Cannot remove the primary admin" });
    }

    await ctx.db.delete(args.approvedEmailId);

    // Revoke access on the user record immediately (reactive sign-out)
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", entry.email))
      .unique();
    if (existingUser) {
      await ctx.db.patch(existingUser._id, { isApproved: false });
    }
  },
});

// ─── Admin: change a user's role ─────────────────────────────────────────────

export const updateUserRole = mutation({
  args: {
    approvedEmailId: v.id("approvedEmails"),
    role: v.union(v.literal("admin"), v.literal("recruiter"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromCtx(ctx);
    if (!user || user.role !== "admin") {
      throw new ConvexError({ code: "FORBIDDEN", message: "Admin access required" });
    }

    const entry = await ctx.db.get(args.approvedEmailId);
    if (!entry) throw new ConvexError({ code: "NOT_FOUND", message: "Entry not found" });

    await ctx.db.patch(args.approvedEmailId, { role: args.role });

    // Also update live user record
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", entry.email))
      .unique();
    if (existingUser) {
      await ctx.db.patch(existingUser._id, { role: args.role });
    }
  },
});

// Internal helpers used by other backend functions
export const getCurrentUserInternal = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args): Promise<{ _id: Id<"users">; role?: "admin" | "recruiter" | "viewer"; isApproved?: boolean; email?: string } | null> => {
    return ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
  },
});
