import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";

const sectionLabel: Record<string, string> = {
  "/": "Cours",
  "/nouveau-cours": "Nouveau cours",
  "/recherche": "Recherche",
  "/vocabulaire": "Vocabulaire",
  "/prompts": "Prompts",
};

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const label = sectionLabel[location.pathname] ?? "Cours";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <NavLink to="/" className="brand" aria-label="Accueil">
            Suivi cours de ʿilm
          </NavLink>
          <nav className="main-nav" aria-label="Navigation principale">
            <NavLink to="/">Cours</NavLink>
            <NavLink to="/recherche">Recherche</NavLink>
            <NavLink to="/vocabulaire">Vocabulaire</NavLink>
            <NavLink to="/prompts">Prompts</NavLink>
            <NavLink to="/nouveau-cours">Nouveau</NavLink>
          </nav>
        </div>
      </header>
      <div className="crumb">
        <div className="crumb__inner">
          <span>{label}</span>
          {user ? (
            <button className="link-button" type="button" onClick={signOut}>
              Se déconnecter
            </button>
          ) : null}
        </div>
      </div>
      <main className="page-wrap">
        <Outlet />
      </main>
    </div>
  );
}
