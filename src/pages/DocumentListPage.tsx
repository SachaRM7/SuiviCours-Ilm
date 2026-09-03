import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  deleteCourseImage,
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
  transcription_brute: "transcription",
  synthese: "synthese",
  fiche: "fiche",
  transcription_corrigee: "correction",
  prompt_image: "image",
};

export function DocumentListPage() {
  const { moduleId, rayon = "syntheses" } = useParams();
  const config = rayonConfig[rayon] ?? rayonConfig.syntheses;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "numero">("recent");
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    void reloadKey;

    if (!moduleId) {
      return [];
    }

    return config.images
      ? listImagesForModule(moduleId)
      : listDocumentsForRayon(moduleId, config.type ?? "synthese");
  }, [config.images, config.type, moduleId, reloadKey]);
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

  async function handleDeleteImage(item: LibraryImage) {
    const confirmed = window.confirm(
      "Supprimer cette fiche image ? L'image et son controle seront retires.",
    );

    if (!confirmed) {
      return;
    }

    const id = `${item.course.id}-${item.image.id}`;
    setDeletingImageId(id);
    setNotice(null);

    try {
      await deleteCourseImage({
        professorId: item.professor.id,
        moduleId: item.module.id,
        courseId: item.course.id,
        image: item.image,
      });
      setNotice("Fiche image supprimee.");
      setReloadKey((value) => value + 1);
    } catch (deleteError) {
      setNotice(
        deleteError instanceof Error
          ? deleteError.message
          : "Suppression impossible pour le moment.",
      );
    } finally {
      setDeletingImageId(null);
    }
  }

  return (
    <section className="stack library-rayon">
      <header className="library-head">
        <div>
          <p className="eyebrow">Rayon du module</p>
          <h1 className="page-title">{config.title}</h1>
          <p className="lede">{config.description}</p>
        </div>
        <div className="library-count">
          <strong>{count}</strong>
          <span>document{count > 1 ? "s" : ""}</span>
        </div>
      </header>

      <div className="library-controls">
        <input
          aria-label={`Chercher dans les ${config.title.toLowerCase()}`}
          className="search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Chercher dans les ${config.title.toLowerCase()}…`}
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
      </div>

      {notice ? (
        <div aria-live="polite" className="empty-state notice-state">
          {notice}
        </div>
      ) : null}

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
          {images.map((item) => {
            const { course, image } = item;
            const id = `${course.id}-${image.id}`;

            return (
              <div className="thumb-shell" key={id}>
                <Link className="thumb" to={`/images/${course.id}/${image.id}`}>
              {image.url ? (
                <img
                  alt={`Fiche image du cours ${course.numero} - ${
                    course.titre || config.title
                  }`}
                  loading="lazy"
                  src={image.url}
                />
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
                <button
                  aria-label={`Supprimer la fiche image du cours ${course.numero}`}
                  className="thumb-delete"
                  disabled={deletingImageId === id}
                  onClick={() => void handleDeleteImage(item)}
                  type="button"
                >
                  {deletingImageId === id ? "..." : "Suppr."}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
