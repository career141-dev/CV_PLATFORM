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

type WorkableCandidateDetail = {
  candidate: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    resume_url?: string;
    resume?: { url?: string; file_url?: string };
    // Attachments can have any type — don't restrict to "resume"/"cv"
    attachments?: Array<{ url?: string; file_url?: string; type?: string; name?: string }>;
  };
};

function extractResumeUrl(detail: WorkableCandidateDetail["candidate"]): string | undefined {
  // 1. Top-level resume_url (most reliable)
  if (detail.resume_url) return detail.resume_url;
  // 2. Nested resume object
  if (detail.resume?.url) return detail.resume.url;
  if (detail.resume?.file_url) return detail.resume.file_url;
  // 3. Attachments explicitly typed as resume/cv
  const typedAttachment = detail.attachments?.find(
    (a) => a.type === "resume" || a.type === "cv"
  );
  if (typedAttachment?.url) return typedAttachment.url;
  if (typedAttachment?.file_url) return typedAttachment.file_url;
  // 4. Any attachment whose name looks like a CV/resume
  const namedAttachment = detail.attachments?.find((a) => {
    const name = (a.name ?? "").toLowerCase();
    return name.includes("cv") || name.includes("resume");
  });
  if (namedAttachment?.url) return namedAttachment.url;
  if (namedAttachment?.file_url) return namedAttachment.file_url;
  // 5. Fall back to ANY attachment with a URL (last resort)
  const anyAttachment = detail.attachments?.find((a) => a.url ?? a.file_url);
  if (anyAttachment?.url) return anyAttachment.url;
  if (anyAttachment?.file_url) return anyAttachment.file_url;
  return undefined;
}

type WorkableCandidatesPage = {
  candidates: Array<{ id: string; name: string }>;
  paging?: { next?: string };
};

async function fetchPage(
  subdomain: string,
  apiKey: string,
  nextUrl?: string
): Promise<WorkableCandidatesPage> {
  const url = nextUrl ?? workableUrl(subdomain, "/candidates?limit=20");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.status === 429) throw new Error("RATE_LIMIT_429");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Workable API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<WorkableCandidatesPage>;
}

async function fetchCandidateDetail(
  subdomain: string,
  apiKey: string,
  candidateId: string
): Promise<{ resumeUrl?: string; name: string; email?: string; phone?: string }> {
  // Respect Workable rate limit (~1 req/s)
  await new Promise((r) => setTimeout(r, 700));
  const url = workableUrl(subdomain, `/candidates/${candidateId}`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (res.status === 429) throw new Error("RATE_LIMIT_429");
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = (await res.json()) as WorkableCandidateDetail;
  return {
    name: data.candidate.name,
    email: data.candidate.email,
    phone: data.candidate.phone,
    resumeUrl: extractResumeUrl(data.candidate),
  };
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
    return { buffer: await res.arrayBuffer(), contentType, fileType };
  } catch {
    return null;
  }
}

// ─── Test connection ──────────────────────────────────────────────────────────

export const testConnection = action({
  args: { subdomain: v.string(), apiKey: v.string() },
  handler: async (_ctx, args): Promise<{ ok: boolean; error?: string }> => {
    try {
      await fetchPage(args.subdomain, args.apiKey);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  },
});

// ─── Start bulk import ────────────────────────────────────────────────────────

export const startBulkImport = action({
  args: { subdomain: v.string(), apiKey: v.string() },
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
      subdomain: args.subdomain,
      apiKey: args.apiKey,
    });

    ctx.scheduler.runAfter(0, internal.workable.actions.runImportBatch, {
      importId,
      subdomain: args.subdomain,
      apiKey: args.apiKey,
      userId: user._id,
      nextUrl: undefined,
      imported: 0,
      skipped: 0,
      deduplicated: 0,
      failed: 0,
    });

    return { importId };
  },
});

// ─── Get latest import status ─────────────────────────────────────────────────

export const getLatestImportStatus = action({
  args: {},
  handler: async (ctx): Promise<{
    _id: Id<"workableImports">;
    status: "running" | "done" | "error" | "stopped";
    totalCandidates: number;
    imported: number;
    skipped: number;
    deduplicated: number;
    failed: number;
    startedAt: string;
    errorMessage?: string;
    subdomain?: string;
  } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const job = await ctx.runQuery(internal.workable.db.getLatestImportJob, {});
    if (!job) return null;
    return { ...job, deduplicated: job.deduplicated ?? 0 };
  },
});

export const getImportStatus = action({
  args: { importId: v.id("workableImports") },
  handler: async (ctx, args): Promise<{
    _id: Id<"workableImports">;
    status: "running" | "done" | "error" | "stopped";
    totalCandidates: number;
    imported: number;
    skipped: number;
    deduplicated: number;
    failed: number;
    startedAt: string;
    errorMessage?: string;
    subdomain?: string;
  } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const job = await ctx.runQuery(internal.workable.db.getImportJob, { importId: args.importId });
    if (!job) return null;
    return { ...job, deduplicated: job.deduplicated ?? 0 };
  },
});

// ─── Retry a failed import ────────────────────────────────────────────────────

export const retryImport = action({
  args: {
    importId: v.id("workableImports"),
    subdomain: v.optional(v.string()),
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const job = await ctx.runQuery(internal.workable.db.getImportJob, { importId: args.importId });
    if (!job) throw new ConvexError({ message: "Import job not found", code: "NOT_FOUND" });

    const subdomain = args.subdomain ?? job.subdomain;
    const apiKey = args.apiKey ?? job.apiKey;
    if (!subdomain || !apiKey) {
      throw new ConvexError({ message: "Please enter your Workable subdomain and API key.", code: "BAD_REQUEST" });
    }

    const user = await ctx.runQuery(api.users.getUserByToken, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    await ctx.runMutation(internal.workable.db.updateImportJob, {
      importId: args.importId,
      status: "running",
      errorMessage: "",
      subdomain,
      apiKey,
    });

    ctx.scheduler.runAfter(0, internal.workable.actions.runImportBatch, {
      importId: args.importId,
      subdomain,
      apiKey,
      userId: user._id,
      nextUrl: job.lastCursor ?? undefined,
      imported: job.imported,
      skipped: job.skipped,
      deduplicated: job.deduplicated ?? 0,
      failed: job.failed,
    });
  },
});

// ─── Retry skipped (no CV) candidates from the beginning ─────────────────────

export const retrySkipped = action({
  args: {
    importId: v.id("workableImports"),
    subdomain: v.optional(v.string()),
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const job = await ctx.runQuery(internal.workable.db.getImportJob, { importId: args.importId });
    if (!job) throw new ConvexError({ message: "Import job not found", code: "NOT_FOUND" });

    const subdomain = args.subdomain ?? job.subdomain;
    const apiKey = args.apiKey ?? job.apiKey;
    if (!subdomain || !apiKey) {
      throw new ConvexError({ message: "Please enter your Workable subdomain and API key.", code: "BAD_REQUEST" });
    }

    const user = await ctx.runQuery(api.users.getUserByToken, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Reset cursor to start, keep imported/deduplicated counts, reset skipped/failed
    await ctx.runMutation(internal.workable.db.updateImportJob, {
      importId: args.importId,
      status: "running",
      errorMessage: "",
      skipped: 0,
      failed: 0,
      subdomain,
      apiKey,
    });

    ctx.scheduler.runAfter(0, internal.workable.actions.runImportBatch, {
      importId: args.importId,
      subdomain,
      apiKey,
      userId: user._id,
      nextUrl: undefined, // restart from beginning
      imported: job.imported,
      skipped: 0,
      deduplicated: job.deduplicated ?? 0,
      failed: 0,
    });
  },
});

// ─── Stop a running import ────────────────────────────────────────────────────

export const stopImport = action({
  args: { importId: v.id("workableImports") },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.runMutation(internal.workable.db.updateImportJob, {
      importId: args.importId,
      status: "stopped",
      errorMessage: "Import stopped by user.",
    });
  },
});

// ─── Core import batch runner ─────────────────────────────────────────────────

export const runImportBatch = internalAction({
  args: {
    importId: v.id("workableImports"),
    subdomain: v.string(),
    apiKey: v.string(),
    userId: v.id("users"),
    nextUrl: v.optional(v.string()),
    imported: v.number(),
    skipped: v.number(),
    deduplicated: v.number(),
    failed: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    let imported = args.imported;
    let skipped = args.skipped;
    let deduplicated = args.deduplicated;
    let failed = args.failed;

    // Check if import was stopped before processing this batch
    const currentJob = await ctx.runQuery(internal.workable.db.getImportJob, { importId: args.importId });
    if (!currentJob || currentJob.status === "stopped" || currentJob.status === "done") return;

    // Fetch the page of candidates
    let page: WorkableCandidatesPage;
    try {
      page = await fetchPage(args.subdomain, args.apiKey, args.nextUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      if (msg === "RATE_LIMIT_429") {
        // Save cursor and retry after 90s via scheduler — never sleep inside action
        await ctx.runMutation(internal.workable.db.updateImportJob, {
          importId: args.importId,
          imported,
          skipped,
          deduplicated,
          failed,
          lastCursor: args.nextUrl ?? undefined,
        });
        ctx.scheduler.runAfter(90000, internal.workable.actions.runImportBatch, {
          ...args,
          imported,
          skipped,
          deduplicated,
          failed,
        });
        return;
      }
      await ctx.runMutation(internal.workable.db.updateImportJob, {
        importId: args.importId,
        status: "error",
        errorMessage: msg,
        imported,
        skipped,
        deduplicated,
        failed,
      });
      return;
    }

    // Accumulate total candidates as pages arrive (Workable doesn't give a grand total upfront)
    if (page.candidates.length > 0) {
      const job = await ctx.runQuery(internal.workable.db.getImportJob, { importId: args.importId });
      if (job) {
        await ctx.runMutation(internal.workable.db.updateImportJob, {
          importId: args.importId,
          totalCandidates: (job.totalCandidates ?? 0) + page.candidates.length,
        });
      }
    }

    for (const candidate of page.candidates) {
      try {
        // Check dedup first before fetching details
        const existing = await ctx.runQuery(internal.workable.db.findCvByWorkableId, {
          workableCandidateId: candidate.id,
        });
        if (existing) {
          deduplicated++;
          continue;
        }

        // Fetch full candidate to get resume URL
        let detail: { resumeUrl?: string; name: string };
        try {
          detail = await fetchCandidateDetail(args.subdomain, args.apiKey, candidate.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (msg === "RATE_LIMIT_429") {
            // Save progress, reschedule this page from scratch after 90s
            await ctx.runMutation(internal.workable.db.updateImportJob, {
              importId: args.importId,
              imported,
              skipped,
              deduplicated,
              failed,
              lastCursor: args.nextUrl ?? undefined,
            });
            ctx.scheduler.runAfter(90000, internal.workable.actions.runImportBatch, {
              ...args,
              imported,
              skipped,
              deduplicated,
              failed,
            });
            return;
          }
          // Log the actual HTTP status so it's visible in the job error message
          if (msg.startsWith("HTTP_")) {
            await ctx.runMutation(internal.workable.db.updateImportJob, {
              importId: args.importId,
              errorMessage: `API error fetching candidate ${candidate.id}: ${msg}`,
            });
          }
          failed++;
          continue;
        }

        if (!detail.resumeUrl) {
          skipped++;
          continue;
        }

        const downloaded = await downloadResume(detail.resumeUrl);
        if (!downloaded) {
          failed++;
          continue;
        }

        // Upload to Convex storage
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
        const fileName = `${detail.name || candidate.id}.${downloaded.fileType}`;

        const cvId = await ctx.runMutation(internal.workable.db.insertCv, {
          storageId,
          fileName,
          fileType: downloaded.fileType,
          fileSize: downloaded.buffer.byteLength,
          userId: args.userId,
          workableCandidateId: candidate.id,
        });

        // Trigger full AI processing (text extract + AI structuring)
        // Stagger to avoid bursting — 2s apart per candidate
        ctx.scheduler.runAfter(imported * 2000, internal.workable.actions.processImportedCv, {
          cvId,
          storageId,
          fileType: downloaded.fileType,
        });

        imported++;
      } catch {
        failed++;
      }
    }

    // Save progress and cursor
    await ctx.runMutation(internal.workable.db.updateImportJob, {
      importId: args.importId,
      imported,
      skipped,
      deduplicated,
      failed,
      lastCursor: page.paging?.next ?? undefined,
    });

    // Chain to next page (add 500ms gap between pages)
    if (page.paging?.next) {
      ctx.scheduler.runAfter(500, internal.workable.actions.runImportBatch, {
        importId: args.importId,
        subdomain: args.subdomain,
        apiKey: args.apiKey,
        userId: args.userId,
        nextUrl: page.paging.next,
        imported,
        skipped,
        deduplicated,
        failed,
      });
    } else {
      await ctx.runMutation(internal.workable.db.updateImportJob, {
        importId: args.importId,
        status: "done",
      });
    }
  },
});

// ─── Process a single imported CV (full AI processing) ────────────────────────

export const processImportedCv = internalAction({
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
