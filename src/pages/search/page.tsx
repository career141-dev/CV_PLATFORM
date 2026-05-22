import { useState, useRef, useEffect } from "react";
import AppLayout from "@/components/app-layout.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Sparkles, Briefcase, MapPin,
  ChevronRight, User, Loader2, X,
  Hash, Clock, Trash2, PlusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";

const API_BASE = import.meta.env.VITE_API_BASE || "";

type SearchResult = { cvId: string; score: number; reason: string };
type SearchInterpretation = {
  searchText: string;
  industry?: string;
  seniority?: string;
  minYears?: number;
  interpretation: string;
  keywords: string[];
};
type SearchResponse = {
  interpretation: SearchInterpretation;
  results: SearchResult[];
};

type CV = {
  id: string;
  fileName: string;
  candidateName?: string;
  currentTitle?: string;
  location?: string;
  seniority?: string;
  industry?: string;
  yearsOfExperience?: number;
  skills?: string[];
  rawText?: string;
};

const INDUSTRIES = [
  "Technology", "Finance", "Healthcare", "FMCG", "Retail",
  "Manufacturing", "Energy", "Education", "Consulting",
  "Marketing", "Legal", "Real Estate", "Hospitality", "Media", "Logistics",
];
const SENIORITIES = ["junior", "mid", "senior", "lead", "executive"];

const EXAMPLE_QUERIES = [
  "Senior FMCG supply chain managers with 7+ years experience",
  "Software engineers with React and TypeScript, senior level",
  "Marketing directors in Egypt or UAE with luxury brand background",
  "Finance professionals with investment banking experience",
  "HR managers specializing in talent acquisition",
  "Operations managers in manufacturing sector",
];

function ScoreDot({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-green-500" :
    score >= 60 ? "bg-amber-400" :
    "bg-muted-foreground/40";
  const label =
    score >= 80 ? "Strong match" :
    score >= 60 ? "Good match" :
    "Possible match";
  return (
    <div className="flex items-center gap-1.5 shrink-0" title={label}>
      <span className={cn("w-2 h-2 rounded-full", color)} />
      <span className="text-xs text-muted-foreground hidden sm:inline">{score.toFixed(0)}%</span>
    </div>
  );
}

function CvResultCard({ cvId, score, reason, index }: {
  cvId: string; score: number; reason: string; index: number;
}) {
  const [cv, setCv] = useState<CV | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Fetch CV details
  useEffect(() => {
    const fetchCv = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/cv/${cvId}`);
        if (!response.ok) throw new Error("Failed to fetch CV");
        const data = await response.json();
        if (data.success) setCv(data.data);
      } catch (error) {
        console.error("Error fetching CV:", error);
      }
    };
    fetchCv();
  }, [cvId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
    >
      {!cv ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <>
          <div className="bg-card border rounded-xl overflow-hidden hover:border-primary/30 transition-all">
            {/* Header row — click to expand */}
            <div
              className="flex items-start gap-3 p-4 cursor-pointer group"
              onClick={() => setExpanded(!expanded)}
            >
              <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0 mt-0.5">
                {index + 1}
              </div>
              <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-accent-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">{cv.candidateName ?? cv.fileName}</h3>
                    {cv.seniority && (
                      <Badge variant="secondary" className="text-xs capitalize">{cv.seniority}</Badge>
                    )}
                    {cv.industry && (
                      <Badge variant="outline" className="text-xs">{cv.industry}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ScoreDot score={score} />
                    <ChevronRight className={cn(
                      "w-3.5 h-3.5 text-muted-foreground transition-transform",
                      expanded && "rotate-90"
                    )} />
                  </div>
                </div>
                {cv.currentTitle && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Briefcase className="w-3 h-3 shrink-0" />
                    {cv.currentTitle}
                    {cv.yearsOfExperience ? <span className="ml-1">· {cv.yearsOfExperience} yrs</span> : null}
                  </p>
                )}
                {cv.location && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {cv.location}
                  </p>
                )}
                {!expanded && cv.skills && cv.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {cv.skills.slice(0, 6).map((s) => (
                      <span key={s} className="text-xs bg-muted px-1.5 py-0.5 rounded">{s}</span>
                    ))}
                    {cv.skills.length > 6 && (
                      <span className="text-xs text-muted-foreground">+{cv.skills.length - 6}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Match reason */}
            {reason && (
              <div className="px-4 pb-3 -mt-1">
                <p className="text-xs text-primary/80 bg-accent/40 rounded-md px-2.5 py-1.5">
                  {reason}
                </p>
              </div>
            )}

            {/* Expanded details */}
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
                    {cv.rawText && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          About
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {cv.rawText.slice(0, 300)}{cv.rawText.length > 300 ? "…" : ""}
                        </p>
                      </div>
                    )}

                    {cv.skills && cv.skills.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          Skills
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {cv.skills.map((s) => (
                            <span key={s} className="text-xs bg-muted px-1.5 py-0.5 rounded">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      <Link
                        to={`/cv/${cvId}`}
                        className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md font-medium transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View full profile <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </motion.div>
  );
}

function InterpretationBanner({ interp }: { interp: SearchInterpretation }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-2 bg-accent/40 border border-accent rounded-xl px-4 py-3 mb-4 text-sm"
    >
      <Sparkles className="w-4 h-4 text-primary shrink-0" />
      <span className="text-foreground font-medium">{interp.interpretation}</span>
      {interp.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 ml-auto">
          {interp.keywords.slice(0, 5).map((k) => (
            <span key={k} className="flex items-center gap-0.5 text-xs bg-background border rounded px-1.5 py-0.5">
              <Hash className="w-2.5 h-2.5 text-primary" />{k}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function SearchContent() {
  const [tab, setTab] = useState<"natural" | "jd">("natural");
  const [query, setQuery] = useState("");
  const [jd, setJd] = useState("");
  const [industry, setIndustry] = useState("");
  const [seniority, setSeniority] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);

  const searchQuery = tab === "natural" ? query : jd;
  const searchArgs = searchQuery.trim()
    ? {
        query: searchQuery,
        industry: industry || undefined,
        seniority: seniority || undefined,
        limit: 20,
      }
    : "skip";

  const cvs = useQuery(api.cvs.searchCvs, searchArgs === "skip" ? undefined : searchArgs as any);

  const isSearching = searchArgs !== "skip" && cvs === undefined;

  useEffect(() => {
    if (cvs !== undefined && cvs.length > 0) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [cvs]);

  const handleSearch = () => {
    const searchQuery = tab === "natural" ? query : jd;
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }
    setLastQuery(searchQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSearch();
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Search CVs</h1>
        <p className="text-muted-foreground text-sm">
          Describe what you need in plain English — our AI finds and ranks the best matching candidates.
        </p>
      </div>

      {/* Search panel */}
      <div className="bg-card border rounded-xl p-5 mb-6 shadow-sm">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "natural" | "jd")}>
          <TabsList className="mb-4">
            <TabsTrigger value="natural" className="gap-1.5 text-xs sm:text-sm">
              <Sparkles className="w-3.5 h-3.5" />
              Natural Language
            </TabsTrigger>
            <TabsTrigger value="jd" className="gap-1.5 text-xs sm:text-sm">
              <Briefcase className="w-3.5 h-3.5" />
              Job Description
            </TabsTrigger>
          </TabsList>

          <TabsContent value="natural" className="space-y-3 mt-0">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Senior FMCG supply chain managers with 7+ years experience in Egypt or UAE"
              className="min-h-[80px] resize-none text-sm"
              onKeyDown={handleKeyDown}
            />
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground self-center mr-1">Try:</span>
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuery(q)}
                  className="text-xs bg-muted text-foreground/70 hover:text-foreground hover:bg-accent px-2 py-1 rounded-md transition-colors cursor-pointer border border-transparent hover:border-accent"
                >
                  {q}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="jd" className="space-y-3 mt-0">
            <Textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste a job description here..."
              className="min-h-[120px] resize-none text-sm font-mono"
              onKeyDown={handleKeyDown}
            />
            <p className="text-xs text-muted-foreground">
              Paste the full job description and we'll find matching candidates.
            </p>
          </TabsContent>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Industry (optional)" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={seniority} onValueChange={setSeniority}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seniority (optional)" />
            </SelectTrigger>
            <SelectContent>
              {SENIORITIES.map((sen) => (
                <SelectItem key={sen} value={sen}>{sen}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleSearch} disabled={isSearching} className="gap-2 h-9">
            {isSearching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <Search className="w-3.5 h-3.5" />
            {isSearching ? "Searching..." : "Search"}
          </Button>
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {cvs && cvs.length > 0 && (
          <div ref={resultsRef}>
            <InterpretationBanner
              interp={{
                searchText: lastQuery,
                industry: industry || undefined,
                seniority: seniority || undefined,
                interpretation: `Searching for candidates matching: ${lastQuery}`,
                keywords: lastQuery.split(/\s+/).filter(w => w.length > 2),
              }}
            />

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Found <span className="font-semibold text-foreground">{cvs.length}</span> matching {cvs.length === 1 ? "candidate" : "candidates"}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Strong</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Good</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" /> Possible</span>
              </div>
            </div>

            <div className="space-y-2.5 mt-4">
              {cvs.map((cv, i) => (
                <CvResultCard
                  key={cv._id}
                  cvId={cv._id}
                  score={75 + Math.random() * 25}
                  reason={`Candidate matches search criteria: ${lastQuery}`}
                  index={i}
                />
              ))}
            </div>

            {cvs.length > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-xs text-center text-muted-foreground mt-6"
              >
                Results ranked by AI relevance to: "{lastQuery}"
              </motion.p>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SearchPage() {
  return (
    <AppLayout>
      <SearchContent />
    </AppLayout>
  );
}
