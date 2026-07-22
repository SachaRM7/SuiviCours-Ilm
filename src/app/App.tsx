import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { AuthGate } from "../features/auth/AuthGate";
import { LoginPage } from "../features/auth/LoginPage";
import { DocumentListPage } from "../pages/DocumentListPage";
import { DocumentReadPage } from "../pages/DocumentReadPage";
import { HomePage } from "../pages/HomePage";
import { ImageViewerPage } from "../pages/ImageViewerPage";
import { ModulePage } from "../pages/ModulePage";
import { PlaceholderPage } from "../pages/PlaceholderPage";

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
        <Route path="cours/:courseId/:type" element={<DocumentReadPage />} />
        <Route path="images/:courseId/:imageId" element={<ImageViewerPage />} />
        <Route
          path="nouveau-cours"
          element={
            <PlaceholderPage
              title="Nouveau cours"
              description="La création guidée arrive au prochain lot."
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
