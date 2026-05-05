"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel.d.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMsConfig() {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const redirectUri = process.env.MS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ConvexError({
      message: "Microsoft OAuth credentials are not configured. Please add MS_CLIENT_ID, MS_CLIENT_SECRET, and MS_REDIRECT_URI to your secrets.",
      code: "BAD_REQUEST",
    });
  }
  return { clientId, clientSecret, redirectUri };
}

// ─── Get OAuth URL ────────────────────────────────────────────────────────────

export const getOAuthUrl = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.runQuery(internal.users.getUserByTokenInternal, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const { clientId, redirectUri } = getMsConfig();

    // Generate a random state token and store it in DB
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min TTL

    await ctx.runMutation(internal.m365.db.createOAuthState, {
      state,
      userId: user._id,
      expiresAt,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: "offline_access Mail.Read User.Read Sites.Read.All Files.Read.All",
      state,
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  },
});

// ─── Exchange code for tokens ─────────────────────────────────────────────────

export const exchangeCode = action({
  args: { code: v.string(), state: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; email?: string; error?: string }> => {
    const { clientId, clientSecret, redirectUri } = getMsConfig();

    // Validate state
    const oauthState = await ctx.runQuery(internal.m365.db.getOAuthState, { state: args.state });
    if (!oauthState) {
      return { ok: false, error: "Invalid or expired OAuth state. Please try connecting again." };
    }
    if (new Date(oauthState.expiresAt) < new Date()) {
      return { ok: false, error: "OAuth session expired. Please try connecting again." };
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: args.code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return { ok: false, error: `Token exchange failed: ${err.slice(0, 200)}` };
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      id_token?: string;
    };

    // Get user profile from Graph
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (await profileRes.json()) as { mail?: string; userPrincipalName?: string; displayName?: string; id?: string };
    const email = profile.mail ?? profile.userPrincipalName ?? "";

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await ctx.runMutation(internal.m365.db.upsertAccount, {
      userId: oauthState.userId,
      email,
      displayName: profile.displayName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      tenantId: profile.id,
    });

    // Clean up state
    await ctx.runMutation(internal.m365.db.deleteOAuthState, { state: args.state });

    return { ok: true, email };
  },
});

// ─── List connected accounts ──────────────────────────────────────────────────

export const listAccounts = action({
  args: {},
  handler: async (ctx): Promise<Array<{ _id: Id<"m365Accounts">; email: string; displayName?: string; expiresAt: string }>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.runQuery(internal.users.getUserByTokenInternal, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) return [];

    const accounts = await ctx.runQuery(internal.m365.db.getAccountsByUser, { userId: user._id });
    return accounts.map((a) => ({
      _id: a._id,
      email: a.email,
      displayName: a.displayName,
      expiresAt: a.expiresAt,
    }));
  },
});

// ─── Remove connected account ─────────────────────────────────────────────────

export const removeAccount = action({
  args: { accountId: v.id("m365Accounts") },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.runMutation(internal.m365.db.deleteAccount, { accountId: args.accountId });
  },
});

// ─── Graph API helper ─────────────────────────────────────────────────────────

async function graphGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// Refresh token if expired
type M365Account = { _id: Id<"m365Accounts">; accessToken: string; refreshToken: string; expiresAt: string } | null;

async function getValidToken(ctx: ActionCtx, accountId: Id<"m365Accounts">): Promise<string> {
  const account = await ctx.runQuery(internal.m365.db.getAccountById, { accountId }) as M365Account;
  if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });

  // If token still valid (>5 min remaining), return as-is
  if (new Date(account.expiresAt).getTime() - Date.now() > 5 * 60 * 1000) {
    return account.accessToken;
  }

  // Refresh
  const { clientId, clientSecret } = getMsConfig();
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
      scope: "offline_access Mail.Read User.Read Sites.Read.All Files.Read.All",
    }),
  });
  if (!res.ok) throw new ConvexError({ message: "Failed to refresh token. Please reconnect your account.", code: "BAD_REQUEST" });
  const tokens = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await ctx.runMutation(internal.m365.db.updateTokens, {
    accountId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  });
  return tokens.access_token;
}

// ─── List mail folders ────────────────────────────────────────────────────────

type MailFolder = { id: string; displayName: string; childFolderCount: number; totalItemCount: number };

export const listMailFolders = action({
  args: {
    accountId: v.id("m365Accounts"),
    sharedMailbox: v.optional(v.string()),
    parentFolderId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Array<MailFolder>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const token = await getValidToken(ctx, args.accountId);
    const base = args.sharedMailbox
      ? `/users/${encodeURIComponent(args.sharedMailbox)}`
      : "/me";
    const path = args.parentFolderId
      ? `${base}/mailFolders/${args.parentFolderId}/childFolders?$top=50&$select=id,displayName,childFolderCount,totalItemCount`
      : `${base}/mailFolders?$top=50&$select=id,displayName,childFolderCount,totalItemCount`;

    const data = await graphGet<{ value: MailFolder[] }>(token, path);
    return data.value ?? [];
  },
});

// ─── List SharePoint sites ────────────────────────────────────────────────────

type SharePointSite = { id: string; displayName: string; name: string; webUrl: string };

export const listSharePointSites = action({
  args: { accountId: v.id("m365Accounts") },
  handler: async (ctx, args): Promise<Array<SharePointSite>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const token = await getValidToken(ctx, args.accountId);
    const data = await graphGet<{ value: SharePointSite[] }>(
      token,
      "/sites?search=*&$select=id,displayName,name,webUrl&$top=50"
    );
    return data.value ?? [];
  },
});

// ─── List SharePoint drives (document libraries) ──────────────────────────────

type SpDrive = { id: string; name: string; driveType: string };

export const listSharePointDrives = action({
  args: { accountId: v.id("m365Accounts"), siteId: v.string() },
  handler: async (ctx, args): Promise<Array<SpDrive>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const token = await getValidToken(ctx, args.accountId);
    const data = await graphGet<{ value: SpDrive[] }>(
      token,
      `/sites/${args.siteId}/drives?$select=id,name,driveType`
    );
    return data.value ?? [];
  },
});

// ─── List SharePoint folder children ─────────────────────────────────────────

type DriveItem = {
  id: string;
  name: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  size?: number;
};

export const listSharePointFolder = action({
  args: {
    accountId: v.id("m365Accounts"),
    siteId: v.string(),
    driveId: v.string(),
    itemId: v.optional(v.string()), // undefined = root
  },
  handler: async (ctx, args): Promise<Array<DriveItem>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const token = await getValidToken(ctx, args.accountId);
    const base = `/sites/${args.siteId}/drives/${args.driveId}`;
    const path = args.itemId
      ? `${base}/items/${args.itemId}/children?$top=100&$select=id,name,folder,file,size`
      : `${base}/root/children?$top=100&$select=id,name,folder,file,size`;

    const data = await graphGet<{ value: DriveItem[] }>(token, path);
    return data.value ?? [];
  },
});
