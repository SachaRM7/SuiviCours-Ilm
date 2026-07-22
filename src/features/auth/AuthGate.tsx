import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import type { ReactNode } from "react";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-busy="true">
          <p className="eyebrow">Connexion</p>
          <h1>Ouverture de la bibliothèque</h1>
        </section>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
