import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { listVocabulary } from "../lib/vocabularyRepository";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function tagCourseNumber(tag: string) {
  return tag.match(/_C(\d+)$/)?.[1] ?? null;
}

function tagToCourseHref(tag: string) {
  const courseNumber = tagCourseNumber(tag);

  if (!courseNumber) {
    return null;
  }

  const normalizedCourseNumber = String(Number(courseNumber));

  if (tag.startsWith("#Tawhid_")) {
    return `/cours/tawhid-${normalizedCourseNumber}/synthese`;
  }

  if (tag.startsWith("#FiqhIbadat_")) {
    return `/cours/fiqh-ibadat-${normalizedCourseNumber}/synthese`;
  }

  if (tag.startsWith("#Tawbah_")) {
    return `/cours/tawbah-${normalizedCourseNumber}/synthese`;
  }

  return null;
}

export function VocabularyPage() {
  const load = useCallback(() => listVocabulary(), []);
  const { data, error, loading } = useAsync(load);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const needle = normalize(search);

    return (data ?? []).filter((entry) =>
      normalize(
        `${entry.translitteration} ${entry.arabe} ${entry.glose} ${entry.tags.join(
          " ",
        )}`,
      ).includes(needle),
    );
  }, [data, search]);

  return (
    <section className="stack">
      <div>
        <h1 className="page-title">Vocabulaire</h1>
        <p className="lede">
          {filtered.length} terme{filtered.length > 1 ? "s" : ""} · tous modules
        </p>
      </div>

      <input
        className="search"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Chercher un terme..."
        value={search}
      />

      {loading ? <div className="empty-state">Chargement du vocabulaire...</div> : null}

      {error ? (
        <div className="empty-state empty-state--alert">
          <h2>Lecture impossible</h2>
          <p>{error}</p>
        </div>
      ) : null}

      {!loading && !error && filtered.length === 0 ? (
        <div className="empty-state">
          <h2>Aucun terme</h2>
          <p>
            Le vocabulaire se remplira depuis les sorties de correction et de
            synthèse.
          </p>
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <div className="vocab-list">
          {filtered.map((entry) => (
            <article className="vocab-row" key={entry.id}>
              <div>
                <h2>
                  {entry.translitteration}
                  {entry.arabe ? <span lang="ar">{entry.arabe}</span> : null}
                </h2>
                <p>{entry.glose}</p>
              </div>
              <div className="vocab-tags">
                {entry.tags.map((tag) => {
                  const href = tagToCourseHref(tag);

                  return href ? (
                    <Link className="slug" key={tag} to={href}>
                      {tag}
                    </Link>
                  ) : (
                    <span className="slug" key={tag}>
                      {tag}
                    </span>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
