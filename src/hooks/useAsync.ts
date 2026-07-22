import { useEffect, useState } from "react";

type AsyncState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

export function useAsync<T>(load: () => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    setState((current) => ({ ...current, error: null, loading: true }));
    load()
      .then((data) => {
        if (active) {
          setState({ data, error: null, loading: false });
        }
      })
      .catch((reason) => {
        if (active) {
          const message =
            reason instanceof Error
              ? reason.message
              : "Impossible de charger les données.";
          setState({ data: null, error: message, loading: false });
        }
      });

    return () => {
      active = false;
    };
  }, [load]);

  return state;
}
