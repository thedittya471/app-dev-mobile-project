import { API_BASE_URL } from '../config/api';

export async function request(path, { token, method = 'GET', body, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 12_000);

  let response;
  let data;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: JSON.stringify(body),
    });
    data = await response.json().catch(() => null);
  } catch {
    throw new Error('Network error: could not reach the attendance server. Please try again.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }

  if (!response.ok || !data) {
    const error = new Error(data?.error || `The server could not complete the request (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  return data;
}
