import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function createRosterManager() {
  const sessions = new Map();
  const periods = new Map();
  const sessionRosters = new Map(); // key: `${sessionId}:${studentId}`

  function getRoster({ user, sessionId }) {
    if (!user) {
      return { status: 401, error: 'Unauthorized' };
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return { status: 404, error: 'Session not found' };
    }

    const period = periods.get(session.periodId);
    if (!period) {
      return { status: 404, error: 'Period not found' };
    }

    // Only assigned teacher can read roster
    if (user.role !== 'teacher' || period.teacherId !== user.id) {
      return { status: 403, error: 'Access denied: only assigned teacher can view attendance roster' };
    }

    const roster = [];
    for (const [key, entry] of sessionRosters.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        roster.push(entry);
      }
    }

    roster.sort((a, b) => a.studentName.localeCompare(b.studentName));

    const checkedInCount = roster.filter((s) => s.status === 'present').length;
    const pendingCount = roster.filter((s) => s.status === 'pending').length;

    return {
      status: 200,
      session,
      roster,
      summary: {
        totalEnrolled: roster.length,
        checkedInCount,
        pendingCount,
        percentage: roster.length ? Math.round((checkedInCount / roster.length) * 100) : 0,
      },
    };
  }

  function markStudentPresent(sessionId, studentId) {
    const key = `${sessionId}:${studentId}`;
    const entry = sessionRosters.get(key);
    if (entry) {
      entry.status = 'present';
    }
  }

  return {
    sessions,
    periods,
    sessionRosters,
    getRoster,
    markStudentPresent,
  };
}

test('Roster Auth: Unauthenticated callers rejected with 401', () => {
  const env = createRosterManager();
  const res = env.getRoster({ user: null, sessionId: 's1' });
  assert.equal(res.status, 401);
});

test('Roster Auth: Students and unrelated teachers cannot read private roster', () => {
  const env = createRosterManager();
  const assignedTeacher = { id: 'teacher-1', role: 'teacher' };
  const unrelatedTeacher = { id: 'teacher-2', role: 'teacher' };
  const student = { id: 'student-1', role: 'student' };

  const periodId = 'p1';
  const sessionId = 's1';

  env.periods.set(periodId, { id: periodId, teacherId: assignedTeacher.id });
  env.sessions.set(sessionId, { id: sessionId, periodId, status: 'open' });

  // Student attempted access
  const studentRes = env.getRoster({ user: student, sessionId });
  assert.equal(studentRes.status, 403);
  assert.match(studentRes.error, /only assigned teacher/);

  // Unrelated teacher attempted access
  const unrelatedRes = env.getRoster({ user: unrelatedTeacher, sessionId });
  assert.equal(unrelatedRes.status, 403);
  assert.match(unrelatedRes.error, /only assigned teacher/);

  // Assigned teacher allowed
  const assignedRes = env.getRoster({ user: assignedTeacher, sessionId });
  assert.equal(assignedRes.status, 200);
});

test('Roster Update: Scan by one student updates private roster and checked-in total while other remains pending', () => {
  const env = createRosterManager();
  const teacher = { id: 'teacher-1', role: 'teacher' };
  const student1 = { id: 's1-id', name: 'Alice Smith', email: 'alice@pilot.edu' };
  const student2 = { id: 's2-id', name: 'Bob Jones', email: 'bob@pilot.edu' };

  const periodId = 'p1';
  const sessionId = crypto.randomUUID();

  env.periods.set(periodId, { id: periodId, teacherId: teacher.id });
  env.sessions.set(sessionId, { id: sessionId, periodId, status: 'open' });

  // Seed session snapshot with 2 enrolled students, initially pending
  env.sessionRosters.set(`${sessionId}:${student1.id}`, {
    id: 'r1',
    sessionId,
    studentId: student1.id,
    studentName: student1.name,
    studentEmail: student1.email,
    status: 'pending',
  });
  env.sessionRosters.set(`${sessionId}:${student2.id}`, {
    id: 'r2',
    sessionId,
    studentId: student2.id,
    studentName: student2.name,
    studentEmail: student2.email,
    status: 'pending',
  });

  // 1. Initial roster state
  const initial = env.getRoster({ user: teacher, sessionId });
  assert.equal(initial.status, 200);
  assert.equal(initial.roster.length, 2);
  assert.equal(initial.summary.totalEnrolled, 2);
  assert.equal(initial.summary.checkedInCount, 0);
  assert.equal(initial.summary.pendingCount, 2);
  assert.equal(initial.summary.percentage, 0);
  assert.equal(initial.roster[0].status, 'pending');
  assert.equal(initial.roster[1].status, 'pending');

  // 2. Student 1 scans and checks in
  env.markStudentPresent(sessionId, student1.id);

  // 3. Teacher's refreshed roster view
  const refreshed = env.getRoster({ user: teacher, sessionId });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.summary.totalEnrolled, 2);
  assert.equal(refreshed.summary.checkedInCount, 1);
  assert.equal(refreshed.summary.pendingCount, 1);
  assert.equal(refreshed.summary.percentage, 50);

  const alice = refreshed.roster.find((s) => s.studentId === student1.id);
  const bob = refreshed.roster.find((s) => s.studentId === student2.id);

  // Alice is present, Bob remains pending
  assert.equal(alice.status, 'present');
  assert.equal(bob.status, 'pending');
});
