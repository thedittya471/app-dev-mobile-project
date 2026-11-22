import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function createProjectorManager() {
  const sessions = new Map();
  const periods = new Map();
  const sections = new Map();
  const users = new Map();
  const sessionRosters = new Map(); // key: `${sessionId}:${studentId}`
  const codes = new Map(); // key: code
  const attendanceRecords = new Map(); // key: `${sessionId}:${studentId}`

  function addUser({ id, name, email, role }) {
    users.set(id, { id, name, email, role });
  }

  function addSection({ id, name, timezone = 'America/New_York' }) {
    sections.set(id, { id, name, timezone });
  }

  function addPeriod({ id, sectionId, teacherId, subject, startTime, endTime }) {
    periods.set(id, { id, sectionId, teacherId, subject, startTime, endTime });
  }

  function openSession({ id, periodId }) {
    const session = { id, periodId, status: 'open', openedAt: new Date(), closedAt: null };
    sessions.set(id, session);
    return session;
  }

  function addToRoster({ sessionId, studentId, studentName, studentEmail, status = 'pending' }) {
    sessionRosters.set(`${sessionId}:${studentId}`, { sessionId, studentId, studentName, studentEmail, status });
  }

  function issueCode({ sessionId, ttlSeconds = 20, now = new Date() }) {
    const code = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const record = { sessionId, code, expiresAt, createdAt: now };
    codes.set(code, record);
    return record;
  }

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
    const roster = sessionRosters.get(rosterKey);
    if (!roster) {
      return { status: 403, error: 'Student is not on the roster' };
    }

    roster.status = 'present';
    attendanceRecords.set(rosterKey, {
      sessionId,
      studentId: user.id,
      status: 'present',
      recordedAt: now,
      method: 'qr_scan',
    });

    return { status: 201, message: 'Check-in confirmed' };
  }

  function closeSession({ user, sessionId, now = new Date() }) {
    const session = sessions.get(sessionId);
    if (!session) return { status: 404, error: 'Session not found' };

    const period = periods.get(session.periodId);
    if (!user || user.role !== 'teacher' || period.teacherId !== user.id) {
      return { status: 403, error: 'Access denied: only assigned teacher can close session' };
    }

    session.status = 'closed';
    session.closedAt = now;

    // Finalize pending as absent
    for (const [key, roster] of sessionRosters.entries()) {
      if (key.startsWith(`${sessionId}:`) && roster.status === 'pending') {
        roster.status = 'absent';
        attendanceRecords.set(key, {
          sessionId,
          studentId: roster.studentId,
          status: 'absent',
          recordedAt: now,
          method: 'finalized_absence',
        });
      }
    }

    // Expire codes
    for (const c of codes.values()) {
      if (c.sessionId === sessionId) {
        c.expiresAt = now;
      }
    }

    return { status: 200, message: 'Session closed' };
  }

  function getSessionSummary({ user, sessionId, now = new Date() }) {
    if (!user) {
      return { status: 401, error: 'Unauthorized' };
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return { status: 404, error: 'Session not found' };
    }

    const period = periods.get(session.periodId);
    if (!period || user.role !== 'teacher' || period.teacherId !== user.id) {
      return { status: 403, error: 'Access denied: only assigned teacher can view classroom projector summary' };
    }

    const section = sections.get(period.sectionId);
    const teacher = users.get(period.teacherId);

    // Aggregate summary counts (omits individual students)
    let totalEnrolled = 0;
    let checkedInCount = 0;
    let absentCount = 0;
    let pendingCount = 0;

    for (const [key, roster] of sessionRosters.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        totalEnrolled += 1;
        if (roster.status === 'present') checkedInCount += 1;
        else if (roster.status === 'absent') absentCount += 1;
        else if (roster.status === 'pending') pendingCount += 1;
      }
    }

    const percentage = totalEnrolled ? Math.round((checkedInCount / totalEnrolled) * 100) : 0;

    let qr = null;
    if (session.status === 'open') {
      // Find active code or generate new one
      let activeCode = null;
      for (const c of codes.values()) {
        if (c.sessionId === sessionId && new Date(c.expiresAt) > now) {
          activeCode = c;
          break;
        }
      }

      if (!activeCode) {
        activeCode = issueCode({ sessionId, ttlSeconds: 20, now });
      }

      qr = {
        code: activeCode.code,
        qrPayload: JSON.stringify({ sessionId: session.id, code: activeCode.code }),
        qrDataUrl: `data:image/png;base64,mock_${activeCode.code}`,
        expiresAt: activeCode.expiresAt,
        expiresInSeconds: Math.max(0, Math.round((new Date(activeCode.expiresAt).getTime() - now.getTime()) / 1000)),
      };
    }

    return {
      status: 200,
      session: {
        id: session.id,
        periodId: session.periodId,
        status: session.status,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
      },
      period: {
        id: period.id,
        subject: period.subject,
        sectionName: section?.name || '',
        teacherName: teacher?.name || '',
        date: new Date(period.startTime).toISOString().slice(0, 10),
        startTime: period.startTime,
        endTime: period.endTime,
      },
      summary: {
        totalEnrolled,
        checkedInCount,
        absentCount,
        pendingCount,
        percentage,
      },
      qr,
    };
  }

  return {
    addUser,
    addSection,
    addPeriod,
    openSession,
    addToRoster,
    issueCode,
    checkIn,
    closeSession,
    getSessionSummary,
  };
}

test('1. Session summary omits individual student attendance data', () => {
  const mgr = createProjectorManager();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Dr. Turing', email: 'turing@school.edu' };
  const student1 = { id: crypto.randomUUID(), role: 'student', name: 'Alice Smith', email: 'alice@school.edu' };
  const student2 = { id: crypto.randomUUID(), role: 'student', name: 'Bob Jones', email: 'bob@school.edu' };

  mgr.addUser(teacher);
  mgr.addUser(student1);
  mgr.addUser(student2);

  const sectionId = crypto.randomUUID();
  mgr.addSection({ id: sectionId, name: 'Grade 10 - A' });
  mgr.addPeriod({
    id: 'p1',
    sectionId,
    teacherId: teacher.id,
    subject: 'Computer Science',
    startTime: new Date('2026-11-22T09:00:00Z'),
    endTime: new Date('2026-11-22T09:45:00Z'),
  });

  mgr.openSession({ id: 's1', periodId: 'p1' });
  mgr.addToRoster({ sessionId: 's1', studentId: student1.id, studentName: student1.name, studentEmail: student1.email });
  mgr.addToRoster({ sessionId: 's1', studentId: student2.id, studentName: student2.name, studentEmail: student2.email });

  const res = mgr.getSessionSummary({ user: teacher, sessionId: 's1' });

  assert.equal(res.status, 200);
  assert.equal(res.summary.totalEnrolled, 2);
  assert.equal(res.summary.checkedInCount, 0);
  assert.equal(res.summary.pendingCount, 2);
  assert.equal(res.summary.percentage, 0);

  // CRITICAL PRIVACY CHECK: response must NOT contain individual student data
  assert.equal(res.roster, undefined, 'Must not leak roster array');
  assert.equal(res.students, undefined, 'Must not leak students array');
  const serialized = JSON.stringify(res);
  assert.ok(!serialized.includes('Alice Smith'), 'Must not contain student names');
  assert.ok(!serialized.includes('alice@school.edu'), 'Must not contain student emails');
  assert.ok(!serialized.includes(student1.id), 'Must not contain student IDs');
});

test('2. Displays subject, status, and large QR code when session is open', () => {
  const mgr = createProjectorManager();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Dr. Turing' };
  mgr.addUser(teacher);

  const sectionId = crypto.randomUUID();
  mgr.addSection({ id: sectionId, name: 'Grade 10 - A' });
  mgr.addPeriod({
    id: 'p1',
    sectionId,
    teacherId: teacher.id,
    subject: 'Physics',
    startTime: new Date('2026-11-22T10:00:00Z'),
    endTime: new Date('2026-11-22T10:45:00Z'),
  });

  mgr.openSession({ id: 's1', periodId: 'p1' });
  const res = mgr.getSessionSummary({ user: teacher, sessionId: 's1' });

  assert.equal(res.status, 200);
  assert.equal(res.session.status, 'open');
  assert.equal(res.period.subject, 'Physics');
  assert.ok(res.qr, 'Must provide QR data when session is open');
  assert.ok(res.qr.code, 'Must contain active code');
  assert.ok(res.qr.qrPayload, 'Must contain QR payload');
  assert.ok(res.qr.qrDataUrl, 'Must contain QR image data URL');

  const parsedPayload = JSON.parse(res.qr.qrPayload);
  assert.equal(parsedPayload.sessionId, 's1');
  assert.equal(parsedPayload.code, res.qr.code);
});

test('3. Closed session hides QR code completely', () => {
  const mgr = createProjectorManager();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Dr. Turing' };
  mgr.addUser(teacher);

  const sectionId = crypto.randomUUID();
  mgr.addSection({ id: sectionId, name: 'Grade 10 - A' });
  mgr.addPeriod({
    id: 'p1',
    sectionId,
    teacherId: teacher.id,
    subject: 'Chemistry',
    startTime: new Date('2026-11-22T11:00:00Z'),
    endTime: new Date('2026-11-22T11:45:00Z'),
  });

  mgr.openSession({ id: 's1', periodId: 'p1' });
  mgr.closeSession({ user: teacher, sessionId: 's1' });

  const res = mgr.getSessionSummary({ user: teacher, sessionId: 's1' });
  assert.equal(res.status, 200);
  assert.equal(res.session.status, 'closed');
  assert.equal(res.qr, null, 'QR must be hidden/null when session is closed');
});

test('4. Inaccessible session: students and unrelated teachers are rejected with 403', () => {
  const mgr = createProjectorManager();
  const teacher1 = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher 1' };
  const teacher2 = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher 2' };
  const student = { id: crypto.randomUUID(), role: 'student', name: 'Alice' };

  mgr.addUser(teacher1);
  mgr.addUser(teacher2);
  mgr.addUser(student);

  const sectionId = crypto.randomUUID();
  mgr.addSection({ id: sectionId, name: 'Grade 10 - A' });
  mgr.addPeriod({
    id: 'p1',
    sectionId,
    teacherId: teacher1.id,
    subject: 'Biology',
    startTime: new Date('2026-11-22T12:00:00Z'),
    endTime: new Date('2026-11-22T12:45:00Z'),
  });

  mgr.openSession({ id: 's1', periodId: 'p1' });

  // Unrelated teacher
  const teacher2Res = mgr.getSessionSummary({ user: teacher2, sessionId: 's1' });
  assert.equal(teacher2Res.status, 403);
  assert.match(teacher2Res.error, /only assigned teacher/i);

  // Student
  const studentRes = mgr.getSessionSummary({ user: student, sessionId: 's1' });
  assert.equal(studentRes.status, 403);
  assert.match(studentRes.error, /only assigned teacher/i);
});

test('5. Missing session returns 404', () => {
  const mgr = createProjectorManager();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher 1' };
  mgr.addUser(teacher);

  const res = mgr.getSessionSummary({ user: teacher, sessionId: 'nonexistent-session' });
  assert.equal(res.status, 404);
  assert.match(res.error, /not found/i);
});

test('6. Unauthenticated request returns 401', () => {
  const mgr = createProjectorManager();
  const res = mgr.getSessionSummary({ user: null, sessionId: 's1' });
  assert.equal(res.status, 401);
});

test('7. End-to-end check: Projector displays open QR, student scans from phone, teacher closes and QR is hidden', () => {
  const mgr = createProjectorManager();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher 1' };
  const student1 = { id: crypto.randomUUID(), role: 'student', name: 'Student 1' };
  const student2 = { id: crypto.randomUUID(), role: 'student', name: 'Student 2' };

  mgr.addUser(teacher);
  mgr.addUser(student1);
  mgr.addUser(student2);

  const sectionId = crypto.randomUUID();
  mgr.addSection({ id: sectionId, name: 'Grade 10 - A' });
  mgr.addPeriod({
    id: 'p1',
    sectionId,
    teacherId: teacher.id,
    subject: 'Literature',
    startTime: new Date('2026-11-22T13:00:00Z'),
    endTime: new Date('2026-11-22T13:45:00Z'),
  });

  // 1. Teacher opens session
  mgr.openSession({ id: 's1', periodId: 'p1' });
  mgr.addToRoster({ sessionId: 's1', studentId: student1.id, studentName: 'Student 1', studentEmail: 's1@school.edu' });
  mgr.addToRoster({ sessionId: 's1', studentId: student2.id, studentName: 'Student 2', studentEmail: 's2@school.edu' });

  // 2. Projector summary displays active QR
  const projector1 = mgr.getSessionSummary({ user: teacher, sessionId: 's1' });
  assert.equal(projector1.status, 200);
  assert.equal(projector1.session.status, 'open');
  assert.ok(projector1.qr?.code);
  assert.equal(projector1.summary.checkedInCount, 0);

  // 3. Student 1 scans code from phone
  const checkInRes = mgr.checkIn({
    user: student1,
    sessionId: 's1',
    code: projector1.qr.code,
  });
  assert.equal(checkInRes.status, 201);

  // 4. Projector count updates to 1 checked in
  const projector2 = mgr.getSessionSummary({ user: teacher, sessionId: 's1' });
  assert.equal(projector2.summary.checkedInCount, 1);
  assert.equal(projector2.summary.totalEnrolled, 2);
  assert.equal(projector2.summary.percentage, 50);

  // 5. Teacher closes session
  mgr.closeSession({ user: teacher, sessionId: 's1' });

  // 6. Projector reloads after closure: QR is hidden, final stats confirmed
  const projector3 = mgr.getSessionSummary({ user: teacher, sessionId: 's1' });
  assert.equal(projector3.session.status, 'closed');
  assert.equal(projector3.qr, null, 'QR must be completely removed after closure');
  assert.equal(projector3.summary.checkedInCount, 1);
  assert.equal(projector3.summary.absentCount, 1);
  assert.equal(projector3.summary.percentage, 50);

  // 7. Later scan from phone rejected
  const lateScan = mgr.checkIn({
    user: student2,
    sessionId: 's1',
    code: projector1.qr.code,
  });
  assert.equal(lateScan.status, 400);
});
