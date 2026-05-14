import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
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
import JSZip from "jszip";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "setup" | "importing" | "done";

const CV_EXTENSIONS = [".pdf", ".doc", ".docx"];

function isCvExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return CV_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getFileType(name: string): "pdf" | "docx" | "doc" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".doc")) return "doc";
  return "pdf";
}

function getMimeType(fileType: string): string {
  if (fileType === "pdf") return "application/pdf";
  if (fileType === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/msword";
}

async function computeHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ZipImportPage() {
  const [urls, setUrls] = useState<string[]>(["", "", ""]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [jobId, setJobId] = useState<Id<"zipImportJobs"> | null>(null);
  const [isPausing, setIsPausing] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");

  const createJob = useMutation(api.zip.mutations.createJob);
  const setStatus = useMutation(api.zip.mutations.setStatus);
  const updateProgressPublic = useMutation(api.zip.mutations.updateProgressPublic);
  const generateUploadUrl = useMutation(api.cvs.generateUploadUrl);
  const createCvRecord = useMutation(api.zip.mutations.createCvFromBrowser);
  const findByHash = useMutation(api.zip.mutations.checkDuplicate);

  const job = useQuery(api.zip.mutations.getJob, jobId ? { jobId } : "skip");
  const jobs = useQuery(api.zip.mutations.listJobs, {});
  const identity = useQuery(api.users.getCurrentUser, {});

  const shouldStopRef = useRef(false);
  const isRunningRef = useRef(false);

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

  // ─── Main browser-side import loop ──────────────────────────────────────────

  async function runImport(
    jId: Id<"zipImportJobs">,
    zipUrls: string[],
    startUrlIdx: number,
    startFileIdx: number,
    initialCounters: { imported: number; duplicates: number; notCv: number; errors: number; totalFound: number }
  ) {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    shouldStopRef.current = false;

    let { imported, duplicates, notCv, errors, totalFound } = initialCounters;

    try {
      for (let urlIdx = startUrlIdx; urlIdx < zipUrls.length; urlIdx++) {
        if (shouldStopRef.current) break;

        const url = zipUrls[urlIdx];
        setStatusLabel(`Downloading ZIP ${urlIdx + 1} of ${zipUrls.length}…`);

        // ── Download ZIP in browser ──
        let zipData: JSZip;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          setStatusLabel(`Scanning ZIP ${urlIdx + 1} of ${zipUrls.length}…`);
          zipData = await JSZip.loadAsync(buf);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(`Failed to download ZIP ${urlIdx + 1}: ${msg}`);
          errors++;
          await updateProgressPublic({ jobId: jId, currentUrlIndex: urlIdx + 1, currentFileIndex: 0, totalFound, imported, duplicates, notCv, errors, status: "running" });
          continue;
        }

        // ── Collect CV files ──
        const allEntries = Object.values(zipData.files).filter((f) => !f.dir);
        const cvFiles = allEntries.filter((f) => isCvExtension(f.name));
        const nonCvCount = allEntries.length - cvFiles.length;
        notCv += nonCvCount;
        totalFound += cvFiles.length;

        // ── Process files one by one, starting at cursor ──
        const fileStartIdx = urlIdx === startUrlIdx ? startFileIdx : 0;

        for (let fileIdx = fileStartIdx; fileIdx < cvFiles.length; fileIdx++) {
          if (shouldStopRef.current) break;

          const entry = cvFiles[fileIdx];
          const fileName = entry.name.split("/").pop() ?? entry.name;
          setStatusLabel(`ZIP ${urlIdx + 1}/${zipUrls.length} — file ${fileIdx + 1} of ${cvFiles.length}: ${fileName}`);

          try {
            const buffer = await entry.async("arraybuffer");
            const fileType = getFileType(fileName);
            const fileHash = await computeHash(buffer);

            // Check duplicate
            const isDuplicate = await findByHash({ fileHash });
            if (isDuplicate) {
              duplicates++;
            } else {
              // Get upload URL from Convex
              const uploadUrl = await generateUploadUrl();

              // Upload file to Convex storage
              const uploadRes = await fetch(uploadUrl, {
                method: "POST",
                headers: { "Content-Type": getMimeType(fileType) },
                body: buffer,
              });
              if (!uploadRes.ok) throw new Error(`Upload failed: HTTP ${uploadRes.status}`);
              const { storageId } = await uploadRes.json() as { storageId: Id<"_storage"> };

              // Create CV record in DB
              await createCvRecord({
                storageId,
                fileName,
                fileType,
                fileSize: buffer.byteLength,
                fileHash,
              });

              imported++;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`Error processing ${fileName}:`, msg);
            errors++;
          }

          // Save cursor every 10 files
          if (fileIdx % 10 === 0) {
            await updateProgressPublic({
              jobId: jId,
              currentUrlIndex: urlIdx,
              currentFileIndex: fileIdx,
              totalFound,
              imported,
              duplicates,
              notCv,
              errors,
              status: "running",
            });
          }
        }

        if (!shouldStopRef.current) {
          // Mark this ZIP done, move to next
          await updateProgressPublic({
            jobId: jId,
            currentUrlIndex: urlIdx + 1,
            currentFileIndex: 0,
            totalFound,
            imported,
            duplicates,
            notCv,
            errors,
            status: "running",
          });
          toast.success(`ZIP ${urlIdx + 1} complete — ${imported.toLocaleString()} CVs imported so far`);
        }
      }

      if (!shouldStopRef.current) {
        await updateProgressPublic({ jobId: jId, currentUrlIndex: zipUrls.length, currentFileIndex: 0, totalFound, imported, duplicates, notCv, errors, status: "done" });
        setPhase("done");
        toast.success(`All done! ${imported.toLocaleString()} CVs imported.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Import error: ${msg}`);
      await updateProgressPublic({ jobId: jId, currentUrlIndex: startUrlIdx, currentFileIndex: 0, totalFound, imported, duplicates, notCv, errors, status: "error", errorMessage: msg });
    } finally {
      isRunningRef.current = false;
      setIsPausing(false);
    }
  }

  // ─── Handlers ────────────────────────────────────────────────────────────────

  async function handleStart() {
    const validUrls = urls.filter((u) => u.trim().length > 0);
    if (validUrls.length === 0) { toast.error("Please enter at least one ZIP URL"); return; }
    if (!identity) { toast.error("Not authenticated"); return; }
    try {
      const jId = await createJob({ urls: validUrls });
      setJobId(jId);
      setPhase("importing");
      runImport(jId, validUrls, 0, 0, { imported: 0, duplicates: 0, notCv: 0, errors: 0, totalFound: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start");
    }
  }

  async function handlePause() {
    if (!jobId) return;
    setIsPausing(true);
    shouldStopRef.current = true;
    await setStatus({ jobId, status: "paused" });
    toast.info("Import paused — resume anytime, even from another browser session");
  }

  async function handleResume() {
    if (!jobId || !job) return;
    if (!identity) { toast.error("Not authenticated"); return; }
    await setStatus({ jobId, status: "running" });
    runImport(jobId, job.urls, job.currentUrlIndex, job.currentFileIndex, {
      imported: job.imported,
      duplicates: job.duplicates,
      notCv: job.notCv,
      errors: job.errors,
      totalFound: job.totalFound,
    });
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
    setStatusLabel("");
  }

  function setUrl(i: number, v: string) { setUrls((prev) => prev.map((u, idx) => (idx === i ? v : u))); }
  function addUrl() { setUrls((prev) => [...prev, ""]); }
  function removeUrl(i: number) { setUrls((prev) => prev.filter((_, idx) => idx !== i)); }

  // ─── Progress ─────────────────────────────────────────────────────────────────

  const processed = job ? job.imported + job.duplicates + job.notCv + job.errors : 0;
  const progressPct = job && job.totalFound > 0 ? Math.min(100, Math.round((processed / job.totalFound) * 100)) : 0;

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
            {statusLabel && <CardDescription className="truncate">{statusLabel}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Files processed</span>
                <span>{processed.toLocaleString()} / {job.totalFound.toLocaleString()}</span>
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
                  <PauseIcon className="w-4 h-4 mr-2" /> {isPausing ? "Pausing…" : "Pause"}
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
      {(phase === "done" || job?.status === "done") && job && (
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
              CVs are being processed in the background — they will appear searchable as they complete.
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
