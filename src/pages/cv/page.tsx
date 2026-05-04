import { useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated } from "convex/react";
import AppLayout from "@/components/app-layout.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { Id } from "@/convex/_generated/dataModel.js";
import {
  ArrowLeft, User, Briefcase, MapPin, Mail, Phone,
  GraduationCap, Globe, Star, Calendar, FileText, ExternalLink
} from "lucide-react";

function CvProfileContent({ cvId }: { cvId: Id<"cvs"> }) {
  const cv = useQuery(api.cvs.getCv, { cvId });

  if (cv === undefined) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!cv) {
    return (
      <div className="p-6 text-center text-muted-foreground">CV not found.</div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link to="/search">
        <Button variant="ghost" size="sm" className="gap-1.5 mb-6 -ml-2">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Search
        </Button>
      </Link>

      {/* Header */}
      <div className="bg-card border rounded-xl p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-accent-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold mb-1">{cv.candidateName ?? cv.fileName}</h1>
            {cv.currentTitle && (
              <p className="text-sm text-muted-foreground mb-2">{cv.currentTitle}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {cv.seniority && (
                <Badge variant="secondary" className="capitalize">{cv.seniority}</Badge>
              )}
              {cv.industry && <Badge variant="outline">{cv.industry}</Badge>}
              {cv.sector && <Badge variant="outline">{cv.sector}</Badge>}
            </div>
          </div>
          {cv.fileUrl && (
            <a href={cv.fileUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary" className="gap-1.5 shrink-0">
                <FileText className="w-3.5 h-3.5" />
                View File
                <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          )}
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5 pt-5 border-t">
          {cv.email && (
            <InfoRow icon={Mail} value={cv.email} />
          )}
          {cv.phone && (
            <InfoRow icon={Phone} value={cv.phone} />
          )}
          {cv.location && (
            <InfoRow icon={MapPin} value={cv.location} />
          )}
          {cv.yearsOfExperience !== undefined && (
            <InfoRow icon={Calendar} value={`${cv.yearsOfExperience} years experience`} />
          )}
        </div>
      </div>

      {/* AI Summary */}
      {cv.summary && (
        <div className="bg-accent/30 border border-accent rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-4 h-4 text-accent-foreground" />
            <span className="text-sm font-semibold">AI Summary</span>
          </div>
          <p className="text-sm leading-relaxed">{cv.summary}</p>
        </div>
      )}

      {/* Skills */}
      {cv.skills && cv.skills.length > 0 && (
        <div className="bg-card border rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Skills
          </h2>
          <div className="flex flex-wrap gap-2">
            {cv.skills.map((skill) => (
              <span key={skill} className="text-xs bg-secondary text-secondary-foreground px-2.5 py-1 rounded-md">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Languages */}
      {cv.languages && cv.languages.length > 0 && (
        <div className="bg-card border rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Languages
          </h2>
          <div className="flex flex-wrap gap-2">
            {cv.languages.map((lang) => (
              <Badge key={lang} variant="secondary">{lang}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Raw text preview */}
      {cv.rawText && (
        <details className="bg-card border rounded-xl p-5">
          <summary className="text-sm font-semibold cursor-pointer flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Raw CV Text
          </summary>
          <pre className="text-xs text-muted-foreground mt-3 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
            {cv.rawText}
          </pre>
        </details>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, value }: { icon: React.ElementType; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{value}</span>
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
