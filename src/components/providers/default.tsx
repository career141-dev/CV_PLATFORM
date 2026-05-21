import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { ClerkProvider } from "@clerk/clerk-react";
import { AuthProvider, isDemoMode } from "./auth.tsx";
import { ConvexProvider } from "./convex.tsx";
import { useAuth } from "./auth.tsx";
import { QueryClientProvider } from "./query-client.tsx";
import { ThemeProvider } from "./theme.tsx";
import { Toaster } from "../ui/sonner.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";

function UserSync() {
  const { isAuthenticated } = useAuth();
  const { isAuthenticated: isConvexReady, isLoading: isConvexLoading } = useConvexAuth();
  const updateCurrentUser = useMutation(api.users.updateCurrentUser);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (isAuthenticated && isConvexReady && !synced && !isConvexLoading) {
      updateCurrentUser()
        .then(() => setSynced(true))
        .catch((err) => console.error("Failed to sync user:", err));
    }
    if (!isAuthenticated) {
      setSynced(false);
    }
  }, [isAuthenticated, isConvexReady, isConvexLoading, synced, updateCurrentUser]);

  return null;
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConvexProvider>
        <UserSync />
        <QueryClientProvider>
          <TooltipProvider>
            <ThemeProvider>
              <Toaster />
              {children}
            </ThemeProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ConvexProvider>
    </AuthProvider>
  );
}

export function DefaultProviders({ children }: { children: React.ReactNode }) {
  if (isDemoMode()) {
    return <Providers>{children}</Providers>;
  }

  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY!}
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
    >
      <Providers>{children}</Providers>
    </ClerkProvider>
  );
}
