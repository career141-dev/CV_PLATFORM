import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),

  cvs: defineTable({
    // File storage
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(), // "pdf" | "docx" | "txt"
    fileSize: v.number(),

    // Extracted & AI-structured data
    rawText: v.optional(v.string()),
    candidateName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    currentTitle: v.optional(v.string()),
    industry: v.optional(v.string()),
    sector: v.optional(v.string()),
    seniority: v.optional(v.string()), // "junior" | "mid" | "senior" | "lead" | "executive"
    yearsOfExperience: v.optional(v.number()),
    skills: v.optional(v.array(v.string())),
    languages: v.optional(v.array(v.string())),
    summary: v.optional(v.string()), // AI-generated 2-3 sentence summary

    // Processing state
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("error")
    ),
    errorMessage: v.optional(v.string()),

    // Who uploaded
    uploadedBy: v.id("users"),
  })
    .index("by_status", ["status"])
    .index("by_uploaded_by", ["uploadedBy"])
    .index("by_industry", ["industry"])
    .index("by_seniority", ["seniority"])
    .searchIndex("search_text", {
      searchField: "rawText",
      filterFields: ["status", "industry", "seniority"],
    })
    .searchIndex("search_summary", {
      searchField: "summary",
      filterFields: ["status"],
    }),

  searchHistory: defineTable({
    userId: v.id("users"),
    query: v.string(),
    type: v.union(v.literal("natural_language"), v.literal("job_description")),
    resultCount: v.number(),
  }).index("by_user", ["userId"]),
  workableImports: defineTable({
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    totalCandidates: v.number(),
    imported: v.number(),
    skipped: v.number(),
    failed: v.number(),
    userId: v.id("users"),
    startedAt: v.string(),
    errorMessage: v.optional(v.string()),
  }).index("by_user", ["userId"]),
});
