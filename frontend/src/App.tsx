import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "@/components/Layout";

import { LoadingScreen } from "@/components/ui/Spinner";

import { useAuth } from "@/context/AuthContext";

import ApprovalsPage from "@/pages/ApprovalsPage";

import AuditPage from "@/pages/AuditPage";

import DashboardPage from "@/pages/DashboardPage";

import LoginPage from "@/pages/LoginPage";

import MyScriptsPage from "@/pages/MyScriptsPage";

import ServersPage from "@/pages/ServersPage";

import UsersPage from "@/pages/UsersPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />

        <Route path="submit" element={<Navigate to="/my-scripts" replace />} />

        <Route path="my-scripts" element={<MyScriptsPage />} />

        <Route path="approvals" element={<ApprovalsPage />} />

        <Route path="servers" element={<ServersPage />} />

        <Route path="users" element={<UsersPage />} />

        <Route path="audit" element={<AuditPage />} />
      </Route>
    </Routes>
  );
}
