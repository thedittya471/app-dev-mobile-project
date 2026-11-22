import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function createPreferencesHarness() {
  const users = new Map();
  const profiles = new Map(); // studentId -> { careerGoal, interests, strengths, updatedAt }

  function addUser({ id, name, email, role }) {
    users.set(id, { id, name, email, role });
  }

  function normalizeTags(input) {
    if (!input) return [];
    const list = Array.isArray(input) ? input : String(input).split(',');
    const cleaned = list
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean);
    return Array.from(new Set(cleaned));
  }

  function getPreferences({ user, queryStudentId }) {
    if (!user) {
      return { status: 401, error: 'Unauthorized' };
    }

    if (user.role !== 'student') {
      return { status: 403, error: 'Access denied: only students have planning preferences' };
    }

    if (queryStudentId && queryStudentId !== user.id) {
      return { status: 403, error: 'Access denied: cannot read other students preferences' };
    }

    const studentId = user.id;
    const profile = profiles.get(studentId);

    if (!profile) {
      return {
        status: 200,
        studentId,
        careerGoal: '',
        interests: [],
        strengths: [],
        updatedAt: null,
      };
    }

    return {
      status: 200,
      studentId,
      careerGoal: profile.careerGoal || '',
      interests: profile.interests || [],
      strengths: profile.strengths || [],
      updatedAt: profile.updatedAt,
    };
  }

  function savePreferences({ user, body = {}, now = new Date() }) {
    if (!user) {
      return { status: 401, error: 'Unauthorized' };
    }

    if (user.role !== 'student') {
      return { status: 403, error: 'Access denied: only students can edit planning preferences' };
    }

    if (body.studentId && body.studentId !== user.id) {
      return { status: 403, error: 'Access denied: cannot edit other students preferences' };
    }

    const studentId = user.id;
    const careerGoal = body.careerGoal !== undefined ? String(body.careerGoal).trim() : '';
    const interests = normalizeTags(body.interests);
    const strengths = normalizeTags(body.strengths);

    const saved = {
      studentId,
      careerGoal,
      interests,
      strengths,
      updatedAt: now,
    };
    profiles.set(studentId, saved);

    return {
      status: 200,
      profile: saved,
      message: 'Planning preferences saved successfully',
    };
  }

  return {
    addUser,
    normalizeTags,
    getPreferences,
    savePreferences,
  };
}

test('1. Save preferences, reopen (get), and confirm they persist', () => {
  const h = createPreferencesHarness();
  const student = { id: crypto.randomUUID(), role: 'student', name: 'Alice', email: 'alice@school.edu' };
  h.addUser(student);

  // Initial read (empty profile)
  const initial = h.getPreferences({ user: student });
  assert.equal(initial.status, 200);
  assert.equal(initial.careerGoal, '');
  assert.deepEqual(initial.interests, []);
  assert.deepEqual(initial.strengths, []);

  // Save software development preferences
  const saveRes = h.savePreferences({
    user: student,
    body: {
      careerGoal: 'Software Development',
      interests: ['coding', 'robotics', 'algorithms'],
      strengths: ['problem-solving', 'logical thinking'],
    },
  });
  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.profile.careerGoal, 'Software Development');
  assert.deepEqual(saveRes.profile.interests, ['coding', 'robotics', 'algorithms']);
  assert.deepEqual(saveRes.profile.strengths, ['problem-solving', 'logical thinking']);

  // Reopen / fetch preferences
  const fetchRes = h.getPreferences({ user: student });
  assert.equal(fetchRes.status, 200);
  assert.equal(fetchRes.careerGoal, 'Software Development');
  assert.deepEqual(fetchRes.interests, ['coding', 'robotics', 'algorithms']);
  assert.deepEqual(fetchRes.strengths, ['problem-solving', 'logical thinking']);
  assert.ok(fetchRes.updatedAt);
});

test('2. Clear the fields and save again, confirming empty values persist', () => {
  const h = createPreferencesHarness();
  const student = { id: crypto.randomUUID(), role: 'student', name: 'Alice', email: 'alice@school.edu' };
  h.addUser(student);

  // Save non-empty preferences first
  h.savePreferences({
    user: student,
    body: {
      careerGoal: 'Data Scientist',
      interests: ['python', 'statistics'],
      strengths: ['analysis'],
    },
  });

  // Clear all fields and save
  const clearRes = h.savePreferences({
    user: student,
    body: {
      careerGoal: '',
      interests: [],
      strengths: [],
    },
  });
  assert.equal(clearRes.status, 200);
  assert.equal(clearRes.profile.careerGoal, '');
  assert.deepEqual(clearRes.profile.interests, []);
  assert.deepEqual(clearRes.profile.strengths, []);

  // Reopen and confirm fields are cleared
  const fetchRes = h.getPreferences({ user: student });
  assert.equal(fetchRes.status, 200);
  assert.equal(fetchRes.careerGoal, '');
  assert.deepEqual(fetchRes.interests, []);
  assert.deepEqual(fetchRes.strengths, []);
});

test('3. Verify another student cannot read or edit them', () => {
  const h = createPreferencesHarness();
  const studentA = { id: crypto.randomUUID(), role: 'student', name: 'Alice', email: 'alice@school.edu' };
  const studentB = { id: crypto.randomUUID(), role: 'student', name: 'Bob', email: 'bob@school.edu' };
  const teacher = { id: crypto.randomUUID(), role: 'teacher', name: 'Teacher', email: 'teacher@school.edu' };

  h.addUser(studentA);
  h.addUser(studentB);
  h.addUser(teacher);

  h.savePreferences({
    user: studentA,
    body: { careerGoal: 'Software Engineer', interests: ['coding'], strengths: ['logic'] },
  });

  // Student B attempting to read Student A's preferences
  const snoopGet = h.getPreferences({ user: studentB, queryStudentId: studentA.id });
  assert.equal(snoopGet.status, 403);
  assert.match(snoopGet.error, /cannot read other students/i);

  // Student B attempting to overwrite Student A's preferences
  const snoopPut = h.savePreferences({
    user: studentB,
    body: { studentId: studentA.id, careerGoal: 'Hacked' },
  });
  assert.equal(snoopPut.status, 403);
  assert.match(snoopPut.error, /cannot edit other students/i);

  // Teacher cannot read or edit student preferences
  const teacherGet = h.getPreferences({ user: teacher });
  assert.equal(teacherGet.status, 403);

  const teacherPut = h.savePreferences({ user: teacher, body: { careerGoal: 'Test' } });
  assert.equal(teacherPut.status, 403);

  // Unauthenticated requests
  assert.equal(h.getPreferences({ user: null }).status, 401);
  assert.equal(h.savePreferences({ user: null }).status, 401);
});

test('4. Optional fields and tag normalization', () => {
  const h = createPreferencesHarness();
  const student = { id: crypto.randomUUID(), role: 'student', name: 'Alice', email: 'alice@school.edu' };
  h.addUser(student);

  // Normalization: trim, lowercase, deduplicate, filter empty
  const saveRes = h.savePreferences({
    user: student,
    body: {
      careerGoal: '  Software Development  ',
      interests: ['  CODING  ', 'coding', 'Robotics', '', '   '],
      strengths: ' Problem-Solving , problem-solving, Creativity ',
    },
  });

  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.profile.careerGoal, 'Software Development');
  assert.deepEqual(saveRes.profile.interests, ['coding', 'robotics']);
  assert.deepEqual(saveRes.profile.strengths, ['problem-solving', 'creativity']);
});
