"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel.d.ts";
import OpenAI from "openai";

function getOpenAI() {
  return new OpenAI({
    baseURL: "https://ai-gateway.hercules.app/v1",
    apiKey: process.env.HERCULES_API_KEY,
  });
}

const WA_TOKEN = process.env.WHATSAPP_TOKEN ?? "";
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID ?? "";

// ─── WhatsApp API helpers ─────────────────────────────────────────────────────

async function sendWhatsAppMessage(to: string, text: string) {
  if (!WA_TOKEN || !WA_PHONE_ID) return;
  await fetch(`https://graph.facebook.com/v18.0/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  const urlRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  });
  if (!urlRes.ok) return null;
  const urlData = (await urlRes.json()) as { url?: string; mime_type?: string };
  if (!urlData.url) return null;

  const fileRes = await fetch(urlData.url, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  });
  if (!fileRes.ok) return null;
  const buffer = await fileRes.arrayBuffer();
  return { buffer, mimeType: urlData.mime_type ?? "application/pdf" };
}

// ─── Job keyword matching ─────────────────────────────────────────────────────

function matchJobFromMessage(
  messageText: string,
  jobs: Array<{ _id: Id<"jobs">; title: string; keywords?: string[]; disqualifyThreshold?: number }>
): Id<"jobs"> | null {
  const lower = messageText.toLowerCase();

  for (const job of jobs) {
    if (job.keywords && job.keywords.length > 0) {
      for (const kw of job.keywords) {
        if (lower.includes(kw.toLowerCase())) return job._id;
      }
    }
    const titleWords = job.title.toLowerCase().split(/\s+/);
    if (titleWords.some(w => w.length > 3 && lower.includes(w))) return job._id;
  }

  if (jobs.length === 1) return jobs[0]._id;
  return null;
}

// ─── CV scoring against JD ────────────────────────────────────────────────────

async function scoreCvAgainstJob(cvText: string, jobTitle: string, jobDescription: string): Promise<number> {
  const response = await getOpenAI().chat.completions.create({
    model: "openai/gpt-5-mini",
    messages: [
      {
        role: "system",
        content: `You are a recruitment scoring assistant. Score the candidate's CV against the job description on a scale of 0-100. Return ONLY a JSON object: {"score": number, "reason": "brief reason"}`,
      },
      {
        role: "user",
        content: `Job Title: ${jobTitle}\n\nJob Description:\n${jobDescription.slice(0, 2000)}\n\nCV:\n${cvText.slice(0, 4000)}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content ?? '{"score":0}';
  try {
    const parsed = JSON.parse(content) as { score?: number };
    return Math.min(100, Math.max(0, parsed.score ?? 0));
  } catch {
    return 0;
  }
}

// ─── Main processing action ───────────────────────────────────────────────────

export const processIncomingMessage = internalAction({
  args: {
    waId: v.string(),
    from: v.string(),
    messageText: v.string(),
    mediaId: v.optional(v.string()),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    // Deduplicate
    const existing = await ctx.runQuery(internal.whatsapp.mutations.getApplicationByWaId, { waId: args.waId });
    if (existing) return;

    const appId = await ctx.runMutation(internal.whatsapp.mutations.createApplication, {
      waId: args.waId,
      from: args.from,
      messageText: args.messageText,
      status: "received",
    });

    try {
      // 1. Check for CV attachment
      if (!args.mediaId) {
        await ctx.runMutation(internal.whatsapp.mutations.updateApplication, {
          appId,
          status: "no_cv",
        });
        await sendWhatsAppMessage(
          args.from,
          "Thank you for your interest! Please re-send your message with your CV attached as a PDF or Word document."
        );
        return;
      }

      // 2. Match to a job
      const jobs = await ctx.runQuery(internal.whatsapp.mutations.getAllJobs, {});
      const jobId = matchJobFromMessage(args.messageText, jobs);

      if (!jobId) {
        await ctx.runMutation(internal.whatsapp.mutations.updateApplication, {
          appId,
          status: "no_job_match",
        });
        const jobList = jobs.map(j => `• ${j.title}`).join("\n");
        await sendWhatsAppMessage(
          args.from,
          `Thank you for reaching out! We couldn't determine which position you're applying for. Please reply with one of:\n${jobList}`
        );
        return;
      }

      const job = jobs.find(j => j._id === jobId)!;

      // 3. Download CV from WhatsApp
      const media = await downloadWhatsAppMedia(args.mediaId);
      if (!media) {
        await ctx.runMutation(internal.whatsapp.mutations.updateApplication, {
          appId,
          jobId,
          status: "error",
          errorMessage: "Failed to download CV attachment",
        });
        return;
      }

      // 4. Detect file type
      const rawFileName = args.fileName ?? `cv_${args.from}.pdf`;
      const ext = rawFileName.split(".").pop()?.toLowerCase() ?? "pdf";
      const fileType = ["pdf", "docx", "doc"].includes(ext) ? ext : "pdf";

      // 5. Store file in Convex storage
      const systemUser = await ctx.runQuery(internal.whatsapp.mutations.getSystemUser, {});
      if (!systemUser) throw new Error("No system user found");

      const blob = new Blob([media.buffer], { type: media.mimeType });
      const storageId = await ctx.storage.store(blob);

      // 6. Extract text
      let rawText = "";
      try {
        if (fileType === "pdf") {
          const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
          const bufCopy = media.buffer.slice(0);
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bufCopy) }).promise;
          const parts: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            parts.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
          }
          rawText = parts.join("\n");
        } else {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer: Buffer.from(media.buffer) });
          rawText = result.value;
        }
      } catch { /* proceed with empty rawText */ }

      // 7. Insert CV record
      const cvId = await ctx.runMutation(internal.whatsapp.mutations.insertCv, {
        storageId,
        fileName: rawFileName,
        fileType,
        fileSize: media.buffer.byteLength,
        rawText: rawText.slice(0, 50000),
        uploadedBy: systemUser._id,
      });

      // 8. Score CV against job
      const score = rawText.length > 50
        ? await scoreCvAgainstJob(rawText, job.title, job.description)
        : 0;

      const threshold = job.disqualifyThreshold ?? 40;
      const isDisqualified = score < threshold;

      // 9. Add to pipeline
      await ctx.runMutation(internal.whatsapp.mutations.addCvToPipeline, {
        jobId,
        cvId,
        stage: isDisqualified ? "rejected" : "new",
      });

      // 10. Update application record
      await ctx.runMutation(internal.whatsapp.mutations.updateApplication, {
        appId,
        jobId,
        cvId,
        score,
        status: isDisqualified ? "disqualified" : "scored",
      });

      // 11. Send reply
      if (isDisqualified) {
        await sendWhatsAppMessage(
          args.from,
          `Thank you for applying for the ${job.title} position. After reviewing your application, we regret to inform you that your profile does not meet the requirements for this role at this time. We wish you the best in your job search.`
        );
      } else {
        await sendWhatsAppMessage(
          args.from,
          `Thank you for applying for the ${job.title} position! We have received your CV and will be in touch if your profile matches our requirements.`
        );
      }
    } catch (err) {
      await ctx.runMutation(internal.whatsapp.mutations.updateApplication, {
        appId,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});
