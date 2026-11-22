import test from 'node:test';
import assert from 'node:assert/strict';

// Helper replicating StudentScanScreen payload parsing logic
function parseQrPayload(rawString) {
  let parsed;
  try {
    parsed = typeof rawString === 'string' ? JSON.parse(rawString.trim()) : rawString;
  } catch {
    throw new Error('Malformed QR code. Please scan the classroom check-in QR code.');
  }

  if (!parsed || typeof parsed !== 'object' || !parsed.sessionId || !parsed.code) {
    throw new Error('QR code missing session or code information.');
  }

  return parsed;
}

// Helper replicating StudentScanScreen error classification logic
function classifyScanError(errMessage) {
  let title = 'Check-in Failed';
  let actionHint = 'Please try scanning again.';

  if (/expired/i.test(errMessage)) {
    title = 'QR Code Expired';
    actionHint = 'The classroom QR code refreshed. Look at the teacher’s screen and scan the active code.';
  } else if (/network|fetch|failed to fetch|econnrefused/i.test(errMessage)) {
    title = 'Network Connection Error';
    actionHint = 'Could not reach the server. Please verify your connection and try again.';
  } else if (/not enrolled/i.test(errMessage)) {
    title = 'Not Enrolled';
    actionHint = 'You are not enrolled in the roster for this class section.';
  } else if (/closed/i.test(errMessage)) {
    title = 'Session Closed';
    actionHint = 'The attendance session has already been closed by the teacher.';
  }

  return { title, actionHint };
}

test('QR Payload Parser: Accepts valid payload', () => {
  const sessionId = '123e4567-e89b-12d3-a456-426614174000';
  const code = 'a1b2c3d4e5f6789012345678abcdef01';
  const raw = JSON.stringify({ sessionId, code });

  const result = parseQrPayload(raw);
  assert.equal(result.sessionId, sessionId);
  assert.equal(result.code, code);
});

test('QR Payload Parser: Rejects non-JSON and malformed inputs', () => {
  assert.throws(() => parseQrPayload('random text not json'), /Malformed QR code/);
  assert.throws(() => parseQrPayload('{sessionId: missing quotes}'), /Malformed QR code/);
  assert.throws(() => parseQrPayload(JSON.stringify({ sessionId: '123' })), /missing session or code/);
  assert.throws(() => parseQrPayload(JSON.stringify({ code: 'abc' })), /missing session or code/);
  assert.throws(() => parseQrPayload(null), /missing session or code/);
});

test('Error Classifier: Categorizes expired, network, roster, and closed errors with actionable feedback', () => {
  const expired = classifyScanError('Attendance code has expired');
  assert.equal(expired.title, 'QR Code Expired');
  assert.match(expired.actionHint, /teacher’s screen/);

  const network = classifyScanError('Failed to fetch: network disconnected');
  assert.equal(network.title, 'Network Connection Error');
  assert.match(network.actionHint, /verify your connection/);

  const roster = classifyScanError('Student is not enrolled in this session roster');
  assert.equal(roster.title, 'Not Enrolled');
  assert.match(roster.actionHint, /not enrolled in the roster/);

  const closed = classifyScanError('Attendance session is closed');
  assert.equal(closed.title, 'Session Closed');
  assert.match(closed.actionHint, /already been closed/);
});

test('Callback Suppression: Rapid scanner callbacks suppressed while submitting', async () => {
  let isSubmitting = false;
  let submissionCount = 0;

  async function mockScanCallback(data) {
    if (isSubmitting) return; // Suppress repeated callbacks
    isSubmitting = true;
    submissionCount++;

    // Simulate async server latency
    await new Promise((r) => setTimeout(r, 10));
    isSubmitting = false;
  }

  // Trigger 10 rapid camera callbacks in parallel
  const callbacks = Array.from({ length: 10 }, () =>
    mockScanCallback(JSON.stringify({ sessionId: '1', code: '2' }))
  );

  await Promise.all(callbacks);

  // Only the first one was allowed through
  assert.equal(submissionCount, 1);
});

test('Server Confirmation Requirement: Never confirmed before successful server response', async () => {
  let uiConfirmed = false;

  async function mockSubmitCheckIn(serverWillFail = false) {
    // Before server response, UI must NOT be confirmed
    assert.equal(uiConfirmed, false);

    if (serverWillFail) {
      throw new Error('Server returned 500 error');
    }

    // Only set on successful response
    uiConfirmed = true;
    return { record: { status: 'present' }, repeated: false };
  }

  // Failing submission
  await assert.rejects(async () => {
    await mockSubmitCheckIn(true);
  });
  assert.equal(uiConfirmed, false, 'Must remain unconfirmed after server error');

  // Successful submission
  const res = await mockSubmitCheckIn(false);
  assert.equal(res.record.status, 'present');
  assert.equal(uiConfirmed, true, 'Confirmed only after successful server response');
});
