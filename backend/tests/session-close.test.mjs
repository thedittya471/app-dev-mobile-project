import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function createSessionCloseManager() {
  const sessions = new Map();
  const periods = new Map();
  const codes = new Map();
  const sessionRosters = new Map(); // key: `${sessionId}:${studentId}`
  const attendanceRecords = new Map(); // key: `${sessionId}:${studentId}`

  function checkIn({ user, sessionId, code, now = new Date() }) {
    if (!user || user.role !== 'student') {
      return { status: 403, error: 'Only students can check in' };
    }

    const session = sessions.get(sessionId);
    if (!session || session.status !== 'open') {
      return { status: 400, error: 'Attendance session is closed' };
    }

    const codeRecord = codes.get(code);
    if (!codeRecord || codeRecord.sessionId !== sessionId || new Date(codeRecord.expiresAt) <= now) {
      return { status: 400, error: 'Invalid or expired code' };
    }

    const rosterKey = `${sessionId}:${user.id}`;
    const rosterEntry = sessionRosters.get(rosterKey);
    if (!rosterEntry) {
      return { status: 403, error: 'Student not on roster' };
    }

    const recordKey = `${sessionId}:${user.id}`;
    if (attendanceRecords.has(recordKey)) {
      return { status: 200, record: attendanceRecords.get(recordKey), repeated: true };
    }

    const newRecord = {
      id: crypto.randomUUID(),
      sessionId,
      studentId: user.id,
      status: 'present',
      recordedAt: now,
      method: 'qr_scan',
    };
    attendanceRecords.set(recordKey, newRecord);
    rosterEntry.status = 'present';

    return { status: 201, record: newRecord, repeated: false };
  }

  function closeSession({ user, sessionId, now = new Date() }) {
    if (!user) {
      return { status: 401, error: 'Unauthorized' };
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return { status: 404, error: 'Session not found' };
    }

    const period = periods.get(session.periodId);
    if (!period || user.role !== 'teacher' || period.teacherId !== user.id) {
      return { status: 403, error: 'Access denied: only assigned teacher can close attendance session' };
    }

    // Repeated close requests safe (idempotent)
    if (session.status === 'closed') {
      const roster = [];
      for (const [key, entry] of sessionRosters.entries()) {
        if (key.startsWith(`${sessionId}:`)) roster.push(entry);
      }
      roster.sort((a, b) => a.studentName.localeCompare(b.studentName));
      const checkedInCount = roster.filter((s) => s.status === 'present').length;
      const absentCount = roster.filter((s) => s.status === 'absent').length;

      return {
        status: 200,
        session,
        roster,
        summary: {
          totalEnrolled: roster.length,
          checkedInCount,
          absentCount,
          percentage: roster.length ? Math.round((checkedInCount / roster.length) * 100) : 0,
        },
        message: 'Attendance session is already closed',
      };
    }

    // Transaction: close session, expire codes, and finalize pending students as absent
    session.status = 'closed';
    session.closedAt = now;

    // Expire active codes
    for (const code of codes.values()) {
      if (code.sessionId === sessionId) {
        code.expiresAt = now;
      }
    }

    const roster = [];
    for (const [key, entry] of sessionRosters.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        if (entry.status === 'pending') {
          entry.status = 'absent';
          const recordKey = `${sessionId}:${entry.studentId}`;
          if (!attendanceRecords.has(recordKey)) {
            attendanceRecords.set(recordKey, {
              id: crypto.randomUUID(),
              sessionId,
              studentId: entry.studentId,
              status: 'absent',
              recordedAt: now,
              method: 'finalized_absence',
            });
          }
        }
        roster.push(entry);
      }
    }

    roster.sort((a, b) => a.studentName.localeCompare(b.studentName));
    const checkedInCount = roster.filter((s) => s.status === 'present').length;
    const absentCount = roster.filter((s) => s.status === 'absent').length;

    return {
      status: 200,
      session,
      roster,
      summary: {
        totalEnrolled: roster.length,
        checkedInCount,
        absentCount,
        percentage: roster.length ? Math.round((checkedInCount / roster.length) * 100) : 0,
      },
      message: 'Attendance session closed and absences finalized successfully',
    };
  }

  return {
    sessions,
    periods,
    codes,
    sessionRosters,
    attendanceRecords,
    checkIn,
    closeSession,
  };
}

test('Close Session Auth: Only assigned teacher can close session', () => {
  const env = createSessionCloseManager();
  const assignedTeacher = { id: 'teacher-1', role: 'teacher' };
  const unrelatedTeacher = { id: 'teacher-2', role: 'teacher' };
  const student = { id: 'student-1', role: 'student' };

  const periodId = 'p1';
  const sessionId = 's1';

  env.periods.set(periodId, { id: periodId, teacherId: assignedTeacher.id });
  env.sessions.set(sessionId, { id: sessionId, periodId, status: 'open' });

  // Unauthenticated
  assert.equal(env.closeSession({ user: null, sessionId }).status, 401);

  // Student
  assert.equal(env.closeSession({ user: student, sessionId }).status, 403);

  // Unrelated teacher
  assert.equal(env.closeSession({ user: unrelatedTeacher, sessionId }).status, 403);

  // Assigned teacher allowed
  assert.equal(env.closeSession({ user: assignedTeacher, sessionId }).status, 200);
});

test('Close Session Flow: Checked-in student is present, second is absent, later scan rejected', () => {
  const env = createSessionCloseManager();
  const teacher = { id: 'teacher-1', role: 'teacher' };
  const student1 = { id: 'student-1', role: 'student', name: 'Jane Doe' };
  const student2 = { id: 'student-2', role: 'student', name: 'John River' };

  const periodId = 'p1';
  const sessionId = crypto.randomUUID();
  const code = 'valid-qr-code';

  env.periods.set(periodId, { id: periodId, teacherId: teacher.id });
  env.sessions.set(sessionId, { id: sessionId, periodId, status: 'open' });
  env.codes.set(code, { code, sessionId, expiresAt: new Date(Date.now() + 60000) });

  // Both students initially on roster snapshot as pending
  env.sessionRosters.set(`${sessionId}:${student1.id}`, {
    id: 'r1',
    sessionId,
    studentId: student1.id,
    studentName: student1.name,
    status: 'pending',
  });
  env.sessionRosters.set(`${sessionId}:${student2.id}`, {
    id: 'r2',
    sessionId,
    studentId: student2.id,
    studentName: student2.name,
    status: 'pending',
  });

  // 1. Student 1 checks in successfully
  const checkInRes = env.checkIn({ user: student1, sessionId, code });
  assert.equal(checkInRes.status, 201);
  assert.equal(checkInRes.record.status, 'present');

  // 2. Teacher closes the session
  const closeRes = env.closeSession({ user: teacher, sessionId });
  assert.equal(closeRes.status, 200);
  assert.equal(closeRes.session.status, 'closed');
  assert.ok(closeRes.session.closedAt);

  // Summary counts
  assert.equal(closeRes.summary.totalEnrolled, 2);
  assert.equal(closeRes.summary.checkedInCount, 1);
  assert.equal(closeRes.summary.absentCount, 1);
  assert.equal(closeRes.summary.percentage, 50);

  // Roster entries
  const r1 = closeRes.roster.find((s) => s.studentId === student1.id);
  const r2 = closeRes.roster.find((s) => s.studentId === student2.id);
  assert.equal(r1.status, 'present');
  assert.equal(r2.status, 'absent');

  // Database records
  assert.equal(env.attendanceRecords.get(`${sessionId}:${student1.id}`).status, 'present');
  assert.equal(env.attendanceRecords.get(`${sessionId}:${student2.id}`).status, 'absent');

  // 3. Later scan by student 2 is rejected
  const lateScanRes = env.checkIn({ user: student2, sessionId, code });
  assert.equal(lateScanRes.status, 400);
  assert.match(lateScanRes.error, /closed/);

  // 4. Repeated closure is safe (idempotent)
  const repeatCloseRes = env.closeSession({ user: teacher, sessionId });
  assert.equal(repeatCloseRes.status, 200);
  assert.equal(repeatCloseRes.summary.checkedInCount, 1);
  assert.equal(repeatCloseRes.summary.absentCount, 1);
});

test('Concurrent coordination: Check-in and closure do not write conflicting states', async () => {
  const env = createSessionCloseManager();
  const teacher = { id: 'teacher-1', role: 'teacher' };
  const student = { id: 'student-1', role: 'student', name: 'Jane Doe' };

  const periodId = 'p1';
  const sessionId = crypto.randomUUID();
  const code = 'valid-qr-code';

  env.periods.set(periodId, { id: periodId, teacherId: teacher.id });
  env.sessions.set(sessionId, { id: sessionId, periodId, status: 'open' });
  env.codes.set(code, { code, sessionId, expiresAt: new Date(Date.now() + 60000) });

  env.sessionRosters.set(`${sessionId}:${student.id}`, {
    id: 'r1',
    sessionId,
    studentId: student.id,
    studentName: student.name,
    status: 'pending',
  });

  // Scenario A: Check-in resolves, then close runs
  const checkInRes = env.checkIn({ user: student, sessionId, code });
  const closeRes = env.closeSession({ user: teacher, sessionId });

  assert.equal(checkInRes.status, 201);
  assert.equal(closeRes.status, 200);
  // Student stays present, NOT marked absent
  const record = env.attendanceRecords.get(`${sessionId}:${student.id}`);
  assert.equal(record.status, 'present');
  assert.equal(closeRes.roster[0].status, 'present');
});
