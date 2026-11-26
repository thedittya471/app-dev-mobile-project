import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from './db/index.js';
import {
  users,
  sessions,
  sections,
  enrollments,
  periods,
  attendanceSessions,
  attendanceCodes,
  attendanceRecords,
  sessionRosters,
  studentProfiles,
} from './db/schema.js';
import { hashPassword } from './auth.js';
import { createDateInTimezone } from './freePeriods.js';

const SEED_USERS = [
  {
    email: 'teacher@pilot.edu',
    name: 'Prof. Alan Smith',
    role: 'teacher',
    password: 'password123',
  },
  {
    email: 'teacher2@pilot.edu',
    name: 'Prof. Bob Wilson',
    role: 'teacher',
    password: 'password123',
  },
  { email: 'teacher3@pilot.edu', name: 'Dr. Meera Iyer', role: 'teacher', password: 'password123' },
  { email: 'teacher4@pilot.edu', name: 'Prof. Arjun Rao', role: 'teacher', password: 'password123' },
  {
    email: 'student1@pilot.edu',
    name: 'Jane Doe',
    role: 'student',
    password: 'password123',
    careerGoal: 'Full-Stack Software Engineer',
    interests: ['react-native', 'web-development', 'javascript', 'ui/ux'],
    strengths: ['problem-solving', 'algorithms', 'clean-code'],
  },
  {
    email: 'student2@pilot.edu',
    name: 'John River',
    role: 'student',
    password: 'password123',
    careerGoal: 'Machine Learning Engineer',
    interests: ['python', 'data-science', 'machine-learning', 'robotics'],
    strengths: ['math', 'analysis', 'statistics'],
  },
  {
    email: 'student3@pilot.edu',
    name: 'Alex Chen',
    role: 'student',
    password: 'password123',
    careerGoal: 'Cybersecurity Specialist',
    interests: ['cybersecurity', 'networking', 'linux', 'ethical-hacking'],
    strengths: ['debugging', 'logic', 'systems-thinking'],
  },
  {
    email: 'student4@pilot.edu',
    name: 'Sophia Patel',
    role: 'student',
    password: 'password123',
    careerGoal: 'Mobile Product Designer',
    interests: ['ui/ux', 'design', 'figma', 'mobile-apps'],
    strengths: ['creativity', 'wireframing', 'user-research'],
  },
  {
    email: 'student5@pilot.edu',
    name: 'Marcus Vance',
    role: 'student',
    password: 'password123',
    careerGoal: 'Cloud & DevOps Architect',
    interests: ['cloud-computing', 'docker', 'kubernetes', 'automation'],
    strengths: ['infrastructure', 'troubleshooting', 'scripting'],
  },
  {
    email: 'unrelated@pilot.edu',
    name: 'Unrelated User',
    role: 'student',
    password: 'password123',
  },
];

const TIMEZONE = 'Asia/Kolkata';
const DAY_MS = 86_400_000;

const extraStudents = [
  'Ananya Sharma', 'Rohan Gupta', 'Kavya Nair', 'Ishaan Verma', 'Priya Shah',
  'Dev Singh', 'Neha Das', 'Aarav Menon', 'Diya Banerjee', 'Kabir Sethi',
  'Sara Fernandes', 'Vihaan Joshi', 'Maya Desai',
];
const sampleProfiles = SEED_USERS.filter((account) => account.careerGoal);

extraStudents.forEach((name, index) => {
  const { careerGoal, interests, strengths } = sampleProfiles[index % sampleProfiles.length];
  SEED_USERS.push({
    email: `student${index + 6}@pilot.edu`,
    name,
    role: 'student',
    password: 'password123',
    careerGoal,
    interests,
    strengths,
  });
});

const SAMPLE_SECTIONS = [
  {
    name: 'Computer Science A',
    firstStudent: 1,
    subjects: ['Database Systems & Architecture', 'Mobile App Development', 'Algorithms & Data Structures'],
  },
  {
    name: 'Computer Science B',
    firstStudent: 7,
    subjects: ['Operating Systems', 'Web Application Development', 'Computer Networks'],
  },
  {
    name: 'Data Science A',
    firstStudent: 13,
    subjects: ['Applied Statistics', 'Machine Learning', 'Data Visualization'],
  },
];

const CLASS_TIMES = [['09:00', '10:00'], ['11:30', '12:30'], ['14:00', '15:15']];

function assertLocalReset() {
  const target = new URL(process.env.DATABASE_URL || 'postgres://127.0.0.1:5433/attendance_pilot');
  if (process.env.NODE_ENV === 'production' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      target.port !== '5433' ||
      target.pathname !== '/attendance_pilot' ||
      target.search) {
    throw new Error('Reset is only available for the local attendance_pilot database on port 5433.');
  }
}

async function seed({ reset }) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const todayMs = Date.parse(`${today}T00:00:00Z`);

  await db.transaction(async (tx) => {
    if (reset) {
      await tx.execute(sql`TRUNCATE TABLE
        ${users}, ${sessions}, ${sections}, ${enrollments}, ${periods},
        ${attendanceSessions}, ${attendanceCodes}, ${attendanceRecords},
        ${sessionRosters}, ${studentProfiles}`);
    }

    const userMap = new Map();
    for (const account of SEED_USERS) {
      const [existing] = await tx.select().from(users).where(eq(users.email, account.email));
      const [user] = existing ? [existing] : await tx.insert(users).values({
        email: account.email,
        name: account.name,
        role: account.role,
        passwordHash: hashPassword(account.password),
      }).returning();

      userMap.set(user.email, user);
      if (account.careerGoal) {
        await tx.insert(studentProfiles).values({
          studentId: user.id,
          careerGoal: account.careerGoal,
          interests: account.interests,
          strengths: account.strengths,
        }).onConflictDoNothing({ target: studentProfiles.studentId });
      }
    }

    const teachers = [...userMap.values()].filter((user) => user.role === 'teacher');
    for (const [sectionIndex, fixture] of SAMPLE_SECTIONS.entries()) {
      const [existing] = await tx.select().from(sections).where(eq(sections.name, fixture.name));
      const [section] = existing ? [existing] : await tx.insert(sections).values({
        name: fixture.name,
        timezone: TIMEZONE,
      }).returning();
      if (section.timezone !== TIMEZONE) {
        throw new Error(`Sample section "${section.name}" uses ${section.timezone}. Reset the local sample database to rebuild it in ${TIMEZONE}.`);
      }

      const students = Array.from({ length: 6 }, (_, index) =>
        userMap.get(`student${fixture.firstStudent + index}@pilot.edu`)
      );
      await tx.insert(enrollments).values(students.map((student) => ({
        sectionId: section.id,
        studentId: student.id,
      }))).onConflictDoNothing({ target: [enrollments.sectionId, enrollments.studentId] });

      const existingPeriods = await tx.select({ startTime: periods.startTime })
        .from(periods).where(eq(periods.sectionId, section.id));
      const occupied = new Set(existingPeriods.map(({ startTime }) => startTime.getTime()));

      for (let offset = -5; offset <= 5; offset += 1) {
        const dayMs = todayMs + offset * DAY_MS;
        const date = new Date(dayMs).toISOString().slice(0, 10);
        const rotation = (dayMs / DAY_MS) % CLASS_TIMES.length;
        for (const [slot, [start, end]] of CLASS_TIMES.entries()) {
          const startTime = createDateInTimezone(date, start, TIMEZONE);
          if (occupied.has(startTime.getTime())) continue;

          const subjectIndex = (slot + rotation) % CLASS_TIMES.length;
          const [period] = await tx.insert(periods).values({
            sectionId: section.id,
            teacherId: teachers[(sectionIndex + subjectIndex) % teachers.length].id,
            subject: fixture.subjects[subjectIndex],
            startTime,
            endTime: createDateInTimezone(date, end, TIMEZONE),
          }).returning();
          if (offset >= 0) continue;

          const [session] = await tx.insert(attendanceSessions).values({
            periodId: period.id,
            status: 'closed',
            openedAt: period.startTime,
            closedAt: period.endTime,
          }).returning();
          const roster = students.map((student, index) => ({
            sessionId: session.id,
            studentId: student.id,
            studentName: student.name,
            studentEmail: student.email,
            status: (index * 3 + offset * 2 + slot + sectionIndex) % 7 === 0 ? 'absent' : 'present',
          }));
          await tx.insert(sessionRosters).values(roster);
          await tx.insert(attendanceRecords).values(roster.map(({ sessionId, studentId, status }) => ({
            sessionId,
            studentId,
            status,
            recordedAt: status === 'present' ? period.startTime : period.endTime,
            method: status === 'present' ? 'qr_scan' : 'finalized_absence',
          })));
        }
      }
    }
  });

  console.log(`Sample data ready in ${TIMEZONE}, centered on ${today}.`);
}

const args = process.argv.slice(2);
try {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--reset')) {
    throw new Error('Usage: npm run db:seed -- [--reset]');
  }
  const reset = args[0] === '--reset';
  if (reset) assertLocalReset();
  await seed({ reset });
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
