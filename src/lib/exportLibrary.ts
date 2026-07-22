import JSZip from "jszip";
import type {
  Artifact,
  ArtifactType,
  Course,
  CourseImage,
  CourseModule,
  Professor,
} from "../types/domain";
import type { ModuleExportData } from "./libraryRepository";

const folderByArtifactType: Partial<Record<ArtifactType, string>> = {
  synthese: "syntheses",
  fiche: "fiches",
  transcription_corrigee: "transcriptions",
};

export function slugifyTitle(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/['’ʿ`]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "cours"
  );
}

export function courseFileStem(course: Course) {
  return `${String(course.numero).padStart(2, "0")}-${slugifyTitle(
    course.titre || `cours-${course.numero}`,
  )}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadMarkdown(input: {
  course: Course;
  artifact: Artifact;
  module: CourseModule;
}) {
  const filename = `${courseFileStem(input.course)}.md`;
  const blob = new Blob([input.artifact.contenu], {
    type: "text/markdown;charset=utf-8",
  });
  downloadBlob(blob, filename);
}

function imageExtension(image: CourseImage) {
  try {
    const path = new URL(image.url).pathname;
    const match = path.match(/\.([a-z0-9]+)(?:$|[?#])/i);
    return match?.[1]?.toLowerCase() ?? "png";
  } catch {
    return "png";
  }
}

async function fetchImageBlob(image: CourseImage) {
  if (!image.url) {
    return null;
  }

  const response = await fetch(image.url);
  if (!response.ok) {
    return null;
  }

  return response.blob();
}

function moduleJson(data: ModuleExportData) {
  return {
    exportedAt: new Date().toISOString(),
    professeur: data.professor,
    module: data.module,
    cours: data.courses.map(({ course, artifacts, images }) => ({
      id: course.id,
      numero: course.numero,
      titre: course.titre,
      date: course.date,
      artefacts: artifacts.map((artifact) => ({
        id: artifact.id,
        type: artifact.type,
        version: artifact.version,
        createdAt: artifact.createdAt,
      })),
      images: images.map((image) => ({
        id: image.id,
        ordre: image.ordre,
        createdAt: image.createdAt,
        verification: image.verification,
      })),
    })),
  };
}

export async function exportModuleAsZip(data: ModuleExportData) {
  const zip = new JSZip();
  const root = zip.folder(data.module.slug) ?? zip;

  root.file("module.json", JSON.stringify(moduleJson(data), null, 2));

  for (const { course, artifacts, images } of data.courses) {
    const stem = courseFileStem(course);

    for (const artifact of artifacts) {
      const folder = folderByArtifactType[artifact.type];
      if (!folder) {
        continue;
      }

      root.folder(folder)?.file(`${stem}.md`, artifact.contenu);
    }

    for (const [index, image] of images.entries()) {
      const blob = await fetchImageBlob(image);
      if (!blob) {
        continue;
      }

      const suffix = images.length > 1 ? `-${index + 1}` : "";
      root
        .folder("images")
        ?.file(`${stem}${suffix}.${imageExtension(image)}`, blob);
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${slugifyTitle(data.module.slug)}.zip`);
}

export function exportMetadataSummary(data: {
  professor: Professor;
  module: CourseModule;
}) {
  return `${data.module.nom} · ${data.professor.nom}`;
}
