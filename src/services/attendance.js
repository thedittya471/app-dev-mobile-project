import { authenticatedRequest } from './auth';

function sessionPath(sessionId) {
  return `/attendance/sessions/${encodeURIComponent(sessionId)}`;
}

export function openAttendanceSession(periodId) {
  return authenticatedRequest('/attendance/sessions', { method: 'POST', body: { periodId } });
}

export function getAttendanceSession(sessionId) {
  return authenticatedRequest(sessionPath(sessionId));
}

export function getSessionQrCode(sessionId) {
  return authenticatedRequest(`${sessionPath(sessionId)}/code`);
}

export function submitCheckIn(payload) {
  return authenticatedRequest('/attendance/check-in', { method: 'POST', body: payload });
}

export function closeAttendanceSession(sessionId) {
  return authenticatedRequest(`${sessionPath(sessionId)}/close`, { method: 'POST' });
}

export function updateAttendanceRecord(sessionId, { studentId, status }) {
  return authenticatedRequest(`${sessionPath(sessionId)}/records`, {
    method: 'POST',
    body: { studentId, status },
  });
}

export function getStudentAttendance() {
  return authenticatedRequest('/attendance/student');
}

export function getSessionSummary(sessionId, signal) {
  return authenticatedRequest(`${sessionPath(sessionId)}/summary`, { signal });
}
