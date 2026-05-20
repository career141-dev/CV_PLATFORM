import type { ReactNode } from "react";
import { useCallback } from "react";
import { useAuth } from "@/hooks/use-auth.ts";
import { useCurrentUser } from "@/hooks/use-role.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import AccessDenied from "@/pages/access-denied/page.tsx";

// Wraps authenticated routes — allows access for approved users, but unapproved users see error
// Anonymous users (not logged in) are allowed to view but may see limited content
export default function AccessGuard({ children }: { children: ReactNode }) {
  const { removeUser, user: authUser } = useAuth();
  const currentUser = useCurrentUser();

  const handleRevoke = useCallback(() => {
    removeUser();
  }, [removeUser]);

  // Not signed in — allow access (they may see limited content)
  if (!authUser) return <>{children}</>;

  // Loading user record
  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  // User record found — check approval
  if (currentUser && currentUser.isApproved === false) {
    // Revoked: sign out
    removeUser();
    return null;
  }

  if (!currentUser || !currentUser.isApproved) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
