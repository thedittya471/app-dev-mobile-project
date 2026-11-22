import { API_BASE_URL } from '../config/api';
import { getToken } from './auth';

export async function openAttendanceSession(periodId) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE_URL}/attendance/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ periodId }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to open attendance session');
  }

  return data;
}

export async function getAttendanceSession(sessionId) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE_URL}/attendance/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch attendance session');
  }

  return data;
}
