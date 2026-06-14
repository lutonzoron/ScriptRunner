import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileCode,
  ClipboardList,
  Shield,
  Server,
  Users,
  ScrollText,
  LogOut,
  Menu,
  X,
  Terminal,
} from "lucide-react";
import { logout } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import ThemeToggle from "@/components/ui/ThemeToggle";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/submit", label: "Submeter Script", icon: FileCode },
  { to: "/my-scripts", label: "Minhas Solicitações", icon: ClipboardList },
  {
    to: "/approvals",
    label: "Aprovações",
    icon: Shield,
    roles: ["admin", "coordinator"],
  },
  { to: "/servers", label: "Servidores", icon: Server, roles: ["admin"] },
  {
    to: "/users",
    label: "Usuários",
    icon: Users,
    roles: ["admin", "coordinator"],
  },
  {
    to: "/audit",
    label: "Auditoria",
    icon: ScrollText,
    roles: ["admin", "coordinator"],
  },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/submit": "Submeter Script",
  "/my-scripts": "Minhas Solicitações",
  "/approvals": "Fila de Aprovação",
  "/servers": "Servidores",
  "/users": "Usuários",
  "/audit": "Auditoria",
};

export default function Layout() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    navigate("/login");
  };

  const visibleNav = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role)),
  );

  const pageTitle = pageTitles[location.pathname] || "Script Runner";
  const userInitial = user?.name?.charAt(0).toUpperCase() || "?";

  const sidebarContent = (
    <>
      <div className="p-5 border-b border-default">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-primary">
              Script Runner
            </h1>
            <p className="text-xs text-muted">Execução controlada de T-SQL</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-200 ${
                  isActive
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-muted hover:text-primary hover:bg-surface-elevated"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 w-1 h-6 bg-accent rounded-r hidden lg:block" />
                  )}
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-default">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-sm font-semibold text-accent">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-primary truncate">
              {user?.name}
            </p>
            <p className="text-xs text-muted truncate">{user?.email}</p>
          </div>
        </div>
        <Badge variant="brand" className="capitalize mb-3">
          {user?.role}
        </Badge>
        <Button variant="secondary" className="w-full" onClick={handleLogout}>
          <LogOut className="w-4 h-4" />
          Sair
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-base">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-default flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 p-1 rounded-lg text-muted hover:text-primary lg:hidden"
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur border-b border-default px-4 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-elevated lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-primary">{pageTitle}</h2>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
