"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel.d.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FoundFile = {
  id: string; // unique key: driveItemId or attachmentId
  name: string;
  size: number;
  source: "sharepoint" | "email";
  // SharePoint fields
  driveId?: string;
  siteId?: string;
  itemId?: string;
  // Email fields
  messageId?: string;
  attachmentId?: string;
  folderPath?: string;
  emailSubject?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DriveItem = {
  id: string;
  name: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  size?: number;
};

const CV_EXTENSIONS = [".pdf", ".doc", ".docx"];
const CV_MIMETYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function isCvFile(name: string, mimeType?: string): boolean {
  const lower = name.toLowerCase();
  if (CV_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (mimeType && CV_MIMETYPES.includes(mimeType)) return true;
  return false;
}

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

async function graphGetBytes(accessToken: string, path: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph download error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}

// ─── Recursive SharePoint folder scanner ─────────────────────────────────────

async function scanSpFolderRecursive(
  token: string,
  siteId: string,
  driveId: string,
  itemId: string | null,
  pathLabel: string,
  results: FoundFile[],
  depth: number
): Promise<void> {
  if (depth > 8) return; // safety limit

  const base = `/sites/${siteId}/drives/${driveId}`;
  const childrenPath = itemId
    ? `${base}/items/${itemId}/children?$top=200&$select=id,name,folder,file,size`
    : `${base}/root/children?$top=200&$select=id,name,folder,file,size`;

  const data = await graphGet<{ value: DriveItem[] }>(token, childrenPath);
  const items = data.value ?? [];

  for (const item of items) {
    if (item.folder) {
      await scanSpFolderRecursive(
        token, siteId, driveId, item.id,
        `${pathLabel}/${item.name}`, results, depth + 1
      );
    } else if (item.file && isCvFile(item.name, item.file.mimeType)) {
      results.push({
        id: `sp-${item.id}`,
        name: item.name,
        size: item.size ?? 0,
        source: "sharepoint",
        driveId,
        siteId,
        itemId: item.id,
        folderPath: pathLabel,
      });
    }
  }
}

// ─── Recursive mail folder scanner ───────────────────────────────────────────

type MailMessage = {
  id: string;
  subject?: string;
  hasAttachments: boolean;
};

type MailAttachment = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  isInline: boolean;
};

async function scanMailFolderRecursive(
  token: string,
  mailboxBase: string, // "/me" or "/users/email"
  folderId: string,
  folderName: string,
  results: FoundFile[],
  depth: number
): Promise<void> {
  if (depth > 6) return;

  // Scan messages in this folder that have attachments
  let nextLink: string | null =
    `${mailboxBase}/mailFolders/${folderId}/messages?$filter=hasAttachments eq true&$select=id,subject,hasAttachments&$top=50`;

  while (nextLink) {
    const raw = nextLink.startsWith("https://")
      ? nextLink
      : `https://graph.microsoft.com/v1.0${nextLink}`;
    const res = await fetch(raw, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const data = (await res.json()) as { value: MailMessage[]; "@odata.nextLink"?: string };
    const messages = data.value ?? [];

    for (const msg of messages) {
      if (!msg.hasAttachments) continue;
      // List attachments for this message
      try {
        const attData = await graphGet<{ value: MailAttachment[] }>(
          token,
          `${mailboxBase}/messages/${msg.id}/attachments?$select=id,name,size,contentType,isInline`
        );
        for (const att of attData.value ?? []) {
          if (!att.isInline && isCvFile(att.name, att.contentType)) {
            results.push({
              id: `mail-${att.id}`,
              name: att.name,
              size: att.size,
              source: "email",
              messageId: msg.id,
              attachmentId: att.id,
              folderPath: folderName,
              emailSubject: msg.subject ?? "(no subject)",
            });
          }
        }
      } catch {
        // Skip messages we can't read attachments from
      }
    }
    nextLink = data["@odata.nextLink"] ?? null;
  }

  // Recurse into child folders
  try {
    const childData = await graphGet<{ value: Array<{ id: string; displayName: string }> }>(
      token,
      `${mailboxBase}/mailFolders/${folderId}/childFolders?$top=50&$select=id,displayName`
    );
    for (const child of childData.value ?? []) {
      await scanMailFolderRecursive(
        token, mailboxBase, child.id,
        `${folderName}/${child.displayName}`, results, depth + 1
      );
    }
  } catch {
    // Skip if we can't list child folders
  }
}

// ─── Scan SharePoint action ───────────────────────────────────────────────────

export const scanSharePointFolder = action({
  args: {
    accountId: v.id("m365Accounts"),
    siteId: v.string(),
    driveId: v.string(),
    itemId: v.optional(v.string()),
    folderName: v.string(),
  },
  handler: async (ctx, args): Promise<FoundFile[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const token = await ctx.runAction(internal.m365.scanHelpers.getToken, { accountId: args.accountId });
    const results: FoundFile[] = [];
    await scanSpFolderRecursive(
      token, args.siteId, args.driveId,
      args.itemId ?? null, args.folderName, results, 0
    );
    return results;
  },
});

// ─── Scan mail folder action ──────────────────────────────────────────────────

export const scanMailFolder = action({
  args: {
    accountId: v.id("m365Accounts"),
    folderId: v.string(),
    folderName: v.string(),
    sharedMailbox: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<FoundFile[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const token = await ctx.runAction(internal.m365.scanHelpers.getToken, { accountId: args.accountId });
    const mailboxBase = args.sharedMailbox
      ? `/users/${encodeURIComponent(args.sharedMailbox)}`
      : "/me";
    const results: FoundFile[] = [];
    await scanMailFolderRecursive(token, mailboxBase, args.folderId, args.folderName, results, 0);
    return results;
  },
});

// ─── Import a SharePoint file as CV ──────────────────────────────────────────

export const importSharePointFile = action({
  args: {
    accountId: v.id("m365Accounts"),
    siteId: v.string(),
    driveId: v.string(),
    itemId: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args): Promise<{ cvId: Id<"cvs"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const token = await ctx.runAction(internal.m365.scanHelpers.getToken, { accountId: args.accountId });

    // Download file bytes
    const buffer = await graphGetBytes(
      token,
      `/sites/${args.siteId}/drives/${args.driveId}/items/${args.itemId}/content`
    );

    return ctx.runAction(internal.m365.scan.storeAndProcess, {
      buffer: buffer,
      fileName: args.fileName,
      tokenIdentifier: identity.tokenIdentifier,
    });
  },
});

// ─── Import an email attachment as CV ────────────────────────────────────────

export const importMailAttachment = action({
  args: {
    accountId: v.id("m365Accounts"),
    messageId: v.string(),
    attachmentId: v.string(),
    fileName: v.string(),
    sharedMailbox: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ cvId: Id<"cvs"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const token = await ctx.runAction(internal.m365.scanHelpers.getToken, { accountId: args.accountId });
    const mailboxBase = args.sharedMailbox
      ? `/users/${encodeURIComponent(args.sharedMailbox)}`
      : "/me";

    // Download attachment bytes via $value endpoint
    const res = await fetch(
      `https://graph.microsoft.com/v1.0${mailboxBase}/messages/${args.messageId}/attachments/${args.attachmentId}/$value`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Failed to download attachment: ${res.status}`);
    const buffer = await res.arrayBuffer();

    return ctx.runAction(internal.m365.scan.storeAndProcess, {
      buffer: new Uint8Array(buffer).buffer,
      fileName: args.fileName,
      tokenIdentifier: identity.tokenIdentifier,
    });
  },
});

// ─── Internal: store bytes in Convex storage and kick off CV processing ───────

export const storeAndProcess = internalAction({
  args: {
    buffer: v.bytes(),
    fileName: v.string(),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args): Promise<{ cvId: Id<"cvs"> }> => {
    const lower = args.fileName.toLowerCase();
    const fileType = lower.endsWith(".pdf") ? "pdf"
      : lower.endsWith(".docx") ? "docx"
      : lower.endsWith(".doc") ? "doc"
      : "pdf";

    // Store file in Convex storage
    const blob = new Blob([args.buffer], {
      type: fileType === "pdf" ? "application/pdf"
        : fileType === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/msword",
    });
    const storageId = await ctx.storage.store(blob);

    // Create CV record
    const cvId = await ctx.runMutation(internal.m365.scanMutations.createCvRecord, {
      storageId,
      fileName: args.fileName,
      fileType,
      fileSize: args.buffer.byteLength,
      tokenIdentifier: args.tokenIdentifier,
    });

    // Process the CV (extract text + AI structure)
    await ctx.runAction(api.cvProcessing.processCv, {
      cvId,
      storageId,
      fileType,
    });

    return { cvId };
  },
});
