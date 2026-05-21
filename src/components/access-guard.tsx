import type { ReactNode } from "react";
import { isDemoMode } from "@/hooks/use-auth.ts";

export default function AccessGuard({ children }: { children: ReactNode }) {
  const isDemo = isDemoMode();

  if (isDemo) return <>{children}</>;

  return <>{children}</>;
}
