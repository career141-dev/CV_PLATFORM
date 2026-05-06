import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("recruiter"), v.literal("viewer"))),
    isApproved: v.optional(v.boolean()),
  }).index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  // Pre-approved email list managed by admin
  approvedEmails: defineTable({
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("recruiter"), v.literal("viewer")),
    addedBy: v.id("users"),
    addedAt: v.string(),
  }).index("by_email", ["email"]),

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
      v.literal("error"),
      v.literal("paused")
    ),
    errorMessage: v.optional(v.string()),

    // Lazy structuring — true if AI has extracted structured fields
    isStructured: v.optional(v.boolean()),

    // Who uploaded
    uploadedBy: v.id("users"),

    // Workable integration — used for deduplication
    workableCandidateId: v.optional(v.string()),

    // File hash — SHA-256 hex string for deduplication across imports
    fileHash: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_uploaded_by", ["uploadedBy"])
    .index("by_industry", ["industry"])
    .index("by_seniority", ["seniority"])
    .index("by_file_hash", ["fileHash"])
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
    // Stored results for persistence
    results: v.optional(v.array(v.object({
      cvId: v.string(),
      score: v.number(),
      reason: v.string(),
    }))),
    // For natural language searches
    interpretation: v.optional(v.object({
      searchText: v.string(),
      industry: v.optional(v.string()),
      seniority: v.optional(v.string()),
      minYears: v.optional(v.number()),
      interpretation: v.string(),
      keywords: v.array(v.string()),
    })),
    // For JD matches — store top-level job requirements
    jobRequirements: v.optional(v.object({
      title: v.string(),
      requiredSkills: v.array(v.string()),
      preferredSkills: v.array(v.string()),
      minYearsExperience: v.union(v.number(), v.null()),
      industry: v.union(v.string(), v.null()),
      seniority: v.union(v.string(), v.null()),
      location: v.union(v.string(), v.null()),
      education: v.union(v.string(), v.null()),
      summary: v.string(),
    })),
    // For JD matches — store richer match objects
    matchResults: v.optional(v.array(v.object({
      cvId: v.string(),
      overallScore: v.number(),
      breakdown: v.object({
        skills: v.number(),
        experience: v.number(),
        seniority: v.number(),
        industry: v.number(),
        location: v.number(),
      }),
      matchedSkills: v.array(v.string()),
      missingSkills: v.array(v.string()),
      reason: v.string(),
    }))),
  }).index("by_user", ["userId"]),

  // Singleton stats document — maintained by mutations for O(1) dashboard reads
  cvStats: defineTable({
    total: v.number(),
    ready: v.number(),
    processing: v.number(),
    errors: v.number(),
    paused: v.number(),
  }),

  // Lightweight lookup table for Workable deduplication — avoids scanning the large cvs table
  workableCandidateLookup: defineTable({
    workableCandidateId: v.string(),
    cvId: v.id("cvs"),
  }).index("by_workable_candidate_id", ["workableCandidateId"]),

  // Jobs — open positions for candidate matching
  jobs: defineTable({
    title: v.string(),
    description: v.string(),
    industry: v.optional(v.string()),
    seniority: v.optional(v.string()),
    location: v.optional(v.string()),
    createdBy: v.id("users"),
    // Latest match results snapshot (stored after each run)
    lastMatchedAt: v.optional(v.string()),
    matchResults: v.optional(v.array(v.object({
      cvId: v.string(),
      overallScore: v.number(),
      breakdown: v.object({
        skills: v.number(),
        experience: v.number(),
        seniority: v.number(),
        industry: v.number(),
        location: v.number(),
      }),
      matchedSkills: v.array(v.string()),
      missingSkills: v.array(v.string()),
      reason: v.string(),
    }))),
    jobRequirements: v.optional(v.object({
      title: v.string(),
      requiredSkills: v.array(v.string()),
      preferredSkills: v.array(v.string()),
      minYearsExperience: v.union(v.number(), v.null()),
      industry: v.union(v.string(), v.null()),
      seniority: v.union(v.string(), v.null()),
      location: v.union(v.string(), v.null()),
      education: v.union(v.string(), v.null()),
      summary: v.string(),
    })),
  }).index("by_created_by", ["createdBy"]),

  // Pipeline stages for candidates per job
  pipeline: defineTable({
    jobId: v.id("jobs"),
    cvId: v.id("cvs"),
    stage: v.union(
      v.literal("new"),
      v.literal("shortlisted"),
      v.literal("interview"),
      v.literal("offered"),
      v.literal("hired"),
      v.literal("rejected")
    ),
    notes: v.optional(v.string()),
    movedAt: v.string(), // ISO timestamp
  })
    .index("by_job", ["jobId"])
    .index("by_job_and_cv", ["jobId", "cvId"])
    .index("by_job_and_stage", ["jobId", "stage"]),

  // Temporary OAuth state tokens (TTL ~10 min) to link callback back to userId
  oauthStates: defineTable({
    state: v.string(),
    userId: v.id("users"),
    expiresAt: v.string(),
  }).index("by_state", ["state"]),

  // M365 connected mailboxes for email CV import
  m365Accounts: defineTable({
    userId: v.id("users"),
    email: v.string(),
    displayName: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.string(), // ISO timestamp
    tenantId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

  workableImports: defineTable({
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error"), v.literal("stopped")),
    totalCandidates: v.number(),
    imported: v.number(),
    skipped: v.number(),
    deduplicated: v.optional(v.number()),
    failed: v.number(),
    userId: v.id("users"),
    startedAt: v.string(),
    errorMessage: v.optional(v.string()),
    // Pagination cursor — saved after each page so import can retry from here
    lastCursor: v.optional(v.string()),
    // Workable credentials stored for retry
    subdomain: v.optional(v.string()),
    apiKey: v.optional(v.string()),
  }).index("by_user", ["userId"]),
});
