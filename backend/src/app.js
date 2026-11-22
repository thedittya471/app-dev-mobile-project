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
} from './db/schema.js';
import {
  verifyPassword,
  createSession,
  deleteSession,
  requireAuth,
} from './auth.js';

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

function getDateInTimezone(dateObj, timezone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(dateObj));
}

function formatTimeInTimezone(dateObj, timezone = 'America/New_York') {
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
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

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
});

app.get('/auth/me', requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

app.post('/auth/sign-out', requireAuth, async (req, res) => {
  await deleteSession(req.sessionToken);
  res.status(200).json({ success: true });
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
        return res.status(200).json({
          schedule: [],
          institutionDate: getDateInTimezone(new Date(), 'America/New_York'),
          institutionTimezone: 'America/New_York',
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

    const institutionTimezone = results[0]?.timezone || 'America/New_York';
    const institutionToday = getDateInTimezone(new Date(), institutionTimezone);

    let mapped = results.map((p) => {
      const periodTimezone = p.timezone || institutionTimezone;
      const periodDate = getDateInTimezone(p.startTime, periodTimezone);
      const startFormatted = formatTimeInTimezone(p.startTime, periodTimezone);
      const endFormatted = formatTimeInTimezone(p.endTime, periodTimezone);
      return {
        ...p,
        periodDate,
        formattedTime: `${startFormatted} - ${endFormatted}`,
        startTimeFormatted: startFormatted,
        endTimeFormatted: endFormatted,
      };
    });

    if (filterDate) {
      const targetDate = filterDate === 'today' ? institutionToday : filterDate;
      mapped = mapped.filter((p) => p.periodDate === targetDate);
    }

    res.status(200).json({
      schedule: mapped,
      institutionDate: institutionToday,
      institutionTimezone,
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

    const periodTimezone = period.timezone || 'America/New_York';
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
    if (!periodId) {
      return res.status(400).json({ error: 'periodId required' });
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

    // Check if session already exists
    const existingSessions = await db
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.periodId, periodId));

    if (existingSessions.length > 0) {
      const existingSession = existingSessions[0];
      const roster = await db
        .select()
        .from(sessionRosters)
        .where(eq(sessionRosters.sessionId, existingSession.id))
        .orderBy(asc(sessionRosters.studentName));

      const checkedInCount = roster.filter((s) => s.status === 'present').length;
      const pendingCount = roster.filter((s) => s.status === 'pending').length;

      return res.status(200).json({
        session: existingSession,
        roster,
        summary: {
          totalEnrolled: roster.length,
          checkedInCount,
          pendingCount,
          percentage: roster.length ? Math.round((checkedInCount / roster.length) * 100) : 0,
        },
        message: 'Existing attendance session retrieved',
      });
    }

    // Create session and capture roster snapshot in one transaction
    const result = await db.transaction(async (tx) => {
      const [newSession] = await tx
        .insert(attendanceSessions)
        .values({
          periodId,
          openedAt: new Date(),
          status: 'open',
        })
        .returning();

      const enrolledStudents = await tx
        .select({
          studentId: enrollments.studentId,
          studentName: users.name,
          studentEmail: users.email,
        })
        .from(enrollments)
        .innerJoin(users, eq(enrollments.studentId, users.id))
        .where(eq(enrollments.sectionId, period.sectionId))
        .orderBy(asc(users.name));

      let roster = [];
      if (enrolledStudents.length > 0) {
        roster = await tx
          .insert(sessionRosters)
          .values(
            enrolledStudents.map((s) => ({
              sessionId: newSession.id,
              studentId: s.studentId,
              studentName: s.studentName,
              studentEmail: s.studentEmail,
              status: 'pending',
            }))
          )
          .returning();
      }

      return {
        session: newSession,
        roster,
        summary: {
          totalEnrolled: roster.length,
          checkedInCount: 0,
          pendingCount: roster.length,
          percentage: 0,
        },
      };
    });

    res.status(201).json({
      session: result.session,
      roster: result.roster,
      summary: result.summary,
      message: 'Attendance session opened successfully',
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

    // Check if session is open
    if (session.status !== 'open') {
      return res.status(400).json({ error: 'Attendance session is closed' });
    }

    const now = new Date();

    // Check for existing active code that has not expired
    // Reuse current code until it expires so multiple displays stay in sync
    const activeCodes = await db
      .select()
      .from(attendanceCodes)
      .where(
        and(
          eq(attendanceCodes.sessionId, session.id),
          gt(attendanceCodes.expiresAt, now)
        )
      )
      .orderBy(desc(attendanceCodes.expiresAt))
      .limit(1);

    let activeCode;
    if (activeCodes.length > 0) {
      activeCode = activeCodes[0];
    } else {
      // Generate unpredictable code
      const code = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(now.getTime() + QR_CODE_TTL_SECONDS * 1000);

      const [newCode] = await db
        .insert(attendanceCodes)
        .values({
          sessionId: session.id,
          code,
          expiresAt,
          createdAt: now,
        })
        .returning();

      activeCode = newCode;
    }

    // Payload limited strictly to what check-in needs
    const qrPayload = JSON.stringify({
      sessionId: session.id,
      code: activeCode.code,
    });

    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    const expiresInSeconds = Math.max(
      0,
      Math.round((new Date(activeCode.expiresAt).getTime() - Date.now()) / 1000)
    );

    res.status(200).json({
      sessionId: session.id,
      code: activeCode.code,
      qrPayload,
      qrDataUrl,
      expiresAt: activeCode.expiresAt,
      expiresInSeconds,
      serverTime: new Date().toISOString(),
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

    if (!sessionId || !code) {
      return res.status(400).json({ error: 'sessionId and code are required' });
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(sessionId)) {
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

    // 4. Check for existing record (repeat submission / concurrent repeat)
    const existingRecords = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.sessionId, sessionId),
          eq(attendanceRecords.studentId, studentId)
        )
      );

    if (existingRecords.length > 0) {
      return res.status(200).json({
        record: existingRecords[0],
        message: 'Attendance already recorded',
        repeated: true,
      });
    }

    // 5. Insert attendance record in transaction and update roster status
    const savedRecord = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(attendanceRecords)
        .values({
          sessionId,
          studentId,
          status: 'present',
          recordedAt: now,
          method: 'qr_scan',
        })
        .onConflictDoNothing()
        .returning();

      let record;
      if (inserted.length > 0) {
        record = inserted[0];
      } else {
        const [found] = await tx
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.sessionId, sessionId),
              eq(attendanceRecords.studentId, studentId)
            )
          );
        record = found;
      }

      await tx
        .update(sessionRosters)
        .set({ status: 'present' })
        .where(
          and(
            eq(sessionRosters.sessionId, sessionId),
            eq(sessionRosters.studentId, studentId)
          )
        );

      return record;
    });

    res.status(201).json({
      record: savedRecord,
      message: 'Attendance check-in confirmed',
      repeated: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
