import { useState, useRef, useEffect } from "react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated } from "convex/react";
import AppLayout from "@/components/app-layout.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Sparkles, Briefcase, MapPin,
  ChevronRight, User, Loader2, X, Clock,
  CheckCircle, Hash, ArrowRight,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.js";
import { cn } from "@/lib/utils.ts";

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

const EXAMPLE_JD = `Job Title: Senior Supply Chain Manager

We are looking for an experienced Supply Chain Manager to join our FMCG company.

Requirements:
- 7+ years of experience in supply chain management
- Experience in FMCG or consumer goods industry
- Strong knowledge of logistics, procurement, and inventory management
- Proven track record managing cross-functional teams
- Fluency in English and Arabic preferred
- Based in or willing to relocate to Cairo, Egypt`;

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
      <span className="text-xs text-muted-foreground hidden sm:inline">{score}%</span>
    </div>
  );
}

function CvResultCard({ cvId, score, reason, index }: {
  cvId: Id<"cvs">; score: number; reason: string; index: number;
}) {
  const cv = useQuery(api.cvs.getCv, { cvId });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
    >
      {!cv ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <Link to={`/cv/${cvId}`}>
          <div className="bg-card border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group">
            <div className="flex items-start gap-3">
              {/* Rank number */}
              <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0 mt-0.5">
                {index + 1}
              </div>

              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-accent-foreground" />
              </div>

              {/* Info */}
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
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
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
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {cv.location}
                  </p>
                )}

                {/* AI match reason */}
                {reason && (
                  <p className="text-xs text-primary/80 bg-accent/40 rounded-md px-2 py-1 mb-2">
                    {reason}
                  </p>
                )}

                {cv.skills && cv.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
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
          </div>
        </Link>
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
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);

  const aiSearch = useAction(api.cvProcessing.aiSearch);

  const handleSearch = async () => {
    const searchQuery = tab === "natural" ? query : jd;
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    setIsSearching(true);
    setSearchResponse(null);
    setLastQuery(searchQuery);

    try {
      const res = await aiSearch({
        query: searchQuery,
        industry: industry || undefined,
        seniority: seniority || undefined,
        limit: 20,
      });
      setSearchResponse(res);
      if (res.results.length === 0) {
        toast.info("No matching CVs found. Try rephrasing your query.");
      } else {
        // Scroll to results
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    } catch {
      toast.error("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
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
              placeholder="Paste the full job description here — include requirements, responsibilities, experience needed..."
              className="min-h-[180px] resize-none font-mono text-xs leading-relaxed"
              onKeyDown={handleKeyDown}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setJd(EXAMPLE_JD)}
                className="text-xs bg-muted hover:bg-accent text-foreground/70 hover:text-foreground px-2 py-1 rounded-md transition-colors cursor-pointer"
              >
                Load example JD
              </button>
              {jd && (
                <button onClick={() => setJd("")} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t">
          <Select value={industry || "all"} onValueChange={(v) => setIndustry(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="All industries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All industries</SelectItem>
              {INDUSTRIES.map((i) => (
                <SelectItem key={i} value={i}>{i}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={seniority || "all"} onValueChange={(v) => setSeniority(v === "all" ? "" : v)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="All levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {SENIORITIES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(industry || seniority) && (
            <button
              onClick={() => { setIndustry(""); setSeniority(""); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">Cmd+Enter to search</span>
            <Button onClick={handleSearch} disabled={isSearching} className="gap-2 h-9">
              {isSearching ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...</>
              ) : (
                <><Search className="w-3.5 h-3.5" /> Search</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      <AnimatePresence>
        {isSearching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>AI is interpreting your search and matching candidates...</span>
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {searchResponse && !isSearching && (
          <div ref={resultsRef}>
            {/* AI interpretation banner */}
            <InterpretationBanner interp={searchResponse.interpretation} />

            {/* Result count & match legend */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">
                {searchResponse.results.length > 0 ? (
                  <span>{searchResponse.results.length} candidate{searchResponse.results.length !== 1 ? "s" : ""} matched</span>
                ) : (
                  <span className="text-muted-foreground">No candidates matched this search</span>
                )}
              </p>
              {searchResponse.results.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Strong</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Good</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" /> Possible</span>
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              {searchResponse.results.map((r, i) => (
                <CvResultCard
                  key={r.cvId}
                  cvId={r.cvId as Id<"cvs">}
                  score={r.score}
                  reason={r.reason}
                  index={i}
                />
              ))}
            </div>

            {searchResponse.results.length > 0 && (
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
    <Authenticated>
      <AppLayout>
        <SearchContent />
      </AppLayout>
    </Authenticated>
  );
}
