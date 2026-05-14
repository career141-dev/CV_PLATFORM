"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import JSZip from "jszip";
import type { Id } from "../_generated/dataModel.d.ts";

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE = 25; // files per batch call (keeps action well under 10-min limit)
const CV_EXTENSIONS = [".pdf", ".doc", ".docx"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCvExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return CV_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function looksLikeCv(text: string): boolean {
  const lower = text.toLowerCase();
  const keywords = [
    "experience", "education", "skills", "resume", "curriculum vitae", "cv",
    "work history", "employment", "objective", "summary", "references",
    "bachelor", "master", "degree", "university", "college", "qualification",
    "job title", "position", "responsibilities", "achievements",
  ];
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) hits++;
    if (hits >= 3) return true;
  }
  return false;
}

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bufferCopy = buffer.slice(0);
    const loadingTask = (pdfjsLib as unknown as { getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string }[] }> }> }> } }).getDocument({ data: bufferCopy });
    const pdf = await loadingTask.promise;
    const texts: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: { str?: string }) => item.str ?? "")
        .join(" ");
      texts.push(pageText);
    }
    return texts.join("\n");
  } catch {
    return "";
  }
}

async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return result.value ?? "";
  } catch {
    return "";
  }
}

async function extractText(buffer: ArrayBuffer, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return extractTextFromPdf(buffer);
  if (lower.endsWith(".docx")) return extractTextFromDocx(buffer);
  if (lower.endsWith(".doc")) return extractTextFromDocx(buffer);
  return "";
}

// ─── Main batch action ────────────────────────────────────────────────────────

/**
 * Processes one batch of BATCH_SIZE files from the ZIP(s).
 * Returns `done: true` when all ZIPs have been fully processed.
 * The caller (frontend) loops calling this until done or paused/stopped.
 */
export const processBatch = action({
  args: {
    jobId: v.id("zipImportJobs"),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args): Promise<{
    done: boolean;
    currentUrlIndex: number;
    currentFileIndex: number;
    batchImported: number;
    batchDuplicates: number;
    batchNotCv: number;
    batchErrors: number;
    batchFound: number;
  }> => {
    // Load current job state
    const job = await ctx.runQuery(internal.zip.mutations.getJobInternal, { jobId: args.jobId });
    if (!job) throw new ConvexError({ message: "Job not found", code: "NOT_FOUND" });
    if (job.status !== "running") {
      return {
        done: job.status === "done",
        currentUrlIndex: job.currentUrlIndex,
        currentFileIndex: job.currentFileIndex,
        batchImported: 0,
        batchDuplicates: 0,
        batchNotCv: 0,
        batchErrors: 0,
        batchFound: 0,
      };
    }

    let urlIndex = job.currentUrlIndex;
    let fileIndex = job.currentFileIndex;
    let totalFound = job.totalFound;
    let imported = job.imported;
    let duplicates = job.duplicates;
    let notCv = job.notCv;
    let errors = job.errors;

    const batchStats = { imported: 0, duplicates: 0, notCv: 0, errors: 0, found: 0 };

    // Load the current ZIP
    const zipUrl = job.urls[urlIndex];
    let zipData: JSZip;
    try {
      const res = await fetch(zipUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      zipData = await JSZip.loadAsync(arrayBuffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.zip.mutations.updateProgress, {
        jobId: args.jobId,
        currentUrlIndex: urlIndex,
        currentFileIndex: fileIndex,
        totalFound,
        imported,
        duplicates,
        notCv,
        errors: errors + 1,
        status: "error",
        errorMessage: `Failed to download ZIP #${urlIndex + 1}: ${msg}`,
      });
      return { done: false, currentUrlIndex: urlIndex, currentFileIndex: fileIndex, batchImported: 0, batchDuplicates: 0, batchNotCv: 0, batchErrors: 1, batchFound: 0 };
    }

    // Collect all CV-extension files from ZIP
    const allFiles = Object.values(zipData.files).filter(
      (f) => !f.dir && isCvExtension(f.name)
    );

    totalFound = job.totalFound + Math.max(0, allFiles.length - fileIndex);
    batchStats.found = allFiles.length - fileIndex;

    // Process BATCH_SIZE files starting at fileIndex
    const batchFiles = allFiles.slice(fileIndex, fileIndex + BATCH_SIZE);

    for (const zipEntry of batchFiles) {
      try {
        const buffer = await zipEntry.async("arraybuffer");
        const fileName = zipEntry.name.split("/").pop() ?? zipEntry.name;

        // Extract text
        const rawText = await extractText(buffer, fileName);

        // CV check
        if (!looksLikeCv(rawText)) {
          notCv++;
          batchStats.notCv++;
          fileIndex++;
          continue;
        }

        // Store + dedup via existing pipeline
        const result = await ctx.runAction(internal.m365.scan.storeAndProcess, {
          buffer,
          fileName,
          tokenIdentifier: args.tokenIdentifier,
          rawText: rawText.slice(0, 50000),
        }) as { cvId: Id<"cvs"> | null; skipped: boolean };

        if (result.skipped) {
          duplicates++;
          batchStats.duplicates++;
        } else {
          imported++;
          batchStats.imported++;
        }
      } catch {
        errors++;
        batchStats.errors++;
      }
      fileIndex++;
    }

    // Advance cursor
    const newFileIndex = fileIndex;
    let newUrlIndex = urlIndex;
    let isDone = false;

    if (newFileIndex >= allFiles.length) {
      // This ZIP is exhausted — move to next
      newUrlIndex = urlIndex + 1;
      if (newUrlIndex >= job.urls.length) {
        isDone = true;
      }
    }

    const newStatus = isDone ? "done" : "running";

    await ctx.runMutation(internal.zip.mutations.updateProgress, {
      jobId: args.jobId,
      currentUrlIndex: isDone ? newUrlIndex : newUrlIndex,
      currentFileIndex: isDone ? 0 : newFileIndex,
      totalFound,
      imported,
      duplicates,
      notCv,
      errors,
      status: newStatus,
    });

    return {
      done: isDone,
      currentUrlIndex: newUrlIndex,
      currentFileIndex: isDone ? 0 : newFileIndex,
      batchImported: batchStats.imported,
      batchDuplicates: batchStats.duplicates,
      batchNotCv: batchStats.notCv,
      batchErrors: batchStats.errors,
      batchFound: batchStats.found,
    };
  },
});
