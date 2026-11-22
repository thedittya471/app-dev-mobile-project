export function formatTimeInTimezone(dateObj, timezone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateObj));
}

export function createDateInTimezone(dateStr, timeStr, timezone = 'America/New_York') {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, min] = timeStr.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, min, 0));

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(utcGuess);

  const p = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }

  const formattedHour = p.hour === '24' ? 0 : parseInt(p.hour, 10);
  const formattedDate = new Date(Date.UTC(
    parseInt(p.year, 10),
    parseInt(p.month, 10) - 1,
    parseInt(p.day, 10),
    formattedHour,
    parseInt(p.minute, 10),
    parseInt(p.second, 10)
  ));

  const offsetMs = utcGuess.getTime() - formattedDate.getTime();
  return new Date(utcGuess.getTime() + offsetMs);
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours} hr`;
  return `${hours} hr ${remaining} min`;
}

export function computeFreePeriods({
  classes = [],
  schoolDayStart = '09:00',
  schoolDayEnd = '17:00',
  timezone = 'America/New_York',
  dateStr,
}) {
  // Preserve empty-day state when no classes are scheduled
  if (!classes || classes.length === 0 || !dateStr) {
    return [];
  }

  const schoolBoundaryStart = createDateInTimezone(dateStr, schoolDayStart, timezone);
  const schoolBoundaryEnd = createDateInTimezone(dateStr, schoolDayEnd, timezone);

  if (schoolBoundaryEnd.getTime() <= schoolBoundaryStart.getTime()) {
    return [];
  }

  // Clip classes to school day boundaries
  const intervals = [];
  for (const c of classes) {
    const start = new Date(c.startTime).getTime();
    const end = new Date(c.endTime).getTime();
    const effectiveStart = Math.max(start, schoolBoundaryStart.getTime());
    const effectiveEnd = Math.min(end, schoolBoundaryEnd.getTime());
    if (effectiveEnd > effectiveStart) {
      intervals.push({ start: effectiveStart, end: effectiveEnd });
    }
  }

  intervals.sort((a, b) => a.start - b.start);

  // Merge overlapping and back-to-back classes so they do not create invalid gaps
  const merged = [];
  for (const int of intervals) {
    if (merged.length === 0) {
      merged.push({ start: int.start, end: int.end });
    } else {
      const prev = merged[merged.length - 1];
      if (int.start <= prev.end) {
        prev.end = Math.max(prev.end, int.end);
      } else {
        merged.push({ start: int.start, end: int.end });
      }
    }
  }

  const freePeriods = [];
  let cursor = schoolBoundaryStart.getTime();

  for (const occ of merged) {
    if (occ.start > cursor) {
      const gapStart = new Date(cursor);
      const gapEnd = new Date(occ.start);
      const durationMinutes = Math.round((gapEnd.getTime() - gapStart.getTime()) / 60000);
      if (durationMinutes > 0) {
        freePeriods.push({
          type: 'free',
          id: `free-${gapStart.getTime()}`,
          startTime: gapStart.toISOString(),
          endTime: gapEnd.toISOString(),
          startTimeFormatted: formatTimeInTimezone(gapStart, timezone),
          endTimeFormatted: formatTimeInTimezone(gapEnd, timezone),
          formattedTime: `${formatTimeInTimezone(gapStart, timezone)} - ${formatTimeInTimezone(gapEnd, timezone)}`,
          durationMinutes,
          durationFormatted: formatDuration(durationMinutes),
        });
      }
    }
    cursor = Math.max(cursor, occ.end);
  }

  // Gap after last class until schoolDayEnd
  if (cursor < schoolBoundaryEnd.getTime()) {
    const gapStart = new Date(cursor);
    const gapEnd = new Date(schoolBoundaryEnd.getTime());
    const durationMinutes = Math.round((gapEnd.getTime() - gapStart.getTime()) / 60000);
    if (durationMinutes > 0) {
      freePeriods.push({
        type: 'free',
        id: `free-${gapStart.getTime()}`,
        startTime: gapStart.toISOString(),
        endTime: gapEnd.toISOString(),
        startTimeFormatted: formatTimeInTimezone(gapStart, timezone),
        endTimeFormatted: formatTimeInTimezone(gapEnd, timezone),
        formattedTime: `${formatTimeInTimezone(gapStart, timezone)} - ${formatTimeInTimezone(gapEnd, timezone)}`,
        durationMinutes,
        durationFormatted: formatDuration(durationMinutes),
      });
    }
  }

  return freePeriods;
}
