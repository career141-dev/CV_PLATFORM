import { createContext, useContext, type ReactNode } from "react";
import { HerculesAuthProvider, useAuth as useHerculesAuth } from "@usehercules/auth/react";

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
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function HerculesSync({ children }: { children: ReactNode }) {
  const h = useHerculesAuth();
  const value: AuthContextValue = {
    user: h.user,
    isAuthenticated: h.isAuthenticated,
    isLoading: h.isLoading,
    signin: h.signin,
    signout: h.signout,
    removeUser: h.removeUser ?? (() => {}),
    error: h.error,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (isDemoMode()) {
    return <DemoSync>{children}</DemoSync>;
  }

  return (
    <HerculesAuthProvider
      authority={import.meta.env.VITE_HERCULES_OIDC_AUTHORITY!}
      client_id={import.meta.env.VITE_HERCULES_OIDC_CLIENT_ID!}
      userManagerSettings={{
        prompt: import.meta.env.VITE_HERCULES_OIDC_PROMPT ?? "select_account",
        response_type:
          import.meta.env.VITE_HERCULES_OIDC_RESPONSE_TYPE ?? "code",
        scope:
          import.meta.env.VITE_HERCULES_OIDC_SCOPE ??
          "openid profile email offline_access",
        redirect_uri:
          import.meta.env.VITE_HERCULES_OIDC_REDIRECT_URI ??
          `${window.location.origin}/auth/callback`,
      }}
    >
      <HerculesSync>{children}</HerculesSync>
    </HerculesAuthProvider>
  );
}
