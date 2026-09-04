import { useEffect, useState } from "react";
import { useAuth } from "../features/auth/useAuth";
import { subscribeToAiJobs, type AiJob } from "../lib/aiJobsRepository";

export function useAiJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<AiJob[]>([]);

  useEffect(() => {
    if (!user) {
      setJobs([]);
      return;
    }

    return subscribeToAiJobs(setJobs, () => setJobs([]));
  }, [user]);

  return jobs;
}