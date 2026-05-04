import { useState, useEffect, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated } from "convex/react";
import AppLayout from "@/components/app-layout.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2, Key, CheckCircle2, AlertCircle, Loader2,
  Download, SkipForward, XCircle, ArrowRight,
  ExternalLink, Info, Play,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.js";
import { cn } from "@/lib/utils.ts";

type ImportStatus = {
  _id: Id<"workableImports">;
  status: "running" | "done" | "error";
  totalCandidates: number;
  imported: number;
  skipped: number;
  failed: number;
  startedAt: string;
  errorMessage?: string;
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
    <div className="bg-card border rounded-xl p-4 flex items-center gap-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
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
  const getImportStatus = useAction(api.workable.actions.getImportStatus);
  const getLatestImportStatus = useAction(api.workable.actions.getLatestImportStatus);
  const resumeProcessing = useAction(api.cvProcessing.resumeProcessing);
  const pausedCvs = useQuery(api.cvs.getPausedCvs, {});

  // On mount: restore any existing import session
  useEffect(() => {
    let cancelled = false;
    getLatestImportStatus({}).then((latest) => {
      if (cancelled) return;
      if (latest) {
        setImportId(latest._id);
        setImportStatus(latest);
        if (latest.status === "running") {
          setIsImporting(true);
        }
      }
      setIsRestoring(false);
    }).catch(() => {
      if (!cancelled) setIsRestoring(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Poll import status while running
  useEffect(() => {
    if (!importId) return;
    pollRef.current = setInterval(async () => {
      const status = await getImportStatus({ importId });
      if (status) {
        setImportStatus(status);
        if (status.status !== "running") {
          clearInterval(pollRef.current!);
          setIsImporting(false);
          if (status.status === "done") {
            toast.success(`Import complete! ${status.imported} CVs imported.`);
          } else {
            toast.error(`Import failed: ${status.errorMessage ?? "Unknown error"}`);
          }
        }
      }
    }, 3000);
    return () => clearInterval(pollRef.current!);
  }, [importId]);

  const handleTest = async () => {
    if (!subdomain.trim() || !apiKey.trim()) {
      toast.error("Please enter both your Workable subdomain and API key");
      return;
    }
    setIsTesting(true);
    setIsConnected(false);
    try {
      const result = await testConnection({ subdomain: subdomain.trim(), apiKey: apiKey.trim() });
      if (result.ok) {
        setIsConnected(true);
        toast.success("Connected to Workable successfully!");
      } else {
        toast.error(`Connection failed: ${result.error ?? "Check your credentials and try again."}`);
      }
    } catch {
      toast.error("Connection test failed. Check your credentials.");
    } finally {
      setIsTesting(false);
    }
  };

  const handleImport = async () => {
    if (!isConnected) {
      toast.error("Please test the connection first");
      return;
    }
    setIsImporting(true);
    try {
      const result = await startBulkImport({ subdomain: subdomain.trim(), apiKey: apiKey.trim() });
      setImportId(result.importId as Id<"workableImports">);
      toast.info("Import started! CVs are being downloaded and processed in the background.");
    } catch (err) {
      toast.error("Failed to start import. Please try again.");
      setIsImporting(false);
    }
  };

  const handleResume = async () => {
    try {
      await resumeProcessing({});
      toast.success("Resuming CV processing...");
    } catch {
      toast.error("Failed to resume processing. Please try again.");
    }
  };

  const totalProcessed = importStatus
    ? importStatus.imported + importStatus.skipped + importStatus.failed
    : 0;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Import from Workable</h1>
        <p className="text-muted-foreground text-sm">
          Bulk import all your existing candidates and their CVs from Workable into this system.
        </p>
      </div>

      {/* Loading state while restoring session */}
      {isRestoring && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking import status...
        </div>
      )}

      {!isRestoring && (
        <>
          {/* Paused CVs banner */}
          {pausedCvs && pausedCvs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    {pausedCvs.length} CV{pausedCvs.length !== 1 ? "s" : ""} paused — insufficient AI credits
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    Top up your credits in Settings → Billing → Cloud Usage, then resume processing.
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={handleResume} className="gap-1.5 shrink-0">
                <Play className="w-3.5 h-3.5" /> Resume
              </Button>
            </motion.div>
          )}

          {/* How it works */}
          <div className="bg-accent/30 border border-accent rounded-xl p-4 mb-6">
            <p className="text-sm font-medium flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-primary shrink-0" />
              How this works
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>We connect to your Workable account using your API key</li>
              <li>All candidates with a CV/resume attached are downloaded</li>
              <li>Each CV is stored and processed by AI to extract structured data</li>
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

          {/* Credentials form */}
          <div className="bg-card border rounded-xl p-5 mb-6 space-y-4">
            <div>
              <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                Workable subdomain
              </label>
              <div className="flex items-center gap-0">
                <Input
                  value={subdomain}
                  onChange={(e) => { setSubdomain(e.target.value); setIsConnected(false); }}
                  placeholder="mycompany"
                  className="rounded-r-none border-r-0 text-sm"
                />
                <span className="h-9 px-3 bg-muted border rounded-r-md text-xs text-muted-foreground flex items-center shrink-0">
                  .workable.com
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                If your Workable URL is <span className="font-mono">mycompany.workable.com</span>, enter <span className="font-mono">mycompany</span>
              </p>
            </div>

            <div>
              <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Key className="w-3.5 h-3.5 text-muted-foreground" />
                API key
              </label>
              <Input
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setIsConnected(false); }}
                placeholder="your-workable-api-key"
                type="password"
                className="text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Found in Workable under Settings → Integrations → API Access Tokens
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={handleTest}
                disabled={isTesting || !subdomain || !apiKey}
                className="gap-2"
              >
                {isTesting ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing...</>
                ) : isConnected ? (
                  <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Connected</>
                ) : (
                  "Test connection"
                )}
              </Button>

              {isConnected && (
                <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                  <Badge variant="secondary" className="text-green-600 dark:text-green-400 gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Ready to import
                  </Badge>
                </motion.div>
              )}
            </div>
          </div>

          {/* Start import button */}
          <AnimatePresence>
            {isConnected && !importId && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-6"
              >
                <Button
                  onClick={handleImport}
                  disabled={isImporting}
                  size="lg"
                  className="w-full gap-2"
                >
                  {isImporting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Starting import...</>
                  ) : (
                    <><Download className="w-4 h-4" /> Start bulk import from Workable</>
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  This runs in the background — you can leave this page and check back later.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Import progress */}
          <AnimatePresence>
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
                      <span>{totalProcessed} / {importStatus.totalCandidates}</span>
                    </div>
                    <ProgressBar
                      value={totalProcessed}
                      max={importStatus.totalCandidates}
                      color="bg-primary"
                    />
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

                {importStatus.errorMessage && (
                  <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs text-destructive">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {importStatus.errorMessage}
                  </div>
                )}

                {importStatus.status === "done" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 pt-4 border-t flex items-center justify-between"
                  >
                    <p className="text-sm text-muted-foreground">
                      CVs are now processing in the background — they will appear in Search once ready.
                    </p>
                    <a
                      href="/search"
                      className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline shrink-0"
                    >
                      Go to Search <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

export default function WorkableImportPage() {
  return (
    <Authenticated>
      <AppLayout>
        <ImportContent />
      </AppLayout>
    </Authenticated>
  );
}
