import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function createCorrectionManager() {
  const sessions = new Map();
  const periods = new Map();
  const sessionRosters = new Map(); // key: `${sessionId}:${studentId}`
  const attendanceRecords = new Map(); // key: `${sessionId}:${studentId}`

  function updateRecord({ user, sessionId, studentId, status, now = new Date() }) {
    if (!user) {
      return { status: 401, error: 'Unauthorized' };
    }

    if (!studentId || !status) {
      return { status: 400, error: 'studentId and status are required' };
    }

    if (!['present', 'absent', 'pending'].includes(status)) {
      return { status: 400, error: 'status must be present, absent, or pending' };
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return { status: 404, error: 'Session not found' };
    }

    const period = periods.get(session.periodId);
    if (!period || user.role !== 'teacher' || period.teacherId !== user.id) {
      return { status: 403, error: 'Access denied: only assigned teacher can modify attendance records' };
    }

    // Verify student is on the captured session roster
    const rosterKey = `${sessionId}:${studentId}`;
    const rosterEntry = sessionRosters.get(rosterKey);
    if (!rosterEntry) {
      return { status: 403, error: 'Student is not in the captured session roster' };
    }

    const method = session.status === 'open' ? 'teacher_manual' : 'teacher_correction';
    const recordKey = `${sessionId}:${studentId}`;

    // Update roster status
    rosterEntry.status = status;

    // Update or insert attendance record with actor and edit time
    let record = attendanceRecords.get(recordKey);
    if (record) {
      record.status = status;
      record.method = method;
      record.updatedBy = user.id;
      record.updatedAt = now;
    } else {
      record = {
        id: crypto.randomUUID(),
        sessionId,
        studentId,
        status,
        method,
        updatedBy: user.id,
        recordedAt: now,
        updatedAt: now,
      };
      attendanceRecords.set(recordKey, record);
    }

    const roster = [];
    for (const [key, entry] of sessionRosters.entries()) {
      if (key.startsWith(`${sessionId}:`)) roster.push(entry);
    }
    roster.sort((a, b) => a.studentName.localeCompare(b.studentName));
    const checkedInCount = roster.filter((s) => s.status === 'present').length;
    const absentCount = roster.filter((s) => s.status === 'absent').length;
    const pendingCount = roster.filter((s) => s.status === 'pending').length;

    return {
      status: 200,
      record,
      roster,
      summary: {
        totalEnrolled: roster.length,
        checkedInCount,
        absentCount,
        pendingCount,
        percentage: roster.length ? Math.round((checkedInCount / roster.length) * 100) : 0,
      },
    };
  }

  return {
    sessions,
    periods,
    sessionRosters,
    attendanceRecords,
    updateRecord,
  };
}

test('Correction Auth: Unrelated teachers and students cannot modify records', () => {
  const env = createCorrectionManager();
  const assignedTeacher = { id: 'teacher-1', role: 'teacher' };
  const unrelatedTeacher = { id: 'teacher-2', role: 'teacher' };
  const student = { id: 'student-1', role: 'student' };

  const periodId = 'p1';
  const sessionId = 's1';
  const studentId = 'student-1';

  env.periods.set(periodId, { id: periodId, teacherId: assignedTeacher.id });
  env.sessions.set(sessionId, { id: sessionId, periodId, status: 'open' });
  env.sessionRosters.set(`${sessionId}:${studentId}`, { sessionId, studentId, studentName: 'Student 1', status: 'pending' });

  // Unauthenticated
  assert.equal(env.updateRecord({ user: null, sessionId, studentId, status: 'present' }).status, 401);

  // Student
  assert.equal(env.updateRecord({ user: student, sessionId, studentId, status: 'present' }).status, 403);

  // Unrelated teacher
  const unauthRes = env.updateRecord({ user: unrelatedTeacher, sessionId, studentId, status: 'present' });
  assert.equal(unauthRes.status, 403);
  assert.match(unauthRes.error, /only assigned teacher/);

  // Assigned teacher allowed
  const authRes = env.updateRecord({ user: assignedTeacher, sessionId, studentId, status: 'present' });
  assert.equal(authRes.status, 200);
});

test('Correction Scope: Cannot modify student outside captured roster', () => {
  const env = createCorrectionManager();
  const teacher = { id: 'teacher-1', role: 'teacher' };
  const periodId = 'p1';
  const sessionId = 's1';

  env.periods.set(periodId, { id: periodId, teacherId: teacher.id });
  env.sessions.set(sessionId, { id: sessionId, periodId, status: 'open' });

  const res = env.updateRecord({ user: teacher, sessionId, studentId: 'outside-student', status: 'present' });
  assert.equal(res.status, 403);
  assert.match(res.error, /not in the captured session roster/);
});

test('Correction Lifecycle: Manually mark pending student, close session, then correct finalized entry', () => {
  const env = createCorrectionManager();
  const teacher = { id: 'teacher-1', role: 'teacher' };
  const student1 = { id: 's1', name: 'Alice' };
  const student2 = { id: 's2', name: 'Bob' };

  const periodId = 'p1';
  const sessionId = crypto.randomUUID();

  env.periods.set(periodId, { id: periodId, teacherId: teacher.id });
  env.sessions.set(sessionId, { id: sessionId, periodId, status: 'open' });

  env.sessionRosters.set(`${sessionId}:${student1.id}`, { sessionId, studentId: student1.id, studentName: student1.name, status: 'pending' });
  env.sessionRosters.set(`${sessionId}:${student2.id}`, { sessionId, studentId: student2.id, studentName: student2.name, status: 'pending' });

  // 1. Teacher manually marks student 1 present when they cannot scan
  const t1 = new Date('2026-11-22T10:00:00.000Z');
  const manualRes = env.updateRecord({ user: teacher, sessionId, studentId: student1.id, status: 'present', now: t1 });

  assert.equal(manualRes.status, 200);
  assert.equal(manualRes.record.status, 'present');
  assert.equal(manualRes.record.method, 'teacher_manual');
  assert.equal(manualRes.record.updatedBy, teacher.id);
  assert.equal(manualRes.record.updatedAt.toISOString(), t1.toISOString());
  assert.equal(manualRes.summary.checkedInCount, 1);
  assert.equal(manualRes.summary.pendingCount, 1);

  // 2. Session closed: student 2 finalized as absent
  env.sessions.get(sessionId).status = 'closed';
  env.sessionRosters.get(`${sessionId}:${student2.id}`).status = 'absent';
  env.attendanceRecords.set(`${sessionId}:${student2.id}`, {
    id: crypto.randomUUID(),
    sessionId,
    studentId: student2.id,
    status: 'absent',
    method: 'finalized_absence',
    recordedAt: new Date('2026-11-22T10:15:00.000Z'),
    updatedAt: new Date('2026-11-22T10:15:00.000Z'),
  });

  // 3. Teacher corrects student 2 from absent to present after closure
  const t2 = new Date('2026-11-22T10:20:00.000Z');
  const correctRes = env.updateRecord({ user: teacher, sessionId, studentId: student2.id, status: 'present', now: t2 });

  assert.equal(correctRes.status, 200);
  assert.equal(correctRes.record.status, 'present');
  assert.equal(correctRes.record.method, 'teacher_correction');
  assert.equal(correctRes.record.updatedBy, teacher.id);
  assert.equal(correctRes.record.updatedAt.toISOString(), t2.toISOString());
  assert.equal(correctRes.summary.checkedInCount, 2);
  assert.equal(correctRes.summary.absentCount, 0);
  assert.equal(correctRes.summary.percentage, 100);

  // 4. Teacher corrects student 1 to absent
  const t3 = new Date('2026-11-22T10:25:00.000Z');
  const revertRes = env.updateRecord({ user: teacher, sessionId, studentId: student1.id, status: 'absent', now: t3 });
  assert.equal(revertRes.record.status, 'absent');
  assert.equal(revertRes.record.updatedBy, teacher.id);
  assert.equal(revertRes.summary.checkedInCount, 1);
  assert.equal(revertRes.summary.absentCount, 1);
  assert.equal(revertRes.summary.percentage, 50);
});
