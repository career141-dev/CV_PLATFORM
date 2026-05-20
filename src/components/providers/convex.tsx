import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ConvexProviderWithHerculesAuth } from "@usehercules/auth/convex-react";
import { isDemoMode } from "./auth.tsx";
import type { ReactNode } from "react";

function useFakeAuth() {
  return {
    isLoading: false,
    isAuthenticated: true,
    fetchAccessToken: async () => "demo-token",
  };
}

function RealConvexProvider({ children }: { children: ReactNode }) {
  const convexUrl = import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3000";
  const convex = new ConvexReactClient(convexUrl);

  return (
    <ConvexProviderWithHerculesAuth client={convex}>
      {children}
    </ConvexProviderWithHerculesAuth>
  );
}

function DemoConvexProvider({ children }: { children: ReactNode }) {
  const convexUrl = import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3000";
  const convex = new ConvexReactClient(convexUrl);

  return (
    <ConvexProviderWithAuth client={convex} useAuth={useFakeAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

export function ConvexProvider({ children }: { children: ReactNode }) {
  if (isDemoMode()) {
    return <DemoConvexProvider>{children}</DemoConvexProvider>;
  }

  return <RealConvexProvider>{children}</RealConvexProvider>;
}
