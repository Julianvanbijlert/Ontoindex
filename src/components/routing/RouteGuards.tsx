import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessPath, getDefaultRouteForRole } from "@/lib/app-access";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, loading, role } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessPath(role, location.pathname)) {
    return <Navigate to={getDefaultRouteForRole(role)} replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

export function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading, role } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to={getDefaultRouteForRole(role)} replace />;
  }

  return <>{children}</>;
}
