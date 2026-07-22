import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { AuthGate } from "../features/auth/AuthGate";
import { LoginPage } from "../features/auth/LoginPage";
import { HomePage } from "../pages/HomePage";
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
        <Route
          path="modules/:moduleId/:rayon"
          element={
            <PlaceholderPage
              title="Rayon"
              description="Les listes de documents arrivent au Lot 3."
            />
          }
        />
        <Route
          path="cours/:courseId"
          element={
            <PlaceholderPage
              title="Lecture"
              description="La lecture markdown arrive avec la bibliothèque."
            />
          }
        />
        <Route
          path="nouveau-cours"
          element={
            <PlaceholderPage
              title="Nouveau cours"
              description="La création guidée arrive au Lot 2."
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
