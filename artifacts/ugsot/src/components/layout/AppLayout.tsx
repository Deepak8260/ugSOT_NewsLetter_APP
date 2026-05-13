import { Link, useLocation } from "wouter";
import { useGetMe, getGetMeQueryKey, useLogout } from "@workspace/api-client-react";
import { LayoutDashboard, Users, Mail, Settings, LogOut, FileText, Menu, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const menuItems = [
  { title: "Dashboard", icon: LayoutDashboard, url: "/dashboard" },
  { title: "Employees", icon: Users, url: "/employees" },
  { title: "Newsletters", icon: FileText, url: "/newsletters" },
  { title: "Email Logs", icon: Mail, url: "/email-logs" },
  { title: "Settings", icon: Settings, url: "/settings" },
];

function AppSidebar() {
  const [location] = useLocation();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        // The AppLayout will redirect
      }
    });
  };

  return (
    <Sidebar>
      <SidebarHeader className="h-16 flex items-center justify-center border-b px-4">
        <div className="flex items-center gap-2 font-semibold text-lg text-primary">
          <Mail className="h-5 w-5" />
          <span>ugSOT Admin</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url || (item.url !== "/dashboard" && location.startsWith(item.url))}>
                    <Link href={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <Button variant="ghost" className="w-full justify-start gap-2" onClick={handleLogout} disabled={logoutMutation.isPending}>
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isLoading, isError } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && (!session || !session.loggedIn)) {
      if (location !== "/login") {
        setLocation("/login");
      }
    }
  }, [isLoading, session, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session || !session.loggedIn) {
    return null; // Will redirect
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/30">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center border-b bg-background px-4 lg:px-8 gap-4 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="font-semibold text-sm text-muted-foreground ml-auto hidden sm:block">
              {session.email}
            </div>
          </header>
          <div className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}