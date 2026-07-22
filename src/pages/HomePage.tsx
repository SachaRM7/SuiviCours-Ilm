import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <section className="stack">
      <div>
        <h1 className="page-title">Mes cours</h1>
        <p className="lede">
          Le socle applicatif est prêt. Les données Firebase arrivent au Lot 2.
        </p>
      </div>

      <div className="prof-block">
        <p className="eyebrow">Cheikh Hatim Al-Maliki</p>
        <Link className="module-card" to="/modules/tawhid">
          <span>
            <strong>Tawhid</strong>
            <small>Module actif · structure à connecter</small>
          </span>
          <span className="slug">#Tawhid</span>
        </Link>
      </div>
    </section>
  );
}
