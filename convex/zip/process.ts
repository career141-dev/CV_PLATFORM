"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { ConvexError } from "convex/values";
import JSZip from "jszip";
import type { Id } from "../_generated/dataModel.d.ts";

// ─── Config ───────────────────────────────────────────────────────────────────

// Max files stored per action call before saving progress and returning
// The frontend will call again for the next URL if there are more ZIPs
const MAX_FILES_PER_CALL = 5000;

const CV_EXTENSIONS = [".pdf", ".doc", ".docx"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCvExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return CV_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getFileType(name: string): "pdf" | "docx" | "doc" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".doc")) return "doc";
  return "pdf";
}

// ─── Main action — processes one ZIP URL completely ───────────────────────────
/**
 * Downloads one ZIP, iterates ALL files in it, stores CV files to Convex
 * storage, and schedules background text extraction. No text extraction happens
 * here — that keeps each file fast (~50–100ms) and avoids the 10-min timeout
 * even for ZIPs with tens of thousands of files.
 *
 * Returns counters so the frontend can update the job record.
 */
export const processZipUrl = action({
  args: {
    jobId: v.id("zipImportJobs"),
    url: v.string(),
    urlIndex: v.number(),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args): Promise<{
    imported: number;
    duplicates: number;
    notCv: number;
    errors: number;
    totalFound: number;
  }> => {
    let imported = 0;
    let duplicates = 0;
    let notCv = 0;
    let errors = 0;
    let totalFound = 0;

    // ── 1. Download the ZIP ──────────────────────────────────────────────────
    let zipData: JSZip;
    try {
      const res = await fetch(args.url);
      if (!res.ok) throw new Error(`HTTP ${res.status} downloading ZIP`);
      const arrayBuffer = await res.arrayBuffer();
      zipData = await JSZip.loadAsync(arrayBuffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new ConvexError({ message: `Failed to download ZIP #${args.urlIndex + 1}: ${msg}`, code: "EXTERNAL_SERVICE_ERROR" });
    }

    // ── 2. Collect CV-extension files ────────────────────────────────────────
    const allFiles = Object.values(zipData.files).filter(
      (f) => !f.dir && isCvExtension(f.name)
    );
    totalFound = allFiles.length;

    // ── 3. Store files in batches, schedule background processing ────────────
    let processed = 0;
    for (const zipEntry of allFiles) {
      if (processed >= MAX_FILES_PER_CALL) break;
      try {
        const buffer = await zipEntry.async("arraybuffer");
        const fileName = zipEntry.name.split("/").pop() ?? zipEntry.name;
        const fileType = getFileType(fileName);

        // Compute SHA-256 hash for deduplication
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const fileHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        // Check for duplicate
        const existingId = await ctx.runMutation(
          internal.m365.scanMutations.findByFileHash,
          { fileHash }
        ) as Id<"cvs"> | null;

        if (existingId) {
          duplicates++;
          processed++;
          continue;
        }

        // Store file in Convex storage
        const mimeType =
          fileType === "pdf" ? "application/pdf"
          : fileType === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/msword";

        const blob = new Blob([buffer], { type: mimeType });
        const storageId = await ctx.storage.store(blob);

        // Create CV record (status: "uploading" — background job will extract text)
        const cvId = await ctx.runMutation(internal.m365.scanMutations.createCvRecord, {
          storageId,
          fileName,
          fileType,
          fileSize: buffer.byteLength,
          tokenIdentifier: args.tokenIdentifier,
          fileHash,
        }) as Id<"cvs">;

        // Schedule background text extraction (staggered to avoid bursts)
        await ctx.scheduler.runAfter(
          (processed % 50) * 500,
          api.cvProcessing.extractTextOnly,
          { cvId, storageId, fileType }
        );

        imported++;
      } catch {
        errors++;
      }
      processed++;
    }

    // notCv: files skipped because they aren't CV extensions (images etc.)
    // These are already excluded by the isCvExtension filter above, so we
    // count the difference between all ZIP entries and the CV-extension ones.
    const totalEntries = Object.values(zipData.files).filter((f) => !f.dir).length;
    notCv = Math.max(0, totalEntries - totalFound);

    return { imported, duplicates, notCv, errors, totalFound };
  },
});
