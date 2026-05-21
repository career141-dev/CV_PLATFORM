import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useAuth, isDemoMode } from "@/hooks/use-auth.ts";

type Role = "admin" | "recruiter" | "viewer";

export function useCurrentUser() {
  const { user: authUser } = useAuth();
  const isDemo = isDemoMode();

  if (isDemo) {
    return { role: "admin" as Role, isApproved: true, name: "Demo Admin", _id: "demo-user" };
  }

  const currentUser = useQuery(
    api.users.getCurrentUser,
    authUser ? {} : "skip",
  );
  return currentUser;
}

export function useRole(): Role | null | undefined {
  const user = useCurrentUser();
  if (user === undefined) return undefined;
  if (!user || !user.isApproved) return null;
  if (isDemoMode()) return "admin";
  return (user.role as Role) ?? null;
}
