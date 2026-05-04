import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated } from "convex/react";
import AppLayout from "@/components/app-layout.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import type { Id } from "@/convex/_generated/dataModel.js";
import { cn } from "@/lib/utils.ts";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, User, Briefcase, MapPin, Mail, Phone,
  Globe, Calendar, FileText, ExternalLink, Sparkles,
  MessageSquare, Trash2, Send, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Clock, Loader2,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  if (status === "ready") return "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800";
  if (status === "processing") return "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800";
  if (status === "error") return "bg-red-500/10 text-red-600 border-red-200 dark:border-red-800";
  if (status === "paused") return "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800";
  return "bg-muted text-muted-foreground";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "ready") return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === "processing") return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
  if (status === "error") return <AlertCircle className="w-3.5 h-3.5" />;
  if (status === "paused") return <Clock className="w-3.5 h-3.5" />;
  return null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoItem({ icon: Icon, label, value }: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotesSection({ cvId }: { cvId: Id<"cvs"> }) {
  const notes = useQuery(api.cvs.getNotes, { cvId });
  const addNote = useMutation(api.cvs.addNote);
  const deleteNote = useMutation(api.cvs.deleteNote);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await addNote({ cvId, text: text.trim() });
      setText("");
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Notes" icon={MessageSquare}>
      {/* Add note */}
      <div className="flex gap-2 mb-4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note about this candidate..."
          className="resize-none text-sm min-h-[72px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd();
          }}
        />
        <Button
          size="icon"
          onClick={handleAdd}
          disabled={saving || !text.trim()}
          className="shrink-0 self-end"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {/* Notes list */}
      {notes === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No notes yet</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <motion.div
              key={note._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 bg-muted/40 rounded-lg px-3 py-2.5 group"
            >
              <p className="text-sm flex-1 leading-relaxed">{note.text}</p>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {formatDistanceToNow(new Date(note._creationTime), { addSuffix: true })}
                </span>
                <button
                  onClick={() => deleteNote({ noteId: note._id }).catch(() => toast.error("Failed"))}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function CvProfileContent({ cvId }: { cvId: Id<"cvs"> }) {
  const cv = useQuery(api.cvs.getCv, { cvId });
  const deleteCv = useMutation(api.cvs.deleteCv);
  const navigate = useNavigate();
  const [showRaw, setShowRaw] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this CV? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteCv({ cvId });
      navigate("/search");
      toast.success("CV deleted");
    } catch {
      toast.error("Failed to delete CV");
      setDeleting(false);
    }
  };

  if (cv === undefined) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (!cv) {
    return (
      <div className="p-6 text-center text-muted-foreground">CV not found.</div>
    );
  }

  const isStructured = cv.isStructured === true;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Back button */}
      <Link to="/search">
        <Button variant="ghost" size="sm" className="gap-1.5 mb-5 -ml-2 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Search
        </Button>
      </Link>

      {/* Hero header card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border rounded-xl p-6 mb-4"
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent flex items-center justify-center shrink-0">
            <User className="w-8 h-8 text-primary" />
          </div>

          {/* Core info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h1 className="text-xl font-bold">{cv.candidateName ?? cv.fileName}</h1>
                {cv.currentTitle && (
                  <p className="text-sm text-muted-foreground mt-0.5">{cv.currentTitle}</p>
                )}
              </div>
              {/* Status badge */}
              <div className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border shrink-0",
                statusColor(cv.status)
              )}>
                <StatusIcon status={cv.status} />
                <span className="capitalize">{cv.status}</span>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {cv.seniority && (
                <Badge variant="secondary" className="capitalize">{cv.seniority}</Badge>
              )}
              {cv.industry && <Badge variant="outline">{cv.industry}</Badge>}
              {cv.sector && <Badge variant="outline">{cv.sector}</Badge>}
              {!isStructured && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Not yet structured
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-5 pt-5 border-t">
          {cv.fileUrl && (
            <a href={cv.fileUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary" className="gap-1.5 cursor-pointer">
                <FileText className="w-3.5 h-3.5" />
                View CV File
                <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-destructive hover:text-destructive ml-auto cursor-pointer"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete
          </Button>
        </div>

        {/* Contact grid */}
        {(cv.email || cv.phone || cv.location || cv.yearsOfExperience !== undefined) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 pt-5 border-t">
            {cv.email && <InfoItem icon={Mail} label="Email" value={cv.email} />}
            {cv.phone && <InfoItem icon={Phone} label="Phone" value={cv.phone} />}
            {cv.location && <InfoItem icon={MapPin} label="Location" value={cv.location} />}
            {cv.yearsOfExperience !== undefined && (
              <InfoItem icon={Calendar} label="Experience" value={`${cv.yearsOfExperience} years`} />
            )}
          </div>
        )}
      </motion.div>

      {/* AI Summary */}
      {cv.summary && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-gradient-to-br from-primary/5 to-accent/20 border border-primary/20 rounded-xl p-5 mb-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">AI Summary</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/80">{cv.summary}</p>
        </motion.div>
      )}

      {/* Skills */}
      {cv.skills && cv.skills.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <Section title="Skills" icon={Briefcase}>
            <div className="flex flex-wrap gap-2">
              {cv.skills.map((skill) => (
                <span
                  key={skill}
                  className="text-xs bg-secondary text-secondary-foreground px-2.5 py-1 rounded-md font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          </Section>
        </motion.div>
      )}

      {/* Languages */}
      {cv.languages && cv.languages.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Section title="Languages" icon={Globe}>
            <div className="flex flex-wrap gap-2">
              {cv.languages.map((lang) => (
                <Badge key={lang} variant="secondary" className="text-sm">{lang}</Badge>
              ))}
            </div>
          </Section>
        </motion.div>
      )}

      {/* Notes */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
      >
        <NotesSection cvId={cvId} />
      </motion.div>

      {/* Raw CV text */}
      {cv.rawText && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="bg-card border rounded-xl overflow-hidden mb-4"
        >
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Raw CV Text</span>
              <span className="text-xs text-muted-foreground">
                ({Math.round(cv.rawText.length / 1000)}k chars)
              </span>
            </div>
            {showRaw
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          <AnimatePresence>
            {showRaw && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <pre className="text-xs text-muted-foreground px-5 pb-5 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                  {cv.rawText}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* File metadata footer */}
      <div className="text-xs text-muted-foreground text-center pb-6">
        {cv.fileName} · {(cv.fileSize / 1024).toFixed(0)} KB · uploaded {formatDistanceToNow(new Date(cv._creationTime), { addSuffix: true })}
      </div>
    </div>
  );
}

export default function CvProfilePage() {
  const { cvId } = useParams<{ cvId: string }>();
  return (
    <Authenticated>
      <AppLayout>
        <CvProfileContent cvId={cvId as Id<"cvs">} />
      </AppLayout>
    </Authenticated>
  );
}
