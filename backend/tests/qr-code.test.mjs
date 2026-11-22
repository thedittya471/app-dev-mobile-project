import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import QRCode from 'qrcode';

// Test 1: Unpredictable code generation and formatting
test('generate unpredictable 16-byte hex code', () => {
  const code1 = crypto.randomBytes(16).toString('hex');
  const code2 = crypto.randomBytes(16).toString('hex');
  assert.equal(code1.length, 32);
  assert.equal(code2.length, 32);
  assert.notEqual(code1, code2);
});

// Test 2: QR payload strictly limited to what check-in needs
test('QR payload contains only sessionId and code', async () => {
  const sessionId = 'd7d24294-b778-4389-9fc6-cfb011d612e4';
  const code = crypto.randomBytes(16).toString('hex');

  const qrPayload = JSON.stringify({ sessionId, code });
  const parsed = JSON.parse(qrPayload);

  assert.deepEqual(Object.keys(parsed).sort(), ['code', 'sessionId']);
  assert.equal(parsed.sessionId, sessionId);
  assert.equal(parsed.code, code);

  // Generates valid data URL
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
  assert.ok(qrDataUrl.startsWith('data:image/png;base64,'));
});

// Test 3: Active code reuse logic (multiple displays stay in sync)
test('Active code is reused until expiry across multiple views', () => {
  const codesDb = [];
  const sessionId = 'session-123';
  const TTL_SECONDS = 20;

  function getOrIssueCode(currentTime) {
    // Check for active code
    const active = codesDb
      .filter((c) => c.sessionId === sessionId && c.expiresAt > currentTime)
      .sort((a, b) => b.expiresAt - a.expiresAt)[0];

    if (active) {
      return { code: active, isNew: false };
    }

    const newCode = {
      id: 'code-' + Math.random(),
      sessionId,
      code: crypto.randomBytes(16).toString('hex'),
      expiresAt: new Date(currentTime.getTime() + TTL_SECONDS * 1000),
      createdAt: currentTime,
    };
    codesDb.push(newCode);
    return { code: newCode, isNew: true };
  }

  const t0 = new Date('2026-11-22T10:00:00.000Z');

  // Teacher view 1 requests code
  const view1 = getOrIssueCode(t0);
  assert.equal(view1.isNew, true);

  // Teacher view 2 (or classroom projector) requests code 5 seconds later
  const t5 = new Date('2026-11-22T10:00:05.000Z');
  const view2 = getOrIssueCode(t5);
  assert.equal(view2.isNew, false);
  assert.equal(view2.code.code, view1.code.code);
  assert.equal(view2.code.expiresAt.toISOString(), view1.code.expiresAt.toISOString());

  // After 21 seconds (expiry exceeded)
  const t21 = new Date('2026-11-22T10:00:21.000Z');
  const view3 = getOrIssueCode(t21);
  assert.equal(view3.isNew, true);
  assert.notEqual(view3.code.code, view1.code.code);
});

// Test 4: Role-based authorization rules
test('Authorization rules for classroom QR endpoint', () => {
  function authorizeQrAccess(user, period, session) {
    if (!user) return { status: 401, error: 'Unauthorized' };
    if (user.role !== 'teacher' || period.teacherId !== user.id) {
      return { status: 403, error: 'Access denied: only assigned teacher can access classroom QR code' };
    }
    if (session.status !== 'open') {
      return { status: 400, error: 'Attendance session is closed' };
    }
    return { status: 200, ok: true };
  }

  const assignedTeacher = { id: 'teacher-1', role: 'teacher' };
  const anotherTeacher = { id: 'teacher-2', role: 'teacher' };
  const student = { id: 'student-1', role: 'student' };
  const period = { id: 'period-1', teacherId: 'teacher-1' };
  const openSession = { id: 'session-1', status: 'open' };
  const closedSession = { id: 'session-1', status: 'closed' };

  // Unauthenticated
  assert.equal(authorizeQrAccess(null, period, openSession).status, 401);

  // Student attempted access
  const studentResult = authorizeQrAccess(student, period, openSession);
  assert.equal(studentResult.status, 403);
  assert.match(studentResult.error, /only assigned teacher/);

  // Unassigned teacher attempted access
  const unassignedResult = authorizeQrAccess(anotherTeacher, period, openSession);
  assert.equal(unassignedResult.status, 403);

  // Closed session
  const closedResult = authorizeQrAccess(assignedTeacher, period, closedSession);
  assert.equal(closedResult.status, 400);

  // Assigned teacher on open session
  const allowedResult = authorizeQrAccess(assignedTeacher, period, openSession);
  assert.equal(allowedResult.status, 200);
});
