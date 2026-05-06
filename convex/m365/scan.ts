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
  sharedMailbox?: string;
  // Body link fields (CV linked in email body, not attached)
  bodyLinkUrl?: string;
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
  let nextUrl: string | null = itemId
    ? `${base}/items/${itemId}/children?$top=200&$select=id,name,folder,file,size`
    : `${base}/root/children?$top=200&$select=id,name,folder,file,size`;

  // Follow @odata.nextLink to paginate through all items in this folder
  while (nextUrl) {
    const isAbsolute: boolean = nextUrl.startsWith("https://");
    const data: { value: DriveItem[]; "@odata.nextLink"?: string } = isAbsolute
      ? await (async () => {
          const res = await fetch(nextUrl as string, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error(`Graph error ${res.status}`);
          return res.json() as Promise<{ value: DriveItem[]; "@odata.nextLink"?: string }>;
        })()
      : await graphGet<{ value: DriveItem[]; "@odata.nextLink"?: string }>(token, nextUrl);

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

    nextUrl = data["@odata.nextLink"] ?? null;
  }
}

// ─── Extract CV links from email HTML body ────────────────────────────────────

function extractCvLinksFromHtml(html: string): Array<{ url: string; name: string }> {
  const links: Array<{ url: string; name: string }> = [];
  // Match href attributes in anchor tags
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    const url = match[1];
    try {
      // Must be an absolute HTTP(S) URL
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) continue;
      const pathname = parsed.pathname.toLowerCase();
      if (CV_EXTENSIONS.some(ext => pathname.endsWith(ext))) {
        // Derive a file name from the URL path
        const segments = parsed.pathname.split("/").filter(Boolean);
        const rawName = segments[segments.length - 1] ?? "cv";
        const name = decodeURIComponent(rawName).replace(/[^a-zA-Z0-9._-]/g, "_");
        links.push({ url, name });
      }
    } catch {
      // Invalid URL — skip
    }
  }
  // Deduplicate by URL
  const seen = new Set<string>();
  return links.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

// ─── Recursive mail folder scanner ───────────────────────────────────────────

type MailMessage = {
  id: string;
  subject?: string;
  hasAttachments: boolean;
  body?: { contentType: string; content: string };
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
  depth: number,
  sharedMailbox?: string // carry through for import routing
): Promise<void> {
  if (depth > 6) return;

  // Scan messages — fetch body too so we can extract CV links
  let nextLink: string | null =
    `${mailboxBase}/mailFolders/${folderId}/messages?$select=id,subject,hasAttachments,body&$top=50`;

  while (nextLink) {
    const raw = nextLink.startsWith("https://")
      ? nextLink
      : `https://graph.microsoft.com/v1.0${nextLink}`;
    const res = await fetch(raw, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Graph API error ${res.status} scanning mail folder: ${errText.slice(0, 300)}`);
    }
    const data = (await res.json()) as { value: MailMessage[]; "@odata.nextLink"?: string };
    const messages = data.value ?? [];

    for (const msg of messages) {
      // 1. File attachments
      if (msg.hasAttachments) {
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
                sharedMailbox,
              });
            }
          }
        } catch {
          // Skip messages we can't read attachments from
        }
      }

      // 2. Body links — extract PDF/DOC/DOCX hrefs from the email HTML body
      if (msg.body?.contentType === "html" && msg.body.content) {
        const bodyLinks = extractCvLinksFromHtml(msg.body.content);
        for (const link of bodyLinks) {
          results.push({
            id: `bodylink-${Buffer.from(link.url).toString("base64").slice(0, 32)}`,
            name: link.name,
            size: 0, // unknown until downloaded
            source: "email",
            messageId: msg.id,
            folderPath: folderName,
            emailSubject: msg.subject ?? "(no subject)",
            bodyLinkUrl: link.url,
            sharedMailbox,
          });
        }
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
        `${folderName}/${child.displayName}`, results, depth + 1, sharedMailbox
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

// ─── Cursor-based batch SharePoint scan ──────────────────────────────────────
// Processes one folder at a time (fully paginated) per batch call.
// Cursor is always at a clean folder boundary to avoid resume bugs.

type SpQueueEntry = { itemId: string | null; pathLabel: string; depth: number };
type SpScanCursor = {
  queue: SpQueueEntry[];
};

const BATCH_SP_FOLDER_LIMIT = 10; // folders fully processed per action call

export const scanSharePointFolderBatch = action({
  args: {
    accountId: v.id("m365Accounts"),
    siteId: v.string(),
    driveId: v.string(),
    itemId: v.optional(v.string()),
    folderName: v.string(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    files: FoundFile[];
    nextCursor: string | null;
    itemsScanned: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const token = await ctx.runAction(internal.m365.scanHelpers.getToken, { accountId: args.accountId });
    const base = `/sites/${args.siteId}/drives/${args.driveId}`;

    // Initialise or restore cursor
    let state: SpScanCursor;
    if (args.cursor) {
      state = JSON.parse(args.cursor) as SpScanCursor;
    } else {
      state = {
        queue: [{ itemId: args.itemId ?? null, pathLabel: args.folderName, depth: 0 }],
      };
    }

    const files: FoundFile[] = [];
    let itemsScanned = 0;
    let foldersProcessed = 0;

    // Helper: fetch a full page (handles both relative Graph paths and absolute nextLink URLs)
    const fetchPage = async (url: string): Promise<{ value: DriveItem[]; "@odata.nextLink"?: string }> => {
      if (url.startsWith("https://")) {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Graph error ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
        return res.json() as Promise<{ value: DriveItem[]; "@odata.nextLink"?: string }>;
      }
      return graphGet<{ value: DriveItem[]; "@odata.nextLink"?: string }>(token, url);
    };

    while (state.queue.length > 0 && foldersProcessed < BATCH_SP_FOLDER_LIMIT) {
      const entry = state.queue.shift()!;
      if (entry.depth > 8) continue;

      // Fully paginate this folder before moving on
      let pageUrl: string | null = entry.itemId
        ? `${base}/items/${entry.itemId}/children?$top=200&$select=id,name,folder,file,size`
        : `${base}/root/children?$top=200&$select=id,name,folder,file,size`;

      while (pageUrl) {
        const data = await fetchPage(pageUrl);
        const items = data.value ?? [];
        itemsScanned += items.length;

        for (const item of items) {
          if (item.folder && entry.depth < 8) {
            // Add subfolders to the queue to be processed in this or future batches
            state.queue.push({
              itemId: item.id,
              pathLabel: `${entry.pathLabel}/${item.name}`,
              depth: entry.depth + 1,
            });
          } else if (item.file && isCvFile(item.name, item.file.mimeType)) {
            files.push({
              id: `sp-${item.id}`,
              name: item.name,
              size: item.size ?? 0,
              source: "sharepoint",
              driveId: args.driveId,
              siteId: args.siteId,
              itemId: item.id,
              folderPath: entry.pathLabel,
            });
          }
        }

        pageUrl = data["@odata.nextLink"] ?? null;
      }

      foldersProcessed++;
    }

    const isDone = state.queue.length === 0;
    return {
      files,
      nextCursor: isDone ? null : JSON.stringify(state),
      itemsScanned,
    };
  },
});

// ─── Scan mail folder action (legacy, single-shot) ───────────────────────────

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
    await scanMailFolderRecursive(token, mailboxBase, args.folderId, args.folderName, results, 0, args.sharedMailbox);
    return results;
  },
});

// ─── Cursor-based batch mail scan ─────────────────────────────────────────────
// Processes up to BATCH_MSG_LIMIT messages per call to avoid Convex action timeout.
// The cursor encodes the remaining work so the frontend can resume with another call.

type ScanQueueEntry = { folderId: string; folderName: string; depth: number };
type MailScanCursor = {
  queue: ScanQueueEntry[];         // folders yet to be scanned
  currentNextLink: string | null;  // resume URL within the current folder
};

const BATCH_MSG_LIMIT = 50; // messages processed per action call

export const scanMailFolderBatch = action({
  args: {
    accountId: v.id("m365Accounts"),
    folderId: v.string(),      // root folder (only used when cursor is null)
    folderName: v.string(),    // root folder display name
    sharedMailbox: v.optional(v.string()),
    cursor: v.optional(v.string()), // JSON-serialised MailScanCursor, null = first call
  },
  handler: async (ctx, args): Promise<{
    files: FoundFile[];
    nextCursor: string | null;
    messagesScanned: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const token = await ctx.runAction(internal.m365.scanHelpers.getToken, { accountId: args.accountId });
    const mailboxBase = args.sharedMailbox
      ? `/users/${encodeURIComponent(args.sharedMailbox)}`
      : "/me";

    // Initialise or deserialise cursor
    let state: MailScanCursor;
    if (args.cursor) {
      state = JSON.parse(args.cursor) as MailScanCursor;
    } else {
      // First call — seed the queue with the root folder
      state = { queue: [{ folderId: args.folderId, folderName: args.folderName, depth: 0 }], currentNextLink: null };
    }

    const files: FoundFile[] = [];
    let messagesScanned = 0;

    // Work through the queue until we hit the batch limit or run out of work
    while (messagesScanned < BATCH_MSG_LIMIT) {
      // Resume current folder or pick next from queue
      let nextLink: string | null = state.currentNextLink;
      let current: ScanQueueEntry | undefined;

      if (!nextLink) {
        current = state.queue.shift();
        if (!current) break; // all done
        nextLink = `https://graph.microsoft.com/v1.0${mailboxBase}/mailFolders/${current.folderId}/messages?$select=id,subject,hasAttachments,body&$top=50`;
      } else {
        // We're mid-folder; find the current folder from context (we store it in queue[0] as a sentinel)
        current = state.queue[0] ?? { folderId: "", folderName: "?", depth: 0 };
        // Remove the sentinel — it will be re-added if we need to pause mid-folder
        state.queue.shift();
      }

      let pausedLink: string | null = null;

      // Scan pages until batch limit or folder exhausted
      while (nextLink && messagesScanned < BATCH_MSG_LIMIT) {
        const res = await fetch(nextLink, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { nextLink = null; break; } // skip bad pages silently
        const data = (await res.json()) as { value: MailMessage[]; "@odata.nextLink"?: string };
        const messages = data.value ?? [];

        for (const msg of messages) {
          messagesScanned++;
          // Attachments
          if (msg.hasAttachments) {
            try {
              const attData = await graphGet<{ value: MailAttachment[] }>(
                token,
                `${mailboxBase}/messages/${msg.id}/attachments?$select=id,name,size,contentType,isInline`
              );
              for (const att of attData.value ?? []) {
                if (!att.isInline && isCvFile(att.name, att.contentType)) {
                  files.push({
                    id: `mail-${att.id}`,
                    name: att.name,
                    size: att.size,
                    source: "email",
                    messageId: msg.id,
                    attachmentId: att.id,
                    folderPath: current.folderName,
                    emailSubject: msg.subject ?? "(no subject)",
                    sharedMailbox: args.sharedMailbox,
                  });
                }
              }
            } catch { /* skip */ }
          }
          // Body links
          if (msg.body?.contentType === "html" && msg.body.content) {
            const bodyLinks = extractCvLinksFromHtml(msg.body.content);
            for (const link of bodyLinks) {
              files.push({
                id: `bodylink-${Buffer.from(link.url).toString("base64").slice(0, 32)}`,
                name: link.name,
                size: 0,
                source: "email",
                messageId: msg.id,
                folderPath: current.folderName,
                emailSubject: msg.subject ?? "(no subject)",
                bodyLinkUrl: link.url,
                sharedMailbox: args.sharedMailbox,
              });
            }
          }
        }

        nextLink = data["@odata.nextLink"] ?? null;
        if (messagesScanned >= BATCH_MSG_LIMIT && nextLink) {
          // Pause mid-folder — save where we are
          pausedLink = nextLink;
          break;
        }
      }

      if (pausedLink) {
        // Re-insert current folder as sentinel at front so we resume it next call
        state.queue.unshift({ ...current, folderId: current.folderId });
        state.currentNextLink = pausedLink;
        break; // batch limit reached
      } else {
        // Folder exhausted — add child folders to queue (if not too deep)
        state.currentNextLink = null;
        if (current.depth < 6) {
          try {
            const childData = await graphGet<{ value: Array<{ id: string; displayName: string }> }>(
              token,
              `${mailboxBase}/mailFolders/${current.folderId}/childFolders?$top=50&$select=id,displayName`
            );
            for (const child of childData.value ?? []) {
              state.queue.push({
                folderId: child.id,
                folderName: `${current.folderName}/${child.displayName}`,
                depth: current.depth + 1,
              });
            }
          } catch { /* skip */ }
        }
      }
    }

    const isDone = state.queue.length === 0 && !state.currentNextLink;
    return {
      files,
      nextCursor: isDone ? null : JSON.stringify(state),
      messagesScanned,
    };
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
  handler: async (ctx, args): Promise<{ cvId: Id<"cvs">; skipped: boolean }> => {
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

// ─── Text extraction (mirrors cvProcessing.ts helpers) ───────────────────────

async function extractTextFromBuffer(buffer: ArrayBuffer, fileType: string): Promise<string> {
  if (fileType === "pdf") {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    const parts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return parts.join("\n");
  } else if (fileType === "docx" || fileType === "doc") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return result.value;
  }
  return new TextDecoder().decode(buffer);
}

// ─── CV keyword detection ─────────────────────────────────────────────────────

const CV_KEYWORDS = [
  "curriculum vitae", "resume", "cv", "work experience", "professional experience",
  "employment history", "education", "qualifications", "skills", "objective",
  "summary", "profile", "references", "bachelor", "master", "degree", "university",
  "college", "position", "job title", "employer", "internship", "volunteer",
];

function looksLikeCv(text: string): boolean {
  const lower = text.toLowerCase();
  // Require at least 3 distinct CV-related keywords to reduce false positives
  let hits = 0;
  for (const kw of CV_KEYWORDS) {
    if (lower.includes(kw)) {
      hits++;
      if (hits >= 3) return true;
    }
  }
  return false;
}

// ─── Import an email attachment as CV ────────────────────────────────────────

export const importMailAttachment = action({
  args: {
    accountId: v.id("m365Accounts"),
    messageId: v.string(),
    attachmentId: v.string(),
    fileName: v.string(),
    sharedMailbox: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ cvId: Id<"cvs"> | null; skipped: boolean; notACv?: boolean }> => {
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
    // Copy buffer before text extraction — pdfjs detaches the original ArrayBuffer
    const bufferCopy = buffer.slice(0);

    // ── CV keyword check: extract text and verify it looks like a CV ──────────
    const lower = args.fileName.toLowerCase();
    const fileType = lower.endsWith(".pdf") ? "pdf"
      : lower.endsWith(".docx") ? "docx"
      : lower.endsWith(".doc") ? "doc"
      : "pdf";

    let rawText = "";
    try {
      rawText = await extractTextFromBuffer(buffer, fileType);
    } catch {
      // If we can't extract text we can't verify — skip to be safe
      return { cvId: null, skipped: true, notACv: true };
    }

    if (!looksLikeCv(rawText)) {
      return { cvId: null, skipped: true, notACv: true };
    }

    return ctx.runAction(internal.m365.scan.storeAndProcess, {
      buffer: bufferCopy,
      fileName: args.fileName,
      tokenIdentifier: identity.tokenIdentifier,
      rawText: rawText.slice(0, 50000), // pass pre-extracted text to skip re-extraction
    });
  },
});

// ─── Import a CV from a body link URL ────────────────────────────────────────

export const importBodyLinkFile = action({
  args: {
    url: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args): Promise<{ cvId: Id<"cvs"> | null; skipped: boolean; notACv?: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    // Download the file — silently skip if URL is expired/unavailable
    let buffer: ArrayBuffer;
    try {
      const res = await fetch(args.url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      if (!res.ok) return { cvId: null, skipped: true, notACv: true };
      buffer = await res.arrayBuffer();
    } catch {
      return { cvId: null, skipped: true, notACv: true };
    }

    if (buffer.byteLength === 0) return { cvId: null, skipped: true, notACv: true };

    // Copy buffer before text extraction — pdfjs detaches the original ArrayBuffer
    const bufferCopy = buffer.slice(0);

    const lower = args.fileName.toLowerCase();
    const fileType = lower.endsWith(".pdf") ? "pdf"
      : lower.endsWith(".docx") ? "docx"
      : lower.endsWith(".doc") ? "doc"
      : "pdf";

    // CV keyword check
    let rawText = "";
    try {
      rawText = await extractTextFromBuffer(buffer, fileType);
    } catch {
      return { cvId: null, skipped: true, notACv: true };
    }
    if (!looksLikeCv(rawText)) return { cvId: null, skipped: true, notACv: true };

    return ctx.runAction(internal.m365.scan.storeAndProcess, {
      buffer: bufferCopy,
      fileName: args.fileName,
      tokenIdentifier: identity.tokenIdentifier,
      rawText: rawText.slice(0, 50000),
    });
  },
});

// ─── Internal: store bytes in Convex storage and kick off CV processing ───────

export const storeAndProcess = internalAction({
  args: {
    buffer: v.bytes(),
    fileName: v.string(),
    tokenIdentifier: v.string(),
    rawText: v.optional(v.string()), // pre-extracted text (skip re-extraction if provided)
  },
  handler: async (ctx, args): Promise<{ cvId: Id<"cvs">; skipped: boolean }> => {
    // Compute SHA-256 hash for deduplication
    const hashBuffer = await crypto.subtle.digest("SHA-256", args.buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // Check if this file was already imported
    const existingId = await ctx.runMutation(internal.m365.scanMutations.findByFileHash, { fileHash });
    if (existingId) {
      return { cvId: existingId, skipped: true };
    }

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

    // Create CV record — pass rawText if already extracted to skip re-extraction
    const cvId = await ctx.runMutation(internal.m365.scanMutations.createCvRecord, {
      storageId,
      fileName: args.fileName,
      fileType,
      fileSize: args.buffer.byteLength,
      tokenIdentifier: args.tokenIdentifier,
      fileHash,
      rawText: args.rawText ? args.rawText.slice(0, 50000) : undefined,
    });

    // Only run extractTextOnly if we didn't already have the text
    if (!args.rawText) {
      await ctx.runAction(api.cvProcessing.extractTextOnly, {
        cvId,
        storageId,
        fileType,
      });
    }

    return { cvId, skipped: false };
  },
});
