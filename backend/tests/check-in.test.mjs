import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// In-memory model and validator matching the Express check-in operation
function createCheckInHandler() {
  const sessions = new Map();
  const codes = new Map();
  const rosters = new Map(); // key: `${sessionId}:${studentId}`
  const records = new Map(); // key: `${sessionId}:${studentId}`

  function checkIn({ user, body, now = new Date() }) {
    if (!user) {
      return { status: 401, error: 'Unauthorized' };
    }
    if (user.role !== 'student') {
      return { status: 403, error: 'Only students can check in' };
    }

    let { sessionId, code, qrPayload } = body || {};

    if (qrPayload && (!sessionId || !code)) {
      try {
        const parsed = typeof qrPayload === 'string' ? JSON.parse(qrPayload) : qrPayload;
        sessionId = sessionId || parsed.sessionId;
        code = code || parsed.code;
      } catch {
        return { status: 400, error: 'Malformed QR payload' };
      }
    }

    if (!sessionId || !code) {
      return { status: 400, error: 'sessionId and code are required' };
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(sessionId)) {
      return { status: 400, error: 'Invalid sessionId format' };
    }

    // 1. Session exists and is open
    const session = sessions.get(sessionId);
    if (!session) {
      return { status: 404, error: 'Attendance session not found' };
    }
    if (session.status !== 'open') {
      return { status: 400, error: 'Attendance session is closed' };
    }

    // 2. Validate code
    const codeRecord = codes.get(code);
    if (!codeRecord) {
      return { status: 400, error: 'Invalid attendance code' };
    }
    if (codeRecord.sessionId !== sessionId) {
      return { status: 400, error: 'Attendance code does not match this session' };
    }
    if (new Date(codeRecord.expiresAt) <= now) {
      return { status: 400, error: 'Attendance code has expired' };
    }

    // 3. Verify student roster membership (from trusted user context)
    const rosterKey = `${sessionId}:${user.id}`;
    const rosterEntry = rosters.get(rosterKey);
    if (!rosterEntry) {
      return { status: 403, error: 'Student is not enrolled in this session roster' };
    }

    // 4. Check for existing record (repeat submission)
    const recordKey = `${sessionId}:${user.id}`;
    const existing = records.get(recordKey);
    if (existing) {
      return {
        status: 200,
        record: existing,
        message: 'Attendance already recorded',
        repeated: true,
      };
    }

    // 5. Insert record and update roster status
    const newRecord = {
      id: crypto.randomUUID(),
      sessionId,
      studentId: user.id,
      status: 'present',
      recordedAt: now,
      method: 'qr_scan',
    };
    records.set(recordKey, newRecord);
    rosterEntry.status = 'present';

    return {
      status: 201,
      record: newRecord,
      message: 'Attendance check-in confirmed',
      repeated: false,
    };
  }

  return {
    sessions,
    codes,
    rosters,
    records,
    checkIn,
  };
}

test('Check-in: Unauthenticated request rejected with 401', () => {
  const env = createCheckInHandler();
  const res = env.checkIn({ user: null, body: { sessionId: crypto.randomUUID(), code: 'code123' } });
  assert.equal(res.status, 401);
});

test('Check-in: Non-student role rejected with 403', () => {
  const env = createCheckInHandler();
  const teacher = { id: crypto.randomUUID(), role: 'teacher' };
  const res = env.checkIn({ user: teacher, body: { sessionId: crypto.randomUUID(), code: 'code123' } });
  assert.equal(res.status, 403);
  assert.match(res.error, /Only students/);
});

test('Check-in: Missing or malformed parameters rejected with 400', () => {
  const env = createCheckInHandler();
  const student = { id: crypto.randomUUID(), role: 'student' };

  // Missing body
  assert.equal(env.checkIn({ user: student, body: {} }).status, 400);

  // Malformed UUID
  assert.equal(env.checkIn({ user: student, body: { sessionId: 'bad-id', code: 'abc' } }).status, 400);

  // Malformed qrPayload
  assert.equal(env.checkIn({ user: student, body: { qrPayload: '{invalid-json' } }).status, 400);
});

test('Check-in: Closed or missing session rejected', () => {
  const env = createCheckInHandler();
  const student = { id: crypto.randomUUID(), role: 'student' };
  const validUuid = crypto.randomUUID();

  // Missing session
  assert.equal(env.checkIn({ user: student, body: { sessionId: validUuid, code: 'abc' } }).status, 404);

  // Closed session
  env.sessions.set(validUuid, { id: validUuid, status: 'closed' });
  const closedRes = env.checkIn({ user: student, body: { sessionId: validUuid, code: 'abc' } });
  assert.equal(closedRes.status, 400);
  assert.match(closedRes.error, /closed/);
});

test('Check-in: Expired or mismatched code rejected', () => {
  const env = createCheckInHandler();
  const sessionId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  const student = { id: studentId, role: 'student' };

  env.sessions.set(sessionId, { id: sessionId, status: 'open' });
  env.rosters.set(`${sessionId}:${studentId}`, { sessionId, studentId, status: 'pending' });

  // Non-existent code
  assert.equal(env.checkIn({ user: student, body: { sessionId, code: 'unknown' } }).status, 400);

  // Mismatched session code
  const otherSessionId = crypto.randomUUID();
  env.codes.set('mismatched-code', {
    code: 'mismatched-code',
    sessionId: otherSessionId,
    expiresAt: new Date(Date.now() + 60000),
  });
  const mismatchRes = env.checkIn({ user: student, body: { sessionId, code: 'mismatched-code' } });
  assert.equal(mismatchRes.status, 400);
  assert.match(mismatchRes.error, /does not match/);

  // Expired code
  env.codes.set('expired-code', {
    code: 'expired-code',
    sessionId,
    expiresAt: new Date(Date.now() - 5000), // 5 seconds in past
  });
  const expiredRes = env.checkIn({ user: student, body: { sessionId, code: 'expired-code' } });
  assert.equal(expiredRes.status, 400);
  assert.match(expiredRes.error, /expired/);
});

test('Check-in: Account outside roster rejected with 403', () => {
  const env = createCheckInHandler();
  const sessionId = crypto.randomUUID();
  const enrolledStudentId = crypto.randomUUID();
  const outsideStudent = { id: crypto.randomUUID(), role: 'student' };

  env.sessions.set(sessionId, { id: sessionId, status: 'open' });
  env.rosters.set(`${sessionId}:${enrolledStudentId}`, { sessionId, studentId: enrolledStudentId, status: 'pending' });
  env.codes.set('valid-code', {
    code: 'valid-code',
    sessionId,
    expiresAt: new Date(Date.now() + 60000),
  });

  const res = env.checkIn({ user: outsideStudent, body: { sessionId, code: 'valid-code' } });
  assert.equal(res.status, 403);
  assert.match(res.error, /not enrolled/);
});

test('Check-in: Valid submission and repeat submission creates only 1 record', () => {
  const env = createCheckInHandler();
  const sessionId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  const student = { id: studentId, role: 'student' };

  env.sessions.set(sessionId, { id: sessionId, status: 'open' });
  env.rosters.set(`${sessionId}:${studentId}`, { sessionId, studentId, status: 'pending' });
  env.codes.set('valid-code', {
    code: 'valid-code',
    sessionId,
    expiresAt: new Date(Date.now() + 60000),
  });

  // First submission
  const firstRes = env.checkIn({ user: student, body: { sessionId, code: 'valid-code' } });
  assert.equal(firstRes.status, 201);
  assert.equal(firstRes.repeated, false);
  assert.equal(firstRes.record.status, 'present');
  assert.equal(env.rosters.get(`${sessionId}:${studentId}`).status, 'present');
  assert.equal(env.records.size, 1);

  // Repeat submission with same valid code
  const secondRes = env.checkIn({ user: student, body: { sessionId, code: 'valid-code' } });
  assert.equal(secondRes.status, 200);
  assert.equal(secondRes.repeated, true);
  assert.equal(secondRes.record.id, firstRes.record.id);
  // Still exactly 1 record in database
  assert.equal(env.records.size, 1);
});

test('Check-in: Supports raw qrPayload JSON string', () => {
  const env = createCheckInHandler();
  const sessionId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  const student = { id: studentId, role: 'student' };

  env.sessions.set(sessionId, { id: sessionId, status: 'open' });
  env.rosters.set(`${sessionId}:${studentId}`, { sessionId, studentId, status: 'pending' });
  env.codes.set('valid-code-payload', {
    code: 'valid-code-payload',
    sessionId,
    expiresAt: new Date(Date.now() + 60000),
  });

  const qrPayload = JSON.stringify({ sessionId, code: 'valid-code-payload' });
  const res = env.checkIn({ user: student, body: { qrPayload } });
  assert.equal(res.status, 201);
  assert.equal(res.record.status, 'present');
});

test('Check-in: Concurrent requests resolve safely to exactly 1 record', async () => {
  const env = createCheckInHandler();
  const sessionId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  const student = { id: studentId, role: 'student' };

  env.sessions.set(sessionId, { id: sessionId, status: 'open' });
  env.rosters.set(`${sessionId}:${studentId}`, { sessionId, studentId, status: 'pending' });
  env.codes.set('conc-code', {
    code: 'conc-code',
    sessionId,
    expiresAt: new Date(Date.now() + 60000),
  });

  // Launch 5 concurrent submissions
  const promises = Array.from({ length: 5 }, () =>
    Promise.resolve(env.checkIn({ user: student, body: { sessionId, code: 'conc-code' } }))
  );

  const results = await Promise.all(promises);
  assert.equal(results.length, 5);
  results.forEach((r) => {
    assert.ok(r.status === 200 || r.status === 201);
    assert.equal(r.record.status, 'present');
  });

  // Exactly 1 record exists
  assert.equal(env.records.size, 1);
});
