import type { ReactNode } from "react";
import { useCallback } from "react";
import { useAuth, isDemoMode } from "@/hooks/use-auth.ts";
import { useCurrentUser } from "@/hooks/use-role.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import AccessDenied from "@/pages/access-denied/page.tsx";

export default function AccessGuard({ children }: { children: ReactNode }) {
  const { removeUser, user: authUser } = useAuth();
  const currentUser = useCurrentUser();
  const isDemo = isDemoMode();

  const handleRevoke = useCallback(() => {
    removeUser();
  }, [removeUser]);

  if (isDemo) return <>{children}</>;

  if (!authUser) return <>{children}</>;

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

  if (currentUser && currentUser.isApproved === false) {
    removeUser();
    return null;
  }

  if (!currentUser || !currentUser.isApproved) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
