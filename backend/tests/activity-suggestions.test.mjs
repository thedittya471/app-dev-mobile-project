import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_CATALOG,
  suggestActivityForGap,
} from '../src/activities.js';
import {
  computeFreePeriods,
  createDateInTimezone,
} from '../src/freePeriods.js';

test('1. Software development profile with a 30-minute gap suggests matching 20-minute activity', () => {
  const suggestion = suggestActivityForGap({
    gapDurationMinutes: 30,
    careerGoal: 'Software Development',
    interests: ['coding', 'algorithms'],
    strengths: ['problem-solving'],
    catalog: ACTIVITY_CATALOG,
  });

  assert.ok(suggestion, 'Must provide an activity suggestion');
  assert.ok(suggestion.duration <= 30, 'Suggested activity duration must fit within 30 min gap');
  assert.equal(suggestion.duration, 20);
  assert.equal(suggestion.id, 'act-code-challenge');
  assert.equal(suggestion.title, 'Solve Python Algorithm Challenge');
  assert.ok(suggestion.tags.includes('software development'));
  assert.ok(suggestion.tags.includes('coding'));
  assert.ok(suggestion.matchScore > 0);
});

test('2. Empty preferences use a general activity', () => {
  const suggestion = suggestActivityForGap({
    gapDurationMinutes: 30,
    careerGoal: '',
    interests: [],
    strengths: [],
    catalog: ACTIVITY_CATALOG,
  });

  assert.ok(suggestion, 'Empty preferences must return a fitting general task');
  assert.ok(suggestion.duration <= 30, 'Duration must fit within gap');
  assert.equal(suggestion.isGeneral, true, 'Must select a general task when preferences are empty');
  assert.ok(
    ['act-organize-tasks', 'act-review-notes', 'act-flashcards'].includes(suggestion.id),
    `Selected general task ${suggestion.id}`
  );
});

test('3. A short gap stays free when no activity fits', () => {
  // Shortest activity in ACTIVITY_CATALOG is 15 minutes.
  // A 10-minute gap should have no fitting activities and stay free.
  const suggestion = suggestActivityForGap({
    gapDurationMinutes: 10,
    careerGoal: 'Software Development',
    interests: ['coding'],
    strengths: ['problem-solving'],
    catalog: ACTIVITY_CATALOG,
  });

  assert.equal(suggestion, null, 'Short gap (10 min) must return null to leave the gap free');
});

test('4. Activities longer than gap duration are filtered out', () => {
  // Deep focus study is 45 min, analyze dataset is 35 min
  // In a 20-minute gap, only <= 20 min activities can appear
  const suggestion = suggestActivityForGap({
    gapDurationMinutes: 20,
    careerGoal: 'Data Science',
    interests: ['statistics', 'python'],
    strengths: ['analysis'],
    catalog: ACTIVITY_CATALOG,
  });

  assert.ok(suggestion);
  assert.ok(suggestion.duration <= 20, 'Duration must be <= 20 min');
});

test('5. Ranking prioritizes career goal and specific interests over general tasks', () => {
  const suggestion = suggestActivityForGap({
    gapDurationMinutes: 35,
    careerGoal: 'Robotics Engineer',
    interests: ['robotics', 'hardware'],
    strengths: ['engineering'],
    catalog: ACTIVITY_CATALOG,
  });

  assert.ok(suggestion);
  assert.equal(suggestion.id, 'act-robotics-circuit');
  assert.equal(suggestion.title, 'Microcontroller Circuit Simulation');
  assert.equal(suggestion.isGeneral, false);
});

test('6. computeFreePeriods integrates with preferences and attaches suggestions', () => {
  const dateStr = '2026-11-22';
  const timezone = 'America/New_York';
  const schoolDayStart = '09:00';
  const schoolDayEnd = '17:00';

  // Class 1: 09:30 - 10:30
  // Class 2: 11:30 - 12:30
  const c1Start = createDateInTimezone(dateStr, '09:30', timezone);
  const c1End = createDateInTimezone(dateStr, '10:30', timezone);
  const c2Start = createDateInTimezone(dateStr, '11:30', timezone);
  const c2End = createDateInTimezone(dateStr, '12:30', timezone);

  const classes = [
    { id: 'c1', subject: 'Database Systems', startTime: c1Start.toISOString(), endTime: c1End.toISOString() },
    { id: 'c2', subject: 'Mobile App Dev', startTime: c2Start.toISOString(), endTime: c2End.toISOString() },
  ];

  const preferences = {
    careerGoal: 'Software Development',
    interests: ['coding', 'algorithms'],
    strengths: ['problem-solving'],
  };

  const freePeriods = computeFreePeriods({
    classes,
    schoolDayStart,
    schoolDayEnd,
    timezone,
    dateStr,
    preferences,
  });

  assert.equal(freePeriods.length, 3);

  // 1st gap: 09:00 - 09:30 (30 min) -> matches 20-min software development activity
  assert.ok(freePeriods[0].suggestion);
  assert.equal(freePeriods[0].suggestion.duration, 20);
  assert.equal(freePeriods[0].suggestion.id, 'act-code-challenge');

  // 2nd gap: 10:30 - 11:30 (60 min) -> suggests another software development task (act-code-debug, 30 min)
  assert.ok(freePeriods[1].suggestion);
  assert.ok(freePeriods[1].suggestion.duration <= 60);

  // 3rd gap: 12:30 - 17:00 (270 min) -> suggests study task
  assert.ok(freePeriods[2].suggestion);
});
