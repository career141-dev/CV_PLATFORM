import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AuthCallback from "./pages/auth/Callback.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Dashboard from "./pages/dashboard/page.tsx";
import Upload from "./pages/upload/page.tsx";
import Search from "./pages/search/page.tsx";
import CvProfile from "./pages/cv/page.tsx";

import JdMatch from "./pages/jd-match/page.tsx";
import WorkableImport from "./pages/workable-import/page.tsx";

import Jobs from "./pages/jobs/page.tsx";

import EmailImport from "./pages/email-import/page.tsx";

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/search" element={<Search />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jd-match" element={<JdMatch />} />
          <Route path="/workable-import" element={<WorkableImport />} />
          <Route path="/cv/:cvId" element={<CvProfile />} />
          <Route path="/email-import" element={<EmailImport />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </DefaultProviders>
  );
}
