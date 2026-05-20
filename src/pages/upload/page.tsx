import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@usehercules/auth/react";
import AppLayout from "@/components/app-layout.tsx";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle, XCircle, Loader2, CloudUpload, X, PauseCircle, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils.ts";

// API base URL (configure for local dev vs production)
const API_BASE = import.meta.env.VITE_API_BASE || '';

type FileStatus = "pending" | "uploading" | "processing" | "done" | "error" | "paused";

type UploadFile = {
  id: string;
  file: File;
  status: FileStatus;
  error?: string;
  cvId?: string;
};

function getFileType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".doc")) return "doc";
  return "txt";
}

function UploadContent() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [pausedCvs, setPausedCvs] = useState<Array<{ id: string; fileName: string }>>([]);
  const auth = useAuth();
  const token = auth.user?.access_token;

  // Load paused CVs on mount
  useEffect(() => {
    const loadPausedCvs = async () => {
      if (!token) return;
      try {
        const response = await fetch(`${API_BASE}/api/cv/list?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const result = (await response.json()) as { data: { cvs: Array<{ id: string; fileName: string; status: string }> } };
        const paused = result.data.cvs.filter((cv) => cv.status === "paused");
        setPausedCvs(paused);
      } catch (err) {
        console.error("Failed to load paused CVs:", err);
      }
    };

    loadPausedCvs();
  }, [token]);

  const onDrop = useCallback((accepted: File[]) => {
    const newFiles: UploadFile[] = accepted.map((file) => ({
      id: Math.random().toString(36).slice(2),
      file,
      status: "pending",
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "text/plain": [".txt"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const updateFile = (id: string, update: Partial<UploadFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...update } : f)));
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadAll = async () => {
    if (!token) {
      toast.error("You must be logged in to upload files");
      return;
    }

    const pending = files.filter((f) => f.status === "pending");
    if (!pending.length) return;

    setIsUploading(true);

    for (const uf of pending) {
      updateFile(uf.id, { status: "uploading" });
      try {
        // 1. Upload file & create CV record in one request
        const formData = new FormData();
        formData.append("file", uf.file);

        const uploadRes = await fetch(`${API_BASE}/api/cv/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!uploadRes.ok) {
          const error = (await uploadRes.json()) as { error?: string };
          throw new Error(error.error || "Upload failed");
        }

        const uploadData = (await uploadRes.json()) as {
          data: { cvId: string; storageKey: string; fileType: string };
        };
        const { cvId, storageKey, fileType } = uploadData.data;

        updateFile(uf.id, { status: "processing", cvId });

        // 2. Start AI parsing (fire & forget - UI will show processing)
        fetch(`${API_BASE}/api/ai/parse`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cvId,
            storageKey,
            fileType,
          }),
        })
          .then((res) => res.json())
          .then(() => {
            updateFile(uf.id, { status: "done" });
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : "Processing failed";
            updateFile(uf.id, { status: "error", error: msg });
          });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        updateFile(uf.id, { status: "error", error: msg });
        toast.error(`Failed to upload ${uf.file.name}`);
      }
    }

    setIsUploading(false);
    toast.success(`Started processing ${pending.length} file(s)`);
  };

  const handleResume = async () => {
    if (!token) {
      toast.error("You must be logged in");
      return;
    }

    setIsResuming(true);
    try {
      // Get paused CVs and resume processing for each
      const listRes = await fetch(`${API_BASE}/api/cv/list?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!listRes.ok) throw new Error("Failed to load CVs");

      const listData = (await listRes.json()) as {
        data: {
          cvs: Array<{
            id: string;
            storageKey: string;
            fileType: string;
            status: string;
          }>;
        };
      };
      const paused = listData.data.cvs.filter((cv) => cv.status === "paused");

      if (paused.length === 0) {
        toast.info("No paused CVs to resume.");
        setIsResuming(false);
        return;
      }

      // Resume processing for each paused CV
      let resumed = 0;
      for (const cv of paused) {
        try {
          const parseRes = await fetch(`${API_BASE}/api/ai/parse`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cvId: cv.id,
              storageKey: cv.storageKey,
              fileType: cv.fileType,
            }),
          });

          if (parseRes.ok) {
            resumed++;
          }
        } catch {
          // Continue with next CV
        }
      }

      if (resumed > 0) {
        toast.success(`Resumed processing for ${resumed} paused CV${resumed !== 1 ? "s" : ""}`);
        setPausedCvs((prev) => prev.filter((cv) => !paused.find((p) => p.id === cv.id)));
      } else {
        toast.error("Failed to resume processing. Please try again.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to resume processing";
      toast.error(msg);
    } finally {
      setIsResuming(false);
    }
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const processingCount = files.filter((f) => f.status === "processing" || f.status === "uploading").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Upload CVs</h1>
        <p className="text-muted-foreground text-sm">
          Upload PDF, Word, or text files. CVs are saved instantly and structured automatically when you search.
        </p>
      </div>

      {/* Paused banner */}
      {pausedCvs && pausedCvs.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 mb-6">
          <div className="flex items-center gap-2 min-w-0">
            <PauseCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <span className="font-semibold">{pausedCvs.length} CV{pausedCvs.length !== 1 ? "s" : ""} paused</span>
              {" — "}Processing was paused. Click Resume to continue.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleResume}
            disabled={isResuming}
            className="shrink-0 gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isResuming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Resume
          </Button>
        </div>
      )}

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-6",
          isDragActive
            ? "border-primary bg-accent/50"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <input {...getInputProps()} />
        <CloudUpload className={cn("w-10 h-10 mx-auto mb-3", isDragActive ? "text-primary" : "text-muted-foreground")} />
        <p className="font-medium text-sm mb-1">
          {isDragActive ? "Drop files here..." : "Drag & drop CV files here"}
        </p>
        <p className="text-xs text-muted-foreground">PDF, DOCX, DOC, TXT — up to 10MB each</p>
        <Button variant="secondary" size="sm" className="mt-4">
          Browse files
        </Button>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2 mb-6">
          {files.map((uf) => (
            <div key={uf.id} className="flex items-center gap-3 bg-card border rounded-lg px-4 py-3">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{uf.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(uf.file.size / 1024).toFixed(0)} KB
                </p>
                {uf.error && <p className="text-xs text-destructive mt-0.5">{uf.error}</p>}
              </div>
              <StatusBadge status={uf.status} />
              {uf.status === "pending" && (
                <button onClick={() => removeFile(uf.id)} className="text-muted-foreground hover:text-foreground cursor-pointer ml-1">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary & upload button */}
      {files.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground space-x-3">
            {pendingCount > 0 && <span>{pendingCount} pending</span>}
            {processingCount > 0 && <span className="text-amber-500">{processingCount} processing</span>}
            {doneCount > 0 && <span className="text-green-600">{doneCount} done</span>}
            {errorCount > 0 && <span className="text-destructive">{errorCount} errors</span>}
          </div>
          {pendingCount > 0 && (
            <Button onClick={uploadAll} disabled={isUploading} className="gap-2">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload {pendingCount} file{pendingCount !== 1 ? "s" : ""}
            </Button>
          )}
        </div>
      )}

      {/* Tips */}
      <div className="mt-8 bg-muted/40 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-2">Tips for best results</h3>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
          <li>PDF and DOCX files are preferred for accurate text extraction</li>
          <li>CVs are saved instantly — no AI processing cost at upload time</li>
          <li>Candidate data is structured automatically when you run a search</li>
          <li>You can upload multiple files at once — up to 50 at a time recommended</li>
        </ul>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  switch (status) {
    case "pending":
      return <span className="text-xs text-muted-foreground">Pending</span>;
    case "uploading":
      return (
        <span className="flex items-center gap-1 text-xs text-amber-500">
          <Loader2 className="w-3 h-3 animate-spin" /> Uploading
        </span>
      );
    case "processing":
      return (
        <span className="flex items-center gap-1 text-xs text-amber-500">
          <Loader2 className="w-3 h-3 animate-spin" /> Processing
        </span>
      );
    case "done":
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle className="w-3 h-3" /> Done
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <XCircle className="w-3 h-3" /> Error
        </span>
      );
    case "paused":
      return (
        <span className="flex items-center gap-1 text-xs text-amber-500">
          <PauseCircle className="w-3 h-3" /> Paused
        </span>
      );
  }
}

import RoleGuard from "@/components/role-guard.tsx";

export default function UploadPage() {
  return (
    <AppLayout>
      <RoleGuard allowedRoles={["admin", "recruiter"]}>
        <UploadContent />
      </RoleGuard>
    </AppLayout>
  );
}
