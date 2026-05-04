import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated } from "convex/react";
import AppLayout from "@/components/app-layout.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Briefcase, Plus, Sparkles, MapPin, ChevronRight,
  Loader2, Trash2, User, CheckCircle2, XCircle,
  Clock, Building2, GraduationCap, Target, RefreshCw,
  ChevronDown, Rows3, List,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.js";
import { cn } from "@/lib/utils.ts";
import ReactMarkdown from "react-markdown";
import { formatDistanceToNow } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchBreakdown = {
  skills: number; experience: number; seniority: number;
  industry: number; location: number;
};
type CandidateMatch = {
  cvId: string; overallScore: number; breakdown: MatchBreakdown;
  matchedSkills: string[]; missingSkills: string[]; reason: string;
};
type JobRequirements = {
  title: string; requiredSkills: string[]; preferredSkills: string[];
  minYearsExperience: number | null; industry: string | null;
  seniority: string | null; location: string | null;
  education: string | null; summary: string;
};
type Job = {
  _id: Id<"jobs">; _creationTime: number;
  title: string; description: string;
  industry?: string; seniority?: string; location?: string;
  lastMatchedAt?: string;
  matchResults?: CandidateMatch[];
  jobRequirements?: JobRequirements;
};
type PipelineStage = "new" | "shortlisted" | "interview" | "offered" | "hired" | "rejected";
type PipelineEntry = {
  _id: Id<"pipeline">; jobId: Id<"jobs">; cvId: Id<"cvs">;
  stage: PipelineStage; notes?: string; movedAt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Technology", "Finance", "Healthcare", "FMCG", "Retail",
  "Manufacturing", "Energy", "Education", "Consulting",
  "Marketing", "Legal", "Real Estate", "Hospitality", "Media", "Logistics",
];
const SENIORITIES = ["junior", "mid", "senior", "lead", "executive"];

const PIPELINE_STAGES: { id: PipelineStage; label: string; color: string; bg: string }[] = [
  { id: "new",         label: "New",         color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" },
  { id: "shortlisted", label: "Shortlisted", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800" },
  { id: "interview",   label: "Interview",   color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
  { id: "offered",     label: "Offered",     color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
  { id: "hired",       label: "Hired",       color: "text-green-600 dark:text-green-400",  bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" },
  { id: "rejected",    label: "Rejected",    color: "text-red-500 dark:text-red-400",      bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: PipelineStage }) {
  const s = PIPELINE_STAGES.find((p) => p.id === stage);
  if (!s) return null;
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", s.color, s.bg)}>
      {s.label}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "text-green-500" : score >= 50 ? "text-amber-500" : "text-muted-foreground";
  const label = score >= 75 ? "Strong" : score >= 50 ? "Good" : "Possible";
  return (
    <div className={cn("flex flex-col items-center shrink-0", color)}>
      <span className="text-lg font-bold leading-none">{score}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </div>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "bg-green-500" : value >= 50 ? "bg-amber-400" : "bg-muted-foreground/30";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground shrink-0 capitalize">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div className={cn("h-full rounded-full", color)} initial={{ width: 0 }}
          animate={{ width: `${value}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
      </div>
      <span className="w-6 text-right text-muted-foreground">{value}</span>
    </div>
  );
}

// ─── Match card with pipeline controls ───────────────────────────────────────

function MatchCard({
  match, index, jobId, pipelineEntry,
}: {
  match: CandidateMatch; index: number;
  jobId: Id<"jobs">; pipelineEntry?: PipelineEntry;
}) {
  const [expanded, setExpanded] = useState(false);
  const cv = useQuery(api.cvs.getCv, { cvId: match.cvId as Id<"cvs"> });
  const setPipelineStage = useMutation(api.pipeline.setPipelineStage);
  const removePipelineEntry = useMutation(api.pipeline.removePipelineEntry);

  const handleStageChange = async (stage: string) => {
    if (stage === "remove") {
      await removePipelineEntry({ jobId, cvId: match.cvId as Id<"cvs"> }).catch(() =>
        toast.error("Failed to update pipeline")
      );
      return;
    }
    await setPipelineStage({
      jobId, cvId: match.cvId as Id<"cvs">,
      stage: stage as PipelineStage,
    }).catch(() => toast.error("Failed to update pipeline"));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="bg-card border rounded-xl overflow-hidden hover:border-primary/30 transition-colors"
    >
      {!cv ? <Skeleton className="h-20" /> : (
        <>
          <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
            <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0 mt-0.5">
              {index + 1}
            </div>
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{cv.candidateName ?? cv.fileName}</h3>
                  {cv.seniority && <Badge variant="secondary" className="text-xs capitalize">{cv.seniority}</Badge>}
                  {pipelineEntry && <StageBadge stage={pipelineEntry.stage} />}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <ScoreRing score={match.overallScore} />
                  <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                </div>
              </div>
              {cv.currentTitle && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Briefcase className="w-3 h-3 shrink-0" />{cv.currentTitle}
                  {cv.yearsOfExperience ? <span className="ml-1">· {cv.yearsOfExperience} yrs</span> : null}
                </p>
              )}
              {cv.location && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" />{cv.location}
                </p>
              )}
            </div>
          </div>

          {match.reason && (
            <div className="px-4 pb-2 -mt-1">
              <p className="text-xs text-primary/80 bg-accent/40 rounded-md px-2.5 py-1.5">{match.reason}</p>
            </div>
          )}

          {/* Pipeline stage selector */}
          <div className="px-4 pb-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-muted-foreground shrink-0">Stage:</span>
            <Select value={pipelineEntry?.stage ?? "none"} onValueChange={handleStageChange}>
              <SelectTrigger className="h-7 text-xs w-36">
                <SelectValue placeholder="Add to pipeline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Add to pipeline</SelectItem>
                {PIPELINE_STAGES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
                {pipelineEntry && <SelectItem value="remove">Remove from pipeline</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                className="overflow-hidden border-t"
              >
                <div className="p-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Match Breakdown</p>
                    <div className="space-y-1.5">
                      {Object.entries(match.breakdown).map(([key, val]) => (
                        <BreakdownBar key={key} label={key} value={val} />
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {match.matchedSkills.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Matched
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {match.matchedSkills.map((s) => (
                            <span key={s} className="text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 px-1.5 py-0.5 rounded">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {match.missingSkills.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-red-500 mb-1.5 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Missing
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {match.missingSkills.map((s) => (
                            <span key={s} className="text-xs bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-1.5 py-0.5 rounded">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <Link
                    to={`/cv/${match.cvId}`}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View full profile <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

// ─── Pipeline board (Kanban) ──────────────────────────────────────────────────

function PipelineBoard({ jobId, matchResults }: { jobId: Id<"jobs">; matchResults: CandidateMatch[] }) {
  const pipeline = useQuery(api.pipeline.getPipelineForJob, { jobId });
  const setPipelineStage = useMutation(api.pipeline.setPipelineStage);

  if (pipeline === undefined) {
    return <div className="flex gap-3 overflow-x-auto pb-4">{PIPELINE_STAGES.map((s) => (
      <div key={s.id} className="min-w-[200px] flex-1"><Skeleton className="h-48 rounded-xl" /></div>
    ))}</div>;
  }

  // Map cvId -> pipeline entry
  const pipelineMap = new Map<string, PipelineEntry>();
  for (const entry of pipeline) {
    pipelineMap.set(entry.cvId, entry as PipelineEntry);
  }

  // Group matches by stage (only those in pipeline)
  const byStage = new Map<PipelineStage, CandidateMatch[]>();
  for (const stage of PIPELINE_STAGES) {
    byStage.set(stage.id, []);
  }
  for (const match of matchResults) {
    const entry = pipelineMap.get(match.cvId);
    if (entry) {
      byStage.get(entry.stage)?.push(match);
    }
  }

  // Candidates not yet in pipeline — show at top for easy adding
  const unassigned = matchResults.filter((m) => !pipelineMap.has(m.cvId));

  return (
    <div className="space-y-4">
      {/* Unassigned candidates */}
      {unassigned.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {unassigned.length} candidate{unassigned.length !== 1 ? "s" : ""} not yet in pipeline
          </p>
          <div className="space-y-2">
            {unassigned.map((m, i) => (
              <PipelineQuickAdd
                key={m.cvId} match={m} index={i} jobId={jobId}
                onAdd={(stage) => setPipelineStage({ jobId, cvId: m.cvId as Id<"cvs">, stage }).catch(() => toast.error("Failed"))}
              />
            ))}
          </div>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map((stageInfo) => {
          const candidates = byStage.get(stageInfo.id) ?? [];
          return (
            <div key={stageInfo.id} className="min-w-[220px] flex-1">
              <div className={cn("rounded-xl border p-3", stageInfo.bg)}>
                <div className="flex items-center justify-between mb-3">
                  <span className={cn("text-xs font-semibold", stageInfo.color)}>{stageInfo.label}</span>
                  <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-full", stageInfo.color, "bg-background/50")}>
                    {candidates.length}
                  </span>
                </div>
                {candidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4 opacity-60">No candidates</p>
                ) : (
                  <div className="space-y-2">
                    {candidates.map((m) => (
                      <KanbanCard
                        key={m.cvId} match={m} jobId={jobId}
                        pipelineEntry={pipelineMap.get(m.cvId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineQuickAdd({
  match, index, jobId, onAdd,
}: {
  match: CandidateMatch; index: number;
  jobId: Id<"jobs">; onAdd: (stage: PipelineStage) => void;
}) {
  const cv = useQuery(api.cvs.getCv, { cvId: match.cvId as Id<"cvs"> });
  if (!cv) return <Skeleton className="h-12 rounded-lg" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center gap-3 bg-card border rounded-lg px-3 py-2"
    >
      <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0">
        <User className="w-3.5 h-3.5 text-accent-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{cv.candidateName ?? cv.fileName}</p>
        {cv.currentTitle && <p className="text-xs text-muted-foreground truncate">{cv.currentTitle}</p>}
      </div>
      <Select onValueChange={(v) => onAdd(v as PipelineStage)}>
        <SelectTrigger className="h-7 text-xs w-32 shrink-0">
          <SelectValue placeholder="Add to..." />
        </SelectTrigger>
        <SelectContent>
          {PIPELINE_STAGES.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </motion.div>
  );
}

function KanbanCard({
  match, jobId, pipelineEntry,
}: {
  match: CandidateMatch; jobId: Id<"jobs">; pipelineEntry?: PipelineEntry;
}) {
  const cv = useQuery(api.cvs.getCv, { cvId: match.cvId as Id<"cvs"> });
  const setPipelineStage = useMutation(api.pipeline.setPipelineStage);
  const removePipelineEntry = useMutation(api.pipeline.removePipelineEntry);

  if (!cv) return <Skeleton className="h-20 rounded-lg" />;

  return (
    <div className="bg-card border rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0">
          <User className="w-3.5 h-3.5 text-accent-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{cv.candidateName ?? cv.fileName}</p>
          {cv.currentTitle && <p className="text-xs text-muted-foreground truncate">{cv.currentTitle}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">Score: {match.overallScore}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {PIPELINE_STAGES.filter((s) => s.id !== pipelineEntry?.stage).map((s) => (
          <button
            key={s.id}
            onClick={() => setPipelineStage({ jobId, cvId: match.cvId as Id<"cvs">, stage: s.id }).catch(() => toast.error("Failed"))}
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-opacity hover:opacity-80",
              s.color, s.bg
            )}
          >
            → {s.label}
          </button>
        ))}
        <button
          onClick={() => removePipelineEntry({ jobId, cvId: match.cvId as Id<"cvs"> }).catch(() => toast.error("Failed"))}
          className="text-[10px] px-1.5 py-0.5 rounded border cursor-pointer text-muted-foreground hover:text-destructive transition-colors ml-auto"
        >
          Remove
        </button>
      </div>
      <Link
        to={`/cv/${match.cvId}`}
        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
      >
        View profile <ChevronRight className="w-2.5 h-2.5" />
      </Link>
    </div>
  );
}

// ─── Job requirements panel ───────────────────────────────────────────────────

function JobReqPanel({ req }: { req: JobRequirements }) {
  return (
    <div className="bg-accent/30 border border-accent rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Target className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-2">{req.summary}</p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
            {req.industry && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{req.industry}</span>}
            {req.seniority && <span className="flex items-center gap-1 capitalize"><Briefcase className="w-3 h-3" />{req.seniority}</span>}
            {req.minYearsExperience !== null && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{req.minYearsExperience}+ yrs</span>}
            {req.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{req.location}</span>}
            {req.education && <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" />{req.education}</span>}
          </div>
          {req.requiredSkills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {req.requiredSkills.map((s) => (
                <span key={s} className="text-xs bg-background border rounded px-1.5 py-0.5 font-medium">{s}</span>
              ))}
              {req.preferredSkills.slice(0, 4).map((s) => (
                <span key={s} className="text-xs bg-background border border-dashed rounded px-1.5 py-0.5 text-muted-foreground">{s}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Job card (list view) ─────────────────────────────────────────────────────

function JobCard({ job, onSelect }: { job: Job; onSelect: () => void }) {
  const deleteJob = useMutation(api.jobs.deleteJob);
  const pipeline = useQuery(api.pipeline.getPipelineForJob, { jobId: job._id });
  const pipelineCount = pipeline?.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border rounded-xl p-5 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h3 className="font-semibold text-sm">{job.title}</h3>
            {job.seniority && <Badge variant="secondary" className="text-xs capitalize">{job.seniority}</Badge>}
            {job.industry && <Badge variant="outline" className="text-xs">{job.industry}</Badge>}
          </div>
          {job.location && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
              <MapPin className="w-3 h-3" />{job.location}
            </p>
          )}
          <p className="text-xs text-muted-foreground line-clamp-2">{job.description}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!confirm("Delete this job?")) return;
              deleteJob({ jobId: job._id }).catch(() => toast.error("Failed to delete"));
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            {job.matchResults && job.matchResults.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {job.matchResults.length} matches
              </span>
            )}
            {pipelineCount > 0 && (
              <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {pipelineCount} in pipeline
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t">
        <span className="text-xs text-muted-foreground">
          Created {formatDistanceToNow(new Date(job._creationTime), { addSuffix: true })}
        </span>
        {job.lastMatchedAt ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-primary" />
            Matched {formatDistanceToNow(new Date(job.lastMatchedAt), { addSuffix: true })}
          </span>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400">Not yet matched</span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Create job dialog ────────────────────────────────────────────────────────

function CreateJobDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createJob = useMutation(api.jobs.createJob);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [seniority, setSeniority] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !description.trim()) { toast.error("Title and description are required"); return; }
    setSaving(true);
    try {
      await createJob({
        title: title.trim(), description: description.trim(),
        industry: industry || undefined, seniority: seniority || undefined,
        location: location.trim() || undefined,
      });
      toast.success("Job created");
      onClose();
      setTitle(""); setDescription(""); setIndustry(""); setSeniority(""); setLocation("");
    } catch {
      toast.error("Failed to create job");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" /> Create Job Opening
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Job Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Supply Chain Manager" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Job Description *</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Paste the full job description — include requirements, responsibilities, experience needed, location..."
              className="min-h-[160px] resize-none font-mono text-xs leading-relaxed" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Industry</label>
              <Select value={industry || "none"} onValueChange={(v) => setIndustry(v === "none" ? "" : v)}>
                <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Seniority</label>
              <Select value={seniority || "none"} onValueChange={(v) => setSeniority(v === "none" ? "" : v)}>
                <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Select level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {SENIORITIES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Location</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Cairo, Egypt" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !title.trim() || !description.trim()} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Job detail view ──────────────────────────────────────────────────────────

function JobDetailView({ job, onBack }: { job: Job; onBack: () => void }) {
  const [isMatching, setIsMatching] = useState(false);
  const [tab, setTab] = useState<"matches" | "pipeline">("matches");
  const matchByJd = useAction(api.cvProcessing.matchByJobDescription);
  const saveMatchResults = useMutation(api.jobs.saveMatchResults);

  const handleMatch = async () => {
    setIsMatching(true);
    try {
      const res = await matchByJd({ jobDescription: job.description, limit: 20 });
      await saveMatchResults({ jobId: job._id, matchResults: res.matches, jobRequirements: res.jobRequirements });
      toast.success(`Found ${res.matches.length} matching candidates`);
    } catch {
      toast.error("Matching failed. Please check your Hercules Cloud balance.");
    } finally {
      setIsMatching(false);
    }
  };

  const pipeline = useQuery(api.pipeline.getPipelineForJob, { jobId: job._id });
  const pipelineMap = new Map<string, PipelineEntry>();
  for (const entry of pipeline ?? []) {
    pipelineMap.set(entry.cvId, entry as PipelineEntry);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 cursor-pointer transition-colors"
      >
        <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back to Jobs
      </button>

      {/* Header */}
      <div className="bg-card border rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold mb-1">{job.title}</h1>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {job.seniority && <Badge variant="secondary" className="capitalize">{job.seniority}</Badge>}
              {job.industry && <Badge variant="outline">{job.industry}</Badge>}
              {job.location && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{job.location}
                </span>
              )}
            </div>
          </div>
          <Button onClick={handleMatch} disabled={isMatching} className="gap-2 shrink-0">
            {isMatching
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Matching...</>
              : <><RefreshCw className="w-4 h-4" /> {job.matchResults ? "Re-match" : "Find Matches"}</>
            }
          </Button>
        </div>
        <details className="mt-4 pt-4 border-t">
          <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1.5">
            <ChevronDown className="w-3.5 h-3.5" /> View job description
          </summary>
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-muted-foreground mt-2 leading-relaxed max-h-48 overflow-y-auto bg-muted/30 rounded-lg p-3 break-words">
            <ReactMarkdown>{job.description}</ReactMarkdown>
          </div>
        </details>
      </div>

      {/* Loading state */}
      <AnimatePresence>
        {isMatching && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Parsing job requirements and scoring all candidates...</span>
            </div>
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* No matches yet */}
      {!isMatching && !job.matchResults && (
        <div className="text-center py-16 text-muted-foreground">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">No matches yet</p>
          <p className="text-xs mb-4">Click {"\"Find Matches\""} to run AI matching against all CVs in your pool</p>
        </div>
      )}

      {/* Tabs: Matches + Pipeline */}
      {!isMatching && job.matchResults && job.matchResults.length > 0 && (
        <div>
          {job.jobRequirements && <JobReqPanel req={job.jobRequirements} />}

          <Tabs value={tab} onValueChange={(v) => setTab(v as "matches" | "pipeline")} className="mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <TabsList>
                <TabsTrigger value="matches" className="gap-1.5 text-xs sm:text-sm">
                  <List className="w-3.5 h-3.5" /> Matches ({job.matchResults.length})
                </TabsTrigger>
                <TabsTrigger value="pipeline" className="gap-1.5 text-xs sm:text-sm">
                  <Rows3 className="w-3.5 h-3.5" /> Pipeline ({pipeline?.length ?? 0})
                </TabsTrigger>
              </TabsList>
              {job.lastMatchedAt && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last matched {formatDistanceToNow(new Date(job.lastMatchedAt), { addSuffix: true })}
                </p>
              )}
            </div>

            <TabsContent value="matches" className="mt-0 space-y-2.5">
              {job.matchResults.map((m, i) => (
                <MatchCard
                  key={m.cvId} match={m} index={i}
                  jobId={job._id} pipelineEntry={pipelineMap.get(m.cvId)}
                />
              ))}
            </TabsContent>

            <TabsContent value="pipeline" className="mt-0">
              <PipelineBoard jobId={job._id} matchResults={job.matchResults} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function JobsContent() {
  const jobs = useQuery(api.jobs.listJobs, {});
  const [selectedJobId, setSelectedJobId] = useState<Id<"jobs"> | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const selectedJob = jobs?.find((j) => j._id === selectedJobId) as Job | undefined;

  if (jobs === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  if (selectedJob) {
    return <JobDetailView job={selectedJob} onBack={() => setSelectedJobId(null)} />;
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">Jobs</h1>
          <p className="text-muted-foreground text-sm">
            Create job openings, auto-match candidates, and manage your hiring pipeline.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> New Job
        </Button>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium mb-1">No jobs yet</p>
          <p className="text-xs mb-5">Create your first job opening to start matching and shortlisting candidates</p>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Create Job
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job._id} job={job as Job} onSelect={() => setSelectedJobId(job._id)} />
          ))}
        </div>
      )}

      <CreateJobDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export default function JobsPage() {
  return (
    <Authenticated>
      <AppLayout>
        <JobsContent />
      </AppLayout>
    </Authenticated>
  );
}
