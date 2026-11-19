import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

const TOKEN_KEY = 'attendance_session_token';

export async function saveToken(token) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getToken() {
  return await AsyncStorage.getItem(TOKEN_KEY);
}

export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function signIn(email, password) {
  const res = await fetch(`${API_BASE_URL}/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Sign in failed');
  }

  await saveToken(data.sessionToken);
  return data.user;
}

export async function getCurrentUser() {
  const token = await getToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    await clearToken();
    return null;
  }

  const data = await res.json();
  return data.user;
}

export async function signOut() {
  const token = await getToken();
  if (token) {
    try {
      await fetch(`${API_BASE_URL}/auth/sign-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore network errors on sign-out
    }
  }
  await clearToken();
}
