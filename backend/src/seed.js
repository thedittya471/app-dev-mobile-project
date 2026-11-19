import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, pool } from './db/index.js';
import { users } from './db/schema.js';
import { hashPassword } from './auth.js';

const SEED_USERS = [
  {
    email: 'teacher@pilot.edu',
    name: 'Prof. Alan Smith',
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
  console.log('Seeding initial accounts...');
  for (const account of SEED_USERS) {
    const existing = await db.select().from(users).where(eq(users.email, account.email));
    if (existing.length === 0) {
      await db.insert(users).values({
        email: account.email,
        name: account.name,
        role: account.role,
        passwordHash: hashPassword(account.password),
      });
      console.log(`Created user: ${account.email} (${account.role})`);
    } else {
      console.log(`User ${account.email} already exists.`);
    }
  }
  console.log('Seeding finished.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
