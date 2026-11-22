import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, pool } from './db/index.js';
import { users, sections, enrollments, periods, attendanceSessions } from './db/schema.js';
import { hashPassword } from './auth.js';

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
  {
    email: 'student1@pilot.edu',
    name: 'Jane Doe',
    role: 'student',
    password: 'password123',
  },
  {
    email: 'student2@pilot.edu',
    name: 'John River',
    role: 'student',
    password: 'password123',
  },
  {
    email: 'unrelated@pilot.edu',
    name: 'Unrelated User',
    role: 'student',
    password: 'password123',
  },
];

async function seed() {
  console.log('Seeding initial data...');

  // 1. Users
  const userMap = {};
  for (const account of SEED_USERS) {
    let userRows = await db.select().from(users).where(eq(users.email, account.email));
    if (userRows.length === 0) {
      userRows = await db
        .insert(users)
        .values({
          email: account.email,
          name: account.name,
          role: account.role,
          passwordHash: hashPassword(account.password),
        })
        .returning();
      console.log(`Created user: ${account.email} (${account.role})`);
    }
    userMap[account.email] = userRows[0];
  }

  // 2. Section
  let sectionRows = await db.select().from(sections).where(eq(sections.name, 'Computer Science A'));
  if (sectionRows.length === 0) {
    sectionRows = await db
      .insert(sections)
      .values({
        name: 'Computer Science A',
        timezone: 'America/New_York',
        schoolDayStart: '09:00',
        schoolDayEnd: '17:00',
      })
      .returning();
    console.log('Created section: Computer Science A');
  }
  const section = sectionRows[0];

  // 3. Enrollments (clean and ensure exactly student1 and student2)
  await db.delete(attendanceSessions);
  await db.delete(enrollments).where(eq(enrollments.sectionId, section.id));

  for (const email of ['student1@pilot.edu', 'student2@pilot.edu']) {
    const student = userMap[email];
    await db.insert(enrollments).values({
      sectionId: section.id,
      studentId: student.id,
    });
    console.log(`Enrolled ${email} into section ${section.name}`);
  }

  // 4. Periods (two separated periods on today's date in America/New_York)
  const teacher = userMap['teacher@pilot.edu'];
  const nyTodayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  await db.delete(periods).where(eq(periods.sectionId, section.id));

  const periodDefinitions = [
    {
      subject: 'Database Systems',
      startTime: new Date(`${nyTodayStr}T09:30:00-05:00`),
      endTime: new Date(`${nyTodayStr}T10:30:00-05:00`),
    },
    {
      subject: 'Mobile App Development',
      startTime: new Date(`${nyTodayStr}T11:30:00-05:00`),
      endTime: new Date(`${nyTodayStr}T12:30:00-05:00`),
    },
  ];

  for (const p of periodDefinitions) {
    await db.insert(periods).values({
      sectionId: section.id,
      teacherId: teacher.id,
      subject: p.subject,
      startTime: p.startTime,
      endTime: p.endTime,
    });
    console.log(`Created period: ${p.subject} in ${section.timezone}`);
  }

  console.log('Seeding finished.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
