import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth, enableDemoMode } from "@/hooks/use-auth.ts";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Search, Upload, Users, Zap, Brain, Filter } from "lucide-react";

const LOGO_URL = "https://hercules-cdn.com/file_TEqHXmSH2IfLvYtI18CmCUnf";

const features = [
  {
    icon: Brain,
    title: "Natural Language Search",
    description: 'Ask in plain English: "Give me senior FMCG candidates with 5+ years experience in Egypt"',
  },
  {
    icon: Zap,
    title: "Job Description Matching",
    description: "Paste a full JD and get ranked candidates by relevance — instantly.",
  },
  {
    icon: Upload,
    title: "Bulk CV Upload",
    description: "Upload PDFs, Word docs, and text files. AI extracts and structures all data automatically.",
  },
  {
    icon: Filter,
    title: "Smart Filters",
    description: "Filter by industry, seniority, location, skills, years of experience and more.",
  },
  {
    icon: Users,
    title: "115,000+ Profiles",
    description: "Growing database of candidates across industries, sectors, and countries.",
  },
  {
    icon: Search,
    title: "Semantic Understanding",
    description: "AI understands context — searches for 'supply chain expert' finds logistics, procurement, and operations profiles.",
  },
];

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGO_URL} alt="Career141" className="h-16 w-auto" />
          </div>
          <div className="flex items-center gap-3">
            {isLoading ? (
              <Skeleton className="h-9 w-24" />
            ) : isAuthenticated ? (
              <Link to="/dashboard">
                <Button size="sm">Go to Dashboard</Button>
              </Link>
            ) : (
              <>
                <SignInButton />
                <Button size="sm" variant="outline" onClick={enableDemoMode}>
                  Demo Login
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 bg-accent text-accent-foreground text-sm font-medium px-3 py-1.5 rounded-full mb-6">
            <Zap className="w-3.5 h-3.5" />
            AI-Powered CV Intelligence
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-balance mb-6 leading-tight">
            Find the right candidate
            <br />
            <span className="text-primary">in seconds, not hours</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 text-balance">
            Search through 115,000+ CVs using plain English. Describe what you need — our AI finds the best matching profiles instantly.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {isLoading ? (
              <Skeleton className="h-12 w-40" />
            ) : isAuthenticated ? (
              <>
                <Link to="/search">
                  <Button size="lg" className="gap-2">
                    <Search className="w-4 h-4" />
                    Search CVs
                  </Button>
                </Link>
                <Link to="/upload">
                  <Button size="lg" variant="secondary" className="gap-2">
                    <Upload className="w-4 h-4" />
                    Upload CVs
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <SignInButton />
                <Button size="lg" variant="outline" onClick={enableDemoMode}>
                  Demo Login
                </Button>
              </>
            )}
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.07, ease: "easeOut" }}
              className="bg-card border rounded-xl p-6"
            >
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-accent-foreground" />
              </div>
              <h3 className="font-semibold text-base mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
