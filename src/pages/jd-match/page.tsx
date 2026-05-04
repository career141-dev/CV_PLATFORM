import { useState } from "react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated } from "convex/react";
import AppLayout from "@/components/app-layout.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Briefcase, MapPin, User, Loader2, Sparkles,
  CheckCircle2, XCircle, ChevronRight, Target,
  GraduationCap, Clock, Building2, X, Trash2,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.js";
import { cn } from "@/lib/utils.ts";
import { formatDistanceToNow } from "date-fns";

type CandidateMatchBreakdown = {
  skills: number;
  experience: number;
  seniority: number;
  industry: number;
  location: number;
};

type CandidateMatch = {
  cvId: string;
  overallScore: number;
  breakdown: CandidateMatchBreakdown;
  matchedSkills: string[];
  missingSkills: string[];
  reason: string;
};

type JobRequirements = {
  title: string;
  requiredSkills: string[];
  preferredSkills: string[];
  minYearsExperience: number | null;
  industry: string | null;
  seniority: string | null;
  location: string | null;
  education: string | null;
  summary: string;
};

type MatchResponse = {
  jobRequirements: JobRequirements;
  matches: CandidateMatch[];
};

const EXAMPLE_JD = `Job Title: Senior Sales Manager – FMCG

We are looking for an experienced Sales Manager to lead our regional sales team at a leading FMCG company in Sri Lanka.

Requirements:
- 5+ years of experience in FMCG sales
- Proven track record in team leadership and territory management
- Experience with Key Account Management
- Strong knowledge of field sales operations
- MBA or equivalent qualification preferred
- Fluency in English and Sinhala`;

function BreakdownBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 75 ? "bg-green-500" :
    value >= 50 ? "bg-amber-400" :
    "bg-muted-foreground/30";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground shrink-0 capitalize">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="w-6 text-right text-muted-foreground">{value}</span>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 75 ? "text-green-500" :
    score >= 50 ? "text-amber-500" :
    "text-muted-foreground";
  const label =
    score >= 75 ? "Strong" :
    score >= 50 ? "Good" :
    "Possible";
  return (
    <div className={cn("flex flex-col items-center shrink-0", color)}>
      <span className="text-lg font-bold leading-none">{score}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </div>
  );
}

function MatchCard({ match, index }: { match: CandidateMatch; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cv = useQuery(api.cvs.getCv, { cvId: match.cvId as Id<"cvs"> });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: "easeOut" }}
      className="bg-card border rounded-xl overflow-hidden hover:border-primary/30 transition-colors"
    >
      {!cv ? (
        <Skeleton className="h-28" />
      ) : (
        <>
          <div
            className="flex items-start gap-3 p-4 cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
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
                  {cv.seniority && (
                    <Badge variant="secondary" className="text-xs capitalize">{cv.seniority}</Badge>
                  )}
                  {cv.industry && (
                    <Badge variant="outline" className="text-xs">{cv.industry}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <ScoreRing score={match.overallScore} />
                  <ChevronRight
                    className={cn(
                      "w-3.5 h-3.5 text-muted-foreground transition-transform",
                      expanded && "rotate-90"
                    )}
                  />
                </div>
              </div>
              {cv.currentTitle && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                  <Briefcase className="w-3 h-3 shrink-0" />
                  {cv.currentTitle}
                  {cv.yearsOfExperience ? <span className="ml-1">· {cv.yearsOfExperience} yrs</span> : null}
                </p>
              )}
              {cv.location && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {cv.location}
                </p>
              )}
            </div>
          </div>

          {match.reason && (
            <div className="px-4 pb-3 -mt-1">
              <p className="text-xs text-primary/80 bg-accent/40 rounded-md px-2.5 py-1.5">
                {match.reason}
              </p>
            </div>
          )}

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t"
              >
                <div className="p-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Match Breakdown
                    </p>
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
                          <CheckCircle2 className="w-3.5 h-3.5" /> Matched skills
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {match.matchedSkills.map((s) => (
                            <span key={s} className="text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 px-1.5 py-0.5 rounded">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {match.missingSkills.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-red-500 mb-1.5 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Missing skills
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {match.missingSkills.map((s) => (
                            <span key={s} className="text-xs bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-1.5 py-0.5 rounded">
                              {s}
                            </span>
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

function JobRequirementsPanel({ req }: { req: JobRequirements }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-accent/30 border border-accent rounded-xl p-4 mb-5"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Target className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm mb-0.5">{req.title}</h3>
          <p className="text-xs text-muted-foreground mb-3">{req.summary}</p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {req.industry && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" /> {req.industry}
              </span>
            )}
            {req.seniority && (
              <span className="flex items-center gap-1 capitalize">
                <Briefcase className="w-3 h-3" /> {req.seniority}
              </span>
            )}
            {req.minYearsExperience !== null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {req.minYearsExperience}+ yrs
              </span>
            )}
            {req.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {req.location}
              </span>
            )}
            {req.education && (
              <span className="flex items-center gap-1">
                <GraduationCap className="w-3 h-3" /> {req.education}
              </span>
            )}
          </div>
          {req.requiredSkills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {req.requiredSkills.map((s) => (
                <span key={s} className="text-xs bg-background border rounded px-1.5 py-0.5 font-medium">
                  {s}
                </span>
              ))}
              {req.preferredSkills.slice(0, 4).map((s) => (
                <span key={s} className="text-xs bg-background border border-dashed rounded px-1.5 py-0.5 text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

type JdHistoryEntry = {
  _id: Id<"searchHistory">;
  _creationTime: number;
  query: string;
  resultCount: number;
  jobRequirements?: JobRequirements;
  matchResults?: CandidateMatch[];
};

function JdHistoryPanel({ onRestore }: { onRestore: (entry: JdHistoryEntry) => void }) {
  const history = useQuery(api.searchHistory.getSearchHistory, {});
  const deleteSearch = useMutation(api.searchHistory.deleteSearch);

  const jdHistory = history?.filter((h) => h.type === "job_description") ?? [];
  if (!history || jdHistory.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent JD Matches</span>
      </div>
      <div className="space-y-1.5">
        {jdHistory.slice(0, 5).map((entry) => (
          <div
            key={entry._id}
            className="flex items-center gap-2 bg-muted/40 hover:bg-muted rounded-lg px-3 py-2 group cursor-pointer"
            onClick={() => onRestore(entry as unknown as JdHistoryEntry)}
          >
            <Briefcase className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-foreground flex-1 truncate">
              {entry.jobRequirements?.title ?? entry.query.slice(0, 60)}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              {entry.resultCount} match{entry.resultCount !== 1 ? "es" : ""}
            </span>
            <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
              {formatDistanceToNow(new Date(entry._creationTime), { addSuffix: true })}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteSearch({ searchId: entry._id }).catch(() => toast.error("Failed to delete"));
              }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all cursor-pointer shrink-0"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function JdMatchContent() {
  const [jd, setJd] = useState("");
  const [isMatching, setIsMatching] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);

  const matchByJd = useAction(api.cvProcessing.matchByJobDescription);
  const saveSearch = useMutation(api.searchHistory.saveSearch);

  const handleMatch = async () => {
    if (!jd.trim()) {
      toast.error("Please paste a job description first");
      return;
    }
    setIsMatching(true);
    setResult(null);
    try {
      const res = await matchByJd({ jobDescription: jd, limit: 20 });
      setResult(res);

      // Persist results
      saveSearch({
        query: jd,
        type: "job_description",
        resultCount: res.matches.length,
        jobRequirements: res.jobRequirements,
        matchResults: res.matches,
      }).catch(() => { /* non-critical */ });

      if (res.matches.length === 0) {
        toast.info("No matching candidates found. Try a different job description.");
      }
    } catch {
      toast.error("Matching failed. Please check your Hercules Cloud balance and try again.");
    } finally {
      setIsMatching(false);
    }
  };

  const handleRestore = (entry: JdHistoryEntry) => {
    setJd(entry.query);
    if (entry.jobRequirements && entry.matchResults) {
      setResult({ jobRequirements: entry.jobRequirements, matches: entry.matchResults });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Job Description Matching</h1>
        <p className="text-muted-foreground text-sm">
          Paste a job description and AI will find and rank the best-fit candidates from your CV pool — with a detailed match breakdown.
        </p>
      </div>

      {/* Recent JD match history */}
      <JdHistoryPanel onRestore={handleRestore} />

      {/* JD input panel */}
      <div className="bg-card border rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" />
            Job Description
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setJd(EXAMPLE_JD)}
              className="text-xs bg-muted hover:bg-accent text-foreground/70 hover:text-foreground px-2 py-1 rounded-md transition-colors cursor-pointer"
            >
              Load example
            </button>
            {jd && (
              <button
                onClick={() => { setJd(""); setResult(null); }}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>
        <Textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the full job description here — include title, requirements, responsibilities, experience needed, location, etc."
          className="min-h-[200px] resize-none font-mono text-xs leading-relaxed mb-4"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            The more detail in the JD, the more accurate the matching.
          </p>
          <Button onClick={handleMatch} disabled={isMatching || !jd.trim()} className="gap-2">
            {isMatching ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Matching candidates...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Find Matches</>
            )}
          </Button>
        </div>
      </div>

      {/* Loading skeletons */}
      <AnimatePresence>
        {isMatching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Parsing job requirements and scoring all candidates...</span>
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {result && !isMatching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <JobRequirementsPanel req={result.jobRequirements} />

            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">
                {result.matches.length > 0 ? (
                  <span>{result.matches.length} candidate{result.matches.length !== 1 ? "s" : ""} matched</span>
                ) : (
                  <span className="text-muted-foreground">No candidates matched this job description</span>
                )}
              </p>
              {result.matches.length > 0 && (
                <p className="text-xs text-muted-foreground">Click a card to see full breakdown</p>
              )}
            </div>

            <div className="space-y-2.5">
              {result.matches.map((m, i) => (
                <MatchCard key={m.cvId} match={m} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function JdMatchPage() {
  return (
    <Authenticated>
      <AppLayout>
        <JdMatchContent />
      </AppLayout>
    </Authenticated>
  );
}
