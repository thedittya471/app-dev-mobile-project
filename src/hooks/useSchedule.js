import { useCallback, useEffect, useState } from 'react';
import { getSchedule } from '../services/schedule';

export default function useSchedule(date) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    getSchedule(date, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ date, revision, data });
      },
      (error) => {
        if (!controller.signal.aborted) setResult({ date, revision, error: error.message });
      }
    );
    return () => controller.abort();
  }, [date, revision]);

  const current = result?.date === date && result.revision === revision ? result : null;
  return {
    scheduleData: current?.data ?? { schedule: [] },
    loading: !current,
    error: current?.error,
    refresh,
  };
}
