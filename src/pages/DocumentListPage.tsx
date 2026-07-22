import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  listDocumentsForRayon,
  listImagesForModule,
} from "../lib/libraryRepository";
import type { ArtifactType, LibraryDocument, LibraryImage } from "../types/domain";

const rayonConfig: Record<
  string,
  { title: string; description: string; type?: ArtifactType; images?: boolean }
> = {
  syntheses: {
    title: "Synthèses",
    description: "Le cours complet, structuré",
    type: "synthese",
  },
  fiches: {
    title: "Fiches de révision",
    description: "L'essentiel sur une page",
    type: "fiche",
  },
  transcriptions: {
    title: "Transcriptions",
    description: "Archive · le verbatim corrigé",
    type: "transcription_corrigee",
  },
  images: {
    title: "Fiches images",
    description: "À afficher, à mémoriser",
    images: true,
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function imageVerificationLabel(image: LibraryImage["image"]) {
  if (!image.verification.faite) {
    return "À vérifier";
  }

  return image.verification.conforme ? "Conforme" : "À corriger";
}

function imageVerificationClass(image: LibraryImage["image"]) {
  if (!image.verification.faite) {
    return "thumb-status";
  }

  return image.verification.conforme
    ? "thumb-status thumb-status--ok"
    : "thumb-status thumb-status--alert";
}

const stepByArtifactType: Record<ArtifactType, keyof LibraryDocument["course"]["etapes"]> = {
  synthese: "synthese",
  fiche: "fiche",
  transcription_corrigee: "transcription",
  prompt_image: "image",
};

export function DocumentListPage() {
  const { moduleId, rayon = "syntheses" } = useParams();
  const config = rayonConfig[rayon] ?? rayonConfig.syntheses;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "numero">("recent");
  const load = useCallback(async () => {
    if (!moduleId) {
      return [];
    }

    return config.images
      ? listImagesForModule(moduleId)
      : listDocumentsForRayon(moduleId, config.type ?? "synthese");
  }, [config.images, config.type, moduleId]);
  const { data, error, loading } = useAsync(load);

  const filteredDocuments = useMemo(() => {
    if (!data || config.images) {
      return [];
    }

    const queryText = normalize(search);
    return (data as LibraryDocument[])
      .filter(({ course, artifact }) => {
        const haystack = normalize(`${course.titre} ${artifact.contenu}`);
        return haystack.includes(queryText);
      })
      .sort((left, right) =>
        sort === "numero"
          ? left.course.numero - right.course.numero
          : new Date(right.course.date).getTime() -
            new Date(left.course.date).getTime(),
      );
  }, [config.images, data, search, sort]);

  const images = useMemo(() => {
    if (!data || !config.images) {
      return [];
    }

    const queryText = normalize(search);
    return (data as LibraryImage[])
      .filter(({ course, image }) => {
        const haystack = normalize(
          `${course.titre} ${image.promptUtilise} ${imageVerificationLabel(image)}`,
        );
        return haystack.includes(queryText);
      })
      .sort((left, right) =>
        sort === "numero"
          ? left.course.numero - right.course.numero
          : new Date(right.course.date).getTime() -
            new Date(left.course.date).getTime(),
      );
  }, [config.images, data, search, sort]);

  const count = config.images ? images.length : filteredDocuments.length;

  return (
    <section className="stack">
      <div>
        <h1 className="page-title">{config.title}</h1>
        <p className="lede">
          {count} document{count > 1 ? "s" : ""} · {config.description}
        </p>
      </div>

      <input
        className="search"
        onChange={(event) => setSearch(event.target.value)}
        placeholder={`Chercher dans les ${config.title.toLowerCase()}...`}
        value={search}
      />

      <div className="tools">
        <button
          className={sort === "recent" ? "tool on" : "tool"}
          onClick={() => setSort("recent")}
          type="button"
        >
          Récents d'abord
        </button>
        <button
          className={sort === "numero" ? "tool on" : "tool"}
          onClick={() => setSort("numero")}
          type="button"
        >
          Par numéro
        </button>
      </div>

      {loading ? <div className="empty-state">Chargement du rayon...</div> : null}
      {error ? (
        <div className="empty-state empty-state--alert">
          <h2>Lecture impossible</h2>
          <p>{error}</p>
        </div>
      ) : null}

      {!loading && !error && !config.images && filteredDocuments.length === 0 ? (
        <div className="empty-state">
          <h2>Rayon vide</h2>
          <p>Aucun document ne correspond pour l'instant.</p>
        </div>
      ) : null}

      {!config.images && filteredDocuments.length > 0 ? (
        <div className="docs">
          {filteredDocuments.map(({ course, artifact }) => (
            <Link
              className={
                course.etapes[stepByArtifactType[artifact.type]].obsolete
                  ? "doc-row doc-row--obsolete"
                  : "doc-row"
              }
              key={`${course.id}-${artifact.id}`}
              to={`/cours/${course.id}/${artifact.type}`}
            >
              <span className="doc-row__number">{course.numero}</span>
              <span>
                <strong>{course.titre || `Cours ${course.numero}`}</strong>
                <small>{formatDate(course.date)}</small>
                {course.etapes[stepByArtifactType[artifact.type]].obsolete ? (
                  <em>Obsolète</em>
                ) : null}
              </span>
              <span className="doc-row__action">Lire</span>
            </Link>
          ))}
        </div>
      ) : null}

      {config.images && images.length === 0 && !loading && !error ? (
        <div className="empty-state">
          <h2>Aucune image</h2>
          <p>Les fiches images apparaîtront ici après dépôt.</p>
        </div>
      ) : null}

      {config.images && images.length > 0 ? (
        <div className="image-grid">
          {images.map(({ course, image }) => (
            <Link
              className="thumb"
              key={`${course.id}-${image.id}`}
              to={`/images/${course.id}/${image.id}`}
            >
              {image.url ? (
                <img alt="" src={image.url} />
              ) : (
                <span className="thumb__fake">
                  <strong>{course.numero}</strong>
                  <small>Fiche de mémorisation</small>
                </span>
              )}
              <span className="thumb__caption">
                <strong>{course.titre || `Cours ${course.numero}`}</strong>
                <small>{formatDate(course.date)}</small>
                <em className={imageVerificationClass(image)}>
                  {imageVerificationLabel(image)}
                </em>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
