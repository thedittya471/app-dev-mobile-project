import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from './db/index.js';
import { users, sessions } from './db/schema.js';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  try {
    const [salt, key] = storedHash.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await db.insert(sessions).values({
    token,
    userId,
    expiresAt,
  });
  return token;
}

export async function getUserFromSession(token) {
  if (!token) return null;
  const now = new Date();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)));

  if (!rows.length) return null;
  const user = rows[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function deleteSession(token) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7).trim();
  try {
    const user = await getUserFromSession(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    req.user = user;
    req.sessionToken = token;
    next();
  } catch (error) {
    console.error('Session lookup failed:', error.message);
    res.status(503).json({ error: 'Sign-in service is temporarily unavailable' });
  }
}
