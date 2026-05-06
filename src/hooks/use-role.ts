import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useAuth } from "@/hooks/use-auth.ts";
import { useEffect } from "react";

type Role = "admin" | "recruiter" | "viewer";

export function useCurrentUser() {
  const { user: authUser } = useAuth();
  const currentUser = useQuery(
    api.users.getCurrentUser,
    authUser ? {} : "skip",
  );
  return currentUser;
}

export function useRole(): Role | null | undefined {
  const user = useCurrentUser();
  if (user === undefined) return undefined; // loading
  if (!user || !user.isApproved) return null;
  return (user.role as Role) ?? null;
}

// Hook that auto-signs-out when access is revoked
export function useAccessGuard(onRevoke: () => void) {
  const user = useCurrentUser();
  const { user: authUser } = useAuth();

  useEffect(() => {
    // Only act if we're authenticated but access was revoked
    if (authUser && user !== undefined && user !== null && user.isApproved === false) {
      onRevoke();
    }
  }, [user, authUser, onRevoke]);

  return user;
}
