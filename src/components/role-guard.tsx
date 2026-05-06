import type { ReactNode } from "react";
import { ShieldX } from "lucide-react";
import { useRole } from "@/hooks/use-role.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type Role = "admin" | "recruiter" | "viewer";

export default function RoleGuard({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles: Role[];
}) {
  const role = useRole();

  if (role === undefined) {
    return (
      <div className="p-8 space-y-3 max-w-sm mx-auto">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!role || !allowedRoles.includes(role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldX className="w-6 h-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
