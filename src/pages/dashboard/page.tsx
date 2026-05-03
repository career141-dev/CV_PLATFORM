import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Link } from "react-router-dom";
import AppLayout from "@/components/app-layout.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Users, CheckCircle, Clock, AlertCircle, Search, Upload, ArrowRight } from "lucide-react";

function DashboardContent() {
  const stats = useQuery(api.cvs.getStats, {});

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of your CV database</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats === undefined ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : stats !== null ? (
          <>
            <StatCard icon={Users} label="Total CVs" value={stats.total.toLocaleString()} color="text-primary" />
            <StatCard icon={CheckCircle} label="Processed" value={stats.ready.toLocaleString()} color="text-green-600" />
            <StatCard icon={Clock} label="Processing" value={stats.processing.toLocaleString()} color="text-amber-500" />
            <StatCard icon={AlertCircle} label="Errors" value={stats.errors.toLocaleString()} color="text-destructive" />
          </>
        ) : null}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              Search CVs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Use natural language or paste a job description to find matching candidates.
            </p>
            <Link to="/search">
              <Button size="sm" className="gap-1.5">
                Start Searching <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              Upload CVs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Add new CVs to the database. Supports PDF, Word, and text files.
            </p>
            <Link to="/upload">
              <Button size="sm" variant="secondary" className="gap-1.5">
                Upload Files <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <Icon className={`w-5 h-5 mb-2 ${color}`} />
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  return (
    <Authenticated>
      <AppLayout>
        <DashboardContent />
      </AppLayout>
    </Authenticated>
  );
}
