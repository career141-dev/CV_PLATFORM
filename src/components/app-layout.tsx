import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Search, Upload, LogOut, Menu, X, Target, DatabaseZap, Briefcase, Mail, UserCog } from "lucide-react";
import { useAuth } from "@/hooks/use-auth.ts";
import { useRole } from "@/hooks/use-role.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

const baseNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", roles: ["admin", "recruiter", "viewer"] },
  { icon: Search, label: "Search CVs", href: "/search", roles: ["admin", "recruiter", "viewer"] },
  { icon: Briefcase, label: "Jobs", href: "/jobs", roles: ["admin", "recruiter", "viewer"] },
  { icon: Target, label: "JD Matching", href: "/jd-match", roles: ["admin", "recruiter", "viewer"] },
  { icon: Upload, label: "Upload CVs", href: "/upload", roles: ["admin", "recruiter"] },
  { icon: DatabaseZap, label: "Workable Import", href: "/workable-import", roles: ["admin"] },
  { icon: Mail, label: "Email Import", href: "/email-import", roles: ["admin"] },
  { icon: UserCog, label: "Users", href: "/users", roles: ["admin"] },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { removeUser, user } = useAuth();
  const role = useRole();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = role ? baseNavItems.filter(item => item.roles.includes(role)) : [];

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-sidebar border-r border-sidebar-border shrink-0">
        <div className="p-4 flex items-center border-b border-sidebar-border">
          <img src="https://hercules-cdn.com/file_TEqHXmSH2IfLvYtI18CmCUnf" alt="Career141" className="h-8 w-auto" />
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                location.pathname === item.href
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-sidebar-primary/30 flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground">
              {user?.profile.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <span className="text-xs text-sidebar-foreground/70 truncate flex-1">
              {user?.profile.email ?? user?.profile.name ?? "User"}
            </span>
          </div>
          <button
            onClick={() => removeUser()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 w-full transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <img src="https://hercules-cdn.com/file_f8BmJ62aM7DCa5uZEscvjRw3" alt="Career141" className="h-6 w-auto" />
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-sidebar-foreground cursor-pointer">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-sidebar pt-14">
          <nav className="p-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  location.pathname === item.href
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="px-4 pt-4 border-t border-sidebar-border">
            <Button variant="secondary" size="sm" onClick={() => removeUser()} className="gap-2 w-full">
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto min-h-0 pt-14 md:pt-0">{children}</main>
    </div>
  );
}
