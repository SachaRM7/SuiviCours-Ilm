import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  listVocabulary,
  resolveVocabularyGlose,
} from "../lib/vocabularyRepository";
import type { VocabularyEntry } from "../types/domain";

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
  const [reloadKey, setReloadKey] = useState(0);
  const [resolvingEntryId, setResolvingEntryId] = useState<string | null>(null);
  const load = useCallback(() => {
    void reloadKey;
    return listVocabulary();
  }, [reloadKey]);
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

  async function chooseGlose(entry: VocabularyEntry, glose: string) {
    setResolvingEntryId(entry.id);

    try {
      await resolveVocabularyGlose({
        entryId: entry.id,
        glose,
        remainingAlternatives: [],
      });
      setReloadKey((key) => key + 1);
    } finally {
      setResolvingEntryId(null);
    }
  }

  return (
    <section className="stack vocabulary-page">
      <header className="library-head">
        <div>
          <p className="eyebrow">Lexique personnel</p>
          <h1 className="page-title">Vocabulaire</h1>
          <p className="lede">Termes récupérés depuis les corrections et synthèses.</p>
        </div>
        <div className="library-count">
          <strong>{filtered.length}</strong>
          <span>terme{filtered.length > 1 ? "s" : ""}</span>
        </div>
      </header>

      <input
        aria-label="Chercher dans le vocabulaire"
        className="search"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Chercher un terme…"
        value={search}
      />

      {loading ? <div className="empty-state">Chargement du vocabulaire…</div> : null}

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
                {entry.gloseAlternatives?.length ? (
                  <div className="vocab-conflict">
                    <strong>Glose à trancher</strong>
                    <div className="vocab-conflict__options">
                      <button
                        className="tool on"
                        disabled={resolvingEntryId === entry.id}
                        onClick={() => chooseGlose(entry, entry.glose)}
                        type="button"
                      >
                        Garder : {entry.glose}
                      </button>
                      {entry.gloseAlternatives.map((alternative) => (
                        <button
                          className="tool"
                          disabled={resolvingEntryId === entry.id}
                          key={alternative}
                          onClick={() => chooseGlose(entry, alternative)}
                          type="button"
                        >
                          Utiliser : {alternative}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
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
