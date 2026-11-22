import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function createAttendanceManager() {
  const sessions = new Map();
  const periods = new Map();
  const sections = new Map();
  const sessionRosters = new Map(); // key: `${sessionId}:${studentId}`
  const attendanceRecords = new Map(); // key: `${sessionId}:${studentId}`

  function addSection({ id, name, timezone = 'America/New_York' }) {
    sections.set(id, { id, name, timezone });
  }

  function addPeriod({ id, sectionId, teacherId, subject, startTime, endTime }) {
    periods.set(id, { id, sectionId, teacherId, subject, startTime, endTime });
  }

  function openSession({ id, periodId, status = 'open' }) {
    const session = { id, periodId, status, openedAt: new Date(), closedAt: null };
    sessions.set(id, session);
    return session;
  }

  function closeSession({ sessionId, now = new Date() }) {
    const session = sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    session.status = 'closed';
    session.closedAt = now;

    // finalize pending as absent
    for (const [key, roster] of sessionRosters.entries()) {
      if (key.startsWith(`${sessionId}:`) && roster.status === 'pending') {
        roster.status = 'absent';
        attendanceRecords.set(key, {
          sessionId,
          studentId: roster.studentId,
          status: 'absent',
          method: 'finalized_absence',
          recordedAt: now,
          updatedAt: now,
        });
      }
    }
  }

  function addToRoster({ sessionId, studentId, studentName, studentEmail, status = 'pending' }) {
    const key = `${sessionId}:${studentId}`;
    sessionRosters.set(key, { sessionId, studentId, studentName, studentEmail, status });
  }

  function recordCheckIn({ sessionId, studentId, now = new Date() }) {
    const key = `${sessionId}:${studentId}`;
    const roster = sessionRosters.get(key);
    if (roster) roster.status = 'present';
    attendanceRecords.set(key, {
      sessionId,
      studentId,
      status: 'present',
      method: 'qr_scan',
      recordedAt: now,
      updatedAt: now,
    });
  }

  function teacherCorrectRecord({ sessionId, studentId, status, teacherId, now = new Date() }) {
    const key = `${sessionId}:${studentId}`;
    const roster = sessionRosters.get(key);
    if (roster) roster.status = status;

    const existing = attendanceRecords.get(key) || {};
    attendanceRecords.set(key, {
      ...existing,
      sessionId,
      studentId,
      status,
      method: 'teacher_correction',
      updatedBy: teacherId,
      updatedAt: now,
    });
  }

  function getStudentAttendance({ user, queryStudentId }) {
    if (!user || user.role !== 'student') {
      return { status: 403, error: 'Access denied: only students can view student attendance' };
    }

    if (queryStudentId && queryStudentId !== user.id) {
      return { status: 403, error: 'Access denied: cannot view other students attendance' };
    }

    const studentId = user.id;

    // Filter closed sessions where student appears on roster
    const eligibleRows = [];
    for (const [key, roster] of sessionRosters.entries()) {
      if (roster.studentId !== studentId) continue;
      const session = sessions.get(roster.sessionId);
      if (!session || session.status !== 'closed') continue;

      const period = periods.get(session.periodId);
      const section = sections.get(period?.sectionId);
      const record = attendanceRecords.get(key);

      eligibleRows.push({
        sessionId: session.id,
        sessionStatus: session.status,
        sessionClosedAt: session.closedAt,
        periodId: period.id,
        subject: period.subject,
        startTime: period.startTime,
        endTime: period.endTime,
        timezone: section?.timezone || 'America/New_York',
        sectionName: section?.name || '',
        rosterStatus: roster.status,
        recordStatus: record?.status,
        recordRecordedAt: record?.recordedAt,
      });
    }

    eligibleRows.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    const subjectMap = new Map();
    let totalPresent = 0;
    const totalSessions = eligibleRows.length;

    const records = eligibleRows.map((r) => {
      const finalStatus = (r.recordStatus || r.rosterStatus || 'absent').toLowerCase();
      const isPresent = finalStatus === 'present';
      if (isPresent) totalPresent += 1;

      if (!subjectMap.has(r.subject)) {
        subjectMap.set(r.subject, {
          subject: r.subject,
          totalSessions: 0,
          presentSessions: 0,
          absentSessions: 0,
          percentage: 0,
        });
      }
      const group = subjectMap.get(r.subject);
      group.totalSessions += 1;
      if (isPresent) {
        group.presentSessions += 1;
      } else {
        group.absentSessions += 1;
      }

      return {
        id: r.sessionId,
        sessionId: r.sessionId,
        periodId: r.periodId,
        subject: r.subject,
        sectionName: r.sectionName,
        date: new Date(r.startTime).toISOString().slice(0, 10),
        startTime: r.startTime,
        endTime: r.endTime,
        status: isPresent ? 'present' : 'absent',
        recordedAt: r.recordRecordedAt || r.sessionClosedAt,
      };
    });

    const bySubject = Array.from(subjectMap.values()).map((s) => ({
      ...s,
      percentage: s.totalSessions > 0 ? Math.round((s.presentSessions / s.totalSessions) * 100) : 0,
    }));

    const summary = {
      totalSessions,
      presentSessions: totalPresent,
      absentSessions: totalSessions - totalPresent,
      percentage: totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0,
    };

    return {
      status: 200,
      summary,
      bySubject,
      records,
    };
  }

  return {
    addSection,
    addPeriod,
    openSession,
    closeSession,
    addToRoster,
    recordCheckIn,
    teacherCorrectRecord,
    getStudentAttendance,
  };
}

test('1. Student with one present and one absent session shows 50%', () => {
  const mgr = createAttendanceManager();
  const student = { id: crypto.randomUUID(), role: 'student', name: 'Alice' };
  const teacherId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();

  mgr.addSection({ id: sectionId, name: 'Grade 10 - A' });
  mgr.addPeriod({
    id: 'p1',
    sectionId,
    teacherId,
    subject: 'Mathematics',
    startTime: new Date('2026-11-20T09:00:00Z'),
    endTime: new Date('2026-11-20T09:45:00Z'),
  });
  mgr.addPeriod({
    id: 'p2',
    sectionId,
    teacherId,
    subject: 'Mathematics',
    startTime: new Date('2026-11-21T09:00:00Z'),
    endTime: new Date('2026-11-21T09:45:00Z'),
  });

  // Session 1: attended and closed
  mgr.openSession({ id: 's1', periodId: 'p1' });
  mgr.addToRoster({ sessionId: 's1', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });
  mgr.recordCheckIn({ sessionId: 's1', studentId: student.id });
  mgr.closeSession({ sessionId: 's1' });

  // Session 2: absent and closed
  mgr.openSession({ id: 's2', periodId: 'p2' });
  mgr.addToRoster({ sessionId: 's2', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });
  mgr.closeSession({ sessionId: 's2' });

  const res = mgr.getStudentAttendance({ user: student });
  assert.equal(res.status, 200);
  assert.equal(res.summary.totalSessions, 2);
  assert.equal(res.summary.presentSessions, 1);
  assert.equal(res.summary.absentSessions, 1);
  assert.equal(res.summary.percentage, 50);

  assert.equal(res.bySubject.length, 1);
  assert.equal(res.bySubject[0].subject, 'Mathematics');
  assert.equal(res.bySubject[0].totalSessions, 2);
  assert.equal(res.bySubject[0].presentSessions, 1);
  assert.equal(res.bySubject[0].absentSessions, 1);
  assert.equal(res.bySubject[0].percentage, 50);

  assert.equal(res.records.length, 2);
});

test('2. Add an open session and confirm denominator stays the same', () => {
  const mgr = createAttendanceManager();
  const student = { id: crypto.randomUUID(), role: 'student', name: 'Alice' };
  const teacherId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();

  mgr.addSection({ id: sectionId, name: 'Grade 10 - A' });
  mgr.addPeriod({
    id: 'p1',
    sectionId,
    teacherId,
    subject: 'Physics',
    startTime: new Date('2026-11-20T10:00:00Z'),
    endTime: new Date('2026-11-20T10:45:00Z'),
  });
  mgr.addPeriod({
    id: 'p2',
    sectionId,
    teacherId,
    subject: 'Physics',
    startTime: new Date('2026-11-21T10:00:00Z'),
    endTime: new Date('2026-11-21T10:45:00Z'),
  });
  mgr.addPeriod({
    id: 'p3',
    sectionId,
    teacherId,
    subject: 'Physics',
    startTime: new Date('2026-11-22T10:00:00Z'),
    endTime: new Date('2026-11-22T10:45:00Z'),
  });

  // 1 closed present, 1 closed absent
  mgr.openSession({ id: 's1', periodId: 'p1' });
  mgr.addToRoster({ sessionId: 's1', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });
  mgr.recordCheckIn({ sessionId: 's1', studentId: student.id });
  mgr.closeSession({ sessionId: 's1' });

  mgr.openSession({ id: 's2', periodId: 'p2' });
  mgr.addToRoster({ sessionId: 's2', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });
  mgr.closeSession({ sessionId: 's2' });

  // Add an OPEN session (not finalized)
  mgr.openSession({ id: 's3', periodId: 'p3', status: 'open' });
  mgr.addToRoster({ sessionId: 's3', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });

  const res = mgr.getStudentAttendance({ user: student });
  assert.equal(res.status, 200);
  assert.equal(res.summary.totalSessions, 2, 'Denominator must stay 2 when an open session exists');
  assert.equal(res.summary.percentage, 50);
  assert.equal(res.bySubject[0].totalSessions, 2);
});

test('3. Correct the absence and confirm the percentage updates', () => {
  const mgr = createAttendanceManager();
  const student = { id: crypto.randomUUID(), role: 'student', name: 'Alice' };
  const teacherId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();

  mgr.addSection({ id: sectionId, name: 'Grade 10 - A' });
  mgr.addPeriod({
    id: 'p1',
    sectionId,
    teacherId,
    subject: 'History',
    startTime: new Date('2026-11-20T11:00:00Z'),
    endTime: new Date('2026-11-20T11:45:00Z'),
  });
  mgr.addPeriod({
    id: 'p2',
    sectionId,
    teacherId,
    subject: 'History',
    startTime: new Date('2026-11-21T11:00:00Z'),
    endTime: new Date('2026-11-21T11:45:00Z'),
  });

  mgr.openSession({ id: 's1', periodId: 'p1' });
  mgr.addToRoster({ sessionId: 's1', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });
  mgr.recordCheckIn({ sessionId: 's1', studentId: student.id });
  mgr.closeSession({ sessionId: 's1' });

  mgr.openSession({ id: 's2', periodId: 'p2' });
  mgr.addToRoster({ sessionId: 's2', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });
  mgr.closeSession({ sessionId: 's2' });

  // Before correction: 1 present, 1 absent = 50%
  let res = mgr.getStudentAttendance({ user: student });
  assert.equal(res.summary.percentage, 50);

  // Teacher corrects s2 absence to present
  mgr.teacherCorrectRecord({ sessionId: 's2', studentId: student.id, status: 'present', teacherId });

  // After correction: 2 present, 0 absent = 100%
  res = mgr.getStudentAttendance({ user: student });
  assert.equal(res.summary.percentage, 100);
  assert.equal(res.summary.presentSessions, 2);
  assert.equal(res.summary.absentSessions, 0);
  assert.equal(res.bySubject[0].percentage, 100);
});

test('4. Confirm students can access only their own records', () => {
  const mgr = createAttendanceManager();
  const student1 = { id: crypto.randomUUID(), role: 'student', name: 'Alice' };
  const student2 = { id: crypto.randomUUID(), role: 'student', name: 'Bob' };
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Mr. Smith' };

  // Teacher cannot access student endpoint
  const teacherRes = mgr.getStudentAttendance({ user: teacher });
  assert.equal(teacherRes.status, 403);
  assert.match(teacherRes.error, /only students/i);

  // Student 1 attempting to query Student 2's ID
  const snoopRes = mgr.getStudentAttendance({ user: student1, queryStudentId: student2.id });
  assert.equal(snoopRes.status, 403);
  assert.match(snoopRes.error, /cannot view other students/i);

  // Unauthenticated access
  const unauthRes = mgr.getStudentAttendance({ user: null });
  assert.equal(unauthRes.status, 403);
});

test('5. Empty state when there are zero eligible sessions', () => {
  const mgr = createAttendanceManager();
  const student = { id: crypto.randomUUID(), role: 'student', name: 'Alice' };

  const res = mgr.getStudentAttendance({ user: student });
  assert.equal(res.status, 200);
  assert.equal(res.summary.totalSessions, 0);
  assert.equal(res.summary.presentSessions, 0);
  assert.equal(res.summary.absentSessions, 0);
  assert.equal(res.summary.percentage, 0);
  assert.deepEqual(res.bySubject, []);
  assert.deepEqual(res.records, []);
});

test('6. Multiple subjects grouped and calculated correctly', () => {
  const mgr = createAttendanceManager();
  const student = { id: crypto.randomUUID(), role: 'student', name: 'Alice' };
  const teacherId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();

  mgr.addSection({ id: sectionId, name: 'Grade 10 - A' });

  // Math: 2 sessions (2 present) = 100%
  mgr.addPeriod({ id: 'm1', sectionId, teacherId, subject: 'Math', startTime: new Date('2026-11-20T08:00:00Z'), endTime: new Date('2026-11-20T08:45:00Z') });
  mgr.addPeriod({ id: 'm2', sectionId, teacherId, subject: 'Math', startTime: new Date('2026-11-21T08:00:00Z'), endTime: new Date('2026-11-21T08:45:00Z') });
  mgr.openSession({ id: 'sm1', periodId: 'm1' });
  mgr.addToRoster({ sessionId: 'sm1', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });
  mgr.recordCheckIn({ sessionId: 'sm1', studentId: student.id });
  mgr.closeSession({ sessionId: 'sm1' });

  mgr.openSession({ id: 'sm2', periodId: 'm2' });
  mgr.addToRoster({ sessionId: 'sm2', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });
  mgr.recordCheckIn({ sessionId: 'sm2', studentId: student.id });
  mgr.closeSession({ sessionId: 'sm2' });

  // English: 2 sessions (1 present, 1 absent) = 50%
  mgr.addPeriod({ id: 'e1', sectionId, teacherId, subject: 'English', startTime: new Date('2026-11-20T09:00:00Z'), endTime: new Date('2026-11-20T09:45:00Z') });
  mgr.addPeriod({ id: 'e2', sectionId, teacherId, subject: 'English', startTime: new Date('2026-11-21T09:00:00Z'), endTime: new Date('2026-11-21T09:45:00Z') });
  mgr.openSession({ id: 'se1', periodId: 'e1' });
  mgr.addToRoster({ sessionId: 'se1', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });
  mgr.recordCheckIn({ sessionId: 'se1', studentId: student.id });
  mgr.closeSession({ sessionId: 'se1' });

  mgr.openSession({ id: 'se2', periodId: 'e2' });
  mgr.addToRoster({ sessionId: 'se2', studentId: student.id, studentName: 'Alice', studentEmail: 'alice@school.edu' });
  mgr.closeSession({ sessionId: 'se2' });

  const res = mgr.getStudentAttendance({ user: student });
  assert.equal(res.status, 200);
  assert.equal(res.summary.totalSessions, 4);
  assert.equal(res.summary.presentSessions, 3);
  assert.equal(res.summary.absentSessions, 1);
  assert.equal(res.summary.percentage, 75); // 3/4 = 75%

  const math = res.bySubject.find((s) => s.subject === 'Math');
  const english = res.bySubject.find((s) => s.subject === 'English');

  assert.equal(math.percentage, 100);
  assert.equal(english.percentage, 50);
});
