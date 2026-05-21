import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth as useClerkAuth, useUser as useClerkUser, useClerk } from "@clerk/clerk-react";

interface AuthUser {
  profile: { sub: string; name: string; email: string };
  access_token?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signin: (...args: any[]) => Promise<void>;
  signout: (...args: any[]) => Promise<void>;
  removeUser: () => void;
  getToken: () => Promise<string | null>;
  error?: any;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useUser(): AuthUser | null {
  return useAuth().user;
}

const DEMO_KEY = "demo-mode";

export function isDemoMode(): boolean {
  return localStorage.getItem(DEMO_KEY) === "true";
}

export function enableDemoMode() {
  localStorage.setItem(DEMO_KEY, "true");
  window.location.reload();
}

export function disableDemoMode() {
  localStorage.removeItem(DEMO_KEY);
  window.location.reload();
}

function DemoSync({ children }: { children: ReactNode }) {
  const value: AuthContextValue = {
    user: {
      profile: { sub: "demo-admin", name: "Demo Admin", email: "demo@example.com" },
      access_token: "demo-token",
    },
    isAuthenticated: true,
    isLoading: false,
    signin: async () => {},
    signout: async () => { disableDemoMode(); },
    removeUser: () => { disableDemoMode(); },
    getToken: async () => "demo-token",
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function ClerkSync({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded, signOut, getToken } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();
  const clerk = useClerk();

  const value: AuthContextValue = {
    user: isSignedIn && clerkUser
      ? {
          profile: {
            sub: clerkUser.id,
            name: clerkUser.fullName ?? "",
            email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
          },
          access_token: undefined,
        }
      : null,
    isAuthenticated: !!isSignedIn,
    isLoading: !isLoaded,
    signin: async () => {
      await clerk.redirectToSignIn();
    },
    signout: async () => {
      await signOut();
    },
    removeUser: () => {
      signOut();
    },
    getToken: async () => {
      const token = await getToken({ template: "convex" });
      return token ?? null;
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (isDemoMode()) {
    return <DemoSync>{children}</DemoSync>;
  }

  return <ClerkSync>{children}</ClerkSync>;
}
