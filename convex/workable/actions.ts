"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel.d.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function workableUrl(subdomain: string, path: string) {
  return `https://${subdomain}.workable.com/spi/v3${path}`;
}

type WorkableCandidate = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  resume_url?: string;
};

type WorkableCandidateDetail = {
  candidate: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    resume_url?: string;
    // Workable sometimes nests resume under resume object
    resume?: {
      url?: string;
      file_url?: string;
    };
    // Sometimes appears directly as attachments
    attachments?: Array<{ url?: string; file_url?: string; type?: string }>;
  };
};

function extractResumeUrl(detail: WorkableCandidateDetail["candidate"]): string | undefined {
  // Try direct resume_url first
  if (detail.resume_url) return detail.resume_url;
  // Try nested resume object
  if (detail.resume?.url) return detail.resume.url;
  if (detail.resume?.file_url) return detail.resume.file_url;
  // Try attachments array — look for resume type
  const resumeAttachment = detail.attachments?.find(
    (a) => !a.type || a.type === "resume" || a.type === "cv"
  );
  if (resumeAttachment?.url) return resumeAttachment.url;
  if (resumeAttachment?.file_url) return resumeAttachment.file_url;
  return undefined;
}

async function fetchCandidateDetail(
  subdomain: string,
  apiKey: string,
  candidateId: string
): Promise<WorkableCandidate> {
  // Base delay between calls to respect Workable rate limits (~1 req/s)
  await new Promise((resolve) => setTimeout(resolve, 600));
  const url = workableUrl(subdomain, `/candidates/${candidateId}`);

  // Retry up to 3 times on 429
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 429) {
      // Back off 5s on rate limit then retry
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    if (!res.ok) return { id: candidateId, name: candidateId };
    const data = (await res.json()) as WorkableCandidateDetail;
    return {
      id: data.candidate.id,
      name: data.candidate.name,
      email: data.candidate.email,
      phone: data.candidate.phone,
      resume_url: extractResumeUrl(data.candidate),
    };
  }
  // All retries exhausted — skip this candidate
  return { id: candidateId, name: candidateId };
}

type WorkableCandidatesResponse = {
  candidates: WorkableCandidate[];
  paging?: { next?: string };
};

async function fetchCandidatesPage(
  subdomain: string,
  apiKey: string,
  nextUrl?: string
): Promise<WorkableCandidatesResponse> {
  const url = nextUrl ?? workableUrl(subdomain, "/candidates?limit=100");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Workable API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<WorkableCandidatesResponse>;
}

async function downloadResume(
  resumeUrl: string
): Promise<{ buffer: ArrayBuffer; contentType: string; fileType: string } | null> {
  try {
    const res = await fetch(resumeUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "application/pdf";
    const fileType =
      contentType.includes("pdf") ? "pdf" :
      contentType.includes("word") || contentType.includes("docx") ? "docx" :
      "pdf";
    const buffer = await res.arrayBuffer();
    return { buffer, contentType, fileType };
  } catch {
    return null;
  }
}

// ─── Test connection ──────────────────────────────────────────────────────────

export const testConnection = action({
  args: {
    subdomain: v.string(),
    apiKey: v.string(),
  },
  handler: async (_ctx, args): Promise<{ ok: boolean; error?: string }> => {
    try {
      await fetchCandidatesPage(args.subdomain, args.apiKey);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  },
});

// ─── Start bulk import (public action) ───────────────────────────────────────

export const startBulkImport = action({
  args: {
    subdomain: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ importId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.runQuery(api.users.getUserByToken, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const importId = await ctx.runMutation(internal.workable.db.createImportJob, {
      userId: user._id,
      totalCandidates: 0,
    });

    ctx.scheduler.runAfter(0, internal.workable.actions.runImport, {
      importId,
      subdomain: args.subdomain,
      apiKey: args.apiKey,
      userId: user._id,
      nextUrl: undefined,
      imported: 0,
      skipped: 0,
      failed: 0,
    });

    return { importId };
  },
});

// ─── Read import status (public action) ──────────────────────────────────────

export const getImportStatus = action({
  args: { importId: v.id("workableImports") },
  handler: async (ctx, args): Promise<{
    _id: Id<"workableImports">;
    status: "running" | "done" | "error";
    totalCandidates: number;
    imported: number;
    skipped: number;
    failed: number;
    startedAt: string;
    errorMessage?: string;
  } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.runQuery(internal.workable.db.getImportJob, { importId: args.importId });
  },
});

// ─── Paginated import runner (internal action) ────────────────────────────────

export const runImport = internalAction({
  args: {
    importId: v.id("workableImports"),
    subdomain: v.string(),
    apiKey: v.string(),
    userId: v.id("users"),
    nextUrl: v.optional(v.string()),
    imported: v.number(),
    skipped: v.number(),
    failed: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    let imported = args.imported;
    let skipped = args.skipped;
    let failed = args.failed;

    try {
      const page = await fetchCandidatesPage(args.subdomain, args.apiKey, args.nextUrl);

      // Update total count on first page
      if (!args.nextUrl) {
        await ctx.runMutation(internal.workable.db.updateImportJob, {
          importId: args.importId,
          totalCandidates: page.candidates.length,
        });
      }

      for (const candidate of page.candidates) {
        // Fetch full candidate profile to get resume_url (not returned by list endpoint)
        const detail = await fetchCandidateDetail(args.subdomain, args.apiKey, candidate.id);

        if (!detail.resume_url) {
          skipped++;
          continue;
        }

        const downloaded = await downloadResume(detail.resume_url);
        if (!downloaded) {
          failed++;
          continue;
        }

        // Upload buffer to Convex storage
        const uploadUrl = await ctx.storage.generateUploadUrl();
        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": downloaded.contentType },
          body: downloaded.buffer,
        });

        if (!uploadRes.ok) {
          failed++;
          continue;
        }

        const { storageId } = (await uploadRes.json()) as { storageId: Id<"_storage"> };
        const fileName = detail.name
          ? `${detail.name}.${downloaded.fileType}`
          : `workable-${detail.id}.${downloaded.fileType}`;

        const cvId = await ctx.runMutation(internal.workable.db.insertCv, {
          storageId,
          fileName,
          fileType: downloaded.fileType,
          fileSize: downloaded.buffer.byteLength,
          userId: args.userId,
        });

        // Trigger async AI processing
        ctx.scheduler.runAfter(0, internal.workable.actions.triggerProcess, {
          cvId,
          storageId,
          fileType: downloaded.fileType,
        });

        imported++;
      }

      // Save progress
      await ctx.runMutation(internal.workable.db.updateImportJob, {
        importId: args.importId,
        imported,
        skipped,
        failed,
      });

      // Continue to next page if available
      if (page.paging?.next) {
        ctx.scheduler.runAfter(200, internal.workable.actions.runImport, {
          importId: args.importId,
          subdomain: args.subdomain,
          apiKey: args.apiKey,
          userId: args.userId,
          nextUrl: page.paging.next,
          imported,
          skipped,
          failed,
        });
      } else {
        await ctx.runMutation(internal.workable.db.updateImportJob, {
          importId: args.importId,
          status: "done",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      await ctx.runMutation(internal.workable.db.updateImportJob, {
        importId: args.importId,
        status: "error",
        errorMessage: message,
      });
    }
  },
});

// Trigger CV processing for an imported CV
export const triggerProcess = internalAction({
  args: {
    cvId: v.id("cvs"),
    storageId: v.id("_storage"),
    fileType: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runAction(api.cvProcessing.processCv, {
      cvId: args.cvId,
      storageId: args.storageId,
      fileType: args.fileType,
    });
  },
});
