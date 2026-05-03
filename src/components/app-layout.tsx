import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Brain, LayoutDashboard, Search, Upload, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth.ts";
import { Button } from "@/components/ui/button.tsx";
import { useState } from "react";
import { cn } from "@/lib/utils.ts";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Search, label: "Search CVs", href: "/search" },
  { icon: Upload, label: "Upload CVs", href: "/upload" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { removeUser, user } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-sidebar border-r border-sidebar-border shrink-0">
        <div className="p-4 flex items-center gap-2.5 border-b border-sidebar-border">
          <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center">
            <Brain className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <span className="font-bold text-sidebar-foreground text-sm">TalentBase</span>
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
          <Brain className="w-5 h-5 text-sidebar-primary" />
          <span className="font-bold text-sidebar-foreground text-sm">TalentBase</span>
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
      <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
    </div>
  );
}
