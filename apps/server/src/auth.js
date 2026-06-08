import crypto from "node:crypto";
import { get, run } from "./db.js";

const COOKIE_NAME = "jiaokao_session";
const SESSION_DAYS = 14;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [method, salt, expected] = String(stored || "").split(":");
  if (method !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actual.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actual, expectedBuffer)
  );
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    authorizationStatus: user.authorization_status,
    classNote: user.class_note || "",
  };
}

export function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  run(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt],
  );
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${
      SESSION_DAYS * 24 * 60 * 60
    }`,
  );
}

export function clearSession(req, res) {
  const token = sessionToken(req);
  if (token) run(`DELETE FROM sessions WHERE token_hash = ?`, [hashToken(token)]);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

export function attachCurrentUser(req, _res, next) {
  const token = sessionToken(req);
  if (!token) {
    req.user = null;
    return next();
  }
  const session = get(
    `SELECT sessions.*, users.name, users.phone, users.role, users.authorization_status, users.class_note
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ?`,
    [hashToken(token)],
  );
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session) run(`DELETE FROM sessions WHERE id = ?`, [session.id]);
    req.user = null;
    return next();
  }
  req.user = {
    id: session.user_id,
    name: session.name,
    phone: session.phone,
    role: session.role,
    authorization_status: session.authorization_status,
    class_note: session.class_note,
  };
  next();
}

export function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "请先登录" });
  next();
}

export function requireTeacher(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "请先登录" });
  if (req.user.role !== "teacher") {
    return res.status(403).json({ error: "需要老师权限" });
  }
  next();
}

export function requireAuthorized(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "请先登录" });
  if (
    req.user.role !== "teacher" &&
    req.user.authorization_status !== "approved"
  ) {
    return res.status(403).json({ error: "该内容仅对已授权学生开放" });
  }
  next();
}

export function teacherCount() {
  return get(`SELECT COUNT(*) AS count FROM users WHERE role = 'teacher'`)?.count || 0;
}

function sessionToken(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[COOKIE_NAME] || "";
}

function parseCookies(header) {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [
          decodeURIComponent(part.slice(0, index)),
          decodeURIComponent(part.slice(index + 1)),
        ];
      }),
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
