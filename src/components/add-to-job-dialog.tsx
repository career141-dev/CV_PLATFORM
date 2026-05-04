import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Briefcase, Plus, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";

type Props = {
  cvId: Id<"cvs">;
  candidateName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function AddToJobDialog({ cvId, candidateName, open, onOpenChange }: Props) {
  const jobs = useQuery(api.jobs.listJobs);
  const setPipelineStage = useMutation(api.pipeline.setPipelineStage);
  const [loadingJobId, setLoadingJobId] = useState<Id<"jobs"> | null>(null);
  const [addedJobIds, setAddedJobIds] = useState<Set<string>>(new Set());

  const handleAdd = async (jobId: Id<"jobs">) => {
    setLoadingJobId(jobId);
    try {
      await setPipelineStage({ jobId, cvId, stage: "new" });
      setAddedJobIds((prev) => new Set([...prev, jobId]));
      toast.success(`Added ${candidateName ?? "candidate"} to job`);
    } catch {
      toast.error("Failed to add candidate to job");
    } finally {
      setLoadingJobId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" />
            Add to Job
          </DialogTitle>
          <DialogDescription>
            Select a job to add{" "}
            <span className="font-medium text-foreground">
              {candidateName ?? "this candidate"}
            </span>{" "}
            to its pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-2 max-h-72 overflow-y-auto pr-1">
          {jobs === undefined ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading jobs…
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">No jobs created yet.</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                asChild
              >
                <a href="/jobs">Go to Jobs</a>
              </Button>
            </div>
          ) : (
            jobs.map((job) => {
              const added = addedJobIds.has(job._id);
              const loading = loadingJobId === job._id;
              return (
                <div
                  key={job._id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors",
                    added ? "bg-accent/50 border-primary/30" : "hover:bg-accent/30"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{job.title}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {job.industry && (
                        <Badge variant="secondary" className="text-xs">{job.industry}</Badge>
                      )}
                      {job.seniority && (
                        <Badge variant="outline" className="text-xs capitalize">{job.seniority}</Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={added ? "secondary" : "default"}
                    className="shrink-0 gap-1.5 h-8"
                    disabled={loading || added}
                    onClick={() => { if (!added) handleAdd(job._id); }}
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : added ? (
                      <><Check className="w-3.5 h-3.5" /> Added</>
                    ) : (
                      <><Plus className="w-3.5 h-3.5" /> Add</>
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
