import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Search } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/definitions": "Definitions",
  "/ontologies": "Ontologies",
  "/search": "Search",
  "/workflow": "Workflow",
  "/notifications": "Notifications",
  "/favorites": "Favorites",
  "/recent": "Recent",
  "/folders": "Folders",
  "/profile": "Profile",
  "/settings": "Settings",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();

  const pathSegments = location.pathname.split("/").filter(Boolean);
  const currentTitle = breadcrumbMap[location.pathname] || pathSegments[0] || "Dashboard";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border bg-card/50 backdrop-blur-sm px-4 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">OntologyHub</span>
                <span className="text-muted-foreground/50">/</span>
                <span className="font-medium text-foreground">{currentTitle}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/search")}
                className="text-muted-foreground hover:text-foreground"
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/notifications")}
                className="text-muted-foreground hover:text-foreground"
              >
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-6 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
