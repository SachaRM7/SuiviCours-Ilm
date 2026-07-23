import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  getCourseImagesByPath,
  listCoursesForModule,
  listProfessorsWithModules,
} from "../lib/libraryRepository";
import type {
  Artifact,
  Course,
  CourseImage,
  CourseModule,
  Professor,
} from "../types/domain";

type SearchItem =
  | {
      kind: "artifact";
      professor: Professor;
      module: CourseModule;
      course: Course;
      artifact: Artifact;
    }
  | {
      kind: "image";
      professor: Professor;
      module: CourseModule;
      course: Course;
      image: CourseImage;
    };

const artifactLabel: Record<Artifact["type"], string> = {
  synthese: "Synthèse",
  fiche: "Fiche",
  transcription_corrigee: "Transcription",
  prompt_image: "Prompt image",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function itemText(item: SearchItem) {
  const base = `${item.professor.nom} ${item.module.nom} ${item.course.titre}`;

  return item.kind === "artifact"
    ? `${base} ${artifactLabel[item.artifact.type]} ${item.artifact.contenu}`
    : `${base} Image ${item.image.promptUtilise}`;
}

function itemHref(item: SearchItem) {
  return item.kind === "artifact"
    ? `/cours/${item.course.id}/${item.artifact.type}`
    : `/images/${item.course.id}/${item.image.id}`;
}

async function loadSearchIndex() {
  const professors = await listProfessorsWithModules();
  const moduleData = await Promise.all(
    professors.flatMap((professor) =>
      professor.modules.map(async (module) => {
        const courses = await listCoursesForModule(professor.id, module.id);
        const courseData = await Promise.all(
          courses.map(async (course) => ({
            course,
            artifacts: await getCourseArtifactsByPath(
              professor.id,
              module.id,
              course.id,
            ),
            images: await getCourseImagesByPath(professor.id, module.id, course.id),
          })),
        );

        return { professor, module, courseData };
      }),
    ),
  );

  return moduleData.flatMap(({ professor, module, courseData }) =>
    courseData.flatMap(({ course, artifacts, images }) => [
      ...artifacts.map((artifact): SearchItem => ({
        kind: "artifact",
        professor,
        module,
        course,
        artifact,
      })),
      ...images.map((image): SearchItem => ({
        kind: "image",
        professor,
        module,
        course,
        image,
      })),
    ]),
  );
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const load = useCallback(() => loadSearchIndex(), []);
  const { data, error, loading } = useAsync(load);

  useEffect(() => {
    setQuery((current) => (current === urlQuery ? current : urlQuery));
  }, [urlQuery]);

  useEffect(() => {
    if (query === urlQuery) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    const cleanQuery = query.trim();

    if (cleanQuery) {
      nextParams.set("q", cleanQuery);
    } else {
      nextParams.delete("q");
    }

    setSearchParams(nextParams, { replace: true });
  }, [query, searchParams, setSearchParams, urlQuery]);

  const results = useMemo(() => {
    const needle = normalize(query);

    if (!needle) {
      return [];
    }

    return (data ?? [])
      .filter((item) => normalize(itemText(item)).includes(needle))
      .sort((left, right) => right.course.numero - left.course.numero)
      .slice(0, 50);
  }, [data, query]);

  return (
    <section className="stack">
      <div>
        <h1 className="page-title">Recherche</h1>
        <p className="lede">Tous les modules, tous les documents, côté client.</p>
      </div>

      <input
        aria-label="Chercher dans tous les contenus"
        className="search search--large"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Chercher un titre, une notion, une source…"
        value={query}
      />

      {loading ? <div className="empty-state">Indexation locale…</div> : null}

      {error ? (
        <div className="empty-state empty-state--alert">
          <h2>Recherche impossible</h2>
          <p>{error}</p>
        </div>
      ) : null}

      {!loading && !error && query && results.length === 0 ? (
        <div className="empty-state">
          <h2>Aucun résultat</h2>
          <p>Essaie avec un mot du titre, de la synthèse ou du prompt image.</p>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="docs">
          {results.map((item) => (
            <Link
              className="doc-row"
              key={`${item.kind}-${item.course.id}-${
                item.kind === "artifact" ? item.artifact.id : item.image.id
              }`}
              to={itemHref(item)}
            >
              <span className="doc-row__number">{item.course.numero}</span>
              <span>
                <strong>{item.course.titre || `Cours ${item.course.numero}`}</strong>
                <small>
                  {item.module.nom} · {item.professor.nom}
                </small>
                <em>
                  {item.kind === "artifact"
                    ? artifactLabel[item.artifact.type]
                    : "Fiche image"}
                </em>
              </span>
              <span className="doc-row__action">Ouvrir</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
