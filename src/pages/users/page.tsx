import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Plus, Trash2, UserCog, Shield, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import AppLayout from "@/components/app-layout.tsx";
import { Authenticated } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type Role = "admin" | "recruiter" | "viewer";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  recruiter: "Recruiter",
  viewer: "Viewer",
};

const ROLE_ICONS: Record<Role, typeof Shield> = {
  admin: Shield,
  recruiter: Pencil,
  viewer: Eye,
};

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  recruiter: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

function UsersPageInner() {
  const approvedEmails = useQuery(api.users.listApprovedEmails, {});
  const addApprovedEmail = useMutation(api.users.addApprovedEmail);
  const removeApprovedEmail = useMutation(api.users.removeApprovedEmail);
  const updateUserRole = useMutation(api.users.updateUserRole);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("recruiter");
  const [adding, setAdding] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<Id<"approvedEmails"> | null>(null);
  const [editingId, setEditingId] = useState<Id<"approvedEmails"> | null>(null);
  const [editRole, setEditRole] = useState<Role>("recruiter");

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setAdding(true);
    try {
      await addApprovedEmail({ email, role: newRole });
      toast.success(`Access granted to ${email}`);
      setNewEmail("");
      setNewRole("recruiter");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: Id<"approvedEmails">) => {
    try {
      await removeApprovedEmail({ approvedEmailId: id });
      toast.success("Access revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove user");
    } finally {
      setConfirmRemoveId(null);
    }
  };

  const handleUpdateRole = async () => {
    if (!editingId) return;
    try {
      await updateUserRole({ approvedEmailId: editingId, role: editRole });
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setEditingId(null);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="w-6 h-6" />
          User Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Control who can access TalentBase and what they can do.
        </p>
      </div>

      {/* Add new user */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add User</CardTitle>
          <CardDescription>Grant access to a new employee by their email address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="employee@company.com"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              className="flex-1"
            />
            <Select value={newRole} onValueChange={v => setNewRole(v as Role)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="recruiter">Recruiter</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={adding} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Admin</strong> — full access including user management</p>
            <p><strong>Recruiter</strong> — can upload CVs, manage jobs, interact with candidates</p>
            <p><strong>Viewer</strong> — read-only access to candidates and jobs</p>
          </div>
        </CardContent>
      </Card>

      {/* User list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Approved Users ({approvedEmails?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {approvedEmails === undefined && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
          {approvedEmails?.length === 0 && (
            <p className="text-sm text-muted-foreground">No users added yet.</p>
          )}
          {approvedEmails?.map(entry => {
            const RoleIcon = ROLE_ICONS[entry.role];
            return (
              <div key={entry._id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {entry.email[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{entry.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[entry.role]}`}>
                    <RoleIcon className="w-3 h-3" />
                    {ROLE_LABELS[entry.role]}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditingId(entry._id); setEditRole(entry.role); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmRemoveId(entry._id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Confirm remove dialog */}
      <Dialog open={confirmRemoveId !== null} onOpenChange={() => setConfirmRemoveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Access</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This user will be immediately signed out and lose all access to TalentBase. Are you sure?
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmRemoveId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmRemoveId && handleRemove(confirmRemoveId)}
            >
              Revoke Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit role dialog */}
      <Dialog open={editingId !== null} onOpenChange={() => setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
          </DialogHeader>
          <Select value={editRole} onValueChange={v => setEditRole(v as Role)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="recruiter">Recruiter</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
            <Button onClick={handleUpdateRole}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function UsersPage() {
  return (
    <AppLayout>
      <Authenticated>
        <UsersPageInner />
      </Authenticated>
    </AppLayout>
  );
}
