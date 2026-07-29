import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  listCoursesForModule,
  listProfessorsWithModules,
} from "../lib/libraryRepository";
import {
  clearReviewMark,
  listReviewMarks,
  setReviewMark,
  type ReviewKind,
} from "../lib/reviewRepository";
import { listVocabulary } from "../lib/vocabularyRepository";
import type {
  Course,
  CourseModule,
  Professor,
  VocabularyEntry,
} from "../types/domain";

type RevisionCard =
  | {
      id: string;
      kind: "vocabulaire";
      reviewKind: ReviewKind;
      reviewItemId: string;
      title: string;
      eyebrow: string;
      front: string;
      back: string;
      href: string | null;
      meta: string;
    }
  | {
      id: string;
      kind: "fiche";
      reviewKind: ReviewKind;
      reviewItemId: string;
      title: string;
      eyebrow: string;
      front: string;
      back: string;
      href: string;
      meta: string;
    };

type FicheContext = {
  professor: Professor;
  module: CourseModule;
  course: Course;
  contenu: string;
};

function cleanMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`|[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(value: string, maxLength = 280) {
  const clean = cleanMarkdown(value);

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength).trim()}...`;
}

function courseHrefFromOccurrence(entry: VocabularyEntry) {
  const occurrence = entry.occurrences[0];

  if (!occurrence) {
    return null;
  }

  return `/cours/${occurrence.coursId}/synthese`;
}

async function loadRevisionCards() {
  const [vocabulary, professors, reviewMarks] = await Promise.all([
    listVocabulary(),
    listProfessorsWithModules(),
    listReviewMarks(),
  ]);

  const ficheContexts = await Promise.all(
    professors.flatMap((professor) =>
      professor.modules.map(async (module) => {
        const courses = await listCoursesForModule(professor.id, module.id);
        const courseData = await Promise.all(
          courses.map(async (course): Promise<FicheContext | null> => {
            const artifacts = await getCourseArtifactsByPath(
              professor.id,
              module.id,
              course.id,
            );
            const fiche = artifacts.find((artifact) => artifact.type === "fiche");

            if (!fiche) {
              return null;
            }

            return {
              professor,
              module,
              course,
              contenu: fiche.contenu,
            };
          }),
        );

        return courseData.filter(Boolean) as FicheContext[];
      }),
    ),
  );

  const vocabCards: RevisionCard[] = vocabulary.map((entry) => ({
    id: `vocab-${entry.id}`,
    kind: "vocabulaire",
    reviewKind: "term",
    reviewItemId: entry.id,
    title: entry.translitteration,
    eyebrow: "Vocabulaire",
    front: entry.arabe
      ? `${entry.translitteration}\n${entry.arabe}`
      : entry.translitteration,
    back: entry.glose || "Glose à compléter.",
    href: courseHrefFromOccurrence(entry),
    meta: entry.tags.slice(0, 3).join(" · ") || "Terme personnel",
  }));

  const ficheCards: RevisionCard[] = ficheContexts.flat().map((item) => ({
    id: `fiche-${item.course.id}`,
    kind: "fiche",
    reviewKind: "artifact",
    reviewItemId: `${item.course.id}-fiche`,
    title: item.course.titre || `Cours ${item.course.numero}`,
    eyebrow: "Fiche",
    front: `${item.module.nom} · Cours ${item.course.numero}`,
    back: excerpt(item.contenu),
    href: `/cours/${item.course.id}/fiche`,
    meta: item.professor.nom,
  }));

  return {
    cards: [...vocabCards, ...ficheCards].sort((left, right) =>
      left.kind === right.kind ? left.title.localeCompare(right.title, "fr") : 0,
    ),
    reviewMarks,
  };
}

export function RevisionPage() {
  const load = useCallback(() => loadRevisionCards(), []);
  const { data, error, loading } = useAsync(load);
  const [mode, setMode] = useState<"tout" | "vocabulaire" | "fiche" | "aRevoir">(
    "tout",
  );
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [localMarked, setLocalMarked] = useState<Set<string>>(new Set());
  const [localCleared, setLocalCleared] = useState<Set<string>>(new Set());
  const marked = useMemo(() => {
    const next = new Set(
      (data?.reviewMarks ?? [])
        .map((mark) => `${mark.kind}:${mark.itemId}`)
        .filter((key) => !localCleared.has(key)),
    );

    for (const key of localMarked) {
      next.add(key);
    }

    return next;
  }, [data?.reviewMarks, localCleared, localMarked]);

  const cards = useMemo(() => {
    const source = data?.cards ?? [];

    if (mode === "aRevoir") {
      return source.filter((card) =>
        marked.has(`${card.reviewKind}:${card.reviewItemId}`),
      );
    }

    if (mode === "tout") {
      return source;
    }

    return source.filter((card) => card.kind === mode);
  }, [data?.cards, marked, mode]);

  const current = cards[index] ?? null;

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
  }, [mode]);

  useEffect(() => {
    if (index >= cards.length) {
      setIndex(Math.max(cards.length - 1, 0));
    }
  }, [cards.length, index]);

  function move(delta: number) {
    if (cards.length === 0) {
      return;
    }

    setIndex((currentIndex) => {
      const next = currentIndex + delta;

      if (next < 0) {
        return cards.length - 1;
      }

      if (next >= cards.length) {
        return 0;
      }

      return next;
    });
    setFlipped(false);
  }

  async function toggleMarked(card: RevisionCard) {
    const key = `${card.reviewKind}:${card.reviewItemId}`;
    const isMarked = marked.has(key);

    if (isMarked) {
      await clearReviewMark({
        kind: card.reviewKind,
        itemId: card.reviewItemId,
      });
      setLocalMarked((currentMarked) => {
        const next = new Set(currentMarked);
        next.delete(key);
        return next;
      });
      setLocalCleared((currentCleared) => new Set(currentCleared).add(key));
      return;
    }

    await setReviewMark({
      kind: card.reviewKind,
      itemId: card.reviewItemId,
      label: card.title,
      href: card.href ?? "/revision",
      meta: card.meta,
    });
    setLocalMarked((currentMarked) => {
      const next = new Set(currentMarked);
      next.add(key);
      return next;
    });
    setLocalCleared((currentCleared) => {
      const next = new Set(currentCleared);
      next.delete(key);
      return next;
    });
  }

  return (
    <section className="stack revision-page">
      <header className="library-head">
        <div>
          <p className="eyebrow">Révision</p>
          <h1 className="page-title">Mode révision</h1>
          <p className="lede">
            Cartes rapides à partir des fiches et du vocabulaire extrait.
          </p>
        </div>
        <div className="library-count">
          <strong>{cards.length}</strong>
          <span>carte{cards.length > 1 ? "s" : ""}</span>
        </div>
      </header>

      <div className="tools revision-filters" role="group" aria-label="Filtrer les cartes">
        <button
          className={mode === "tout" ? "tool on" : "tool"}
          onClick={() => setMode("tout")}
          type="button"
        >
          Tout
        </button>
        <button
          className={mode === "vocabulaire" ? "tool on" : "tool"}
          onClick={() => setMode("vocabulaire")}
          type="button"
        >
          Vocabulaire
        </button>
        <button
          className={mode === "fiche" ? "tool on" : "tool"}
          onClick={() => setMode("fiche")}
          type="button"
        >
          Fiches
        </button>
        <button
          className={mode === "aRevoir" ? "tool on" : "tool"}
          onClick={() => setMode("aRevoir")}
          type="button"
        >
          À revoir ({marked.size})
        </button>
      </div>

      {loading ? <div className="empty-state">Préparation des cartes...</div> : null}

      {error ? (
        <div className="empty-state empty-state--alert">
          <h2>Révision indisponible</h2>
          <p>{error}</p>
        </div>
      ) : null}

      {!loading && !error && !current ? (
        <div className="empty-state">
          <h2>Aucune carte</h2>
          <p>
            Les cartes apparaîtront quand des fiches ou du vocabulaire seront
            disponibles.
          </p>
        </div>
      ) : null}

      {current ? (
        <div className="revision-deck">
          <button
            className={flipped ? "revision-card flipped" : "revision-card"}
            onClick={() => setFlipped((value) => !value)}
            type="button"
          >
            <span className="eyebrow">{current.eyebrow}</span>
            <strong>{current.title}</strong>
            <span className="revision-card__content">
              {flipped ? current.back : current.front}
            </span>
            <small>{flipped ? "Toucher pour masquer" : "Toucher pour révéler"}</small>
          </button>

          <div className="revision-meta">
            <span>
              {index + 1} / {cards.length}
            </span>
            <span>{current.meta}</span>
          </div>

          <div className="revision-actions">
            <button className="tool" onClick={() => move(-1)} type="button">
              Précédente
            </button>
            <button
              className={
                marked.has(`${current.reviewKind}:${current.reviewItemId}`)
                  ? "tool on"
                  : "tool"
              }
              onClick={() => void toggleMarked(current)}
              type="button"
            >
              {marked.has(`${current.reviewKind}:${current.reviewItemId}`)
                ? "Revue"
                : "À revoir"}
            </button>
            <button className="tool" onClick={() => move(1)} type="button">
              Suivante
            </button>
            {current.href ? (
              <Link className="tool" to={current.href}>
                Ouvrir
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
