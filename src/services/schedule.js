import { authenticatedRequest } from './auth';

export function getSchedule(date = 'today', signal) {
  return authenticatedRequest(`/schedule?date=${encodeURIComponent(date)}`, { signal });
}

export async function getPeriodById(periodId) {
  const data = await authenticatedRequest(`/schedule/${encodeURIComponent(periodId)}`);
  return data.period;
}
