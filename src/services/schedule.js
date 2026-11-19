import { API_BASE_URL } from '../config/api';
import { getToken } from './auth';

export async function getSchedule(dateParam = 'today') {
  const token = await getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const url = dateParam
    ? `${API_BASE_URL}/schedule?date=${encodeURIComponent(dateParam)}`
    : `${API_BASE_URL}/schedule`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch schedule');
  }

  return data;
}
