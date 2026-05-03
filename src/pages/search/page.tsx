import { useState } from "react";
import { useAction, useQuery } from "convex/react";
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
import {
  Search, Sparkles, Briefcase, MapPin, GraduationCap,
  ChevronRight, User, Loader2, X
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.js";

type CvResult = {
  cvId: string;
  score: number;
  reason: string;
};

const INDUSTRIES = [
  "Technology", "Finance", "Healthcare", "FMCG", "Retail",
  "Manufacturing", "Energy", "Education", "Consulting",
  "Marketing", "Legal", "Real Estate", "Hospitality", "Media", "Logistics",
];

const SENIORITIES = ["junior", "mid", "senior", "lead", "executive"];

const EXAMPLE_QUERIES = [
  "Give me all FMCG candidates with at least 5 years experience",
  "Find senior software engineers who know React and TypeScript",
  "Marketing directors in Egypt or UAE with luxury brand experience",
  "Finance professionals with investment banking background",
  "HR managers with talent acquisition expertise",
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

function SearchContent() {
  const [tab, setTab] = useState<"natural" | "jd">("natural");
  const [query, setQuery] = useState("");
  const [jd, setJd] = useState("");
  const [industry, setIndustry] = useState<string>("");
  const [seniority, setSeniority] = useState<string>("");
  const [results, setResults] = useState<CvResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const aiSearch = useAction(api.cvProcessing.aiSearch);

  const handleSearch = async () => {
    const searchQuery = tab === "natural" ? query : jd;
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    setIsSearching(true);
    setResults(null);
    try {
      const res = await aiSearch({
        query: searchQuery,
        industry: industry || undefined,
        seniority: seniority || undefined,
        limit: 20,
      });
      setResults(res);
      if (res.length === 0) {
        toast.info("No matching CVs found. Try a different query or adjust filters.");
      }
    } catch (err) {
      toast.error("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Search CVs</h1>
        <p className="text-muted-foreground text-sm">
          Use natural language or paste a job description to find matching candidates.
        </p>
      </div>

      {/* Search panel */}
      <div className="bg-card border rounded-xl p-5 mb-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "natural" | "jd")}>
          <TabsList className="mb-4">
            <TabsTrigger value="natural" className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Natural Language
            </TabsTrigger>
            <TabsTrigger value="jd" className="gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />
              Job Description
            </TabsTrigger>
          </TabsList>

          <TabsContent value="natural" className="space-y-3">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Give me all FMCG candidates with at least 5 years experience in supply chain"
              className="min-h-[80px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSearch();
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuery(q)}
                  className="text-xs bg-accent text-accent-foreground px-2 py-1 rounded-md hover:bg-accent/80 transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="jd" className="space-y-3">
            <Textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full job description here..."
              className="min-h-[160px] resize-none font-mono text-xs"
            />
            <button
              onClick={() => setJd(EXAMPLE_JD)}
              className="text-xs bg-accent text-accent-foreground px-2 py-1 rounded-md hover:bg-accent/80 transition-colors cursor-pointer"
            >
              Load example JD
            </button>
          </TabsContent>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t">
          <Select value={industry || "all"} onValueChange={(v) => setIndustry(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44 h-8 text-xs">
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
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="All levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {SENIORITIES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}            </SelectContent>
          </Select>

          {(industry || seniority) && (
            <button
              onClick={() => { setIndustry(""); setSeniority(""); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}

          <div className="ml-auto">
            <Button onClick={handleSearch} disabled={isSearching} className="gap-2 h-8 text-xs">
              {isSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      {isSearching && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {results !== null && !isSearching && (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            {results.length} result{results.length !== 1 ? "s" : ""} found
          </p>
          <div className="space-y-3">
            {results.map((r) => (
              <CvResultCard key={r.cvId} cvId={r.cvId as Id<"cvs">} reason={r.reason} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CvResultCard({ cvId, reason }: { cvId: Id<"cvs">; reason: string }) {
  const cv = useQuery(api.cvs.getCv, { cvId });

  if (!cv) return <Skeleton className="h-24 rounded-xl" />;

  return (
    <Link to={`/cv/${cvId}`}>
      <div className="bg-card border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
              <User className="w-4 h-4 text-accent-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-semibold text-sm">{cv.candidateName ?? cv.fileName}</h3>
                {cv.seniority && (
                  <Badge variant="secondary" className="text-xs capitalize">{cv.seniority}</Badge>
                )}
                {cv.industry && (
                  <Badge variant="outline" className="text-xs">{cv.industry}</Badge>
                )}
              </div>
              {cv.currentTitle && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Briefcase className="w-3 h-3" />
                  {cv.currentTitle}
                  {cv.yearsOfExperience && <span>· {cv.yearsOfExperience} yrs exp</span>}
                </p>
              )}
              {cv.location && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {cv.location}
                </p>
              )}
              {reason && (
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{reason}</p>
              )}
              {cv.skills && cv.skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {cv.skills.slice(0, 5).map((s) => (
                    <span key={s} className="text-xs bg-muted px-1.5 py-0.5 rounded">{s}</span>
                  ))}
                  {cv.skills.length > 5 && (
                    <span className="text-xs text-muted-foreground">+{cv.skills.length - 5} more</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
        </div>
      </div>
    </Link>
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
