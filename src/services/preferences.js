import { authenticatedRequest } from './auth';

export function getStudentPreferences() {
  return authenticatedRequest('/student/preferences');
}

export function saveStudentPreferences(body) {
  return authenticatedRequest('/student/preferences', { method: 'PUT', body });
}
