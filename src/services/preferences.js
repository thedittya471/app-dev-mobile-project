import { API_BASE_URL } from '../config/api';
import { getToken } from './auth';

export async function getStudentPreferences() {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE_URL}/student/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to fetch planning preferences');
    error.status = res.status;
    throw error;
  }

  return data;
}

export async function saveStudentPreferences(payload) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_BASE_URL}/student/preferences`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to save planning preferences');
    error.status = res.status;
    throw error;
  }

  return data;
}
