import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Plus, Trash2, CheckCircle, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import AppLayout from "@/components/app-layout.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type Account = {
  _id: Id<"m365Accounts">;
  email: string;
  displayName?: string;
  expiresAt: string;
};

function EmailImportContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [removingId, setRemovingId] = useState<Id<"m365Accounts"> | null>(null);

  const getOAuthUrl = useAction(api.m365.actions.getOAuthUrl);
  const exchangeCode = useAction(api.m365.actions.exchangeCode);
  const listAccounts = useAction(api.m365.actions.listAccounts);
  const removeAccount = useAction(api.m365.actions.removeAccount);

  const loadAccounts = async () => {
    try {
      const result = await listAccounts({});
      setAccounts(result);
    } catch {
      toast.error("Failed to load connected accounts");
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  // Handle OAuth callback result
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (code && state) {
      // Exchange the code for tokens
      setIsConnecting(true);
      setSearchParams({}, { replace: true });
      exchangeCode({ code, state })
        .then((result) => {
          if (result.ok) {
            toast.success(`Microsoft account connected: ${result.email}`);
            loadAccounts();
          } else {
            toast.error(`Connection failed: ${result.error}`);
          }
        })
        .catch(() => toast.error("Failed to complete connection"))
        .finally(() => setIsConnecting(false));
    } else if (connected === "1") {
      toast.success("Microsoft account connected successfully!");
      loadAccounts();
      setSearchParams({}, { replace: true });
    } else if (error) {
      toast.error(`Connection failed: ${decodeURIComponent(error)}`);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const url = await getOAuthUrl({});
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start connection";
      toast.error(msg);
      setIsConnecting(false);
    }
  };

  const handleRemove = async (accountId: Id<"m365Accounts">) => {
    setRemovingId(accountId);
    try {
      await removeAccount({ accountId });
      setAccounts((prev) => prev.filter((a) => a._id !== accountId));
      toast.success("Account disconnected");
    } catch {
      toast.error("Failed to disconnect account");
    } finally {
      setRemovingId(null);
    }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Email Import</h1>
        <p className="text-muted-foreground mt-1">
          Connect your Microsoft 365 mailboxes to scan emails for CV attachments.
        </p>
      </div>

      {/* Setup instructions if no accounts */}
      {!isLoadingAccounts && accounts.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Mail /></EmptyMedia>
                <EmptyTitle>No mailboxes connected</EmptyTitle>
                <EmptyDescription>
                  Connect a Microsoft 365 mailbox to start importing CVs from emails. You can connect up to 10 mailboxes.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={handleConnect} disabled={isConnecting} className="gap-2">
                  {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Connect Microsoft Account
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      )}

      {/* Connected accounts list */}
      {isLoadingAccounts ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : accounts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Connected Mailboxes ({accounts.length}/10)</h2>
            {accounts.length < 10 && (
              <Button size="sm" variant="secondary" onClick={handleConnect} disabled={isConnecting} className="gap-1.5">
                {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add Mailbox
              </Button>
            )}
          </div>

          {accounts.map((account) => (
            <Card key={account._id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{account.displayName ?? account.email}</p>
                    <p className="text-xs text-muted-foreground">{account.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isExpired(account.expiresAt) ? (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <AlertCircle className="w-3 h-3" />
                      Expired
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      Connected
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(account._id)}
                    disabled={removingId === account._id}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {removingId === account._id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Setup guide */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Setup Required</CardTitle>
          <CardDescription className="text-xs">
            Before connecting, you need to register an app in Azure Active Directory and add the credentials to TalentBase secrets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <div className="space-y-2">
            <p className="font-medium text-foreground">Steps to set up:</p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Go to <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">portal.azure.com <ExternalLink className="w-3 h-3" /></a> and sign in with your company account</li>
              <li>Navigate to <strong>Azure Active Directory → App registrations → New registration</strong></li>
              <li>Name it "TalentBase", set Redirect URI to your Convex HTTP Actions URL + <code className="bg-muted px-1 rounded">/m365/callback</code></li>
              <li>After creating, copy the <strong>Application (client) ID</strong></li>
              <li>Under <strong>Certificates & secrets</strong>, create a new client secret and copy it</li>
              <li>In TalentBase, go to <strong>Secrets</strong> and add:
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li><code className="bg-muted px-1 rounded">MS_CLIENT_ID</code> — your Application ID</li>
                  <li><code className="bg-muted px-1 rounded">MS_CLIENT_SECRET</code> — your client secret</li>
                  <li><code className="bg-muted px-1 rounded">MS_REDIRECT_URI</code> — your Convex HTTP Actions URL + <code className="bg-muted px-1 rounded">/m365/callback</code></li>
                  <li><code className="bg-muted px-1 rounded">APP_ORIGIN</code> — your TalentBase app URL (e.g. <code className="bg-muted px-1 rounded">https://yourapp.onhercules.app</code>)</li>
                </ul>
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EmailImport() {
  return (
    <AppLayout>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full">
          <SignInButton />
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AuthLoading>
      <Authenticated>
        <EmailImportContent />
      </Authenticated>
    </AppLayout>
  );
}
