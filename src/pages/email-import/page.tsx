import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Mail, Plus, Trash2, CheckCircle, AlertCircle, Loader2, ExternalLink,
  FolderOpen, Folder, ChevronRight, ChevronDown, Globe, Database,
  ArrowLeft, ScanSearch, X
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Input } from "@/components/ui/input.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import AppLayout from "@/components/app-layout.tsx";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type Account = { _id: Id<"m365Accounts">; email: string; displayName?: string; expiresAt: string };
type MailFolder = { id: string; displayName: string; childFolderCount: number; totalItemCount: number };
type SpSite = { id: string; displayName: string; name: string; webUrl: string };
type SpDrive = { id: string; name: string; driveType: string };
type DriveItem = { id: string; name: string; folder?: { childCount: number }; file?: { mimeType: string }; size?: number };

// ─── Folder tree node ────────────────────────────────────────────────────────

type MailFolderNodeProps = {
  folder: MailFolder;
  accountId: Id<"m365Accounts">;
  sharedMailbox?: string;
  selectedIds: Set<string>;
  onToggle: (id: string, displayName: string) => void;
  listMailFolders: (args: { accountId: Id<"m365Accounts">; sharedMailbox?: string; parentFolderId?: string }) => Promise<MailFolder[]>;
};

function MailFolderNode({ folder, accountId, sharedMailbox, selectedIds, onToggle, listMailFolders }: MailFolderNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<MailFolder[]>([]);
  const [loading, setLoading] = useState(false);

  const expand = async () => {
    if (!expanded && folder.childFolderCount > 0 && children.length === 0) {
      setLoading(true);
      try {
        const result = await listMailFolders({ accountId, sharedMailbox, parentFolderId: folder.id });
        setChildren(result);
      } catch { toast.error("Failed to load subfolders"); }
      finally { setLoading(false); }
    }
    setExpanded(!expanded);
  };

  return (
    <div>
      <div className={cn("flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer group", selectedIds.has(folder.id) && "bg-primary/5")}>
        <Checkbox
          checked={selectedIds.has(folder.id)}
          onCheckedChange={() => onToggle(folder.id, folder.displayName)}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={expand}>
          {folder.childFolderCount > 0 ? (
            loading ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-muted-foreground" /> :
            expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> :
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          ) : <span className="w-3.5 shrink-0" />}
          {expanded ? <FolderOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" /> : <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          <span className="text-sm truncate">{folder.displayName}</span>
          <span className="text-xs text-muted-foreground shrink-0 ml-auto">{folder.totalItemCount}</span>
        </div>
      </div>
      {expanded && children.length > 0 && (
        <div className="ml-5 border-l border-border/50 pl-2 mt-0.5">
          {children.map((child) => (
            <MailFolderNode key={child.id} folder={child} accountId={accountId} sharedMailbox={sharedMailbox} selectedIds={selectedIds} onToggle={onToggle} listMailFolders={listMailFolders} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SharePoint folder tree node ──────────────────────────────────────────────

type SpFolderNodeProps = {
  item: DriveItem;
  accountId: Id<"m365Accounts">;
  siteId: string;
  driveId: string;
  selectedIds: Set<string>;
  onToggle: (id: string, name: string) => void;
  listFolder: (args: { accountId: Id<"m365Accounts">; siteId: string; driveId: string; itemId?: string }) => Promise<DriveItem[]>;
};

function SpFolderNode({ item, accountId, siteId, driveId, selectedIds, onToggle, listFolder }: SpFolderNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(false);

  if (!item.folder) return null; // only show folders

  const expand = async () => {
    if (!expanded && (item.folder?.childCount ?? 0) > 0 && children.length === 0) {
      setLoading(true);
      try {
        const result = await listFolder({ accountId, siteId, driveId, itemId: item.id });
        setChildren(result.filter(i => i.folder));
      } catch { toast.error("Failed to load subfolders"); }
      finally { setLoading(false); }
    }
    setExpanded(!expanded);
  };

  return (
    <div>
      <div className={cn("flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer", selectedIds.has(item.id) && "bg-primary/5")}>
        <Checkbox
          checked={selectedIds.has(item.id)}
          onCheckedChange={() => onToggle(item.id, item.name)}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={expand}>
          {(item.folder.childCount ?? 0) > 0 ? (
            loading ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-muted-foreground" /> :
            expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> :
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          ) : <span className="w-3.5 shrink-0" />}
          {expanded ? <FolderOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" /> : <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          <span className="text-sm truncate">{item.name}</span>
          {item.folder.childCount > 0 && <span className="text-xs text-muted-foreground shrink-0 ml-auto">{item.folder.childCount} items</span>}
        </div>
      </div>
      {expanded && children.length > 0 && (
        <div className="ml-5 border-l border-border/50 pl-2 mt-0.5">
          {children.map((child) => (
            <SpFolderNode key={child.id} item={child} accountId={accountId} siteId={siteId} driveId={driveId} selectedIds={selectedIds} onToggle={onToggle} listFolder={listFolder} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Scanner panel ────────────────────────────────────────────────────────────

type SelectedSource = {
  type: "mail" | "sharepoint";
  id: string; // folderId
  label: string;
  accountId: Id<"m365Accounts">;
  // For sharepoint
  siteId?: string;
  driveId?: string;
  itemId?: string; // drive item id for the folder
  // For mail
  sharedMailbox?: string;
};

type FoundFile = {
  id: string;
  name: string;
  size: number;
  source: "sharepoint" | "email";
  driveId?: string;
  siteId?: string;
  itemId?: string;
  messageId?: string;
  attachmentId?: string;
  folderPath?: string;
  emailSubject?: string;
  sharedMailbox?: string;
  bodyLinkUrl?: string;
};

type ScannerPanelProps = {
  account: Account;
  onBack: () => void;
  selectedSources: SelectedSource[];
  onAddSource: (source: SelectedSource) => void;
  onRemoveSource: (id: string) => void;
  onStartScan: (sources: SelectedSource[]) => void;
};

function ScannerPanel({ account, onBack, selectedSources, onAddSource, onRemoveSource, onStartScan }: ScannerPanelProps) {
  const [tab, setTab] = useState<"mail" | "sharepoint">("mail");
  const [mailFolders, setMailFolders] = useState<MailFolder[]>([]);
  const [loadingMail, setLoadingMail] = useState(false);
  const [sharedMailbox, setSharedMailbox] = useState("");
  const [spSites, setSpSites] = useState<SpSite[]>([]);
  const [spDrives, setSpDrives] = useState<SpDrive[]>([]);
  const [spItems, setSpItems] = useState<DriveItem[]>([]);
  const [selectedSite, setSelectedSite] = useState<SpSite | null>(null);
  const [selectedDrive, setSelectedDrive] = useState<SpDrive | null>(null);
  const [loadingSp, setLoadingSp] = useState(false);

  const listMailFolders = useAction(api.m365.actions.listMailFolders);
  const listSpSites = useAction(api.m365.actions.listSharePointSites);
  const listSpDrives = useAction(api.m365.actions.listSharePointDrives);
  const listSpFolder = useAction(api.m365.actions.listSharePointFolder);

  const selectedMailIds = new Set(selectedSources.filter(s => s.type === "mail").map(s => s.id));
  const selectedSpIds = new Set(selectedSources.filter(s => s.type === "sharepoint").map(s => s.id));

  const loadMailFolders = async (mbx?: string) => {
    setLoadingMail(true);
    try {
      const result = await listMailFolders({ accountId: account._id, sharedMailbox: mbx || undefined });
      setMailFolders(result);
    } catch { toast.error("Failed to load mail folders"); }
    finally { setLoadingMail(false); }
  };

  const loadSpSites = async () => {
    setLoadingSp(true);
    try {
      const result = await listSpSites({ accountId: account._id });
      setSpSites(result);
    } catch { toast.error("Failed to load SharePoint sites"); }
    finally { setLoadingSp(false); }
  };

  useEffect(() => {
    if (tab === "mail" && mailFolders.length === 0) loadMailFolders();
    if (tab === "sharepoint" && spSites.length === 0) loadSpSites();
  }, [tab]);

  const toggleMailFolder = (id: string, name: string) => {
    if (selectedMailIds.has(id)) {
      onRemoveSource(id);
    } else {
      onAddSource({ type: "mail", id, label: name, accountId: account._id, sharedMailbox: sharedMailbox || undefined });
    }
  };

  const toggleSpFolder = (id: string, name: string) => {
    if (!selectedSite || !selectedDrive) return;
    if (selectedSpIds.has(id)) {
      onRemoveSource(id);
    } else {
      onAddSource({ type: "sharepoint", id, label: `${selectedSite.displayName} / ${selectedDrive.name} / ${name}`, accountId: account._id, siteId: selectedSite.id, driveId: selectedDrive.id, itemId: id });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Button>
        <div>
          <p className="text-sm font-medium">{account.displayName ?? account.email}</p>
          <p className="text-xs text-muted-foreground">{account.email}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "mail" | "sharepoint")}>
        <TabsList className="w-full">
          <TabsTrigger value="mail" className="flex-1 gap-1.5"><Mail className="w-3.5 h-3.5" /> Mailbox</TabsTrigger>
          <TabsTrigger value="sharepoint" className="flex-1 gap-1.5"><Globe className="w-3.5 h-3.5" /> SharePoint</TabsTrigger>
        </TabsList>

        <TabsContent value="mail" className="space-y-3 mt-3">
          <div className="flex gap-2">
            <Input
              placeholder="Shared mailbox email (optional)"
              value={sharedMailbox}
              onChange={(e) => setSharedMailbox(e.target.value)}
              className="text-sm h-8"
            />
            <Button size="sm" variant="secondary" onClick={() => loadMailFolders(sharedMailbox)} disabled={loadingMail}>
              {loadingMail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Load"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Leave blank for your own inbox, or enter a shared mailbox email.</p>
          {loadingMail ? (
            <div className="space-y-1">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : mailFolders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No folders found</p>
          ) : (
            <div className="border rounded-md p-2 max-h-64 overflow-y-auto space-y-0.5">
              {mailFolders.map(f => (
                <MailFolderNode key={f.id} folder={f} accountId={account._id} sharedMailbox={sharedMailbox || undefined} selectedIds={selectedMailIds} onToggle={toggleMailFolder} listMailFolders={listMailFolders} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sharepoint" className="space-y-3 mt-3">
          {!selectedSite ? (
            <>
              <p className="text-xs text-muted-foreground">Select a SharePoint site:</p>
              {loadingSp ? (
                <div className="space-y-1">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : spSites.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No SharePoint sites found</p>
              ) : (
                <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                  {spSites.map(site => (
                    <button key={site.id} onClick={async () => {
                      setSelectedSite(site);
                      setLoadingSp(true);
                      try {
                        const drives = await listSpDrives({ accountId: account._id, siteId: site.id });
                        setSpDrives(drives);
                        if (drives.length === 1) {
                          setSelectedDrive(drives[0]);
                          const items = await listSpFolder({ accountId: account._id, siteId: site.id, driveId: drives[0].id });
                          setSpItems(items.filter(i => i.folder));
                        }
                      } catch { toast.error("Failed to load site"); }
                      finally { setLoadingSp(false); }
                    }} className="flex items-center gap-2 px-3 py-2.5 w-full text-left hover:bg-muted/50 transition-colors">
                      <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{site.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{site.webUrl}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : !selectedDrive ? (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => { setSelectedSite(null); setSpDrives([]); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Sites</button>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-xs font-medium">{selectedSite.displayName}</span>
              </div>
              <p className="text-xs text-muted-foreground">Select a document library:</p>
              {loadingSp ? <Skeleton className="h-10 w-full" /> : (
                <div className="border rounded-md divide-y">
                  {spDrives.map(drive => (
                    <button key={drive.id} onClick={async () => {
                      setSelectedDrive(drive);
                      setLoadingSp(true);
                      try {
                        const items = await listSpFolder({ accountId: account._id, siteId: selectedSite.id, driveId: drive.id });
                        setSpItems(items.filter(i => i.folder));
                      } catch { toast.error("Failed to load library"); }
                      finally { setLoadingSp(false); }
                    }} className="flex items-center gap-2 px-3 py-2.5 w-full text-left hover:bg-muted/50">
                      <Database className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">{drive.name}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => { setSelectedSite(null); setSelectedDrive(null); setSpDrives([]); setSpItems([]); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Sites</button>
                <span className="text-xs text-muted-foreground">/</span>
                <button onClick={() => { setSelectedDrive(null); setSpItems([]); }} className="text-xs text-muted-foreground hover:text-foreground">{selectedSite.displayName}</button>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-xs font-medium">{selectedDrive.name}</span>
              </div>
              {loadingSp ? (
                <div className="space-y-1">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : spItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No folders found</p>
              ) : (
                <div className="border rounded-md p-2 max-h-64 overflow-y-auto space-y-0.5">
                  {spItems.map(item => (
                    <SpFolderNode key={item.id} item={item} accountId={account._id} siteId={selectedSite.id} driveId={selectedDrive.id} selectedIds={selectedSpIds} onToggle={toggleSpFolder} listFolder={listSpFolder} />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Selected sources summary */}
      {selectedSources.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Selected for scanning ({selectedSources.length}):</p>
          <div className="space-y-1">
            {selectedSources.map(s => (
              <div key={s.id} className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1">
                {s.type === "mail" ? <Mail className="w-3 h-3 text-blue-400 shrink-0" /> : <Globe className="w-3 h-3 text-blue-400 shrink-0" />}
                <span className="text-xs truncate flex-1">{s.label}</span>
                <button onClick={() => onRemoveSource(s.id)} className="text-muted-foreground hover:text-destructive cursor-pointer shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <Button className="w-full gap-2" onClick={() => onStartScan(selectedSources)}>
            <ScanSearch className="w-4 h-4" />
            Start Scan ({selectedSources.length} {selectedSources.length === 1 ? "folder" : "folders"})
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function EmailImportContent() {
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [removingId, setRemovingId] = useState<Id<"m365Accounts"> | null>(null);
  const [scanningAccount, setScanningAccount] = useState<Account | null>(null);
  const [selectedSources, setSelectedSources] = useState<SelectedSource[]>([]);

  // Scan & review state
  const [phase, setPhase] = useState<"browse" | "scanning" | "summary" | "sample" | "review" | "importing" | "done">("browse");
  const [foundFiles, setFoundFiles] = useState<FoundFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; errors: number; skipped: number; notCv: number }>({ done: 0, total: 0, errors: 0, skipped: 0, notCv: 0 });
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanStats, setScanStats] = useState<{ folders: number; totalFiles: number; totalSize: number } | null>(null);
  const [sampleFiles, setSampleFiles] = useState<FoundFile[]>([]);
  const [scanProgress, setScanProgress] = useState<{ messagesScanned: number; cvsFound: number } | null>(null);

  const getOAuthUrl = useAction(api.m365.actions.getOAuthUrl);
  const exchangeCode = useAction(api.m365.actions.exchangeCode);
  const listAccounts = useAction(api.m365.actions.listAccounts);
  const removeAccount = useAction(api.m365.actions.removeAccount);
  const scanSharePointFolder = useAction(api.m365.scan.scanSharePointFolder);
  const scanSharePointFolderBatch = useAction(api.m365.scan.scanSharePointFolderBatch);
  const scanMailFolder = useAction(api.m365.scan.scanMailFolder);
  const scanMailFolderBatch = useAction(api.m365.scan.scanMailFolderBatch);
  const importSharePointFile = useAction(api.m365.scan.importSharePointFile);
  const importMailAttachment = useAction(api.m365.scan.importMailAttachment);
  const importBodyLinkFile = useAction(api.m365.scan.importBodyLinkFile);

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

  useEffect(() => { loadAccounts(); }, []);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) toast.error(`Connection failed: ${decodeURIComponent(error)}`);
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const url = await getOAuthUrl({});

      // Open in popup so main window session is preserved
      const popup = window.open(url, "ms_oauth", "width=520,height=640,toolbar=0,menubar=0,location=0");
      if (!popup) {
        toast.error("Popup blocked. Please allow popups for this site and try again.");
        setIsConnecting(false);
        return;
      }

      const onMessage = async (event: MessageEvent) => {
        if (event.data?.type !== "ms_oauth_callback") return;
        window.removeEventListener("message", onMessage);

        const { code, state, error } = event.data.payload as { code?: string; state?: string; error?: string };
        if (error) {
          toast.error(`Connection failed: ${error}`);
          setIsConnecting(false);
          return;
        }
        if (!code || !state) {
          toast.error("Connection failed: missing parameters");
          setIsConnecting(false);
          return;
        }
        try {
          const result = await exchangeCode({ code, state });
          if (result.ok) { toast.success(`Connected: ${result.email}`); loadAccounts(); }
          else toast.error(`Connection failed: ${result.error}`);
        } catch {
          toast.error("Failed to complete connection");
        } finally {
          setIsConnecting(false);
        }
      };

      window.addEventListener("message", onMessage);

      // Fallback: if popup is closed without message
      const pollClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClosed);
          window.removeEventListener("message", onMessage);
          setIsConnecting(false);
        }
      }, 500);

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start connection");
      setIsConnecting(false);
    }
  };

  const handleRemove = async (accountId: Id<"m365Accounts">) => {
    setRemovingId(accountId);
    try {
      await removeAccount({ accountId });
      setAccounts(prev => prev.filter(a => a._id !== accountId));
      toast.success("Account disconnected");
    } catch { toast.error("Failed to disconnect account"); }
    finally { setRemovingId(null); }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const handleStartScan = async (sources: SelectedSource[]) => {
    setPhase("scanning");
    setScanError(null);
    setFoundFiles([]);
    setSelectedFileIds(new Set());
    setScanStats(null);
    setScanProgress({ messagesScanned: 0, cvsFound: 0 });

    try {
      const allFiles: FoundFile[] = [];
      let totalMessagesScanned = 0;
      let scanErrors = 0;

      const spSources = sources.filter(s => s.type === "sharepoint");
      const mailSources = sources.filter(s => s.type === "mail");

      // Run SharePoint scans sequentially with cursor-based batching
      if (spSources.length > 0) {
        for (const source of spSources) {
          let spCursor: string | undefined = undefined;
          let spDone = false;
          while (!spDone) {
            const batch = await scanSharePointFolderBatch({
              accountId: source.accountId,
              siteId: source.siteId!,
              driveId: source.driveId!,
              itemId: source.itemId,
              folderName: source.label,
              cursor: spCursor,
            });
            allFiles.push(...batch.files);
            setScanProgress({ messagesScanned: totalMessagesScanned, cvsFound: allFiles.length });
            if (batch.nextCursor) {
              spCursor = batch.nextCursor;
            } else {
              spDone = true;
            }
          }
        }
      }

      // Run mail scans sequentially with cursor-based batching
      for (const source of mailSources) {
        let cursor: string | undefined = undefined;
        let done = false;
        while (!done) {
          const batch = await scanMailFolderBatch({
            accountId: source.accountId,
            folderId: source.id,
            folderName: source.label,
            sharedMailbox: source.sharedMailbox,
            cursor,
          });
          allFiles.push(...batch.files);
          totalMessagesScanned += batch.messagesScanned;
          setScanProgress({ messagesScanned: totalMessagesScanned, cvsFound: allFiles.length });
          if (batch.nextCursor) {
            cursor = batch.nextCursor;
          } else {
            done = true;
          }
        }
      }

      if (scanErrors > 0) toast.warning(`${scanErrors} folder${scanErrors !== 1 ? "s" : ""} failed to scan.`);
      setFoundFiles(allFiles);
      setSelectedFileIds(new Set(allFiles.map(f => f.id)));

      const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);
      setScanStats({ folders: sources.length, totalFiles: allFiles.length, totalSize });

      if (allFiles.length === 0) {
        toast.info("No CV files found in the selected folders.");
        setPhase("browse");
      } else {
        const shuffled = [...allFiles].sort(() => Math.random() - 0.5);
        setSampleFiles(shuffled.slice(0, 10));
        setPhase("summary");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      setScanError(msg);
      toast.error(`Scan failed: ${msg.slice(0, 120)}`);
      setPhase("browse");
    }
  };

  const handleImport = async () => {
    const toImport = foundFiles.filter(f => selectedFileIds.has(f.id));
    if (!scanningAccount || toImport.length === 0) return;

    setPhase("importing");
    setImportProgress({ done: 0, total: toImport.length, errors: 0, skipped: 0, notCv: 0 });

    let errors = 0;
    let skipped = 0;
    let notCv = 0;

    try {
      // Process in parallel batches of 5 to avoid overwhelming the API
      const BATCH_SIZE = 5;
      for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
        const batch = toImport.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(file => {
            if (file.source === "sharepoint") {
              return importSharePointFile({
                accountId: scanningAccount._id,
                siteId: file.siteId!,
                driveId: file.driveId!,
                itemId: file.itemId!,
                fileName: file.name,
              });
            } else if (file.bodyLinkUrl) {
              // CV linked in email body — download directly from URL
              return importBodyLinkFile({
                url: file.bodyLinkUrl,
                fileName: file.name,
              });
            } else {
              return importMailAttachment({
                accountId: scanningAccount._id,
                messageId: file.messageId!,
                attachmentId: file.attachmentId!,
                fileName: file.name,
                sharedMailbox: file.sharedMailbox,
              });
            }
          })
        );

        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            if (result.value.skipped) {
              if ("notACv" in result.value && result.value.notACv) notCv++;
              else skipped++;
            }
          } else {
            errors++;
          }
        }
        setImportProgress(p => ({ ...p, done: Math.min(p.done + batch.length, toImport.length), errors, skipped, notCv }));
      }

      const imported = toImport.length - errors - skipped - notCv;
      if (imported > 0) toast.success(`${imported} CV${imported !== 1 ? "s" : ""} imported successfully!`);
      if (skipped > 0) toast.info(`${skipped} file${skipped !== 1 ? "s" : ""} already imported — skipped.`);
      if (notCv > 0) toast.info(`${notCv} file${notCv !== 1 ? "s" : ""} did not appear to be a CV — skipped.`);
      if (errors > 0) toast.error(`${errors} file${errors !== 1 ? "s" : ""} failed to import.`);
    } catch (err) {
      toast.error(`Import error: ${err instanceof Error ? err.message.slice(0, 120) : "Unknown error"}`);
      errors++;
    }

    // Always show the done summary screen regardless of success or failure
    setImportProgress(p => ({ ...p, errors }));
    setPhase("done");
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Email & SharePoint Import</h1>
        <p className="text-muted-foreground mt-1">
          Scan Microsoft 365 mailboxes and SharePoint folders for CV attachments.
        </p>
      </div>

      {/* Scanning phase */}
      {phase === "scanning" && (
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Scanning folders for CV files...</p>
            {scanProgress && scanProgress.messagesScanned > 0 ? (
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs text-muted-foreground">
                  {scanProgress.messagesScanned.toLocaleString()} messages scanned
                </p>
                <p className="text-xs font-medium text-primary">
                  {scanProgress.cvsFound} CV{scanProgress.cvsFound !== 1 ? "s" : ""} found so far
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">This may take a while for large folders.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary phase */}
      {phase === "summary" && scanStats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Scan Complete</CardTitle>
            <CardDescription className="text-xs">Here&apos;s what was found across {scanStats.folders} folder{scanStats.folders !== 1 ? "s" : ""}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{scanStats.totalFiles}</p>
                <p className="text-xs text-muted-foreground mt-1">CV files found</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{scanStats.folders}</p>
                <p className="text-xs text-muted-foreground mt-1">Folders scanned</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{formatBytes(scanStats.totalSize)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total size</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Before importing all {scanStats.totalFiles} files, review a random sample of {sampleFiles.length} to confirm they look like CVs.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => { setPhase("browse"); }}>Back</Button>
              <Button className="flex-1 gap-2" onClick={() => setPhase("sample")}>
                <ScanSearch className="w-4 h-4" /> Review Sample
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sample review phase */}
      {phase === "sample" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sample Review</CardTitle>
            <CardDescription className="text-xs">
              These {sampleFiles.length} files were randomly selected. Do they look like CVs?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
              {sampleFiles.map(file => (
                <div key={file.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {file.source === "email" ? `Email: ${file.emailSubject ?? ""}` : file.folderPath ?? ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      {file.source === "email" ? "Email" : "SharePoint"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              If these look correct, proceed to import all {foundFiles.length} files.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPhase("summary")}>Back</Button>
              <Button variant="secondary" className="flex-1" onClick={() => setPhase("review")}>
                Review All Files
              </Button>
              <Button className="flex-1 gap-2" onClick={handleImport}>
                <CheckCircle className="w-4 h-4" /> Yes, Import All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Done phase */}
      {phase === "done" && (
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <h3 className="text-lg font-semibold">Import Complete</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-primary">
                  {importProgress.total - importProgress.errors - importProgress.skipped - importProgress.notCv}
                </p>
                <p className="text-xs text-muted-foreground mt-1">CVs imported</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{importProgress.skipped}</p>
                <p className="text-xs text-muted-foreground mt-1">Already existed</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{importProgress.notCv}</p>
                <p className="text-xs text-muted-foreground mt-1">Not a CV</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className={`text-2xl font-bold ${importProgress.errors > 0 ? "text-destructive" : ""}`}>{importProgress.errors}</p>
                <p className="text-xs text-muted-foreground mt-1">Failed</p>
              </div>
            </div>
            <Button className="w-full max-w-sm" onClick={() => {
              setPhase("browse");
              setScanningAccount(null);
              setSelectedSources([]);
              setFoundFiles([]);
            }}>
              Done
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Importing phase */}
      {phase === "importing" && (
        <Card>
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Importing CVs... {importProgress.done} / {importProgress.total}</p>
            <div className="w-full max-w-xs bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              {importProgress.errors > 0 && <span className="text-destructive">{importProgress.errors} failed</span>}
              {importProgress.skipped > 0 && <span>{importProgress.skipped} already imported (skipped)</span>}
              {importProgress.notCv > 0 && <span>{importProgress.notCv} not a CV (skipped)</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review phase */}
      {phase === "review" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Found {foundFiles.length} CV {foundFiles.length === 1 ? "file" : "files"}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSelectedFileIds(new Set(foundFiles.map(f => f.id)))}>
                  Select All
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setSelectedFileIds(new Set())}>
                  Deselect All
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs">
              {selectedFileIds.size} of {foundFiles.length} selected for import
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {foundFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No CV files found in the selected folders.</p>
            ) : (
              <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
                {foundFiles.map(file => (
                  <div key={file.id} className={cn("flex items-start gap-3 px-3 py-2.5 hover:bg-muted/30", selectedFileIds.has(file.id) && "bg-primary/5")}>
                    <Checkbox
                      checked={selectedFileIds.has(file.id)}
                      onCheckedChange={(checked) => {
                        setSelectedFileIds(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(file.id); else next.delete(file.id);
                          return next;
                        });
                      }}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {file.source === "email" ? `Email: ${file.emailSubject ?? ""}` : file.folderPath ?? ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {file.source === "email" ? "Email" : "SharePoint"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setPhase("browse"); }} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedFileIds.size === 0}
                className="flex-1 gap-2"
              >
                <ScanSearch className="w-4 h-4" />
                Import {selectedFileIds.size} CV{selectedFileIds.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Browse phase */}
      {phase === "browse" && scanningAccount ? (
        <Card>
          <CardContent className="pt-6">
            <ScannerPanel
              account={scanningAccount}
              onBack={() => { setScanningAccount(null); setSelectedSources([]); setScanError(null); }}
              selectedSources={selectedSources}
              onAddSource={(s) => setSelectedSources(prev => [...prev, s])}
              onRemoveSource={(id) => setSelectedSources(prev => prev.filter(s => s.id !== id))}
              onStartScan={handleStartScan}
            />
            {scanError && (
              <p className="text-xs text-destructive mt-3">{scanError}</p>
            )}
          </CardContent>
        </Card>
      ) : phase === "browse" && (
        <>
          {!isLoadingAccounts && accounts.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="pt-6">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Mail /></EmptyMedia>
                    <EmptyTitle>No accounts connected</EmptyTitle>
                    <EmptyDescription>Connect a Microsoft 365 account to scan mailboxes and SharePoint for CVs.</EmptyDescription>
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

          {isLoadingAccounts ? (
            <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : accounts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Connected Accounts ({accounts.length}/10)</h2>
                {accounts.length < 10 && (
                  <Button size="sm" variant="secondary" onClick={handleConnect} disabled={isConnecting} className="gap-1.5">
                    {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Add Account
                  </Button>
                )}
              </div>
              {accounts.map(account => (
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
                    <div className="flex items-center gap-2">
                      {isExpired(account.expiresAt) ? (
                        <Badge variant="destructive" className="gap-1 text-xs"><AlertCircle className="w-3 h-3" />Expired</Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 text-xs"><CheckCircle className="w-3 h-3 text-green-500" />Connected</Badge>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => { setScanningAccount(account); setSelectedSources([]); setPhase("browse"); }} className="gap-1.5 text-xs">
                        <ScanSearch className="w-3.5 h-3.5" /> Browse
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleRemove(account._id)} disabled={removingId === account._id} className="text-muted-foreground hover:text-destructive">
                        {removingId === account._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Azure Setup Required</CardTitle>
              <CardDescription className="text-xs">Register a Microsoft app to enable the connection.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <ol className="list-decimal list-inside space-y-1.5">
                <li>Go to <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">portal.azure.com <ExternalLink className="w-3 h-3" /></a></li>
                <li>Azure Active Directory → App registrations → New registration</li>
                <li>Add Redirect URI: your Convex HTTP Actions URL + <code className="bg-muted px-1 rounded">/m365/callback</code></li>
                <li>Add API permissions: <code className="bg-muted px-1 rounded">Mail.Read</code>, <code className="bg-muted px-1 rounded">Sites.Read.All</code>, <code className="bg-muted px-1 rounded">Files.Read.All</code>, <code className="bg-muted px-1 rounded">User.Read</code>, <code className="bg-muted px-1 rounded">offline_access</code></li>
                <li>Add secrets: <code className="bg-muted px-1 rounded">MS_CLIENT_ID</code>, <code className="bg-muted px-1 rounded">MS_CLIENT_SECRET</code>, <code className="bg-muted px-1 rounded">MS_REDIRECT_URI</code>, <code className="bg-muted px-1 rounded">APP_ORIGIN</code></li>
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

import RoleGuard from "@/components/role-guard.tsx";

export default function EmailImport() {
  return (
    <AppLayout>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full"><SignInButton /></div>
      </Unauthenticated>
      <AuthLoading>
        <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /></div>
      </AuthLoading>
      <Authenticated>
        <RoleGuard allowedRoles={["admin"]}>
          <EmailImportContent />
        </RoleGuard>
      </Authenticated>
    </AppLayout>
  );
}
