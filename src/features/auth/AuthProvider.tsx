import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth } from "../../lib/firebase";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      const allowedUid = import.meta.env.VITE_ALLOWED_UID as string | undefined;
      setUser(allowedUid && nextUser?.uid !== allowedUid ? null : nextUser);
      setLoading(false);
    });
  }, []);

  const signIn = useCallback(
    async (
      email: string,
      password: string,
      options: { remember: boolean } = { remember: true },
    ) => {
      setError(null);
      try {
        await setPersistence(
          auth,
          options.remember ? browserLocalPersistence : browserSessionPersistence,
        );
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const allowedUid = import.meta.env.VITE_ALLOWED_UID as string | undefined;

        if (allowedUid && credential.user.uid !== allowedUid) {
          await firebaseSignOut(auth);
          throw new Error("Ce compte n'est pas autorisé pour cette application.");
        }
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : "Connexion impossible pour le moment.";
        setError(message);
        throw reason;
      }
    },
    [],
  );

  const signOut = useCallback(() => firebaseSignOut(auth), []);

  const value = useMemo(
    () => ({ user, loading, error, signIn, signOut }),
    [user, loading, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
