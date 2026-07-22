import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { AuthGate } from "../features/auth/AuthGate";
import { LoginPage } from "../features/auth/LoginPage";
import { DocumentListPage } from "../pages/DocumentListPage";
import { DocumentReadPage } from "../pages/DocumentReadPage";
import { ArtifactEditorPage } from "../pages/ArtifactEditorPage";
import { HomePage } from "../pages/HomePage";
import { ImageViewerPage } from "../pages/ImageViewerPage";
import { ImageUploadPage } from "../pages/ImageUploadPage";
import { ModulePage } from "../pages/ModulePage";
import { NewCoursePage } from "../pages/NewCoursePage";
import { TreatmentPage } from "../pages/TreatmentPage";
import { VocabularyPage } from "../pages/VocabularyPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <AuthGate>
            <AppShell />
          </AuthGate>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="modules/:moduleId" element={<ModulePage />} />
        <Route path="modules/:moduleId/:rayon" element={<DocumentListPage />} />
        <Route path="cours/:courseId/traitement" element={<TreatmentPage />} />
        <Route path="cours/:courseId/:type" element={<DocumentReadPage />} />
        <Route path="cours/:courseId/:type/edit" element={<ArtifactEditorPage />} />
        <Route path="cours/:courseId/images/new" element={<ImageUploadPage />} />
        <Route path="images/:courseId/:imageId" element={<ImageViewerPage />} />
        <Route path="nouveau-cours" element={<NewCoursePage />} />
        <Route path="vocabulaire" element={<VocabularyPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
