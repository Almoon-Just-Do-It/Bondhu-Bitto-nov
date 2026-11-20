import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import bcrypt from "bcryptjs";

const app = new Hono();

const SESSION_COOKIE = "bb_session";
const SESSION_SECONDS = 20 * 60;
const PASSWORD_ITERATIONS = 100000;
const PASSWORD_MAX_LENGTH = 128;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const RESERVED_EMAIL_TLDS = new Set(["local", "localhost", "invalid", "test", "example"]);
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FILE_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

let adminReady = null;
let rateBuckets = new Map();

const secret = (env) => {
  const value = env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("Set JWT_SECRET to a random string of at least 32 characters.");
  }
  return value;
};

const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const validMonth = (value) => MONTH_RE.test(String(value));
const validDate = (value) => DATE_RE.test(String(value)) && !Number.isNaN(Date.parse(value));
const nowIso = () => new Date().toISOString();
const currentMonth = () => nowIso().slice(0, 7);

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return "";
  const at = email.lastIndexOf("@");
  if (at < 1 || at > 64) return "";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return "";
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) return "";
  const tld = labels[labels.length - 1];
  if (RESERVED_EMAIL_TLDS.has(tld)) return "";
  if (!/^[a-z]{2,63}$/i.test(tld) && !/^xn--[a-z0-9-]{2,59}$/i.test(tld)) return "";
  return email;
}

function passwordIssue(password) {
  if (typeof password !== "string" || !password.trim()) {
    return "Enter a password.";
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return "";
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith("pbkdf2$")) {
    const [, iterations, saltBase64, hashBase64] = stored.split("$");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: base64ToBytes(saltBase64), iterations: Number(iterations), hash: "SHA-256" },
      key,
      256
    );
    return equalBytes(new Uint8Array(bits), base64ToBytes(hashBase64));
  }
  return bcrypt.compareSync(password, stored);
}

function parseDataUpload(data, allowedMimes, maxBytes) {
  if (!data) return null;
  const match = String(data).match(/^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || !allowedMimes.has(match[1])) return null;
  const bytes = base64ToBytes(match[2]);
  if (bytes.length > maxBytes || bytesToBase64(bytes) !== match[2]) return null;
  return { mime: match[1], bytes };
}

function parseProfileImage(value) {
  if (value === "") return "";
  const match = String(value).match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return null;
  const bytes = base64ToBytes(match[1]);
  return bytes.length <= 650 * 1024 && bytesToBase64(bytes) === match[1] ? value : null;
}

function safeFilename(value) {
  return clean(value, 120).replace(/[\\/\r\n\0]/g, "_") || "attachment";
}

function blobBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (Array.isArray(data)) return new Uint8Array(data);
  if (data && Array.isArray(data.data)) return new Uint8Array(data.data);
  return data;
}

async function readBody(c) {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function cookieOptions(c) {
  return {
    httpOnly: true,
    sameSite: "Strict",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: SESSION_SECONDS
  };
}

function rateLimit(name, limit, windowMs) {
  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "local";
    const key = `${name}:${ip}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || bucket.reset <= now) {
      bucket = { count: 0, reset: now + windowMs };
      rateBuckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      return c.json({ error: "Too many requests. Please try again later." }, 429);
    }
    if (rateBuckets.size > 5000) {
      for (const [bucketKey, value] of rateBuckets) {
        if (value.reset <= now) rateBuckets.delete(bucketKey);
      }
    }
    await next();
  };
}

const AUDIT_DETAILS_LIMIT = 8000;
const AUDIT_SKIP_PATHS = new Set(["/api/activity-log"]);
const AUDIT_ROUTE_RULES = [
  { method: "POST", pattern: /^\/api\/login$/, action: "user.login", category: "authentication" },
  { method: "POST", pattern: /^\/api\/password\/forgot$/, action: "password.forgot_requested", category: "authentication" },
  { method: "POST", pattern: /^\/api\/password\/reset$/, action: "password.reset_completed", category: "authentication" },
  { method: "POST", pattern: /^\/api\/logout$/, action: "user.logout", category: "authentication" },
  { method: "PATCH", pattern: /^\/api\/profile$/, action: "profile.updated", category: "profile" },
  { method: "POST", pattern: /^\/api\/notices$/, action: "notice.created", category: "notice" },
  { method: "DELETE", pattern: /^\/api\/notices\/[^/]+$/, action: "notice.deleted", category: "notice" },
  { method: "POST", pattern: /^\/api\/emergency$/, action: "emergency.sent", category: "emergency" },
  { method: "PATCH", pattern: /^\/api\/emergency\/[^/]+\/resolve$/, action: "emergency.resolved", category: "emergency" },
  { method: "PATCH", pattern: /^\/api\/emergency\/[^/]+\/reply$/, action: "emergency.replied", category: "emergency" },
  { method: "POST", pattern: /^\/api\/members$/, action: "member.created", category: "member" },
  { method: "GET", pattern: /^\/api\/members\/[^/]+\/profile$/, action: "member.profile_viewed", category: "member" },
  { method: "GET", pattern: /^\/api\/members\/[^/]+\/ledger$/, action: "member.ledger_viewed", category: "member" },
  { method: "PATCH", pattern: /^\/api\/members\/[^/]+\/profile$/, action: "member.profile_updated", category: "member" },
  { method: "PATCH", pattern: /^\/api\/members\/[^/]+\/status$/, action: "member.status_changed", category: "member" },
  { method: "POST", pattern: /^\/api\/members\/[^/]+\/reset-password$/, action: "member.password_reset", category: "member" },
  { method: "POST", pattern: /^\/api\/payments$/, action: "payment.created", category: "payment" },
  { method: "POST", pattern: /^\/api\/payments\/[^/]+\/approve$/, action: "payment.approved", category: "payment" },
  { method: "PATCH", pattern: /^\/api\/payments\/[^/]+$/, action: "payment.updated", category: "payment" },
  { method: "DELETE", pattern: /^\/api\/payments\/[^/]+$/, action: "payment.deleted", category: "payment" },
  { method: "GET", pattern: /^\/api\/report\.csv$/, action: "report.exported", category: "report" }
];

function setAudit(c, patch = {}) {
  const current = c.get("audit") || { details: {} };
  const details = patch.details ? { ...(current.details || {}), ...patch.details } : current.details;
  c.set("audit", { ...current, ...patch, details: details || {} });
}

function auditRequestInfo(c) {
  const method = c.req.method;
  const path = clean(c.req.path, 255);
  const match = AUDIT_ROUTE_RULES.find((rule) => (!rule.method || rule.method === method) && rule.pattern.test(path));
  const action = match ? match.action : `${method.toLowerCase()}.request`;
  const category = match ? match.category : method === "GET" ? "read" : "write";
  return { action, category, method, path, details: {} };
}

function auditActor(c, user, source = "session") {
  if (!user) return;
  setAudit(c, {
    actor: {
      actor_id: Number(user.id) || null,
      actor_name: clean(user.name, 100),
      actor_email: clean(user.email, 254).toLowerCase(),
      actor_role: clean(user.role, 20) || "anonymous",
      actor_source: clean(source, 40)
    }
  });
}

function auditTarget(c, id, label) {
  setAudit(c, { target_user_id: Number(id) || null, target_label: clean(label, 160) });
}

function auditFailure(c, reason, details = {}) {
  setAudit(c, { outcome: "failure", details: { reason, ...details } });
}

function parseAuditDetails(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAuditLog(c) {
  const audit = c.get("audit");
  if (!audit || AUDIT_SKIP_PATHS.has(c.req.path)) return;
  const status = Number(audit.status || c.res?.status) || 500;
  const sessionUser = c.get("user");
  const actor = audit.actor || (sessionUser
    ? {
        actor_id: Number(sessionUser.id) || null,
        actor_name: clean(sessionUser.name, 100),
        actor_email: clean(sessionUser.email, 254).toLowerCase(),
        actor_role: clean(sessionUser.role, 20) || "anonymous",
        actor_source: "session"
      }
    : {
        actor_id: null,
        actor_name: "",
        actor_email: "",
        actor_role: "anonymous",
        actor_source: "anonymous"
      });
  const outcome = audit.outcome || (status >= 200 && status < 300 ? "success" : "failure");
  const ip = clean(c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "local", 100);
  const userAgent = clean(c.req.header("user-agent"), 300);
  const details = JSON.stringify(audit.details || {}).slice(0, AUDIT_DETAILS_LIMIT);
  try {
    await c.env.DB.prepare(`INSERT INTO audit_logs(created_at,actor_id,actor_name,actor_email,actor_role,actor_source,target_user_id,target_label,action,category,method,path,status,outcome,ip,user_agent,details)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        audit.created_at || nowIso(),
        actor.actor_id || null,
        actor.actor_name || "",
        actor.actor_email || "",
        actor.actor_role || "anonymous",
        actor.actor_source || "session",
        audit.target_user_id || null,
        audit.target_label || "",
        audit.action,
        audit.category,
        audit.method,
        audit.path,
        status,
        outcome,
        ip,
        userAgent,
        details
      )
      .run();
  } catch (error) {
    console.error("Audit log write failed:", error.message);
  }
}

async function ensureAdmin(env) {
  if (!adminReady) {
    adminReady = (async () => {
      const email = normalizeEmail(env.ADMIN_EMAIL);
      if (!email) throw new Error("Set ADMIN_EMAIL secret to a valid email address.");
      const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
      if (existing) return;
      const name = clean(env.ADMIN_NAME || "BonDhu Bitto Admin", 100);
      const password = String(env.ADMIN_PASSWORD || "");
      const issue = passwordIssue(password);
      if (issue) throw new Error(`Set ADMIN_PASSWORD secret. ${issue}`);
      const hash = await hashPassword(password);
      await env.DB.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')")
        .bind(name, email, hash)
        .run();
    })().catch((error) => {
      adminReady = null;
      throw error;
    });
  }
  return adminReady;
}

const auth = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "Please sign in." }, 401);
  let payload;
  try {
    payload = await verify(token, secret(c.env), "HS256");
  } catch {
    return c.json({ error: "Session expired. Please sign in again." }, 401);
  }
  const user = await c.env.DB
    .prepare("SELECT id,name,email,phone,role,active,account_no FROM users WHERE id=?")
    .bind(payload.id)
    .first();
  if (!user || !user.active) return c.json({ error: "Account unavailable." }, 401);
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp - now < SESSION_SECONDS / 2) {
    const token = await sign({ id: user.id, exp: now + SESSION_SECONDS }, secret(c.env));
    setCookie(c, SESSION_COOKIE, token, cookieOptions(c));
  }
  c.set("user", user);
  await next();
};

const adminOnly = async (c, next) => {
  if (c.get("user").role !== "admin") {
    return c.json({ error: "Administrator access required." }, 403);
  }
  await next();
};

app.use("/api/*", async (c, next) => {
  c.set("audit", {
    ...auditRequestInfo(c),
    created_at: nowIso(),
    status: null,
    outcome: null,
    actor: null,
    target_user_id: null,
    target_label: ""
  });
  const length = Number(c.req.header("content-length") || 0);
  if (length > 12 * 1024 * 1024) {
    setAudit(c, { status: 413, outcome: "failure", details: { reason: "request_body_too_large" } });
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "SAMEORIGIN");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    await writeAuditLog(c);
    return c.json({ error: "Request body is too large." }, 413);
  }
  try {
    await next();
  } catch (error) {
    setAudit(c, { status: 500, outcome: "failure", details: { reason: "unhandled_error" } });
    throw error;
  } finally {
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "SAMEORIGIN");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    await writeAuditLog(c);
  }
});

app.post("/api/login", rateLimit("login", 10, 15 * 60 * 1000), async (c) => {
  try {
    secret(c.env);
    await ensureAdmin(c.env);
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
  const body = await readBody(c);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  setAudit(c, { details: { submitted_email: clean(body.email, 254).toLowerCase() || "invalid" } });
  if (!email) {
    auditFailure(c, "invalid_email");
    return c.json({ error: "Enter a valid email address." }, 400);
  }
  if (!password || password.length > PASSWORD_MAX_LENGTH) {
    auditFailure(c, "missing_or_invalid_password");
    return c.json({ error: "Enter your email and password." }, 400);
  }
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  const passwordValid = user ? await verifyPassword(password, user.password_hash) : false;
  if (user) auditActor(c, user, "login_attempt");
  if (!user || !user.active || !passwordValid) {
    auditFailure(c, "invalid_credentials");
    return c.json({ error: "Email or password is incorrect." }, 401);
  }
  let passwordHashUpgraded = false;
  if (!user.password_hash.startsWith(`pbkdf2$${PASSWORD_ITERATIONS}$`)) {
    try {
      const hash = await hashPassword(password);
      await c.env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(hash, user.id).run();
      passwordHashUpgraded = true;
    } catch (error) {
      console.error("Password hash upgrade failed:", error.message);
    }
  }
  auditActor(c, user, "login");
  auditTarget(c, user.id, user.email);
  setAudit(c, { details: { reason: "success", password_hash_upgraded: passwordHashUpgraded } });
  const token = await sign(
    { id: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS },
    secret(c.env)
  );
  setCookie(c, SESSION_COOKIE, token, cookieOptions(c));
  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, account_no: user.account_no }
  });
});

async function sendResetEmail(env, { to, name, resetUrl }) {
  const from = env.MAIL_FROM || env.SMTP_FROM;
  if (!env.RESEND_API_KEY || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your BonDhu Bitto password",
      text: `Hello ${name},\n\nUse this link to reset your password. It expires in 30 minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Hello,</p><p>Use this link to reset your BonDhu Bitto password. It expires in 30 minutes.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
    })
  });
  return response.ok;
}

app.post("/api/password/forgot", rateLimit("reset", 5, 15 * 60 * 1000), async (c) => {
  const body = await readBody(c);
  const email = normalizeEmail(body.email);
  setAudit(c, { details: { submitted_email: clean(body.email, 254).toLowerCase() || "invalid", matched: false } });
  if (!c.env.RESEND_API_KEY || !(c.env.MAIL_FROM || c.env.SMTP_FROM)) {
    auditFailure(c, "email_not_configured");
    return c.json({ error: "Password recovery email is not configured. Please contact the administrator." }, 503);
  }
  if (!email) {
    auditFailure(c, "invalid_email");
    return c.json({ error: "Enter a valid email address." }, 400);
  }
  const user = await c.env.DB.prepare("SELECT id,name,email FROM users WHERE email=? AND active=1").bind(email).first();
  if (user) {
    auditActor(c, user, "password_reset_request");
    auditTarget(c, user.id, user.email);
    setAudit(c, { details: { matched: true, reset_record_created: true, email_sent: false } });
    const now = Date.now();
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = now + 30 * 60 * 1000;
    await c.env.DB.prepare("DELETE FROM password_resets WHERE user_id=? OR expires_at<=?").bind(user.id, now).run();
    await c.env.DB.prepare("INSERT INTO password_resets(user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?)")
      .bind(user.id, tokenHash, expiresAt, now)
      .run();
    let resetUrl;
    try {
      const base = c.env.APP_URL && c.env.APP_URL.includes("YOUR-SUBDOMAIN")
        ? new URL(c.req.url).origin
        : (c.env.APP_URL || new URL(c.req.url).origin);
      const url = new URL(base);
      url.searchParams.set("reset", token);
      resetUrl = url.toString();
    } catch {
      await c.env.DB.prepare("DELETE FROM password_resets WHERE token_hash=?").bind(tokenHash).run();
      auditFailure(c, "reset_url_unavailable", { matched: true, reset_record_created: false });
      return c.json({ error: "Password recovery is not available. Please contact the administrator." }, 503);
    }
    try {
      const sent = await sendResetEmail(c.env, { to: user.email, name: user.name, resetUrl });
      if (!sent) throw new Error("Email delivery failed");
      setAudit(c, { details: { email_sent: true } });
    } catch (error) {
      await c.env.DB.prepare("DELETE FROM password_resets WHERE token_hash=?").bind(tokenHash).run();
      auditFailure(c, "email_delivery_failed", { matched: true, reset_record_created: false, email_sent: false });
      console.error("Password reset email delivery failed:", error.message);
    }
  }
  return c.json({ message: "If an active account matches that email, a password reset link will be sent." });
});

app.post("/api/password/reset", rateLimit("reset", 5, 15 * 60 * 1000), async (c) => {
  const body = await readBody(c);
  const token = clean(body.token, 128);
  const password = String(body.password || "");
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const reset = await c.env.DB
    .prepare("SELECT pr.user_id,u.email,u.name,u.role FROM password_resets pr JOIN users u ON u.id=pr.user_id WHERE pr.token_hash=? AND pr.expires_at>? AND pr.used_at IS NULL")
    .bind(tokenHash, now)
    .first();
  if (!reset) {
    auditFailure(c, "invalid_or_expired_token");
    return c.json({ error: "This password reset link is invalid or has expired." }, 400);
  }
  auditActor(c, { id: reset.user_id, email: reset.email, name: reset.name, role: reset.role }, "password_reset_token");
  auditTarget(c, reset.user_id, reset.email);
  const issue = passwordIssue(password);
  if (issue) {
    auditFailure(c, "password_policy_failed", { reason_detail: issue });
    return c.json({ error: issue }, 400);
  }
  const hash = await hashPassword(password);
  const results = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash=? WHERE id=? AND active=1").bind(hash, reset.user_id),
    c.env.DB.prepare("DELETE FROM password_resets WHERE user_id=?").bind(reset.user_id)
  ]);
  if (!results[0].meta.changes) {
    auditFailure(c, "invalid_or_expired_token");
    return c.json({ error: "This password reset link is invalid or has expired." }, 400);
  }
  setAudit(c, { details: { reason: "password_changed", reset_rows_deleted: results[1].meta.changes } });
  return c.json({ ok: true });
});

app.post("/api/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    try {
      const payload = await verify(token, secret(c.env), "HS256");
      const user = await c.env.DB
        .prepare("SELECT id,name,email,role FROM users WHERE id=?")
        .bind(payload.id)
        .first();
      if (user) auditActor(c, user, "session_cookie");
    } catch {
      setAudit(c, { details: { reason: "expired_or_invalid_session" } });
    }
  }
  deleteCookie(c, SESSION_COOKIE, { ...cookieOptions(c), maxAge: 0 });
  return c.json({ ok: true });
});

app.get("/api/me", auth, (c) => c.json({ user: c.get("user") }));

app.get("/api/profile", auth, async (c) => {
  const profile = await c.env.DB
    .prepare("SELECT id,name,email,phone,account_no,father_name,mother_name,nominee_name,nid,nominee_nid,profile_photo,nid_photo,nominee_nid_photo,own_signature,nominee_signature FROM users WHERE id=?")
    .bind(c.get("user").id)
    .first();
  return c.json({ profile });
});

app.patch("/api/profile", auth, async (c) => {
  const body = await readBody(c);
  const imageFields = ["profilePhoto", "nidPhoto", "nomineeNidPhoto", "ownSignature", "nomineeSignature"];
  setAudit(c, {
    target_user_id: c.get("user").id,
    target_label: clean(c.get("user").email, 254),
    details: {
      fields: Object.keys(body).filter((key) => !imageFields.includes(key)).sort().join(","),
      images: imageFields.filter((key) => body[key] !== undefined && body[key] !== null).join(",")
    }
  });
  const name = clean(body.name, 100);
  const fatherName = clean(body.fatherName, 100);
  const motherName = clean(body.motherName, 100);
  const nomineeName = clean(body.nomineeName, 100);
  const nid = clean(body.nid, 30);
  const nomineeNid = clean(body.nomineeNid, 30);
  const profilePhoto = body.profilePhoto === undefined || body.profilePhoto === null ? null : parseProfileImage(body.profilePhoto);
  const nidPhoto = body.nidPhoto === undefined || body.nidPhoto === null ? null : parseProfileImage(body.nidPhoto);
  const nomineeNidPhoto = body.nomineeNidPhoto === undefined || body.nomineeNidPhoto === null ? null : parseProfileImage(body.nomineeNidPhoto);
  const ownSignature = body.ownSignature === undefined || body.ownSignature === null ? null : parseProfileImage(body.ownSignature);
  const nomineeSignature = body.nomineeSignature === undefined || body.nomineeSignature === null ? null : parseProfileImage(body.nomineeSignature);
  if (
    (body.profilePhoto !== undefined && body.profilePhoto !== null && profilePhoto === null) ||
    (body.nidPhoto !== undefined && body.nidPhoto !== null && nidPhoto === null) ||
    (body.nomineeNidPhoto !== undefined && body.nomineeNidPhoto !== null && nomineeNidPhoto === null) ||
    (body.ownSignature !== undefined && body.ownSignature !== null && ownSignature === null) ||
    (body.nomineeSignature !== undefined && body.nomineeSignature !== null && nomineeSignature === null)
  ) {
    auditFailure(c, "invalid_image");
    return c.json({ error: "Profile photos, NID images and signatures must be JPEG images smaller than 650 KB each." }, 400);
  }
  if (!name) {
    auditFailure(c, "missing_name");
    return c.json({ error: "Enter your full name." }, 400);
  }
  await c.env.DB
    .prepare("UPDATE users SET name=?,father_name=?,mother_name=?,nominee_name=?,nid=?,nominee_nid=?,profile_photo=COALESCE(?,profile_photo),nid_photo=COALESCE(?,nid_photo),nominee_nid_photo=COALESCE(?,nominee_nid_photo),own_signature=COALESCE(?,own_signature),nominee_signature=COALESCE(?,nominee_signature) WHERE id=?")
    .bind(name, fatherName, motherName, nomineeName, nid, nomineeNid, profilePhoto, nidPhoto, nomineeNidPhoto, ownSignature, nomineeSignature, c.get("user").id)
    .run();
  const profile = await c.env.DB
    .prepare("SELECT id,name,email,phone,account_no,father_name,mother_name,nominee_name,nid,nominee_nid,profile_photo,nid_photo,nominee_nid_photo,own_signature,nominee_signature FROM users WHERE id=?")
    .bind(c.get("user").id)
    .first();
  return c.json({ profile });
});

app.get("/api/contact-info", auth, (c) =>
  c.json({ whatsappNumber: clean(c.env.WHATSAPP_NUMBER, 30).replace(/\D/g, "") })
);

app.get("/api/notices", auth, async (c) => {
  const result = await c.env.DB.prepare(`SELECT n.id,n.title,n.body,n.file_name,n.created_at,u.name created_by,
    (n.image_data IS NOT NULL) has_image,(n.file_data IS NOT NULL) has_file
    FROM notices n JOIN users u ON u.id=n.created_by ORDER BY n.created_at DESC,n.id DESC`).all();
  return c.json({ notices: result.results });
});

app.post("/api/notices", auth, adminOnly, async (c) => {
  const body = await readBody(c);
  const title = clean(body.title, 120);
  const text = clean(body.body, 4000);
  const image = body.image ? parseDataUpload(body.image, IMAGE_MIMES, 2 * 1024 * 1024) : null;
  const file = body.file ? parseDataUpload(body.file, FILE_MIMES, 4 * 1024 * 1024) : null;
  if (!title) {
    auditFailure(c, "missing_title");
    return c.json({ error: "Enter a notice title." }, 400);
  }
  if (!text && !body.image && !body.file) {
    auditFailure(c, "empty_notice");
    return c.json({ error: "Add notice text, an image, or a file." }, 400);
  }
  if (body.image && !image) {
    auditFailure(c, "invalid_image");
    return c.json({ error: "Notice image must be JPEG, PNG or WebP under 2 MB." }, 400);
  }
  if (body.file && !file) {
    auditFailure(c, "invalid_file");
    return c.json({ error: "File must be PDF, TXT, DOC or DOCX under 4 MB." }, 400);
  }
  const fileName = file ? safeFilename(body.fileName) : null;
  setAudit(c, {
    details: {
      title,
      body_length: text.length,
      has_image: Boolean(image),
      has_file: Boolean(file),
      file_name: fileName || ""
    }
  });
  const info = await c.env.DB
    .prepare("INSERT INTO notices(title,body,image_mime,image_data,file_name,file_mime,file_data,created_by) VALUES(?,?,?,?,?,?,?,?)")
    .bind(title, text, image?.mime || null, image?.bytes || null, fileName, file?.mime || null, file?.bytes || null, c.get("user").id)
    .run();
  const noticeId = info.meta.last_row_id;
  setAudit(c, { target_label: `Notice #${noticeId}`, details: { notice_id: noticeId } });
  return c.json({ id: noticeId }, 201);
});

app.get("/api/notices/:id/image", auth, async (c) => {
  const notice = await c.env.DB
    .prepare("SELECT image_mime,image_data FROM notices WHERE id=?")
    .bind(Number(c.req.param("id")))
    .first();
  if (!notice?.image_data) return c.json({ error: "Notice image not found." }, 404);
  return c.body(blobBytes(notice.image_data), 200, {
    "Content-Type": notice.image_mime,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  });
});

app.get("/api/notices/:id/file", auth, async (c) => {
  const notice = await c.env.DB
    .prepare("SELECT file_name,file_mime,file_data FROM notices WHERE id=?")
    .bind(Number(c.req.param("id")))
    .first();
  if (!notice?.file_data) return c.json({ error: "Notice file not found." }, 404);
  return c.body(blobBytes(notice.file_data), 200, {
    "Content-Type": notice.file_mime,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(notice.file_name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  });
});

app.delete("/api/notices/:id", auth, adminOnly, async (c) => {
  const noticeId = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT title,created_by FROM notices WHERE id=?").bind(noticeId).first();
  const info = await c.env.DB.prepare("DELETE FROM notices WHERE id=?").bind(noticeId).run();
  setAudit(c, { details: { notice_id: noticeId, title: existing?.title || "", author_id: existing?.created_by || null } });
  if (!info.meta.changes) {
    auditFailure(c, "notice_not_found");
    return c.json({ error: "Notice not found." }, 404);
  }
  return c.json({ ok: true });
});

app.post("/api/emergency", auth, rateLimit("emergency", 3, 15 * 60 * 1000), async (c) => {
  if (c.get("user").role !== "member") {
    return c.json({ error: "Only member accounts can send emergency messages." }, 403);
  }
  const body = await readBody(c);
  const text = clean(body.body, 2000);
  const image = body.image ? parseDataUpload(body.image, IMAGE_MIMES, 2 * 1024 * 1024) : null;
  const file = body.file ? parseDataUpload(body.file, FILE_MIMES, 4 * 1024 * 1024) : null;
  setAudit(c, {
    target_user_id: c.get("user").id,
    target_label: clean(c.get("user").account_no || c.get("user").email, 160),
    details: { body_length: text.length, has_image: Boolean(image), has_file: Boolean(file), file_name: file ? safeFilename(body.fileName) : "" }
  });
  if (!text && !body.image && !body.file) {
    auditFailure(c, "empty_emergency");
    return c.json({ error: "Write a message or attach a file." }, 400);
  }
  if (body.image && !image) {
    auditFailure(c, "invalid_image");
    return c.json({ error: "Image must be JPEG, PNG or WebP under 2 MB." }, 400);
  }
  if (body.file && !file) {
    auditFailure(c, "invalid_file");
    return c.json({ error: "File must be PDF, TXT, DOC or DOCX under 4 MB." }, 400);
  }
  const info = await c.env.DB
    .prepare("INSERT INTO emergency_messages(member_id,body,image_mime,image_data,file_name,file_mime,file_data) VALUES(?,?,?,?,?,?,?)")
    .bind(c.get("user").id, text, image?.mime || null, image?.bytes || null, file ? safeFilename(body.fileName) : null, file?.mime || null, file?.bytes || null)
    .run();
  const messageId = info.meta.last_row_id;
  setAudit(c, { target_label: `Emergency #${messageId}`, details: { message_id: messageId } });
  return c.json({ id: messageId, status: "new" }, 201);
});

app.get("/api/emergency", auth, adminOnly, async (c) => {
  const result = await c.env.DB.prepare(`SELECT e.id,e.body,e.status,e.created_at,e.resolved_at,e.file_name,e.admin_reply,e.replied_at,
    (e.image_data IS NOT NULL) has_image,(e.file_data IS NOT NULL) has_file,
    u.id member_id,u.name member_name,u.account_no,u.email,u.phone
    FROM emergency_messages e JOIN users u ON u.id=e.member_id
    ORDER BY CASE e.status WHEN 'new' THEN 0 ELSE 1 END,e.created_at DESC,e.id DESC`).all();
  return c.json({ messages: result.results });
});

app.get("/api/emergency/member", auth, async (c) => {
  if (c.get("user").role !== "member") {
    return c.json({ error: "Only member accounts can view their emergency messages." }, 403);
  }
  const result = await c.env.DB.prepare(`SELECT e.id,e.body,e.status,e.created_at,e.admin_reply,e.replied_at,e.file_name,
    (e.image_data IS NOT NULL) has_image,(e.file_data IS NOT NULL) has_file
    FROM emergency_messages e WHERE e.member_id=? ORDER BY e.created_at DESC,e.id DESC`)
    .bind(c.get("user").id)
    .all();
  return c.json({ messages: result.results });
});

app.get("/api/emergency/:id/image", auth, adminOnly, async (c) => {
  const message = await c.env.DB
    .prepare("SELECT image_mime,image_data FROM emergency_messages WHERE id=?")
    .bind(Number(c.req.param("id")))
    .first();
  if (!message?.image_data) return c.json({ error: "Emergency image not found." }, 404);
  return c.body(blobBytes(message.image_data), 200, {
    "Content-Type": message.image_mime,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  });
});

app.get("/api/emergency/:id/file", auth, adminOnly, async (c) => {
  const message = await c.env.DB
    .prepare("SELECT file_name,file_mime,file_data FROM emergency_messages WHERE id=?")
    .bind(Number(c.req.param("id")))
    .first();
  if (!message?.file_data) return c.json({ error: "Emergency file not found." }, 404);
  return c.body(blobBytes(message.file_data), 200, {
    "Content-Type": message.file_mime,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(message.file_name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  });
});

app.patch("/api/emergency/:id/resolve", auth, adminOnly, async (c) => {
  const messageId = Number(c.req.param("id"));
  const info = await c.env.DB
    .prepare("UPDATE emergency_messages SET status='resolved',resolved_at=?,resolved_by=? WHERE id=? AND status='new'")
    .bind(nowIso(), c.get("user").id, messageId)
    .run();
  setAudit(c, { target_label: `Emergency #${messageId}`, details: { message_id: messageId } });
  if (!info.meta.changes) {
    auditFailure(c, "emergency_not_found");
    return c.json({ error: "New emergency message not found." }, 404);
  }
  return c.json({ ok: true });
});

app.patch("/api/emergency/:id/reply", auth, adminOnly, async (c) => {
  const messageId = Number(c.req.param("id"));
  const body = await readBody(c);
  const reply = clean(body.reply, 2000);
  setAudit(c, { target_label: `Emergency #${messageId}`, details: { message_id: messageId, reply_length: reply.length } });
  if (!reply) {
    auditFailure(c, "empty_emergency_reply");
    return c.json({ error: "Write feedback before sending." }, 400);
  }
  const now = nowIso();
  const info = await c.env.DB
    .prepare("UPDATE emergency_messages SET admin_reply=?,replied_at=?,replied_by=?,status='resolved',resolved_at=COALESCE(resolved_at,?),resolved_by=COALESCE(resolved_by,?) WHERE id=?")
    .bind(reply, now, c.get("user").id, now, c.get("user").id, messageId)
    .run();
  if (!info.meta.changes) {
    auditFailure(c, "emergency_not_found");
    return c.json({ error: "Emergency message not found." }, 404);
  }
  return c.json({ ok: true });
});

app.get("/api/dashboard", auth, async (c) => {
  const user = c.get("user");
  const month = currentMonth();
  if (user.role === "member") {
    const [total, current, communityTotal, members, payments] = await Promise.all([
      c.env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE member_id=? AND status='approved'").bind(user.id).first(),
      c.env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE member_id=? AND kisti_month=? AND status='approved'").bind(user.id, month).first(),
      c.env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE status='approved'").first(),
      c.env.DB.prepare("SELECT COUNT(*) count FROM users WHERE role='member' AND active=1").first(),
      c.env.DB.prepare("SELECT * FROM payments WHERE member_id=? ORDER BY paid_date DESC,id DESC LIMIT 100").bind(user.id).all()
    ]);
    return c.json({
      member: true,
      total: total.total,
      current: current.total,
      communityTotal: communityTotal.total,
      members: members.count,
      average: members.count ? communityTotal.total / members.count : 0,
      payments: payments.results
    });
  }
  const [total, current, members, profileRows, recent] = await Promise.all([
    c.env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE status='approved'").first(),
    c.env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE kisti_month=? AND status='approved'").bind(month).first(),
    c.env.DB.prepare("SELECT COUNT(*) count FROM users WHERE role='member' AND active=1").first(),
    c.env.DB.prepare(`SELECT id,name,email,active,phone,father_name,mother_name,nominee_name,nid,nominee_nid,
      LENGTH(profile_photo)>0 has_profile_photo,LENGTH(nid_photo)>0 has_nid_photo,
      LENGTH(nominee_nid_photo)>0 has_nominee_nid_photo,LENGTH(own_signature)>0 has_own_signature,
      LENGTH(nominee_signature)>0 has_nominee_signature FROM users WHERE role='member' ORDER BY name COLLATE NOCASE`).all(),
    c.env.DB.prepare(`SELECT p.*,u.name member_name FROM payments p JOIN users u ON u.id=p.member_id
      WHERE p.status='approved' ORDER BY p.paid_date DESC,p.id DESC LIMIT 8`).all()
  ]);
  const profileFields = [
    "name", "email", "phone", "father_name", "mother_name", "nominee_name", "nid", "nominee_nid",
    "has_profile_photo", "has_nid_photo", "has_nominee_nid_photo", "has_own_signature", "has_nominee_signature"
  ];
  const profileCompletion = profileRows.results.map((member) => {
    const completed = profileFields.filter((field) => Boolean(member[field])).length;
    return {
      id: member.id,
      name: member.name,
      active: Boolean(member.active),
      completed,
      total: profileFields.length,
      percentage: Math.round((completed * 100) / profileFields.length)
    };
  });
  return c.json({
    member: false,
    total: total.total,
    current: current.total,
    members: members.count,
    average: members.count ? total.total / members.count : 0,
    recent: recent.results,
    profileCompletion
  });
});

app.get("/api/members", auth, adminOnly, async (c) => {
  const result = await c.env.DB.prepare(`SELECT u.id,u.account_no,u.name,u.email,u.phone,u.active,u.created_at,
    COALESCE(SUM(CASE WHEN p.status='approved' THEN p.amount ELSE 0 END),0) total_saved FROM users u LEFT JOIN payments p ON p.member_id=u.id
    WHERE u.role='member' GROUP BY u.id ORDER BY u.name COLLATE NOCASE`).all();
  return c.json({ members: result.results });
});

app.get("/api/members/:id/profile", auth, adminOnly, async (c) => {
  const memberId = Number(c.req.param("id"));
  setAudit(c, { target_user_id: memberId, target_label: `Member #${memberId}`, details: { member_id: memberId } });
  const profile = await c.env.DB
    .prepare("SELECT id,account_no,name,email,phone,father_name,mother_name,nominee_name,nid,nominee_nid,profile_photo,nid_photo,nominee_nid_photo,own_signature,nominee_signature FROM users WHERE id=? AND role='member'")
    .bind(Number(c.req.param("id")))
    .first();
  if (!profile) return c.json({ error: "Member not found." }, 404);
  return c.json({ profile });
});

app.get("/api/members/:id/ledger", auth, adminOnly, async (c) => {
  const memberId = Number(c.req.param("id"));
  setAudit(c, { target_user_id: memberId, target_label: `Member #${memberId}`, details: { member_id: memberId } });
  if (!Number.isInteger(memberId) || memberId < 1) return c.json({ error: "Invalid member account." }, 400);
  const member = await c.env.DB
    .prepare("SELECT id,account_no,name,email,phone,active,father_name,mother_name,nominee_name,nid,nominee_nid FROM users WHERE id=? AND role='member'")
    .bind(memberId)
    .first();
  if (!member) return c.json({ error: "Member not found." }, 404);
  const payments = await c.env.DB
    .prepare("SELECT id,kisti_month,paid_date,amount,method,reference,note,status,created_at,approved_at FROM payments WHERE member_id=? ORDER BY kisti_month DESC,paid_date DESC,id DESC")
    .bind(memberId)
    .all();
  const approvedTotal = payments.results.filter((payment) => payment.status === "approved").reduce((sum, payment) => sum + payment.amount, 0);
  const pendingTotal = payments.results.filter((payment) => payment.status === "pending").reduce((sum, payment) => sum + payment.amount, 0);
  return c.json({ member, payments: payments.results, approvedTotal, pendingTotal });
});

app.patch("/api/members/:id/profile", auth, adminOnly, async (c) => {
  const body = await readBody(c);
  const memberId = Number(c.req.param("id"));
  const imageFields = ["profilePhoto", "nidPhoto", "nomineeNidPhoto", "ownSignature", "nomineeSignature"];
  setAudit(c, {
    target_user_id: memberId,
    target_label: `Member #${memberId}`,
    details: {
      fields: Object.keys(body).filter((key) => !imageFields.includes(key)).sort().join(","),
      images: imageFields.filter((key) => body[key] !== undefined && body[key] !== null).join(",")
    }
  });
  const name = clean(body.name, 100);
  const email = normalizeEmail(body.email);
  const phone = clean(body.phone, 30);
  const fatherName = clean(body.fatherName, 100);
  const motherName = clean(body.motherName, 100);
  const nomineeName = clean(body.nomineeName, 100);
  const nid = clean(body.nid, 30);
  const nomineeNid = clean(body.nomineeNid, 30);
  const images = {
    profilePhoto: body.profilePhoto,
    nidPhoto: body.nidPhoto,
    nomineeNidPhoto: body.nomineeNidPhoto,
    ownSignature: body.ownSignature,
    nomineeSignature: body.nomineeSignature
  };
  for (const [field, value] of Object.entries(images)) {
    if (value !== undefined && value !== null) {
      images[field] = parseProfileImage(value);
      if (images[field] === null) {
        auditFailure(c, "invalid_image", { field });
        return c.json({ error: "Profile photos, NID images and signatures must be JPEG images smaller than 650 KB each." }, 400);
      }
    } else {
      images[field] = null;
    }
  }
  if (!Number.isInteger(memberId) || memberId < 1 || !name || !email) {
    auditFailure(c, "invalid_member_details");
    return c.json({ error: "Enter a member name and a valid email address." }, 400);
  }
  try {
    const info = await c.env.DB
      .prepare("UPDATE users SET name=?,email=?,phone=?,father_name=?,mother_name=?,nominee_name=?,nid=?,nominee_nid=?,profile_photo=COALESCE(?,profile_photo),nid_photo=COALESCE(?,nid_photo),nominee_nid_photo=COALESCE(?,nominee_nid_photo),own_signature=COALESCE(?,own_signature),nominee_signature=COALESCE(?,nominee_signature) WHERE id=? AND role='member'")
      .bind(name, email, phone, fatherName, motherName, nomineeName, nid, nomineeNid, images.profilePhoto, images.nidPhoto, images.nomineeNidPhoto, images.ownSignature, images.nomineeSignature, memberId)
      .run();
    if (!info.meta.changes) return c.json({ error: "Member not found." }, 404);
    const profile = await c.env.DB
      .prepare("SELECT id,account_no,name,email,phone,father_name,mother_name,nominee_name,nid,nominee_nid,profile_photo,nid_photo,nominee_nid_photo,own_signature,nominee_signature FROM users WHERE id=?")
      .bind(memberId)
      .first();
    return c.json({ profile });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return c.json({ error: "This email is already registered." }, 409);
    }
    throw error;
  }
});

app.post("/api/members", auth, adminOnly, async (c) => {
  const body = await readBody(c);
  const name = clean(body.name, 100);
  const email = normalizeEmail(body.email);
  const phone = clean(body.phone, 30);
  const password = String(body.password || "");
  if (!name || !email) {
    return c.json({ error: "Enter a member name and a valid email address." }, 400);
  }
  const issue = passwordIssue(password);
  if (issue) return c.json({ error: issue }, 400);
  try {
    const hash = await hashPassword(password);
    const info = await c.env.DB
      .prepare("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,'member')")
      .bind(name, email, phone, hash)
      .run();
    const id = info.meta.last_row_id;
    const accountNo = `BB-${String(id).padStart(6, "0")}`;
    await c.env.DB.prepare("UPDATE users SET account_no=? WHERE id=?").bind(accountNo, id).run();
    setAudit(c, { target_user_id: id, target_label: `${name} (${accountNo})`, details: { user_id: id, account_no: accountNo, email, phone } });
    return c.json({ id, accountNo }, 201);
  } catch (error) {
    auditFailure(c, String(error.message).includes("UNIQUE") ? "duplicate_email" : "create_failed", { email });
    return c.json({ error: String(error.message).includes("UNIQUE") ? "This email is already registered." : "Could not create member." }, 409);
  }
});

app.patch("/api/members/:id/status", auth, adminOnly, async (c) => {
  const body = await readBody(c);
  const memberId = Number(c.req.param("id"));
  const active = body.active ? 1 : 0;
  const info = await c.env.DB
    .prepare("UPDATE users SET active=? WHERE id=? AND role='member'")
    .bind(active, memberId)
    .run();
  setAudit(c, { target_user_id: memberId, target_label: `Member #${memberId}`, details: { member_id: memberId, active } });
  if (!info.meta.changes) {
    auditFailure(c, "member_not_found");
    return c.json({ error: "Member not found." }, 404);
  }
  return c.json({ ok: true });
});

app.post("/api/members/:id/reset-password", auth, adminOnly, async (c) => {
  const memberId = Number(c.req.param("id"));
  const body = await readBody(c);
  const password = String(body.password || "");
  const member = await c.env.DB
    .prepare("SELECT id,name,email,account_no FROM users WHERE id=? AND role='member'")
    .bind(memberId)
    .first();
  if (!member) {
    auditFailure(c, "member_not_found", { member_id: memberId });
    return c.json({ error: "Member not found." }, 404);
  }
  const issue = passwordIssue(password);
  if (issue) {
    auditFailure(c, "password_policy_failed", { reason_detail: issue });
    return c.json({ error: issue }, 400);
  }
  const hash = await hashPassword(password);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash=? WHERE id=? AND role='member'").bind(hash, memberId),
    c.env.DB.prepare("DELETE FROM password_resets WHERE user_id=?").bind(memberId)
  ]);
  setAudit(c, {
    target_user_id: memberId,
    target_label: `${member.name} (${member.account_no || memberId})`,
    details: { user_id: memberId, email: member.email, reason: "password_reset_by_admin" }
  });
  return c.json({ ok: true });
});

app.get("/api/payments", auth, async (c) => {
  const user = c.get("user");
  const sql = "SELECT p.*,u.name member_name,u.email member_email,u.phone member_phone FROM payments p JOIN users u ON u.id=p.member_id";
  const result = user.role === "admin"
    ? await c.env.DB.prepare(`${sql} ORDER BY p.paid_date DESC,p.id DESC LIMIT 500`).all()
    : await c.env.DB.prepare(`${sql} WHERE p.member_id=? ORDER BY p.paid_date DESC,p.id DESC LIMIT 500`).bind(user.id).all();
  return c.json({ payments: result.results });
});

app.post("/api/payments", auth, async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const memberId = user.role === "admin" ? Number(body.memberId) : user.id;
  const amount = Number(body.amount);
  const month = clean(body.month, 7);
  const date = clean(body.date, 10);
  const method = clean(body.method, 30) || "Cash";
  const reference = clean(body.reference, 80);
  const note = clean(body.note, 250);
  const member = await c.env.DB.prepare("SELECT id FROM users WHERE id=? AND role='member' AND active=1").bind(memberId).first();
  if (!member || !Number.isFinite(amount) || amount <= 0 || amount > 100000000 || !validMonth(month) || !validDate(date)) {
    auditFailure(c, "invalid_payment", { member_id: memberId || null, amount, month, date });
    return c.json({ error: "Check member, amount, kisti month and payment date." }, 400);
  }
  const status = user.role === "admin" ? "approved" : "pending";
  setAudit(c, {
    target_user_id: memberId,
    target_label: `Member #${memberId}`,
    details: { member_id: memberId, amount, month, paid_date: date, method, reference, note, status }
  });
  const info = await c.env.DB
    .prepare("INSERT INTO payments(member_id,amount,kisti_month,paid_date,method,reference,note,recorded_by,status,approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .bind(memberId, amount, month, date, method, reference, note, user.id, status, status === "approved" ? user.id : null, status === "approved" ? nowIso() : null)
    .run();
  const paymentId = info.meta.last_row_id;
  setAudit(c, { target_label: `Payment #${paymentId}`, details: { payment_id: paymentId } });
  return c.json({ id: paymentId, status }, 201);
});

app.post("/api/payments/:id/approve", auth, adminOnly, async (c) => {
  const paymentId = Number(c.req.param("id"));
  setAudit(c, { target_label: `Payment #${paymentId}`, details: { payment_id: paymentId } });
  if (!Number.isInteger(paymentId) || paymentId < 1) {
    auditFailure(c, "invalid_payment");
    return c.json({ error: "Invalid payment record." }, 400);
  }
  const info = await c.env.DB
    .prepare("UPDATE payments SET status='approved',approved_by=?,approved_at=? WHERE id=? AND status='pending'")
    .bind(c.get("user").id, nowIso(), paymentId)
    .run();
  if (!info.meta.changes) {
    auditFailure(c, "pending_payment_not_found");
    return c.json({ error: "Pending payment not found." }, 404);
  }
  return c.json({ ok: true, status: "approved" });
});

app.patch("/api/payments/:id", auth, adminOnly, async (c) => {
  const body = await readBody(c);
  const paymentId = Number(c.req.param("id"));
  const memberId = Number(body.memberId);
  const amount = Number(body.amount);
  const month = clean(body.month, 7);
  const date = clean(body.date, 10);
  const method = clean(body.method, 30) || "Cash";
  const reference = clean(body.reference, 80);
  const note = clean(body.note, 250);
  const member = await c.env.DB.prepare("SELECT id FROM users WHERE id=? AND role='member'").bind(memberId).first();
  const before = await c.env.DB
    .prepare("SELECT member_id,amount,kisti_month,paid_date,method,reference,note FROM payments WHERE id=?")
    .bind(paymentId)
    .first();
  const after = { member_id: memberId, amount, kisti_month: month, paid_date: date, method, reference, note };
  setAudit(c, {
    target_user_id: memberId,
    target_label: `Payment #${paymentId}`,
    details: { payment_id: paymentId, before: before || null, after }
  });
  if (!Number.isInteger(paymentId) || paymentId < 1 || !member || !Number.isFinite(amount) || amount <= 0 || amount > 100000000 || !validMonth(month) || !validDate(date)) {
    auditFailure(c, "invalid_payment");
    return c.json({ error: "Check member, amount, kisti month and payment date." }, 400);
  }
  const info = await c.env.DB
    .prepare("UPDATE payments SET member_id=?,amount=?,kisti_month=?,paid_date=?,method=?,reference=?,note=? WHERE id=?")
    .bind(memberId, amount, month, date, method, reference, note, paymentId)
    .run();
  if (!info.meta.changes) {
    auditFailure(c, "payment_not_found");
    return c.json({ error: "Payment not found." }, 404);
  }
  return c.json({ ok: true });
});

app.delete("/api/payments/:id", auth, adminOnly, async (c) => {
  const paymentId = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT * FROM payments WHERE id=?").bind(paymentId).first();
  const info = await c.env.DB.prepare("DELETE FROM payments WHERE id=?").bind(paymentId).run();
  setAudit(c, { target_label: `Payment #${paymentId}`, details: { payment_id: paymentId, deleted: existing || null } });
  if (!info.meta.changes) {
    auditFailure(c, "payment_not_found");
    return c.json({ error: "Payment not found." }, 404);
  }
  return c.json({ ok: true });
});

app.get("/api/report.csv", auth, adminOnly, async (c) => {
  const result = await c.env.DB.prepare(`SELECT u.name,u.email,u.phone,p.kisti_month,p.paid_date,p.amount,p.method,p.reference,p.note
    FROM payments p JOIN users u ON u.id=p.member_id WHERE p.status='approved' ORDER BY p.paid_date DESC,p.id DESC`).all();
  setAudit(c, { details: { format: "csv", rows: result.results.length, scope: "approved_all" } });
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["Member", "Email", "Phone", "Kisti month", "Paid date", "Amount BDT", "Method", "Reference", "Note"],
    ...result.results.map((row) => [row.name, row.email, row.phone, row.kisti_month, row.paid_date, row.amount, row.method, row.reference, row.note])
  ].map((row) => row.map(quote).join(",")).join("\r\n");
  return c.body(`\ufeff${csv}`, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="bondhu-bitto-report.csv"'
  });
});

app.get("/api/activity-log", auth, adminOnly, async (c) => {
  const user = c.get("user");
  const query = c.req.query();
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
  const where = [];
  const params = [];
  if (user.role !== "admin") {
    where.push("actor_id=?");
    params.push(user.id);
  } else if (/^\d+$/.test(query.user || "")) {
    where.push("actor_id=?");
    params.push(Number(query.user));
  }
  const action = clean(query.action, 80);
  const category = clean(query.category, 40);
  const outcome = clean(query.outcome, 20);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || "") ? query.from : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || "") ? query.to : "";
  const search = clean(query.search, 100);
  if (action) {
    where.push("action=?");
    params.push(action);
  }
  if (category) {
    where.push("category=?");
    params.push(category);
  }
  if (outcome === "success" || outcome === "failure") {
    where.push("outcome=?");
    params.push(outcome);
  }
  if (from) {
    where.push("created_at>=?");
    params.push(`${from}T00:00:00.000Z`);
  }
  if (to) {
    where.push("created_at<=?");
    params.push(`${to}T23:59:59.999Z`);
  }
  if (search) {
    const term = `%${search}%`;
    where.push("(action LIKE ? OR actor_name LIKE ? OR actor_email LIKE ? OR target_label LIKE ? OR details LIKE ?)");
    params.push(term, term, term, term, term);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await c.env.DB
    .prepare(`SELECT id,created_at,actor_id,actor_name,actor_email,actor_role,actor_source,target_user_id,target_label,action,category,method,path,status,outcome,ip,user_agent,details
      FROM audit_logs ${whereSql} ORDER BY id DESC LIMIT ?`)
    .bind(...params, limit)
    .all();
  const count = await c.env.DB.prepare(`SELECT COUNT(*) count FROM audit_logs ${whereSql}`).bind(...params).first();
  const scopeWhere = user.role === "admin" ? "" : "WHERE actor_id=?";
  const scopeParams = user.role === "admin" ? [] : [user.id];
  const today = nowIso().slice(0, 10);
  const [stats, actionRows, categoryRows, userRows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN substr(created_at,1,10)=? THEN 1 ELSE 0 END),0) today,COALESCE(SUM(CASE WHEN outcome='failure' THEN 1 ELSE 0 END),0) failures,COUNT(DISTINCT actor_id) actors FROM audit_logs ${scopeWhere}`)
      .bind(today, ...scopeParams)
      .first(),
    c.env.DB.prepare(`SELECT DISTINCT action FROM audit_logs ${scopeWhere} ORDER BY action`).bind(...scopeParams).all(),
    c.env.DB.prepare(`SELECT DISTINCT category FROM audit_logs ${scopeWhere} ORDER BY category`).bind(...scopeParams).all(),
    user.role === "admin"
      ? c.env.DB.prepare("SELECT id,name,email,account_no FROM users ORDER BY name COLLATE NOCASE").all()
      : Promise.resolve({ results: [{ id: user.id, name: user.name, email: user.email, account_no: user.account_no }] })
  ]);
  return c.json({
    logs: rows.results.map((row) => ({ ...row, details: parseAuditDetails(row.details) })),
    total: Number(count?.count) || 0,
    limit,
    stats: {
      total: Number(stats?.total) || 0,
      today: Number(stats?.today) || 0,
      failures: Number(stats?.failures) || 0,
      actors: Number(stats?.actors) || 0
    },
    filters: {
      actions: actionRows.results.map((row) => row.action),
      categories: categoryRows.results.map((row) => row.category),
      users: userRows.results
    },
    scope: user.role === "admin" ? "all" : "own"
  });
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found." }, 404);
  return c.text("Not found", 404);
});

app.onError((error, c) => {
  console.error(error);
  const message = String(error?.message || "");
  if (message.includes("no such table")) {
    return c.json({ error: "Database is not initialized. Run: npm run db:migrate" }, 500);
  }
  return c.json({ error: "Server error." }, 500);
});

export default app;
