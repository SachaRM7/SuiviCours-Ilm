import { useEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";
import { useAiJobs } from "../hooks/useAiJobs";

const navItems = [
  { to: "/", label: "Accueil", icon: "⌂" },
  { to: "/cours", label: "Cours", icon: "▤" },
  { to: "/revision", label: "Réviser", icon: "◇" },
  { to: "/recherche", label: "Recherche", icon: "⌕" },
];

function activeSection(pathname: string) {
  if (pathname.startsWith("/recherche")) return "Recherche";
  if (pathname.startsWith("/revision")) return "Révision";
  if (pathname.startsWith("/vocabulaire")) return "Réviser";
  if (pathname.startsWith("/prompts")) return "Gestion";
  if (pathname.startsWith("/nouveau-cours")) return "Nouveau cours";
  if (pathname === "/cours") return "Cours";
  if (pathname.startsWith("/modules")) return "Mes cours";
  if (pathname.startsWith("/cours") || pathname.startsWith("/images")) {
    return "Cours";
  }

  return "Accueil";
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const label = activeSection(location.pathname);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const aiJobs = useAiJobs();
  const activeAiJobs = aiJobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  );
  const readyAiJobs = aiJobs.filter(
    (job) => job.status === "completed" && !job.acknowledgedAt,
  );
  const highlightedJob = readyAiJobs[0] ?? activeAiJobs[0];

  useEffect(() => {
    function allowsHorizontalGesture(target: EventTarget | null) {
      return (
        target instanceof Element &&
        Boolean(target.closest(".mobile-nav, .image-viewer"))
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
      <aside className="side-nav" aria-label="Menu principal">
        <NavLink to="/" className="side-brand" aria-label="Accueil">
          <img alt="" src="/app-icon-180-v3.png" />
          <span>
            <strong>Suivi cours</strong>
            <small>de ʿilm</small>
          </span>
        </NavLink>

        <nav className="side-nav__links" aria-label="Navigation principale">
          <p>Mon espace</p>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <nav className="side-nav__links side-nav__links--secondary" aria-label="Gestion">
          <p>Gestion</p>
          <NavLink to="/vocabulaire">
            <span>◈</span>
            Vocabulaire
          </NavLink>
          <NavLink to="/prompts">
            <span>¶</span>
            Prompts
          </NavLink>
        </nav>

        <div className="side-nav__section">
          <p>L'institut</p>
          <small>
            Archive personnelle synchronisée, réservée au compte autorisé.
          </small>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__trail">
            <span>Mon espace</span>
            <i>/</i>
            <strong>{label}</strong>
          </div>
          <div className="topbar__actions">
            {highlightedJob ? (
              <Link
                className={"ai-job-indicator" + (readyAiJobs.length ? " ai-job-indicator--ready" : "")}
                to={"/cours/" + highlightedJob.courseId + "/traitement"}
                title={highlightedJob.courseTitle + " · " + highlightedJob.stepTitle}
              >
                <span aria-hidden="true">{readyAiJobs.length ? "✓" : "···"}</span>
                {readyAiJobs.length
                  ? readyAiJobs.length + " résultat" + (readyAiJobs.length > 1 ? "s" : "")
                  : activeAiJobs.length + " en cours"}
              </Link>
            ) : null}
            <span className="round-action">FR</span>
            <span className="round-action">!</span>
            <span className="round-action round-action--avatar">
              <img alt="" src="/app-icon-180-v3.png" />
            </span>
            {user ? (
              <button className="link-button" type="button" onClick={signOut}>
                Déconnexion
              </button>
            ) : null}
          </div>
        </header>

        <nav className="mobile-nav" aria-label="Navigation mobile">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <NavLink className="mobile-create" to="/nouveau-cours" aria-label="Ajouter un cours">
          +
        </NavLink>

        <main className="page-wrap">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
