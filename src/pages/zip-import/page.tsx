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

type Phase = "setup" | "importing" | "done";

export default function ZipImportPage() {
  const [urls, setUrls] = useState<string[]>(["", "", ""]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [jobId, setJobId] = useState<Id<"zipImportJobs"> | null>(null);
  const [isPausing, setIsPausing] = useState(false);
  // Per-ZIP progress label
  const [currentZipLabel, setCurrentZipLabel] = useState("");

  const createJob = useMutation(api.zip.mutations.createJob);
  const setStatus = useMutation(api.zip.mutations.setStatus);
  const updateProgress = useMutation(api.zip.mutations.updateProgressPublic);
  const processZipUrl = useAction(api.zip.process.processZipUrl);

  const job = useQuery(api.zip.mutations.getJob, jobId ? { jobId } : "skip");
  const jobs = useQuery(api.zip.mutations.listJobs, {});

  const shouldStopRef = useRef(false);
  const isLoopRunningRef = useRef(false);

  const identity = useQuery(api.users.getCurrentUser, {});

  // Resume any active job on mount
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

  // ─── Main loop: iterate ZIP URLs one by one ─────────────────────────────────

  async function runImportLoop(jId: Id<"zipImportJobs">, zipUrls: string[], startUrlIndex: number, tokenIdentifier: string) {
    if (isLoopRunningRef.current) return;
    isLoopRunningRef.current = true;
    shouldStopRef.current = false;

    let totalImported = 0;
    let totalDuplicates = 0;
    let totalNotCv = 0;
    let totalErrors = 0;
    let totalFound = 0;

    // Load existing counters from DB if resuming
    const currentJob = await (async () => {
      // We don't have a direct one-off query here, so use the reactive job state
      return null;
    })();
    void currentJob;

    try {
      for (let i = startUrlIndex; i < zipUrls.length; i++) {
        if (shouldStopRef.current) break;

        setCurrentZipLabel(`Processing ZIP ${i + 1} of ${zipUrls.length}…`);

        // Update DB: mark which URL we're on
        await updateProgress({
          jobId: jId,
          currentUrlIndex: i,
          currentFileIndex: 0,
          totalFound,
          imported: totalImported,
          duplicates: totalDuplicates,
          notCv: totalNotCv,
          errors: totalErrors,
          status: "running",
        });

        try {
          const result = await processZipUrl({
            jobId: jId,
            url: zipUrls[i],
            urlIndex: i,
            tokenIdentifier,
          });

          totalImported += result.imported;
          totalDuplicates += result.duplicates;
          totalNotCv += result.notCv;
          totalErrors += result.errors;
          totalFound += result.totalFound;

          // Save progress after each ZIP
          await updateProgress({
            jobId: jId,
            currentUrlIndex: i + 1,
            currentFileIndex: 0,
            totalFound,
            imported: totalImported,
            duplicates: totalDuplicates,
            notCv: totalNotCv,
            errors: totalErrors,
            status: "running",
          });

          toast.success(`ZIP ${i + 1} done — ${result.imported.toLocaleString()} CVs stored`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(`ZIP ${i + 1} failed: ${msg}`);
          totalErrors++;
          // Continue to next ZIP even if one fails
        }
      }

      if (!shouldStopRef.current) {
        // All ZIPs done
        await updateProgress({
          jobId: jId,
          currentUrlIndex: zipUrls.length,
          currentFileIndex: 0,
          totalFound,
          imported: totalImported,
          duplicates: totalDuplicates,
          notCv: totalNotCv,
          errors: totalErrors,
          status: "done",
        });
        setPhase("done");
        toast.success(`All ZIPs imported! ${totalImported.toLocaleString()} CVs added.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Import failed: ${msg}`);
      await updateProgress({
        jobId: jId,
        currentUrlIndex: startUrlIndex,
        currentFileIndex: 0,
        totalFound,
        imported: totalImported,
        duplicates: totalDuplicates,
        notCv: totalNotCv,
        errors: totalErrors,
        status: "error",
        errorMessage: msg,
      });
    } finally {
      isLoopRunningRef.current = false;
      setIsPausing(false);
    }
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function handleStart() {
    const validUrls = urls.filter((u) => u.trim().length > 0);
    if (validUrls.length === 0) {
      toast.error("Please enter at least one ZIP URL");
      return;
    }
    const tokenId = identity?.tokenIdentifier;
    if (!tokenId) { toast.error("Not authenticated"); return; }
    try {
      const jId = await createJob({ urls: validUrls });
      setJobId(jId);
      setPhase("importing");
      runImportLoop(jId, validUrls, 0, tokenId);
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
    if (!jobId || !job) return;
    const tokenId = identity?.tokenIdentifier;
    if (!tokenId) { toast.error("Not authenticated"); return; }
    await setStatus({ jobId, status: "running" });
    runImportLoop(jobId, job.urls, job.currentUrlIndex, tokenId);
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

  // ─── URL helpers ─────────────────────────────────────────────────────────────

  function setUrl(index: number, value: string) {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }
  function addUrl() { setUrls((prev) => [...prev, ""]); }
  function removeUrl(index: number) { setUrls((prev) => prev.filter((_, i) => i !== index)); }

  // ─── Progress ─────────────────────────────────────────────────────────────────

  const processedCount = job ? (job.imported + job.duplicates + job.notCv + job.errors) : 0;
  const progressPct = job && job.totalFound > 0
    ? Math.min(100, Math.round((processedCount / job.totalFound) * 100))
    : 0;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ZIP Bulk Import</h1>
        <p className="text-muted-foreground mt-1">Import CVs from Workable ZIP archives (100k+ files supported)</p>
      </div>

      {/* Setup */}
      {phase === "setup" && (
        <Card>
          <CardHeader>
            <CardTitle>ZIP Download URLs</CardTitle>
            <CardDescription>Paste the pre-signed download links from Workable. Each link should be a ZIP archive.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {urls.map((url, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label>ZIP URL {i + 1}</Label>
                  <Input
                    placeholder="https://workable-export.s3.amazonaws.com/..."
                    value={url}
                    onChange={(e) => setUrl(i, e.target.value)}
                  />
                </div>
                {urls.length > 1 && (
                  <Button variant="ghost" size="icon" className="cursor-pointer shrink-0" onClick={() => removeUrl(i)}>
                    <TrashIcon className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={addUrl} className="cursor-pointer">
                <PlusIcon className="w-4 h-4 mr-2" /> Add URL
              </Button>
              <Button onClick={handleStart} className="cursor-pointer ml-auto">
                <PlayIcon className="w-4 h-4 mr-2" /> Start Import
              </Button>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Images and non-CV files are filtered out automatically. Duplicates already in the system are skipped.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Importing */}
      {phase === "importing" && job && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Import Progress</CardTitle>
              <Badge variant={job.status === "running" ? "default" : job.status === "paused" ? "secondary" : "destructive"}>
                {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
              </Badge>
            </div>
            <CardDescription>{currentZipLabel || `Processing ZIP ${Math.min(job.currentUrlIndex + 1, job.urls.length)} of ${job.urls.length}`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Files processed</span>
                <span>{processedCount.toLocaleString()} / {job.totalFound.toLocaleString()}</span>
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
                <Button variant="secondary" onClick={handlePause} disabled={isPausing} className="cursor-pointer">
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
      )}

      {/* Done */}
      {(phase === "done" || (job?.status === "done")) && job && (
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
            <p className="text-sm text-muted-foreground">
              CVs are being processed in the background — they will appear in the database as they complete.
            </p>
            <Button onClick={handleNewImport} className="cursor-pointer w-full">
              <RefreshCwIcon className="w-4 h-4 mr-2" /> Start Another Import
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Past jobs */}
      {phase === "setup" && jobs && jobs.filter(j => j.status === "done" || j.status === "stopped").length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Past Imports</CardTitle></CardHeader>
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
