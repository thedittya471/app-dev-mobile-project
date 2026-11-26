import AsyncStorage from '@react-native-async-storage/async-storage';
import { request } from './api';

const TOKEN_KEY = 'attendance_session_token';

export async function signIn(email, password) {
  const data = await request('/auth/sign-in', {
    method: 'POST',
    body: { email: email.trim(), password },
  });
  await AsyncStorage.setItem(TOKEN_KEY, data.sessionToken);
  return data.user;
}

export async function authenticatedRequest(path, options) {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Your session has ended. Please sign in again.');
  return request(path, { ...options, token });
}

export async function getCurrentUser() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const data = await request('/auth/me', { token });
    return data.user;
  } catch (error) {
    if (error.status !== 401) throw error;
    await AsyncStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

export async function signOut() {
  try {
    await authenticatedRequest('/auth/sign-out', { method: 'POST' });
  } catch {
    // Clear the local session even when the server is unavailable.
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}
