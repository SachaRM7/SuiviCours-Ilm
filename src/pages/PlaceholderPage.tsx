export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="stack">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="lede">{description}</p>
      </div>
      <div className="empty-state">
        <p className="eyebrow">Lot 1</p>
        <h2>Fondation en cours</h2>
        <p>
          Cette vue garde la route et le style prêts pendant que les lots métier
          arrivent progressivement.
        </p>
      </div>
    </section>
  );
}
