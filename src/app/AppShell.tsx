import { useEffect, useRef } from "react";
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
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function allowsHorizontalGesture(target: EventTarget | null) {
      return (
        target instanceof Element &&
        Boolean(target.closest(".main-nav, .image-viewer"))
      );
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1 || allowsHorizontalGesture(event.target)) {
        touchStart.current = null;
        return;
      }

      const touch = event.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchMove(event: TouchEvent) {
      if (
        event.touches.length !== 1 ||
        !touchStart.current ||
        allowsHorizontalGesture(event.target)
      ) {
        return;
      }

      const touch = event.touches[0];
      const deltaX = touch.clientX - touchStart.current.x;
      const deltaY = touch.clientY - touchStart.current.y;

      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
        event.preventDefault();
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

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
