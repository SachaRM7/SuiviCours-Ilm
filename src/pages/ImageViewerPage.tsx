import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  getLibraryImage,
  listCourseReferences,
  listImagesForModule,
  saveCourseImageVerification,
  updateCourseImagePrompt,
} from "../lib/libraryRepository";
import type { CourseImage, LibraryImage } from "../types/domain";

function parseDefects(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function buildVerificationPrompt(input: {
  synthese: string;
  promptUtilise: string;
  sourcesValidees: string;
}) {
  return `TA MISSION
Tu contrôles une fiche image générée à partir d'un cours de sciences islamiques.
Je joins l'image à vérifier dans la conversation.

Tu dois vérifier :
- aucune mention parasite comme "à vérifier", "source non précisée", "à confirmer" ;
- aucun verbatim déformé ;
- les sources imprimées correspondent exactement aux sources validées ;
- le texte arabe est cohérent et non malformé ;
- le contenu n'est pas tronqué.

Réponds uniquement dans un de ces deux formats :

CONFORME

ou

NON CONFORME
- défaut 1
- défaut 2

SOURCES VALIDÉES
${input.sourcesValidees || "Aucune source validée."}

PROMPT IMAGE UTILISÉ
${input.promptUtilise}

SYNTHÈSE DU COURS
${input.synthese || "Synthèse absente."}`;
}

export function ImageViewerPage() {
  const navigate = useNavigate();
  const { courseId, imageId } = useParams();
  const [conforme, setConforme] = useState(true);
  const [verdict, setVerdict] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [savedPrompt, setSavedPrompt] = useState<string | null>(null);
  const [savedVerification, setSavedVerification] = useState<
    CourseImage["verification"] | null
  >(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    if (!courseId || !imageId) {
      return null;
    }

    const image = await getLibraryImage(courseId, imageId);
    if (!image) {
      return null;
    }

    const [artifacts, references, moduleImages] = await Promise.all([
      getCourseArtifactsByPath(image.professor.id, image.module.id, image.course.id),
      listCourseReferences({
        professorId: image.professor.id,
        moduleId: image.module.id,
        courseId: image.course.id,
      }),
      listImagesForModule(image.module.id),
    ]);

    return { ...image, artifacts, references, moduleImages };
  }, [courseId, imageId]);
  const { data, error, loading } = useAsync(load);
  const synthese =
    data?.artifacts.find((artifact) => artifact.type === "synthese")?.contenu ?? "";
  const sourcesValidees = useMemo(
    () =>
      (data?.references ?? [])
        .filter((reference) => reference.valide)
        .map((reference) => {
          const text =
            reference.choixTexte === "personnalise" &&
            reference.textePersonnalise
              ? reference.textePersonnalise
              : reference.choixTexte === "exact" && reference.texteExact
              ? reference.texteExact
              : reference.texteCours || reference.texteExact;

          return `- ${text}${
            reference.choixSource ? ` - ${reference.choixSource}` : ""
          }`;
        })
        .join("\n"),
    [data?.references],
  );
  const promptUtilise = savedPrompt ?? data?.image.promptUtilise ?? "";

  const imageNavigation = useMemo(() => {
    if (!data) {
      return { previous: null, next: null };
    }

    const index = data.moduleImages.findIndex(
      (item) => item.course.id === data.course.id && item.image.id === data.image.id,
    );

    return {
      previous: index > 0 ? data.moduleImages[index - 1] : null,
      next:
        index >= 0 && index < data.moduleImages.length - 1
          ? data.moduleImages[index + 1]
          : null,
    };
  }, [data]);

  const goToImage = useCallback(
    (target: LibraryImage | null) => {
      if (!target) {
        return;
      }

      navigate(`/images/${target.course.id}/${target.image.id}`);
    },
    [navigate],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        goToImage(imageNavigation.previous);
      }

      if (event.key === "ArrowRight") {
        goToImage(imageNavigation.next);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToImage, imageNavigation.next, imageNavigation.previous]);

  function handleTouchEnd(clientX: number) {
    if (touchStartX === null) {
      return;
    }

    const delta = clientX - touchStartX;
    setTouchStartX(null);

    if (Math.abs(delta) < 50) {
      return;
    }

    goToImage(delta > 0 ? imageNavigation.previous : imageNavigation.next);
  }

  async function copyVerificationPrompt() {
    if (!data) {
      return;
    }

    await navigator.clipboard.writeText(
      buildVerificationPrompt({
        synthese,
        promptUtilise,
        sourcesValidees,
      }),
    );
    setNotice("Prompt de vérification copié.");
  }

  async function saveImagePrompt() {
    if (!data) {
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      await updateCourseImagePrompt({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId: data.course.id,
        imageId: data.image.id,
        promptUtilise: promptDraft.trim(),
      });
      setSavedPrompt(promptDraft.trim());
      setEditingPrompt(false);
      setNotice("Prompt utilise enregistre.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadImage() {
    if (!data?.image.url) {
      return;
    }

    setNotice(null);

    try {
      const response = await fetch(data.image.url);
      if (!response.ok) {
        throw new Error("download failed");
      }

      const blob = await response.blob();
      const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${data.module.slug}-cours-${String(data.course.numero).padStart(
        2,
        "0",
      )}-fiche-image.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice("Telechargement lance.");
    } catch {
      setNotice(
        "Telechargement bloque par le navigateur. Ouvre l'image puis utilise Partager ou Enregistrer l'image.",
      );
    }
  }

  async function saveVerification() {
    if (!data) {
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      const defauts = conforme ? [] : parseDefects(verdict);
      await saveCourseImageVerification({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId: data.course.id,
        imageId: data.image.id,
        conforme,
        defauts,
      });
      setSavedVerification({ faite: true, conforme, defauts });
      setNotice(
        conforme
          ? "Contrôle conforme enregistré. L'étape image est terminée."
          : "Contrôle enregistré. Dépose une version corrigée après retouche.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="empty-state">Chargement de l'image...</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Image introuvable</h2>
        <p>{error ?? "Cette fiche image n'existe pas encore."}</p>
      </div>
    );
  }

  const verification = savedVerification ?? data.image.verification;
  const hasRealImage = Boolean(data.image.url);

  return (
    <section className="image-viewer">
      <div className="viewer-bar">
        <div>
          <h1>{data.course.titre || `Cours ${data.course.numero}`}</h1>
          <p>
            {data.module.nom} · Cours {data.course.numero} · {data.professor.nom}
          </p>
        </div>
        <div className="viewer-actions">
          <Link className="viewer-button" to={`/modules/${data.module.id}/images`}>
            Fermer
          </Link>
          <Link
            className="viewer-button viewer-button--primary"
            to={`/cours/${data.course.id}/images/new`}
          >
            {hasRealImage ? "Ajouter une version" : "Déposer l'image"}
          </Link>
          {hasRealImage ? (
            <button
              className="viewer-button"
              onClick={() => void downloadImage()}
              type="button"
            >
              Télécharger
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="viewer-stage"
        onTouchEnd={(event) =>
          handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)
        }
        onTouchStart={(event) =>
          setTouchStartX(event.changedTouches[0]?.clientX ?? null)
        }
      >
        <button
          aria-label="Image précédente"
          className="viewer-nav viewer-nav--left"
          disabled={!imageNavigation.previous}
          onClick={() => goToImage(imageNavigation.previous)}
          type="button"
        >
          ‹
        </button>
        {hasRealImage ? (
          <img
            alt={`Fiche image du cours ${data.course.numero} - ${
              data.course.titre || data.module.nom
            }`}
            src={data.image.url}
          />
        ) : (
          <div className="viewer-fake">
            <strong>{data.course.numero}</strong>
            <span>Fiche de mémorisation</span>
          </div>
        )}
        <button
          aria-label="Image suivante"
          className="viewer-nav viewer-nav--right"
          disabled={!imageNavigation.next}
          onClick={() => goToImage(imageNavigation.next)}
          type="button"
        >
          ›
        </button>
      </div>

      {data.course.etapes.image.obsolete ? (
        <div className="viewer-stale">
          <div>
            <strong>Image obsolète</strong>
            <p>
              Cette fiche reste consultable, mais elle dépend d'une étape
              relancée. Dépose une nouvelle version quand le prompt image est prêt.
            </p>
          </div>
          <Link
            className="viewer-button viewer-button--primary"
            to={`/cours/${data.course.id}/traitement`}
          >
            Reprendre le traitement
          </Link>
        </div>
      ) : null}

      {hasRealImage ? (
        <div
          className={
            verification.faite && verification.conforme
              ? "viewer-check viewer-check--done"
              : "viewer-check"
          }
        >
          <div className="viewer-check__head">
            <div>
              <h2>
                {verification.faite && verification.conforme
                  ? "Image terminée"
                  : "Contrôle image"}
              </h2>
              <p>
                {verification.faite
                  ? verification.conforme
                    ? "Dernier verdict : conforme. L'étape image est complète."
                    : `${verification.defauts.length} défaut${
                        verification.defauts.length > 1 ? "s" : ""
                      } relevé${verification.defauts.length > 1 ? "s" : ""}`
                  : "À vérifier avec Claude par copier-coller."}
              </p>
            </div>
            <button
              className="viewer-button"
              onClick={copyVerificationPrompt}
              type="button"
            >
              Copier le prompt de contrôle
            </button>
          </div>

          {notice ? (
            <div aria-live="polite" className="viewer-notice">
              {notice}
            </div>
          ) : null}

          <div className="viewer-check__modes">
            <button
              className={conforme ? "viewer-button viewer-button--primary" : "viewer-button"}
              onClick={() => setConforme(true)}
              type="button"
            >
              Conforme
            </button>
            <button
              className={!conforme ? "viewer-button viewer-button--primary" : "viewer-button"}
              onClick={() => setConforme(false)}
              type="button"
            >
              À corriger
            </button>
          </div>

          {!conforme ? (
            <textarea
              onChange={(event) => setVerdict(event.target.value)}
              placeholder="Colle ici la liste des défauts, un par ligne."
              value={verdict}
            />
          ) : null}

          <button
            className="viewer-button viewer-button--primary"
            disabled={saving || (!conforme && parseDefects(verdict).length === 0)}
            onClick={saveVerification}
            type="button"
          >
            {saving ? "Enregistrement..." : "Enregistrer le contrôle"}
          </button>
        </div>
      ) : (
        <div className="viewer-check viewer-check--empty">
          <div className="viewer-check__head">
            <div>
              <h2>Image à déposer</h2>
              <p>
                Le prompt est conservé, mais aucun fichier image n'a encore été
                envoyé. Le contrôle apparaîtra après le dépôt.
              </p>
            </div>
            <Link
              className="viewer-button viewer-button--primary"
              to={`/cours/${data.course.id}/images/new`}
            >
              Déposer l'image
            </Link>
          </div>
          {notice ? (
            <div aria-live="polite" className="viewer-notice">
              {notice}
            </div>
          ) : null}
        </div>
      )}

      <details className="viewer-prompt">
        <summary>Voir le prompt qui a généré cette image</summary>
        {editingPrompt ? (
          <div className="viewer-prompt-edit">
            <textarea
              onChange={(event) => setPromptDraft(event.target.value)}
              value={promptDraft}
            />
            <div>
              <button
                className="viewer-button viewer-button--primary"
                disabled={saving}
                onClick={saveImagePrompt}
                type="button"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button
                className="viewer-button"
                onClick={() => setEditingPrompt(false)}
                type="button"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <>
            <pre>{promptUtilise || "Aucun prompt utilise enregistre."}</pre>
            <button
              className="viewer-button"
              onClick={() => {
                setPromptDraft(promptUtilise);
                setEditingPrompt(true);
              }}
              type="button"
            >
              Modifier le prompt utilise
            </button>
          </>
        )}
      </details>
    </section>
  );
}
