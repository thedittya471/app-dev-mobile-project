import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function createProjectorHarness() {
  const sessions = new Map();
  const periods = new Map();
  const sections = new Map();
  const users = new Map();
  const sessionRosters = new Map(); // `${sessionId}:${studentId}`
  const codes = new Map();
  const attendanceRecords = new Map();

  let networkFailing = false;

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
    for (const [key, roster] of sessionRosters.entries()) {
      if (key.startsWith(`${sessionId}:`) && roster.status === 'pending') {
        roster.status = 'absent';
      }
    }
    for (const c of codes.values()) {
      if (c.sessionId === sessionId) c.expiresAt = now;
    }
    return { status: 200, message: 'Session closed' };
  }

  function setNetworkFailing(val) {
    networkFailing = val;
  }

  function pollSummary({ user, sessionId, now = new Date() }) {
    if (networkFailing) {
      const err = new Error('Network request failed: ECONNRESET');
      err.status = 503;
      throw err;
    }

    if (!user) return { status: 401, error: 'Unauthorized' };
    const session = sessions.get(sessionId);
    if (!session) return { status: 404, error: 'Session not found' };
    const period = periods.get(session.periodId);
    if (!period || user.role !== 'teacher' || period.teacherId !== user.id) {
      return { status: 403, error: 'Access denied' };
    }

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
        status: session.status,
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

  // Client-side simulation of ProjectorScreen polling & network-interrupted logic
  function createClientProjectorSession({ user, sessionId }) {
    let currentData = null;
    let networkInterrupted = false;
    let pollingActive = false;
    let pollInterval = null;

    function startPolling(nowFn = () => new Date()) {
      pollingActive = true;
      // Immediate first fetch
      try {
        currentData = pollSummary({ user, sessionId, now: nowFn() });
        networkInterrupted = false;
      } catch {
        networkInterrupted = true;
      }

      // Start interval
      pollInterval = {
        tick: (now = nowFn()) => {
          if (!pollingActive || currentData?.session?.status === 'closed') return;
          try {
            currentData = pollSummary({ user, sessionId, now });
            networkInterrupted = false;
          } catch {
            networkInterrupted = true;
          }
        },
      };
    }

    function stopPolling() {
      pollingActive = false;
      pollInterval = null;
    }

    function getDisplayState(now = new Date()) {
      if (!currentData) return { isReady: false };
      const isClosed = currentData.session.status === 'closed';
      const qr = currentData.qr;
      const isQrExpired = !qr || (qr.expiresAt && new Date(qr.expiresAt) <= now);

      // Rule: if network fails and QR is expired, hide expired QR while retrying
      const showQr = !isClosed && qr && !(networkInterrupted && isQrExpired) && !isQrExpired;
      const hideExpiredQr = networkInterrupted && isQrExpired;

      return {
        isReady: true,
        isClosed,
        networkInterrupted,
        showQr,
        hideExpiredQr,
        activeCode: showQr ? qr?.code : null,
        checkedInCount: currentData.summary.checkedInCount,
        totalEnrolled: currentData.summary.totalEnrolled,
        percentage: currentData.summary.percentage,
        pollingActive,
      };
    }

    return {
      startPolling,
      stopPolling,
      tick: (now) => pollInterval?.tick(now),
      getDisplayState,
    };
  }

  return {
    addUser,
    addSection,
    addPeriod,
    openSession,
    addToRoster,
    checkIn,
    closeSession,
    setNetworkFailing,
    pollSummary,
    createClientProjectorSession,
  };
}

test('1. Projected count updates within one polling cycle after student scan', () => {
  const h = createProjectorHarness();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher 1' };
  const student1 = { id: crypto.randomUUID(), role: 'student', name: 'Student 1' };
  const student2 = { id: crypto.randomUUID(), role: 'student', name: 'Student 2' };

  h.addUser(teacher);
  h.addUser(student1);
  h.addUser(student2);

  const sectionId = crypto.randomUUID();
  h.addSection({ id: sectionId, name: 'Grade 10 - A' });
  h.addPeriod({
    id: 'p1',
    sectionId,
    teacherId: teacher.id,
    subject: 'Math',
    startTime: new Date('2026-11-22T09:00:00Z'),
    endTime: new Date('2026-11-22T09:45:00Z'),
  });

  h.openSession({ id: 's1', periodId: 'p1' });
  h.addToRoster({ sessionId: 's1', studentId: student1.id, studentName: student1.name, studentEmail: 's1@school.edu' });
  h.addToRoster({ sessionId: 's1', studentId: student2.id, studentName: student2.name, studentEmail: 's2@school.edu' });

  const client = h.createClientProjectorSession({ user: teacher, sessionId: 's1' });
  client.startPolling();

  // Before student check-in
  let state = client.getDisplayState();
  assert.equal(state.checkedInCount, 0);
  assert.equal(state.totalEnrolled, 2);
  assert.equal(state.percentage, 0);
  assert.ok(state.showQr);

  // Student 1 scans projected QR
  const scanResult = h.checkIn({
    user: student1,
    sessionId: 's1',
    code: state.activeCode,
  });
  assert.equal(scanResult.status, 201);

  // One polling tick occurs (3 seconds later)
  client.tick();

  // Projected count updates to 1 / 2 (50%)
  state = client.getDisplayState();
  assert.equal(state.checkedInCount, 1);
  assert.equal(state.totalEnrolled, 2);
  assert.equal(state.percentage, 50);
});

test('2. Automatic QR refresh occurs when code expires', () => {
  const h = createProjectorHarness();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher 1' };
  h.addUser(teacher);

  const sectionId = crypto.randomUUID();
  h.addSection({ id: sectionId, name: 'Grade 10 - A' });
  h.addPeriod({ id: 'p1', sectionId, teacherId: teacher.id, subject: 'Math', startTime: new Date(), endTime: new Date(Date.now() + 3600000) });
  h.openSession({ id: 's1', periodId: 'p1' });

  let simTime = new Date('2026-11-22T10:00:00Z');
  const client = h.createClientProjectorSession({ user: teacher, sessionId: 's1' });
  client.startPolling(() => simTime);

  const initialCode = client.getDisplayState(simTime).activeCode;
  assert.ok(initialCode);

  // Advance time past 20s TTL (e.g. 25 seconds later)
  simTime = new Date('2026-11-22T10:00:25Z');
  client.tick(simTime);

  const refreshedCode = client.getDisplayState(simTime).activeCode;
  assert.ok(refreshedCode);
  assert.notEqual(refreshedCode, initialCode, 'Expired code must be refreshed automatically');
});

test('3. Session closure automatically removes QR code from projector', () => {
  const h = createProjectorHarness();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher 1' };
  h.addUser(teacher);

  const sectionId = crypto.randomUUID();
  h.addSection({ id: sectionId, name: 'Grade 10 - A' });
  h.addPeriod({ id: 'p1', sectionId, teacherId: teacher.id, subject: 'Science', startTime: new Date(), endTime: new Date(Date.now() + 3600000) });
  h.openSession({ id: 's1', periodId: 'p1' });

  const client = h.createClientProjectorSession({ user: teacher, sessionId: 's1' });
  client.startPolling();

  assert.equal(client.getDisplayState().isClosed, false);
  assert.ok(client.getDisplayState().showQr);

  // Teacher closes session
  h.closeSession({ user: teacher, sessionId: 's1' });

  // Polling cycle runs
  client.tick();

  const closedState = client.getDisplayState();
  assert.equal(closedState.isClosed, true);
  assert.equal(closedState.showQr, false, 'QR must be removed after session closure');
});

test('4. Network failure indicates interruption and hides expired QR while retrying', () => {
  const h = createProjectorHarness();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher 1' };
  h.addUser(teacher);

  const sectionId = crypto.randomUUID();
  h.addSection({ id: sectionId, name: 'Grade 10 - A' });
  h.addPeriod({ id: 'p1', sectionId, teacherId: teacher.id, subject: 'English', startTime: new Date(), endTime: new Date(Date.now() + 3600000) });
  h.openSession({ id: 's1', periodId: 'p1' });

  let simTime = new Date('2026-11-22T11:00:00Z');
  const client = h.createClientProjectorSession({ user: teacher, sessionId: 's1' });
  client.startPolling(() => simTime);

  assert.equal(client.getDisplayState(simTime).networkInterrupted, false);
  assert.equal(client.getDisplayState(simTime).showQr, true);

  // Network drops
  h.setNetworkFailing(true);

  // Poll attempt fails
  client.tick(simTime);
  let state = client.getDisplayState(simTime);
  assert.equal(state.networkInterrupted, true, 'Must indicate update was interrupted');
  // While QR is still unexpired, it can remain visible briefly
  assert.equal(state.showQr, true);
  assert.equal(state.hideExpiredQr, false);

  // Now time advances 30s so the QR is definitely expired while network is still failing
  simTime = new Date('2026-11-22T11:00:30Z');
  client.tick(simTime);

  state = client.getDisplayState(simTime);
  assert.equal(state.networkInterrupted, true);
  assert.equal(state.showQr, false, 'Expired QR must be hidden while network is failing');
  assert.equal(state.hideExpiredQr, true, 'Must activate hideExpiredQr placeholder state');

  // Network recovers
  h.setNetworkFailing(false);
  client.tick(simTime);

  state = client.getDisplayState(simTime);
  assert.equal(state.networkInterrupted, false);
  assert.equal(state.showQr, true, 'Fresh QR must be shown when network recovers');
  assert.equal(state.hideExpiredQr, false);
});

test('5. Polling is cancelled when leaving the page', () => {
  const h = createProjectorHarness();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher 1' };
  h.addUser(teacher);

  const sectionId = crypto.randomUUID();
  h.addSection({ id: sectionId, name: 'Grade 10 - A' });
  h.addPeriod({ id: 'p1', sectionId, teacherId: teacher.id, subject: 'History', startTime: new Date(), endTime: new Date(Date.now() + 3600000) });
  h.openSession({ id: 's1', periodId: 'p1' });

  const client = h.createClientProjectorSession({ user: teacher, sessionId: 's1' });
  client.startPolling();
  assert.equal(client.getDisplayState().pollingActive, true);

  // User navigates away / leaves page
  client.stopPolling();
  assert.equal(client.getDisplayState().pollingActive, false);
});

test('6. Summary payload strictly omits individual student data across multiple polls', () => {
  const h = createProjectorHarness();
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher 1' };
  const student = { id: crypto.randomUUID(), role: 'student', name: 'Alice Confidential', email: 'alice.private@school.edu' };

  h.addUser(teacher);
  h.addUser(student);

  const sectionId = crypto.randomUUID();
  h.addSection({ id: sectionId, name: 'Grade 10 - A' });
  h.addPeriod({ id: 'p1', sectionId, teacherId: teacher.id, subject: 'Privacy Law', startTime: new Date(), endTime: new Date(Date.now() + 3600000) });
  h.openSession({ id: 's1', periodId: 'p1' });
  h.addToRoster({ sessionId: 's1', studentId: student.id, studentName: student.name, studentEmail: student.email });

  for (let i = 0; i < 3; i++) {
    const res = h.pollSummary({ user: teacher, sessionId: 's1' });
    const payloadStr = JSON.stringify(res);

    assert.ok(!payloadStr.includes('Alice Confidential'), `Poll #${i} leaked student name`);
    assert.ok(!payloadStr.includes('alice.private@school.edu'), `Poll #${i} leaked student email`);
    assert.ok(!payloadStr.includes(student.id), `Poll #${i} leaked student ID`);
    assert.equal(res.roster, undefined);
    assert.equal(res.students, undefined);
  }
});
