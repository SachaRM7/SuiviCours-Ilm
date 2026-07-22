import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  getLibraryImage,
  listCourseReferences,
  saveCourseImageVerification,
} from "../lib/libraryRepository";

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
  const { courseId, imageId } = useParams();
  const [conforme, setConforme] = useState(true);
  const [verdict, setVerdict] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    if (!courseId || !imageId) {
      return null;
    }

    const image = await getLibraryImage(courseId, imageId);
    if (!image) {
      return null;
    }

    const [artifacts, references] = await Promise.all([
      getCourseArtifactsByPath(image.professor.id, image.module.id, image.course.id),
      listCourseReferences({
        professorId: image.professor.id,
        moduleId: image.module.id,
        courseId: image.course.id,
      }),
    ]);

    return { ...image, artifacts, references };
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
            reference.choixTexte === "exact" && reference.texteExact
              ? reference.texteExact
              : reference.texteCours || reference.texteExact;

          return `- ${text}${
            reference.choixSource ? ` — ${reference.choixSource}` : ""
          }`;
        })
        .join("\n"),
    [data?.references],
  );

  async function copyVerificationPrompt() {
    if (!data) {
      return;
    }

    await navigator.clipboard.writeText(
      buildVerificationPrompt({
        synthese,
        promptUtilise: data.image.promptUtilise,
        sourcesValidees,
      }),
    );
    setNotice("Prompt de vérification copié.");
  }

  async function saveVerification() {
    if (!data) {
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      await saveCourseImageVerification({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId: data.course.id,
        imageId: data.image.id,
        conforme,
        defauts: conforme ? [] : parseDefects(verdict),
      });
      setNotice("Vérification enregistrée.");
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
            {data.image.url ? "Ajouter une version" : "Déposer l'image"}
          </Link>
          {data.image.url ? (
            <a className="viewer-button" href={data.image.url}>
              Télécharger
            </a>
          ) : null}
        </div>
      </div>

      <div className="viewer-stage">
        {data.image.url ? (
          <img alt="" src={data.image.url} />
        ) : (
          <div className="viewer-fake">
            <strong>{data.course.numero}</strong>
            <span>Fiche de mémorisation</span>
          </div>
        )}
      </div>

      <div className="viewer-check">
        <div className="viewer-check__head">
          <div>
            <h2>Contrôle image</h2>
            <p>
              {data.image.verification.faite
                ? data.image.verification.conforme
                  ? "Dernier verdict : conforme"
                  : `${data.image.verification.defauts.length} défaut${
                      data.image.verification.defauts.length > 1 ? "s" : ""
                    } relevé${
                      data.image.verification.defauts.length > 1 ? "s" : ""
                    }`
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

        {notice ? <div className="viewer-notice">{notice}</div> : null}

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

      <details className="viewer-prompt">
        <summary>Voir le prompt qui a généré cette image</summary>
        <pre>{data.image.promptUtilise}</pre>
      </details>
    </section>
  );
}
