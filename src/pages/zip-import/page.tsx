import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PlusIcon, TrashIcon, PlayIcon, PauseIcon, StopCircleIcon, CheckCircleIcon, RefreshCwIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "setup" | "importing" | "done";

// ─── Component ────────────────────────────────────────────────────────────────

export default function ZipImportPage() {
  const [urls, setUrls] = useState<string[]>(["", "", ""]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [jobId, setJobId] = useState<Id<"zipImportJobs"> | null>(null);
  const [isPausing, setIsPausing] = useState(false);

  const createJob = useMutation(api.zip.mutations.createJob);
  const setStatus = useMutation(api.zip.mutations.setStatus);
  const processBatch = useAction(api.zip.process.processBatch);

  const job = useQuery(api.zip.mutations.getJob, jobId ? { jobId } : "skip");

  // Keep a ref to signal the batch loop to stop
  const shouldStopRef = useRef(false);
  const isLoopRunningRef = useRef(false);

  // If there's an active job on mount, resume UI state
  const jobs = useQuery(api.zip.mutations.listJobs, {});
  useEffect(() => {
    if (!jobId && jobs && jobs.length > 0) {
      const latest = jobs[0];
      if (latest.status === "running" || latest.status === "paused") {
        setJobId(latest._id);
        setPhase("importing");
      } else if (latest.status === "done") {
        setJobId(latest._id);
        setPhase("done");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  // Identity for token (needed by processBatch)
  const identity = useQuery(api.users.getCurrentUser, {});

  // ─── Batch loop ────────────────────────────────────────────────────────────

  async function runBatchLoop(jId: Id<"zipImportJobs">, tokenIdentifier: string) {
    if (isLoopRunningRef.current) return;
    isLoopRunningRef.current = true;
    shouldStopRef.current = false;

    try {
      while (!shouldStopRef.current) {
        const result = await processBatch({ jobId: jId, tokenIdentifier });
        if (result.done) {
          setPhase("done");
          toast.success("ZIP import complete!");
          break;
        }
        // Check if paused/stopped externally
        if (shouldStopRef.current) break;
        // Small delay to avoid hammering
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Import error: ${msg}`);
    } finally {
      isLoopRunningRef.current = false;
      setIsPausing(false);
    }
  }

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleStart() {
    const validUrls = urls.filter((u) => u.trim().length > 0);
    if (validUrls.length === 0) {
      toast.error("Please enter at least one ZIP URL");
      return;
    }
    try {
      const jId = await createJob({ urls: validUrls });
      setJobId(jId);
      setPhase("importing");
      const tokenId = identity?.tokenIdentifier;
      if (!tokenId) { toast.error("Not authenticated"); return; }
      runBatchLoop(jId, tokenId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start import");
    }
  }

  async function handlePause() {
    if (!jobId) return;
    setIsPausing(true);
    shouldStopRef.current = true;
    await setStatus({ jobId, status: "paused" });
    toast.info("Import paused — you can resume anytime");
  }

  async function handleResume() {
    if (!jobId) return;
    const tokenId = identity?.tokenIdentifier;
    if (!tokenId) { toast.error("Not authenticated"); return; }
    await setStatus({ jobId, status: "running" });
    runBatchLoop(jobId, tokenId);
    toast.info("Import resumed");
  }

  async function handleStop() {
    if (!jobId) return;
    shouldStopRef.current = true;
    await setStatus({ jobId, status: "stopped" });
    toast.info("Import stopped");
  }

  function handleNewImport() {
    setJobId(null);
    setPhase("setup");
    setUrls(["", "", ""]);
  }

  // ─── URL input helpers ─────────────────────────────────────────────────────

  function setUrl(index: number, value: string) {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function addUrl() {
    setUrls((prev) => [...prev, ""]);
  }

  function removeUrl(index: number) {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }

  // ─── Progress calc ─────────────────────────────────────────────────────────

  const progressPct = job && job.totalFound > 0
    ? Math.min(100, Math.round(((job.imported + job.duplicates + job.notCv + job.errors) / job.totalFound) * 100))
    : 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ZIP Bulk Import</h1>
        <p className="text-muted-foreground mt-1">Import CVs from Workable ZIP archives (100k+ files supported)</p>
      </div>

      {/* ── Setup Phase ── */}
      {phase === "setup" && (
        <Card>
          <CardHeader>
            <CardTitle>ZIP Download URLs</CardTitle>
            <CardDescription>Paste the pre-signed download links from Workable. Up to 3 ZIPs supported.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {urls.map((url, i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="flex-1 space-y-1">
                  <Label>ZIP URL {i + 1}</Label>
                  <Input
                    placeholder="https://workable-export.s3.amazonaws.com/..."
                    value={url}
                    onChange={(e) => setUrl(i, e.target.value)}
                  />
                </div>
                {urls.length > 1 && (
                  <Button variant="ghost" size="icon" className="mt-6 cursor-pointer" onClick={() => removeUrl(i)}>
                    <TrashIcon className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={addUrl} className="cursor-pointer">
                <PlusIcon className="w-4 h-4 mr-2" /> Add another URL
              </Button>
              <Button onClick={handleStart} className="cursor-pointer ml-auto">
                <PlayIcon className="w-4 h-4 mr-2" /> Start Import
              </Button>
            </div>

            <p className="text-xs text-muted-foreground pt-2">
              Images and non-CV documents (cover letters etc.) are automatically filtered out. Duplicate CVs already in the system are skipped.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Importing Phase ── */}
      {phase === "importing" && job && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Import Progress</CardTitle>
                <Badge
                  variant={
                    job.status === "running" ? "default" :
                    job.status === "paused" ? "secondary" :
                    job.status === "error" ? "destructive" : "outline"
                  }
                >
                  {job.status === "running" && "Running"}
                  {job.status === "paused" && "Paused"}
                  {job.status === "stopped" && "Stopped"}
                  {job.status === "error" && "Error"}
                  {job.status === "done" && "Done"}
                </Badge>
              </div>
              <CardDescription>
                Processing ZIP {Math.min(job.currentUrlIndex + 1, job.urls.length)} of {job.urls.length}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Overall progress</span>
                  <span>{progressPct}%</span>
                </div>
                <Progress value={progressPct} className="h-2" />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Imported" value={job.imported} color="text-green-600" />
                <StatCard label="Duplicates" value={job.duplicates} color="text-yellow-600" />
                <StatCard label="Not a CV" value={job.notCv} color="text-muted-foreground" />
                <StatCard label="Errors" value={job.errors} color="text-destructive" />
              </div>

              {job.errorMessage && (
                <p className="text-sm text-destructive bg-destructive/10 rounded p-3">{job.errorMessage}</p>
              )}

              <div className="flex gap-2 flex-wrap">
                {job.status === "running" && (
                  <Button
                    variant="secondary"
                    onClick={handlePause}
                    disabled={isPausing}
                    className="cursor-pointer"
                  >
                    <PauseIcon className="w-4 h-4 mr-2" />
                    {isPausing ? "Pausing…" : "Pause"}
                  </Button>
                )}
                {job.status === "paused" && (
                  <Button onClick={handleResume} className="cursor-pointer">
                    <PlayIcon className="w-4 h-4 mr-2" /> Resume
                  </Button>
                )}
                {(job.status === "running" || job.status === "paused") && (
                  <Button variant="destructive" onClick={handleStop} className="cursor-pointer">
                    <StopCircleIcon className="w-4 h-4 mr-2" /> Stop
                  </Button>
                )}
                {(job.status === "stopped" || job.status === "error") && (
                  <Button onClick={handleNewImport} className="cursor-pointer">
                    <RefreshCwIcon className="w-4 h-4 mr-2" /> New Import
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Done Phase ── */}
      {(phase === "done" || (phase === "importing" && job?.status === "done")) && job && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 text-green-600" />
              <CardTitle>Import Complete</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Imported" value={job.imported} color="text-green-600" />
              <StatCard label="Duplicates" value={job.duplicates} color="text-yellow-600" />
              <StatCard label="Not a CV" value={job.notCv} color="text-muted-foreground" />
              <StatCard label="Errors" value={job.errors} color="text-destructive" />
            </div>
            <Button onClick={handleNewImport} className="cursor-pointer w-full">
              <RefreshCwIcon className="w-4 h-4 mr-2" /> Start Another Import
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Past Jobs ── */}
      {phase === "setup" && jobs && jobs.filter(j => j.status === "done" || j.status === "stopped").length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past Imports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.filter(j => j.status === "done" || j.status === "stopped").map((j) => (
              <div key={j._id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                <span className="text-muted-foreground">{new Date(j.startedAt).toLocaleDateString()}</span>
                <span>{j.imported.toLocaleString()} imported</span>
                <Badge variant={j.status === "done" ? "default" : "secondary"}>{j.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
