import { FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export function LoginPage() {
  const { user, loading, error, signIn } = useAuth();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const redirectTo = state?.from?.pathname ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      await signIn(email, password, { remember });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Accès privé</p>
        <h1>Suivi cours de ʿilm</h1>
        <p className="muted">
          Connecte-toi avec le compte autorisé pour ouvrir la bibliothèque.
        </p>

        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>

        <label className="field">
          <span>Mot de passe</span>
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>

        <label className="remember-field">
          <input
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Rester connecté</strong>
            <small>Conserver l'accès sur cet appareil.</small>
          </span>
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="button button--primary" disabled={submitting}>
          {submitting ? "Connexion..." : "Entrer"}
        </button>
      </form>
    </main>
  );
}
