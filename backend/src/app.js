import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { eq, and, inArray, asc, desc, gt } from 'drizzle-orm';
import { checkDbConnection, db } from './db/index.js';
import {
  users,
  sections,
  enrollments,
  periods,
  attendanceSessions,
  sessionRosters,
  attendanceCodes,
  attendanceRecords,
  studentProfiles,
} from './db/schema.js';
import {
  verifyPassword,
  createSession,
  deleteSession,
  requireAuth,
} from './auth.js';
import { computeFreePeriods } from './freePeriods.js';

export const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:8081', 'http://127.0.0.1:8081'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(express.json());

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
app.param('id', (req, res, next, id) => {
  if (!UUID_PATTERN.test(id)) return res.status(404).json({ error: 'Resource not found' });
  next();
});

function getDateInTimezone(dateObj, timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(dateObj));
}

function resolveScheduleDate(filterDate, today) {
  if (filterDate !== 'tomorrow') return !filterDate || filterDate === 'today' ? today : filterDate;
  const nextDay = new Date(`${today}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.toISOString().slice(0, 10);
}

function formatTimeInTimezone(dateObj, timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateObj));
}

// Health check
app.get('/health', async (req, res) => {
  try {
    await checkDbConnection();
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected', message: err.message });
  }
});

// Authentication endpoints
app.post('/auth/sign-in', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const rows = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const isValid = verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionToken = await createSession(user.id);
    res.status(200).json({
      sessionToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Sign-in failed:', error.message);
    res.status(503).json({ error: 'Sign-in service is temporarily unavailable' });
  }
});

app.get('/auth/me', requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

app.post('/auth/sign-out', requireAuth, async (req, res) => {
  try {
    await deleteSession(req.sessionToken);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Sign-out failed:', error.message);
    res.status(503).json({ error: 'Sign-in service is temporarily unavailable' });
  }
});

// Explicit guard: users cannot change their role through the API
app.all(['/auth/role', '/users/role'], requireAuth, (req, res) => {
  res.status(403).json({ error: 'Role modification forbidden' });
});

// Timetable and Schedule endpoints
app.get('/schedule', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const filterDate = req.query.date;

    if (filterDate !== undefined && (
      typeof filterDate !== 'string' ||
      (!['today', 'tomorrow'].includes(filterDate) &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(filterDate) ||
          Number.isNaN(Date.parse(filterDate)) ||
          new Date(filterDate).toISOString().slice(0, 10) !== filterDate))
    )) {
      return res.status(400).json({ error: 'Use today, tomorrow, or a date in YYYY-MM-DD format' });
    }

    let results = [];

    if (user.role === 'teacher') {
      results = await db
        .select({
          id: periods.id,
          subject: periods.subject,
          startTime: periods.startTime,
          endTime: periods.endTime,
          sectionId: sections.id,
          sectionName: sections.name,
          timezone: sections.timezone,
          schoolDayStart: sections.schoolDayStart,
          schoolDayEnd: sections.schoolDayEnd,
          teacherId: periods.teacherId,
          teacherName: users.name,
        })
        .from(periods)
        .innerJoin(sections, eq(periods.sectionId, sections.id))
        .innerJoin(users, eq(periods.teacherId, users.id))
        .where(eq(periods.teacherId, user.id))
        .orderBy(asc(periods.startTime));
    } else {
      const enrolledSections = await db
        .select({ sectionId: enrollments.sectionId })
        .from(enrollments)
        .where(eq(enrollments.studentId, user.id));

      if (enrolledSections.length === 0) {
        const institutionDate = getDateInTimezone(new Date());
        return res.status(200).json({
          schedule: [],
          timeline: [],
          freePeriods: [],
          institutionDate,
          scheduleDate: resolveScheduleDate(filterDate, institutionDate),
          institutionTimezone: 'Asia/Kolkata',
        });
      }

      const sectionIds = enrolledSections.map((e) => e.sectionId);
      results = await db
        .select({
          id: periods.id,
          subject: periods.subject,
          startTime: periods.startTime,
          endTime: periods.endTime,
          sectionId: sections.id,
          sectionName: sections.name,
          timezone: sections.timezone,
          schoolDayStart: sections.schoolDayStart,
          schoolDayEnd: sections.schoolDayEnd,
          teacherId: periods.teacherId,
          teacherName: users.name,
        })
        .from(periods)
        .innerJoin(sections, eq(periods.sectionId, sections.id))
        .innerJoin(users, eq(periods.teacherId, users.id))
        .where(inArray(periods.sectionId, sectionIds))
        .orderBy(asc(periods.startTime));
    }

    const institutionTimezone = results[0]?.timezone || 'Asia/Kolkata';
    const institutionToday = getDateInTimezone(new Date(), institutionTimezone);
    const schoolDayStart = results[0]?.schoolDayStart || '09:00';
    const schoolDayEnd = results[0]?.schoolDayEnd || '17:00';

    let mapped = results.map((p) => {
      const periodTimezone = p.timezone || institutionTimezone;
      const periodDate = getDateInTimezone(p.startTime, periodTimezone);
      const startFormatted = formatTimeInTimezone(p.startTime, periodTimezone);
      const endFormatted = formatTimeInTimezone(p.endTime, periodTimezone);
      return {
        ...p,
        type: 'class',
        periodDate,
        formattedTime: `${startFormatted} - ${endFormatted}`,
        startTimeFormatted: startFormatted,
        endTimeFormatted: endFormatted,
      };
    });

    const targetDate = resolveScheduleDate(filterDate, institutionToday);

    if (filterDate) {
      mapped = mapped.filter((p) => p.periodDate === targetDate);
    }

    let studentPrefs = null;
    if (user.role === 'student') {
      const profileRows = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.studentId, user.id));
      if (profileRows.length > 0) {
        studentPrefs = {
          careerGoal: profileRows[0].careerGoal || '',
          interests: profileRows[0].interests || [],
          strengths: profileRows[0].strengths || [],
        };
      }
    }

    const freePeriods = computeFreePeriods({
      classes: mapped,
      schoolDayStart,
      schoolDayEnd,
      timezone: institutionTimezone,
      dateStr: targetDate,
      preferences: studentPrefs,
    });

    const timeline = [...mapped, ...freePeriods].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    res.status(200).json({
      schedule: mapped,
      freePeriods,
      timeline,
      institutionDate: institutionToday,
      scheduleDate: targetDate,
      institutionTimezone,
      schoolDayStart,
      schoolDayEnd,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/schedule/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const rows = await db
      .select({
        id: periods.id,
        subject: periods.subject,
        startTime: periods.startTime,
        endTime: periods.endTime,
        sectionId: sections.id,
        sectionName: sections.name,
        timezone: sections.timezone,
        schoolDayStart: sections.schoolDayStart,
        schoolDayEnd: sections.schoolDayEnd,
        teacherId: periods.teacherId,
        teacherName: users.name,
      })
      .from(periods)
      .innerJoin(sections, eq(periods.sectionId, sections.id))
      .innerJoin(users, eq(periods.teacherId, users.id))
      .where(eq(periods.id, id));

    if (!rows.length) {
      return res.status(404).json({ error: 'Period not found' });
    }

    const period = rows[0];

    if (user.role === 'teacher') {
      if (period.teacherId !== user.id) {
        return res.status(403).json({ error: 'Access denied: not assigned teacher' });
      }
    } else {
      const enrollment = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.sectionId, period.sectionId),
            eq(enrollments.studentId, user.id)
          )
        );

      if (!enrollment.length) {
        return res.status(403).json({ error: 'Access denied: not enrolled in section' });
      }
    }

    const periodTimezone = period.timezone || 'Asia/Kolkata';
    const periodDate = getDateInTimezone(period.startTime, periodTimezone);
    const startFormatted = formatTimeInTimezone(period.startTime, periodTimezone);
    const endFormatted = formatTimeInTimezone(period.endTime, periodTimezone);

    // Also check if attendance session exists for this period
    const sessionRows = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.periodId, period.id));

    res.status(200).json({
      period: {
        ...period,
        periodDate,
        formattedTime: `${startFormatted} - ${endFormatted}`,
        startTimeFormatted: startFormatted,
        endTimeFormatted: endFormatted,
        session: sessionRows[0] || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Attendance Session endpoints
app.post('/attendance/sessions', requireAuth, async (req, res) => {
  try {
    const { periodId } = req.body || {};
    if (typeof periodId !== 'string' || !UUID_PATTERN.test(periodId)) {
      return res.status(400).json({ error: 'A valid periodId is required' });
    }

    // Role check
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only teachers can start attendance sessions' });
    }

    // Verify period exists and is assigned to this teacher
    const periodRows = await db
      .select()
      .from(periods)
      .where(eq(periods.id, periodId));

    if (!periodRows.length) {
      return res.status(404).json({ error: 'Period not found' });
    }

    const period = periodRows[0];
    if (period.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: not assigned teacher for this period' });
    }

    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(attendanceSessions)
        .values({ periodId, status: 'open' })
        .onConflictDoNothing({ target: attendanceSessions.periodId })
        .returning();

      if (created) {
        const enrolledStudents = await tx
          .select({
            studentId: enrollments.studentId,
            studentName: users.name,
            studentEmail: users.email,
          })
          .from(enrollments)
          .innerJoin(users, eq(enrollments.studentId, users.id))
          .where(eq(enrollments.sectionId, period.sectionId));

        if (enrolledStudents.length) {
          await tx.insert(sessionRosters).values(
            enrolledStudents.map((student) => ({ ...student, sessionId: created.id, status: 'pending' }))
          );
        }
      }

      const session = created || (await tx.select().from(attendanceSessions)
        .where(eq(attendanceSessions.periodId, periodId)))[0];
      const roster = await tx
        .select()
        .from(sessionRosters)
        .where(eq(sessionRosters.sessionId, session.id))
        .orderBy(asc(sessionRosters.studentName));
      const checkedInCount = roster.filter((student) => student.status === 'present').length;

      return {
        created: !!created,
        session,
        roster,
        summary: {
          totalEnrolled: roster.length,
          checkedInCount,
          pendingCount: roster.filter((student) => student.status === 'pending').length,
          percentage: roster.length ? Math.round((checkedInCount / roster.length) * 100) : 0,
        },
      };
    });

    const { created, ...sessionData } = result;
    res.status(created ? 201 : 200).json({
      ...sessionData,
      message: created ? 'Attendance session opened successfully' : 'Existing attendance session retrieved',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/attendance/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const sessionRows = await db
      .select({
        session: attendanceSessions,
        period: periods,
      })
      .from(attendanceSessions)
      .innerJoin(periods, eq(attendanceSessions.periodId, periods.id))
      .where(eq(attendanceSessions.id, id));

    if (!sessionRows.length) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { session, period } = sessionRows[0];

    // Authorization: only assigned teacher can access roster
    if (req.user.role !== 'teacher' || period.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: only assigned teacher can view attendance roster' });
    }

    const roster = await db
      .select()
      .from(sessionRosters)
      .where(eq(sessionRosters.sessionId, session.id))
      .orderBy(asc(sessionRosters.studentName));

    const checkedInCount = roster.filter((s) => s.status === 'present').length;
    const pendingCount = roster.filter((s) => s.status === 'pending').length;

    res.status(200).json({
      session,
      roster,
      summary: {
        totalEnrolled: roster.length,
        checkedInCount,
        pendingCount,
        percentage: roster.length ? Math.round((checkedInCount / roster.length) * 100) : 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const QR_CODE_TTL_SECONDS = 20;

async function getActiveCode(tx, sessionId) {
  const now = new Date();
  const [activeCode] = await tx.select().from(attendanceCodes)
    .where(and(eq(attendanceCodes.sessionId, sessionId), gt(attendanceCodes.expiresAt, now)))
    .orderBy(desc(attendanceCodes.expiresAt))
    .limit(1);
  if (activeCode) return activeCode;

  const [newCode] = await tx.insert(attendanceCodes).values({
    sessionId,
    code: crypto.randomBytes(16).toString('hex'),
    expiresAt: new Date(now.getTime() + QR_CODE_TTL_SECONDS * 1000),
    createdAt: now,
  }).returning();
  return newCode;
}

async function renderAttendanceCode({ sessionId, code, expiresAt }, width) {
  const qrPayload = JSON.stringify({ sessionId, code });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width, margin: 4, errorCorrectionLevel: 'M' });
  const serverTime = new Date();
  return {
    code,
    qrPayload,
    qrDataUrl,
    expiresAt,
    expiresInSeconds: Math.max(0, Math.ceil((expiresAt - serverTime) / 1000)),
    serverTime,
  };
}

app.get('/attendance/sessions/:id/code', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const sessionRows = await db
      .select({
        session: attendanceSessions,
        period: periods,
      })
      .from(attendanceSessions)
      .innerJoin(periods, eq(attendanceSessions.periodId, periods.id))
      .where(eq(attendanceSessions.id, id));

    if (!sessionRows.length) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { session, period } = sessionRows[0];

    // Authorization: only the assigned teacher can fetch the code directly
    if (req.user.role !== 'teacher' || period.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: only assigned teacher can access classroom QR code' });
    }

    const activeCode = await db.transaction(async (tx) => {
      const [currentSession] = await tx.select().from(attendanceSessions)
        .where(eq(attendanceSessions.id, session.id)).for('update');
      if (currentSession.status !== 'open') return null;
      return getActiveCode(tx, session.id);
    });

    if (!activeCode) return res.status(400).json({ error: 'Attendance session is closed' });
    res.status(200).json({ sessionId: session.id, ...await renderAttendanceCode(activeCode, 280) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Classroom projector summary endpoint (omits individual attendance)
app.get('/attendance/sessions/:id/summary', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const sessionRows = await db
      .select({
        session: attendanceSessions,
        period: periods,
        section: sections,
        teacher: users,
      })
      .from(attendanceSessions)
      .innerJoin(periods, eq(attendanceSessions.periodId, periods.id))
      .innerJoin(sections, eq(periods.sectionId, sections.id))
      .innerJoin(users, eq(periods.teacherId, users.id))
      .where(eq(attendanceSessions.id, id));

    if (!sessionRows.length) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { session, period, section, teacher } = sessionRows[0];

    // Authorization: only assigned teacher can view classroom projector
    if (req.user.role !== 'teacher' || period.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: only assigned teacher can view classroom projector summary' });
    }

    const { currentSession, rosterRows, activeCode } = await db.transaction(async (tx) => {
      const [currentSession] = await tx.select().from(attendanceSessions)
        .where(eq(attendanceSessions.id, session.id)).for('update');
      const rosterRows = await tx.select({ status: sessionRosters.status })
        .from(sessionRosters).where(eq(sessionRosters.sessionId, session.id));
      const activeCode = currentSession.status === 'open' ? await getActiveCode(tx, session.id) : null;
      return { currentSession, rosterRows, activeCode };
    });

    const totalEnrolled = rosterRows.length;
    const checkedInCount = rosterRows.filter((r) => r.status === 'present').length;
    const absentCount = rosterRows.filter((r) => r.status === 'absent').length;
    const pendingCount = rosterRows.filter((r) => r.status === 'pending').length;
    const percentage = totalEnrolled ? Math.round((checkedInCount / totalEnrolled) * 100) : 0;
    const qr = activeCode ? await renderAttendanceCode(activeCode, 380) : null;

    const tz = section.timezone || 'Asia/Kolkata';

    res.status(200).json({
      session: {
        id: session.id,
        periodId: session.periodId,
        status: currentSession.status,
        openedAt: session.openedAt,
        closedAt: currentSession.closedAt,
      },
      period: {
        id: period.id,
        subject: period.subject,
        sectionName: section.name,
        teacherName: teacher.name,
        date: getDateInTimezone(period.startTime, tz),
        formattedTime: `${formatTimeInTimezone(period.startTime, tz)} - ${formatTimeInTimezone(period.endTime, tz)}`,
        startTime: period.startTime,
        endTime: period.endTime,
        timezone: tz,
      },
      summary: {
        totalEnrolled,
        checkedInCount,
        absentCount,
        pendingCount,
        percentage,
      },
      qr,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student check-in endpoint
app.post('/attendance/check-in', requireAuth, async (req, res) => {
  try {
    // Only student accounts can check in
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Only students can check in' });
    }

    let { sessionId, code, qrPayload } = req.body || {};

    if (qrPayload && (!sessionId || !code)) {
      try {
        const parsed = typeof qrPayload === 'string' ? JSON.parse(qrPayload) : qrPayload;
        sessionId = sessionId || parsed.sessionId;
        code = code || parsed.code;
      } catch {
        return res.status(400).json({ error: 'Malformed QR payload' });
      }
    }

    if (typeof sessionId !== 'string' || typeof code !== 'string' || !sessionId || !code) {
      return res.status(400).json({ error: 'sessionId and code are required' });
    }

    if (!UUID_PATTERN.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId format' });
    }

    // 1. Verify session exists and is open
    const sessionRows = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, sessionId));

    if (!sessionRows.length) {
      return res.status(404).json({ error: 'Attendance session not found' });
    }

    const session = sessionRows[0];
    if (session.status !== 'open') {
      return res.status(400).json({ error: 'Attendance session is closed' });
    }

    // 2. Validate attendance code
    const codeRows = await db
      .select()
      .from(attendanceCodes)
      .where(eq(attendanceCodes.code, code));

    if (!codeRows.length) {
      return res.status(400).json({ error: 'Invalid attendance code' });
    }

    const codeRecord = codeRows[0];
    if (codeRecord.sessionId !== sessionId) {
      return res.status(400).json({ error: 'Attendance code does not match this session' });
    }

    const now = new Date();
    if (new Date(codeRecord.expiresAt) <= now) {
      return res.status(400).json({ error: 'Attendance code has expired' });
    }

    // 3. Verify student roster membership (from trusted auth context)
    const studentId = req.user.id;
    const rosterRows = await db
      .select()
      .from(sessionRosters)
      .where(
        and(
          eq(sessionRosters.sessionId, sessionId),
          eq(sessionRosters.studentId, studentId)
        )
      );

    if (!rosterRows.length) {
      return res.status(403).json({ error: 'Student is not enrolled in this session roster' });
    }

    const result = await db.transaction(async (tx) => {
      const [currentSession] = await tx
        .select()
        .from(attendanceSessions)
        .where(eq(attendanceSessions.id, sessionId))
        .for('update');

      if (!currentSession || currentSession.status !== 'open') {
        throw Object.assign(new Error('Attendance session is closed'), { statusCode: 400 });
      }

      const recordedAt = new Date();
      if (new Date(codeRecord.expiresAt) <= recordedAt) {
        throw Object.assign(new Error('Attendance code has expired'), { statusCode: 400 });
      }

      const [existing] = await tx
        .select()
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.studentId, studentId)));

      if (existing && existing.status !== 'pending') {
        if (existing.status !== 'present') {
          throw Object.assign(new Error('Your attendance was marked by the teacher. Ask them to review it.'), { statusCode: 409 });
        }
        return { record: existing, message: 'Attendance already recorded', repeated: true };
      }

      const [record] = await tx
        .insert(attendanceRecords)
        .values({ sessionId, studentId, status: 'present', recordedAt, method: 'qr_scan' })
        .onConflictDoUpdate({
          target: [attendanceRecords.sessionId, attendanceRecords.studentId],
          set: { status: 'present', recordedAt, method: 'qr_scan', updatedAt: recordedAt },
        })
        .returning();

      await tx
        .update(sessionRosters)
        .set({ status: 'present' })
        .where(and(eq(sessionRosters.sessionId, sessionId), eq(sessionRosters.studentId, studentId)));

      return { record, message: 'Attendance check-in confirmed', repeated: false };
    });

    res.status(result.repeated ? 200 : 201).json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Teacher Close action: close session and finalize absences in one atomic transaction
app.post('/attendance/sessions/:id/close', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const sessionRows = await db
      .select({
        session: attendanceSessions,
        period: periods,
      })
      .from(attendanceSessions)
      .innerJoin(periods, eq(attendanceSessions.periodId, periods.id))
      .where(eq(attendanceSessions.id, id));

    if (!sessionRows.length) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { session, period } = sessionRows[0];

    // Only assigned teacher can close
    if (req.user.role !== 'teacher' || period.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: only assigned teacher can close attendance session' });
    }

    // Repeated close requests safe (idempotent)
    if (session.status === 'closed') {
      const roster = await db
        .select()
        .from(sessionRosters)
        .where(eq(sessionRosters.sessionId, session.id))
        .orderBy(asc(sessionRosters.studentName));

      const checkedInCount = roster.filter((s) => s.status === 'present').length;
      const absentCount = roster.filter((s) => s.status === 'absent').length;

      return res.status(200).json({
        session,
        roster,
        summary: {
          totalEnrolled: roster.length,
          checkedInCount,
          absentCount,
          percentage: roster.length ? Math.round((checkedInCount / roster.length) * 100) : 0,
        },
        message: 'Attendance session is already closed',
      });
    }

    const now = new Date();

    // Close session and finalize pending students as absent in one atomic transaction
    const result = await db.transaction(async (tx) => {
      // 1. Close session
      const [closedSession] = await tx
        .update(attendanceSessions)
        .set({
          status: 'closed',
          closedAt: now,
        })
        .where(and(eq(attendanceSessions.id, session.id), eq(attendanceSessions.status, 'open')))
        .returning();

      if (closedSession) {
        // 2. Expire all attendance codes for this session
        await tx
          .update(attendanceCodes)
          .set({ expiresAt: now })
          .where(eq(attendanceCodes.sessionId, session.id));

        // 3. Find pending roster entries
        const pendingStudents = await tx
          .select()
          .from(sessionRosters)
          .where(
            and(
              eq(sessionRosters.sessionId, session.id),
              eq(sessionRosters.status, 'pending')
            )
          );

        // 4. Finalize pending students as absent in attendanceRecords
        if (pendingStudents.length > 0) {
          await tx
            .insert(attendanceRecords)
            .values(
              pendingStudents.map((s) => ({
                sessionId: session.id,
                studentId: s.studentId,
                status: 'absent',
                recordedAt: now,
                method: 'finalized_absence',
              }))
            )
            .onConflictDoUpdate({
              target: [attendanceRecords.sessionId, attendanceRecords.studentId],
              set: { status: 'absent', method: 'finalized_absence', updatedAt: now },
            });

          // 5. Update roster entries status to absent
          await tx
            .update(sessionRosters)
            .set({ status: 'absent' })
            .where(
              and(
                eq(sessionRosters.sessionId, session.id),
                eq(sessionRosters.status, 'pending')
              )
            );
        }
      }

      // 6. Return finalized roster
      const finalizedRoster = await tx
        .select()
        .from(sessionRosters)
        .where(eq(sessionRosters.sessionId, session.id))
        .orderBy(asc(sessionRosters.studentName));

      const checkedInCount = finalizedRoster.filter((s) => s.status === 'present').length;
      const absentCount = finalizedRoster.filter((s) => s.status === 'absent').length;

      return {
        session: closedSession || (await tx.select().from(attendanceSessions).where(eq(attendanceSessions.id, session.id)))[0],
        roster: finalizedRoster,
        summary: {
          totalEnrolled: finalizedRoster.length,
          checkedInCount,
          absentCount,
          percentage: finalizedRoster.length ? Math.round((checkedInCount / finalizedRoster.length) * 100) : 0,
        },
      };
    });

    res.status(200).json({
      session: result.session,
      roster: result.roster,
      summary: result.summary,
      message: 'Attendance session closed and absences finalized successfully',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher action to record or correct a student's attendance record
app.post('/attendance/sessions/:id/records', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId, status } = req.body || {};

    if (typeof studentId !== 'string' || !UUID_PATTERN.test(studentId)) {
      return res.status(400).json({ error: 'A valid studentId is required' });
    }

    if (!['present', 'absent', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'status must be present, absent, or pending' });
    }

    const sessionRows = await db
      .select({
        session: attendanceSessions,
        period: periods,
      })
      .from(attendanceSessions)
      .innerJoin(periods, eq(attendanceSessions.periodId, periods.id))
      .where(eq(attendanceSessions.id, id));

    if (!sessionRows.length) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { session, period } = sessionRows[0];

    // Authorization: only the assigned teacher can modify attendance
    if (req.user.role !== 'teacher' || period.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: only assigned teacher can modify attendance records' });
    }

    // Verify student is in the captured session roster
    const rosterRows = await db
      .select()
      .from(sessionRosters)
      .where(
        and(
          eq(sessionRosters.sessionId, session.id),
          eq(sessionRosters.studentId, studentId)
        )
      );

    if (!rosterRows.length) {
      return res.status(403).json({ error: 'Student is not in the captured session roster' });
    }

    const now = new Date();

    const result = await db.transaction(async (tx) => {
      const [currentSession] = await tx
        .select()
        .from(attendanceSessions)
        .where(eq(attendanceSessions.id, session.id))
        .for('update');
      if (currentSession.status === 'closed' && status === 'pending') return null;
      const method = currentSession.status === 'open' ? 'teacher_manual' : 'teacher_correction';

      // 1. Update sessionRoster status
      await tx
        .update(sessionRosters)
        .set({ status })
        .where(
          and(
            eq(sessionRosters.sessionId, session.id),
            eq(sessionRosters.studentId, studentId)
          )
        );

      // 2. Check if attendanceRecord exists
      const existingRecords = await tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.sessionId, session.id),
            eq(attendanceRecords.studentId, studentId)
          )
        );

      let record;
      if (existingRecords.length > 0) {
        const [updated] = await tx
          .update(attendanceRecords)
          .set({
            status,
            method,
            updatedBy: req.user.id,
            updatedAt: now,
          })
          .where(
            and(
              eq(attendanceRecords.sessionId, session.id),
              eq(attendanceRecords.studentId, studentId)
            )
          )
          .returning();
        record = updated;
      } else {
        const [inserted] = await tx
          .insert(attendanceRecords)
          .values({
            sessionId: session.id,
            studentId,
            status,
            method,
            updatedBy: req.user.id,
            recordedAt: now,
            updatedAt: now,
          })
          .returning();
        record = inserted;
      }

      // 3. Return fresh roster and summary
      const roster = await tx
        .select()
        .from(sessionRosters)
        .where(eq(sessionRosters.sessionId, session.id))
        .orderBy(asc(sessionRosters.studentName));

      const checkedInCount = roster.filter((s) => s.status === 'present').length;
      const absentCount = roster.filter((s) => s.status === 'absent').length;
      const pendingCount = roster.filter((s) => s.status === 'pending').length;

      return {
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
    });

    if (!result) {
      return res.status(400).json({ error: 'Closed sessions require a present or absent status' });
    }

    res.status(200).json({
      record: result.record,
      roster: result.roster,
      summary: result.summary,
      message: 'Attendance record updated successfully',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student attendance history and by-subject summary
app.get('/attendance/student', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Access denied: only students can view student attendance' });
    }

    if (req.query.studentId && req.query.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: cannot view other students attendance' });
    }

    const studentId = req.user.id;

    // Fetch all closed attendance sessions where student was on the roster
    const rows = await db
      .select({
        sessionId: attendanceSessions.id,
        sessionStatus: attendanceSessions.status,
        sessionClosedAt: attendanceSessions.closedAt,
        periodId: periods.id,
        subject: periods.subject,
        startTime: periods.startTime,
        endTime: periods.endTime,
        timezone: sections.timezone,
        sectionName: sections.name,
        rosterStatus: sessionRosters.status,
        recordStatus: attendanceRecords.status,
        recordMethod: attendanceRecords.method,
        recordRecordedAt: attendanceRecords.recordedAt,
        recordUpdatedAt: attendanceRecords.updatedAt,
      })
      .from(sessionRosters)
      .innerJoin(attendanceSessions, eq(sessionRosters.sessionId, attendanceSessions.id))
      .innerJoin(periods, eq(attendanceSessions.periodId, periods.id))
      .innerJoin(sections, eq(periods.sectionId, sections.id))
      .leftJoin(
        attendanceRecords,
        and(
          eq(attendanceRecords.sessionId, attendanceSessions.id),
          eq(attendanceRecords.studentId, sessionRosters.studentId)
        )
      )
      .where(
        and(
          eq(sessionRosters.studentId, studentId),
          eq(attendanceSessions.status, 'closed')
        )
      )
      .orderBy(desc(periods.startTime));

    const subjectMap = new Map();
    let totalPresent = 0;
    const totalSessions = rows.length;

    const records = rows.map((r) => {
      const tz = r.timezone || 'Asia/Kolkata';
      const status = (r.recordStatus || r.rosterStatus || 'absent').toLowerCase();
      const isPresent = status === 'present';
      if (isPresent) {
        totalPresent += 1;
      }

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
        date: getDateInTimezone(r.startTime, tz),
        formattedTime: `${formatTimeInTimezone(r.startTime, tz)} - ${formatTimeInTimezone(r.endTime, tz)}`,
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

    res.status(200).json({
      summary,
      bySubject,
      records,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function normalizeTags(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : String(input).split(',');
  const cleaned = list
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

// Student planning preferences endpoints
app.get('/student/preferences', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Access denied: only students have planning preferences' });
    }

    if (req.query.studentId && req.query.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: cannot read other students preferences' });
    }

    const studentId = req.user.id;
    const rows = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.studentId, studentId));

    if (!rows.length) {
      return res.status(200).json({
        studentId,
        careerGoal: '',
        interests: [],
        strengths: [],
        updatedAt: null,
      });
    }

    const profile = rows[0];
    res.status(200).json({
      studentId: profile.studentId,
      careerGoal: profile.careerGoal || '',
      interests: Array.isArray(profile.interests) ? profile.interests : [],
      strengths: Array.isArray(profile.strengths) ? profile.strengths : [],
      updatedAt: profile.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/student/preferences', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Access denied: only students can edit planning preferences' });
    }

    if (req.body.studentId && req.body.studentId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: cannot edit other students preferences' });
    }

    const studentId = req.user.id;
    const careerGoal = req.body.careerGoal !== undefined ? String(req.body.careerGoal).trim() : '';
    const interests = normalizeTags(req.body.interests);
    const strengths = normalizeTags(req.body.strengths);
    const now = new Date();

    const [savedProfile] = await db
      .insert(studentProfiles)
      .values({
        studentId,
        careerGoal,
        interests,
        strengths,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: studentProfiles.studentId,
        set: {
          careerGoal,
          interests,
          strengths,
          updatedAt: now,
        },
      })
      .returning();

    res.status(200).json({
      profile: {
        studentId: savedProfile.studentId,
        careerGoal: savedProfile.careerGoal,
        interests: savedProfile.interests,
        strengths: savedProfile.strengths,
        updatedAt: savedProfile.updatedAt,
      },
      message: 'Planning preferences saved successfully',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
