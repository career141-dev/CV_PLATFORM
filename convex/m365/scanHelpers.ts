"use node";

// Internal helper actions for m365 scanning
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel.d.ts";
import type { ActionCtx } from "../_generated/server";

type M365Account = {
  _id: Id<"m365Accounts">;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
} | null;

function getMsConfig() {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const redirectUri = process.env.MS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ConvexError({
      message: "Microsoft OAuth credentials are not configured.",
      code: "BAD_REQUEST",
    });
  }
  return { clientId, clientSecret, redirectUri };
}

async function refreshToken(ctx: ActionCtx, account: NonNullable<M365Account>): Promise<string> {
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
    accountId: account._id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  });
  return tokens.access_token;
}

export const getToken = internalAction({
  args: { accountId: v.id("m365Accounts") },
  handler: async (ctx, args): Promise<string> => {
    const account = await ctx.runQuery(internal.m365.db.getAccountById, { accountId: args.accountId }) as M365Account;
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });
    if (new Date(account.expiresAt).getTime() - Date.now() > 5 * 60 * 1000) {
      return account.accessToken;
    }
    return refreshToken(ctx, account);
  },
});
