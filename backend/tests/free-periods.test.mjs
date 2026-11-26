import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFreePeriods,
  createDateInTimezone,
  formatDuration,
} from '../src/freePeriods.js';

test('1. Compute free periods before, between, and after classes within school hours', () => {
  const dateStr = '2026-11-22';
  const timezone = 'America/New_York';
  const schoolDayStart = '09:00';
  const schoolDayEnd = '17:00';

  // Seeded scenario:
  // Class 1: 09:30 - 10:30
  // Class 2: 11:30 - 12:30
  const class1Start = createDateInTimezone(dateStr, '09:30', timezone);
  const class1End = createDateInTimezone(dateStr, '10:30', timezone);
  const class2Start = createDateInTimezone(dateStr, '11:30', timezone);
  const class2End = createDateInTimezone(dateStr, '12:30', timezone);

  const classes = [
    { id: 'c1', subject: 'Database Systems', startTime: class1Start.toISOString(), endTime: class1End.toISOString() },
    { id: 'c2', subject: 'Mobile App Dev', startTime: class2Start.toISOString(), endTime: class2End.toISOString() },
  ];

  const freePeriods = computeFreePeriods({
    classes,
    schoolDayStart,
    schoolDayEnd,
    timezone,
    dateStr,
  });

  assert.equal(freePeriods.length, 3);

  // Gap 1: Before classes (09:00 - 09:30, 30 min)
  assert.equal(freePeriods[0].formattedTime, '9:00 AM - 9:30 AM');
  assert.equal(freePeriods[0].durationMinutes, 30);
  assert.equal(freePeriods[0].durationFormatted, '30 min');

  // Gap 2: Between classes (10:30 - 11:30, 60 min)
  assert.equal(freePeriods[1].formattedTime, '10:30 AM - 11:30 AM');
  assert.equal(freePeriods[1].durationMinutes, 60);
  assert.equal(freePeriods[1].durationFormatted, '1 hr');

  // Gap 3: After classes (12:30 - 17:00, 270 min)
  assert.equal(freePeriods[2].formattedTime, '12:30 PM - 5:00 PM');
  assert.equal(freePeriods[2].durationMinutes, 270);
  assert.equal(freePeriods[2].durationFormatted, '4 hr 30 min');
});

test('2. Adjacent / back-to-back classes do not create invalid gaps', () => {
  const dateStr = '2026-11-22';
  const timezone = 'America/New_York';
  const schoolDayStart = '09:00';
  const schoolDayEnd = '17:00';

  // Class 1: 09:00 - 10:00
  // Class 2: 10:00 - 11:00 (back-to-back)
  // Class 3: 11:00 - 12:00 (back-to-back)
  const c1Start = createDateInTimezone(dateStr, '09:00', timezone);
  const c1End = createDateInTimezone(dateStr, '10:00', timezone);
  const c2Start = createDateInTimezone(dateStr, '10:00', timezone);
  const c2End = createDateInTimezone(dateStr, '11:00', timezone);
  const c3Start = createDateInTimezone(dateStr, '11:00', timezone);
  const c3End = createDateInTimezone(dateStr, '12:00', timezone);

  const classes = [
    { id: 'c1', subject: 'Math', startTime: c1Start.toISOString(), endTime: c1End.toISOString() },
    { id: 'c2', subject: 'Physics', startTime: c2Start.toISOString(), endTime: c2End.toISOString() },
    { id: 'c3', subject: 'Chemistry', startTime: c3Start.toISOString(), endTime: c3End.toISOString() },
  ];

  const freePeriods = computeFreePeriods({
    classes,
    schoolDayStart,
    schoolDayEnd,
    timezone,
    dateStr,
  });

  // No gap before (starts at 09:00), no gaps between (adjacent), only gap after 12:00 - 17:00
  assert.equal(freePeriods.length, 1);
  assert.equal(freePeriods[0].formattedTime, '12:00 PM - 5:00 PM');
  assert.equal(freePeriods[0].durationMinutes, 300);
  assert.equal(freePeriods[0].durationFormatted, '5 hr');
});

test('3. Overlapping classes do not create invalid gaps and merge correctly', () => {
  const dateStr = '2026-11-22';
  const timezone = 'America/New_York';
  const schoolDayStart = '09:00';
  const schoolDayEnd = '17:00';

  // Class 1: 10:00 - 11:15
  // Class 2: 10:45 - 12:00 (overlapping)
  const c1Start = createDateInTimezone(dateStr, '10:00', timezone);
  const c1End = createDateInTimezone(dateStr, '11:15', timezone);
  const c2Start = createDateInTimezone(dateStr, '10:45', timezone);
  const c2End = createDateInTimezone(dateStr, '12:00', timezone);

  const classes = [
    { id: 'c1', subject: 'Lab A', startTime: c1Start.toISOString(), endTime: c1End.toISOString() },
    { id: 'c2', subject: 'Lab B', startTime: c2Start.toISOString(), endTime: c2End.toISOString() },
  ];

  const freePeriods = computeFreePeriods({
    classes,
    schoolDayStart,
    schoolDayEnd,
    timezone,
    dateStr,
  });

  // Gap 1: 09:00 - 10:00 (60 min)
  // No gap between 10:00 and 12:00
  // Gap 2: 12:00 - 17:00 (300 min)
  assert.equal(freePeriods.length, 2);
  assert.equal(freePeriods[0].formattedTime, '9:00 AM - 10:00 AM');
  assert.equal(freePeriods[1].formattedTime, '12:00 PM - 5:00 PM');
});

test('4. Classes outside school day hours do not schedule activities outside boundaries', () => {
  const dateStr = '2026-11-22';
  const timezone = 'America/New_York';
  const schoolDayStart = '09:00';
  const schoolDayEnd = '17:00';

  // Early class: 08:00 - 09:30 (starts before schoolDayStart)
  // Late class: 16:30 - 18:00 (ends after schoolDayEnd)
  const c1Start = createDateInTimezone(dateStr, '08:00', timezone);
  const c1End = createDateInTimezone(dateStr, '09:30', timezone);
  const c2Start = createDateInTimezone(dateStr, '16:30', timezone);
  const c2End = createDateInTimezone(dateStr, '18:00', timezone);

  const classes = [
    { id: 'c1', subject: 'Early Bird', startTime: c1Start.toISOString(), endTime: c1End.toISOString() },
    { id: 'c2', subject: 'Late Night', startTime: c2Start.toISOString(), endTime: c2End.toISOString() },
  ];

  const freePeriods = computeFreePeriods({
    classes,
    schoolDayStart,
    schoolDayEnd,
    timezone,
    dateStr,
  });

  // Only gap between 09:30 and 16:30 is allowed. No gap before 09:00 or after 17:00!
  assert.equal(freePeriods.length, 1);
  assert.equal(freePeriods[0].formattedTime, '9:30 AM - 4:30 PM');
  assert.equal(freePeriods[0].durationMinutes, 420);
});

test('5. Empty day preserves empty state and returns zero free periods', () => {
  const dateStr = '2026-11-20';
  const timezone = 'America/New_York';

  const freePeriods = computeFreePeriods({
    classes: [],
    schoolDayStart: '09:00',
    schoolDayEnd: '17:00',
    timezone,
    dateStr,
  });

  assert.deepEqual(freePeriods, [], 'Empty day must return empty array to preserve empty-day state');
});

test('6. Duration formatter formats hours and minutes', () => {
  assert.equal(formatDuration(20), '20 min');
  assert.equal(formatDuration(60), '1 hr');
  assert.equal(formatDuration(90), '1 hr 30 min');
  assert.equal(formatDuration(270), '4 hr 30 min');
});

test('Free periods only count whole minutes that fit before the next class', () => {
  const [gap] = computeFreePeriods({
    classes: [{
      startTime: '2026-11-26T09:09:45+05:30',
      endTime: '2026-11-26T10:00:00+05:30',
    }],
    schoolDayStart: '09:00',
    schoolDayEnd: '10:00',
    timezone: 'Asia/Kolkata',
    dateStr: '2026-11-26',
  });
  assert.equal(gap.durationMinutes, 9);
  assert.ok(!gap.suggestion || gap.suggestion.duration <= gap.durationMinutes);
});
