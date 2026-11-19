import express from 'express';
import cors from 'cors';
import { eq } from 'drizzle-orm';
import { checkDbConnection, db } from './db/index.js';
import { users } from './db/schema.js';
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
