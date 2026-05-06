import { ShieldX } from "lucide-react";
import { useAuth } from "@/hooks/use-auth.ts";
import { Button } from "@/components/ui/button.tsx";

export default function AccessDenied() {
  const { removeUser } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <ShieldX className="w-8 h-8 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground max-w-sm">
          Your account has not been granted access to TalentBase. Please contact your administrator.
        </p>
      </div>
      <Button variant="secondary" onClick={() => removeUser()}>
        Sign Out
      </Button>
    </div>
  );
}
