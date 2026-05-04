import { useState, useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated } from "convex/react";
import AppLayout from "@/components/app-layout.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
import { motion } from "motion/react";
import {
  Building2, Key, CheckCircle2, AlertCircle, Loader2,
  SkipForward, XCircle, ExternalLink, Info, RotateCcw, Play,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.js";
import { cn } from "@/lib/utils.ts";

type ImportStatus = {
  _id: Id<"workableImports">;
  status: "running" | "done" | "error" | "stopped";
  totalCandidates: number;
  imported: number;
  skipped: number;
  failed: number;
  startedAt: string;
  errorMessage?: string;
  lastCursor?: string;
  subdomain?: string;
};

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <motion.div
        className={cn("h-full rounded-full", color)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-muted/30 border rounded-xl p-4 flex items-center gap-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-bold tabular-nums">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ImportContent() {
  const [subdomain, setSubdomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importId, setImportId] = useState<Id<"workableImports"> | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const testConnection = useAction(api.workable.actions.testConnection);
  const startBulkImport = useAction(api.workable.actions.startBulkImport);
  const getLatestImportStatus = useAction(api.workable.actions.getLatestImportStatus);
  const getImportStatus = useAction(api.workable.actions.getImportStatus);
  const retryImport = useAction(api.workable.actions.retryImport);
  const stopImport = useAction(api.workable.actions.stopImport);
  const runCleanup = useAction(api.workable.cleanupAction.runCleanup);
  const fixStats = useAction(api.workable.cleanupAction.fixStats);

  // Restore last import on mount
  useEffect(() => {
    getLatestImportStatus()
      .then((status) => {
        if (status) {
          setImportStatus(status as ImportStatus);
          setImportId(status._id);
          if (status.subdomain) setSubdomain(status.subdomain);
          if (status.status === "running") startPolling(status._id);
        }
      })
      .finally(() => setIsRestoring(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPolling = (id: Id<"workableImports">) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const status = await getImportStatus({ importId: id });
      if (status) {
        setImportStatus(status as ImportStatus);
        if (status.status !== "running") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setIsImporting(false);
        }
      }
    }, 3000);
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleTestConnection = async () => {
    if (!subdomain || !apiKey) return toast.error("Please enter both subdomain and API key");
    setIsTesting(true);
    try {
      const result = await testConnection({ subdomain, apiKey });
      if (result.ok) {
        setIsConnected(true);
        toast.success("Connected to Workable successfully!");
      } else {
        toast.error(result.error ?? "Connection failed");
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleStartImport = async () => {
    if (!subdomain || !apiKey) return toast.error("Please enter both subdomain and API key");
    setIsImporting(true);
    try {
      const { importId: newId } = await startBulkImport({ subdomain, apiKey });
      const id = newId as Id<"workableImports">;
      setImportId(id);
      setImportStatus({
        _id: id,
        status: "running",
        totalCandidates: 0,
        imported: 0,
        skipped: 0,
        failed: 0,
        startedAt: new Date().toISOString(),
        subdomain,
      });
      startPolling(id);
      toast.success("Import started! Processing candidates in the background.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start import");
      setIsImporting(false);
    }
  };

  const handleRetry = async () => {
    if (!importStatus) return;
    setIsImporting(true);
    try {
      await retryImport({ importId: importStatus._id, subdomain, apiKey });
      setImportStatus((prev) => prev ? { ...prev, status: "running", errorMessage: "" } : prev);
      startPolling(importStatus._id);
      toast.info("Import retrying from where it left off.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to retry";
      toast.error(msg);
      setIsImporting(false);
    }
  };

  const handleStop = async () => {
    if (!importStatus) return;
    try {
      await stopImport({ importId: importStatus._id });
      setImportStatus((prev) => prev ? { ...prev, status: "stopped" } : prev);
      setIsImporting(false);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      toast.info("Import stopped. You can resume it later.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop import");
    }
  };

  const handleFixStats = async () => {
    try {
      const result = await fixStats();
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fix stats");
    }
  };

  const handleCleanup = async () => {
    if (!confirm("This will permanently delete all non-ready CVs and import history. Are you sure?")) return;
    try {
      const result = await runCleanup();
      toast.success(result.message);
      setImportStatus(null);
      setImportId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cleanup failed");
    }
  };

  const totalProcessed = importStatus
    ? importStatus.imported + importStatus.skipped + importStatus.failed
    : 0;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import from Workable</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bulk import all your existing candidates and their CVs from Workable into this system.
        </p>
      </div>

      {isRestoring && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking import status...
        </div>
      )}

      {!isRestoring && (
        <>
          {/* How it works */}
          <div className="bg-accent/30 border border-accent rounded-xl p-4">
            <p className="text-sm font-medium flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-primary shrink-0" />
              How this works
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>We connect to your Workable account using your API key</li>
              <li>All candidates with a CV/resume attached are downloaded</li>
              <li>Each CV is extracted and fully processed with AI — name, skills, experience, and more</li>
              <li>Once done, candidates become searchable in this system</li>
            </ol>
            <a
              href="https://help.workable.com/hc/en-us/articles/360038927614"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
            >
              How to find your Workable API key <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Credentials */}
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div>
              <label className="text-sm font-medium flex items-center gap-2 mb-1.5">
                <Building2 className="w-4 h-4 text-muted-foreground" /> Workable subdomain
              </label>
              <div className="flex gap-2">
                <Input
                  value={subdomain}
                  onChange={(e) => { setSubdomain(e.target.value); setIsConnected(false); }}
                  placeholder="mycompany"
                  className="flex-1"
                />
                <span className="flex items-center text-sm text-muted-foreground bg-muted px-3 rounded-md border whitespace-nowrap">
                  .workable.com
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                If your Workable URL is <code>mycompany.workable.com</code>, enter <code>mycompany</code>
              </p>
            </div>

            <div>
              <label className="text-sm font-medium flex items-center gap-2 mb-1.5">
                <Key className="w-4 h-4 text-muted-foreground" /> API key
              </label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setIsConnected(false); }}
                placeholder="your-workable-api-key"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Found in Workable under Settings → Integrations → API Access Tokens
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button
                variant="secondary"
                onClick={handleTestConnection}
                disabled={isTesting || !subdomain || !apiKey}
                className="gap-2"
              >
                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Test connection
              </Button>
              {isConnected && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" /> Connected
                </span>
              )}
              {isConnected && !importStatus?.status && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" /> Ready to import
                </span>
              )}
            </div>
          </div>

          {/* Start import button */}
          {isConnected && !importStatus && (
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleStartImport}
              disabled={isImporting}
            >
              {isImporting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
              ) : (
                <><Play className="w-4 h-4" /> Start Import</>
              )}
            </Button>
          )}

          {/* Import progress */}
          {importStatus && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border rounded-xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-sm">Import progress</h2>
                {importStatus.status === "running" && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" /> Running
                  </Badge>
                )}
                {importStatus.status === "stopped" && (
                  <Badge variant="secondary" className="gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-3 h-3" /> Stopped
                  </Badge>
                )}
                {importStatus.status === "done" && (
                  <Badge variant="secondary" className="gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-3 h-3" /> Complete
                  </Badge>
                )}
                {importStatus.status === "error" && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <AlertCircle className="w-3 h-3" /> Error
                  </Badge>
                )}
              </div>

              {importStatus.totalCandidates > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Overall progress</span>
                    <span>{totalProcessed.toLocaleString()} / {importStatus.totalCandidates.toLocaleString()}</span>
                  </div>
                  <ProgressBar value={totalProcessed} max={importStatus.totalCandidates} color="bg-primary" />
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatBox
                  label="Imported"
                  value={importStatus.imported}
                  icon={CheckCircle2}
                  color="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                />
                <StatBox
                  label="Skipped (no CV)"
                  value={importStatus.skipped}
                  icon={SkipForward}
                  color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                />
                <StatBox
                  label="Failed"
                  value={importStatus.failed}
                  icon={XCircle}
                  color="bg-red-100 dark:bg-red-900/30 text-red-500"
                />
              </div>

              {!!importStatus.errorMessage && importStatus.status === "error" && (
                <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs text-destructive mb-4">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {importStatus.errorMessage}
                </div>
              )}

              {importStatus.status === "running" && (
                <div className="pt-3 border-t flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Import is running in the background.</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleStop}
                    className="gap-1.5 shrink-0 text-destructive"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Stop Import
                  </Button>
                </div>
              )}

              {importStatus.status === "stopped" && (
                <div className="pt-3 border-t flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Import stopped</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Will continue from where it stopped — no duplicates.</p>
                  </div>
                  <Button size="sm" onClick={handleRetry} disabled={isImporting} className="gap-1.5 shrink-0">
                    {isImporting ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Resuming...</>
                    ) : (
                      <><Play className="w-3.5 h-3.5" /> Resume Import</>
                    )}
                  </Button>
                </div>
              )}

              {importStatus.status === "error" && (
                <div className="pt-3 border-t flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Import stopped</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {importStatus.lastCursor
                        ? "Will continue from where it stopped — no duplicates."
                        : "Will restart from the beginning (already-imported CVs will be skipped)."}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleRetry}
                    disabled={isImporting}
                    className="gap-1.5 shrink-0"
                  >
                    {isImporting ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Retrying...</>
                    ) : (
                      <><RotateCcw className="w-3.5 h-3.5" /> Retry Import</>
                    )}
                  </Button>
                </div>
              )}

              {importStatus.status === "done" && (
                <div className="pt-3 border-t text-center">
                  <p className="text-sm text-muted-foreground">
                    Import complete. {importStatus.imported.toLocaleString()} CVs imported successfully.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => { setImportStatus(null); setImportId(null); }}
                  >
                    Start new import
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* Danger zone — cleanup */}
          <div className="border border-destructive/30 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-destructive">Danger zone</p>
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                If the dashboard stats look wrong, fix them here (no data is deleted).
              </p>
              <Button variant="secondary" size="sm" onClick={handleFixStats} className="gap-2">
                <RotateCcw className="w-3.5 h-3.5" /> Fix Dashboard Stats
              </Button>
            </div>
            <div className="border-t border-destructive/20 pt-3">
              <p className="text-xs text-muted-foreground mb-2">
                Delete all non-ready CVs (processing, paused, error) and clear import history. Ready/processed CVs are kept.
              </p>
              <Button variant="secondary" size="sm" onClick={handleCleanup} className="text-destructive border-destructive/40 gap-2">
                <AlertCircle className="w-3.5 h-3.5" /> Clean up non-ready CVs
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function WorkableImportPage() {
  return (
    <AppLayout>
      <Authenticated>
        <ImportContent />
      </Authenticated>
    </AppLayout>
  );
}
