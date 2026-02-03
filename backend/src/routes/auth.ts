import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db, userGroups, users } from "../db";
import { ensureDefaultUserGroups } from "../db/seed";
import {
  clearSession,
  createSession,
  getSessionUser,
  updateSessionUser,
  type User,
} from "../utils/session";
import { USER_GROUPS } from "../utils/permissions";
import { hashPassword, verifyPassword } from "../utils/password";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 32;
const MAX_EMAIL_LENGTH = 254;
const SECURE_COOKIE =
  String(process.env.COOKIE_SECURE ?? "").toLowerCase() === "true" ||
  String(process.env.NODE_ENV ?? "").toLowerCase() === "production";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isEmail(value: string) {
  return value.includes("@");
}

function validateName(name: string) {
  if (name.length < MIN_NAME_LENGTH) {
    return "Name too short";
  }
  if (name.length > MAX_NAME_LENGTH) {
    return "Name too long";
  }
  return null;
}

function validateEmail(email: string) {
  if (!isEmail(email)) {
    return "Invalid email";
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return "Email too long";
  }
  return null;
}

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "Password too short";
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return "Password too long";
  }
  return null;
}

function makeSessionCookie(token: string, maxAge?: number) {
  const parts = [
    `vtix_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (SECURE_COOKIE) {
    parts.push("Secure");
  }
  if (typeof maxAge === "number") {
    parts.push(`Max-Age=${maxAge}`);
  }
  return parts.join("; ");
}

async function resolveGroup(groupId: string) {
  await ensureDefaultUserGroups();
  const [group] = await db
    .select()
    .from(userGroups)
    .where(eq(userGroups.id, groupId))
    .limit(1);
  if (group) {
    return {
      id: group.id,
      name: group.name,
      permissions: group.permissions,
    };
  }
  return USER_GROUPS.user;
}

type DbUser = {
  id: number;
  name: string;
  email: string | null;
  groupId: string;
};

async function toSessionUser(row: DbUser): Promise<User> {
  const group = await resolveGroup(row.groupId);
  return {
    id: String(row.id),
    name: row.name,
    email: row.email ?? "",
    groupId: group.id,
    groupName: group.name,
    permissions: group.permissions,
  };
}

export const registerAuthRoutes = (app: Elysia) =>
  app
    .post("/api/register", async ({ body, set }) => {
      const payload = (body ?? {}) as {
        name?: string;
        email?: string;
        password?: string;
      };
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      const emailRaw =
        typeof payload.email === "string" ? payload.email.trim() : "";
      const password =
        typeof payload.password === "string" ? payload.password : "";

      if (!name || !emailRaw || !password) {
        set.status = 400;
        return { error: "Invalid payload" };
      }
      const nameError = validateName(name);
      if (nameError) {
        set.status = 400;
        return { error: nameError };
      }
      const emailError = validateEmail(emailRaw);
      if (emailError) {
        set.status = 400;
        return { error: emailError };
      }
      const passwordError = validatePassword(password);
      if (passwordError) {
        set.status = 400;
        return { error: passwordError };
      }

      await ensureDefaultUserGroups();

      const email = normalizeEmail(emailRaw);
      const [emailExists] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (emailExists) {
        set.status = 409;
        return { error: "Email already exists" };
      }
      const [nameExists] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.name, name))
        .limit(1);
      if (nameExists) {
        set.status = 409;
        return { error: "Name already exists" };
      }

      const now = Date.now();
      await db.insert(users).values({
        name,
        email,
        passwordHash: hashPassword(password),
        groupId: USER_GROUPS.user.id,
        createdAt: now,
        updatedAt: now,
      });

      const [created] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!created) {
        set.status = 500;
        return { error: "Failed to create user" };
      }

      const sessionUser = await toSessionUser(created);
      const token = createSession(sessionUser);
      set.headers["Set-Cookie"] = makeSessionCookie(token);
      return { user: sessionUser };
    })
    .post("/api/login", async ({ body, set }) => {
      const payload = (body ?? {}) as {
        name?: string;
        password?: string;
      };
      const nameRaw = typeof payload.name === "string" ? payload.name.trim() : "";
      const password =
        typeof payload.password === "string" ? payload.password : "";

      if (!nameRaw || !password) {
        set.status = 400;
        return { error: "Invalid payload" };
      }
      if (nameRaw.includes("@")) {
        set.status = 400;
        return { error: "Invalid username" };
      }

      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.name, nameRaw))
        .limit(1);

      if (!existing) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }
      if (!verifyPassword(password, existing.passwordHash)) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      const user = await toSessionUser(existing);
      const token = createSession(user);
      set.headers["Set-Cookie"] = makeSessionCookie(token);
      return { user };
    })
    .post("/api/me/password", async ({ request, body, set }) => {
      const current = getSessionUser(request);
      if (!current) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const payload = (body ?? {}) as {
        currentPassword?: string;
        newPassword?: string;
      };
      const currentPassword =
        typeof payload.currentPassword === "string" ? payload.currentPassword : "";
      const newPassword =
        typeof payload.newPassword === "string" ? payload.newPassword : "";
      if (!currentPassword || !newPassword) {
        set.status = 400;
        return { error: "Invalid payload" };
      }
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        set.status = 400;
        return { error: passwordError };
      }

      const userId = Number(current.id);
      if (!Number.isFinite(userId)) {
        set.status = 400;
        return { error: "Invalid user id" };
      }

      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "User not found" };
      }
      if (!verifyPassword(currentPassword, existing.passwordHash)) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      await db
        .update(users)
        .set({
          passwordHash: hashPassword(newPassword),
          updatedAt: Date.now(),
        })
        .where(eq(users.id, userId));

      return { ok: true };
    })
    .get("/api/me", ({ request }) => {
      return { user: getSessionUser(request) };
    })
    .put("/api/me", async ({ request, body, set }) => {
      const current = getSessionUser(request);
      if (!current) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const payload = (body ?? {}) as { name?: string; email?: string };
      const nextName = typeof payload.name === "string" ? payload.name.trim() : "";
      const nextEmail = typeof payload.email === "string" ? payload.email.trim() : "";
      if (!nextName && !nextEmail) {
        set.status = 400;
        return { error: "Invalid payload" };
      }

      const userId = Number(current.id);
      if (Number.isFinite(userId)) {
        const [existing] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (existing) {
          const normalizedEmail = nextEmail ? normalizeEmail(nextEmail) : "";
          if (normalizedEmail) {
            const emailError = validateEmail(normalizedEmail);
            if (emailError) {
              set.status = 400;
              return { error: emailError };
            }
          }

          if (normalizedEmail && normalizedEmail !== existing.email) {
            const [emailExists] = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, normalizedEmail))
              .limit(1);
            if (emailExists) {
              set.status = 409;
              return { error: "Email already exists" };
            }
          }

          if (nextName) {
            const nameError = validateName(nextName);
            if (nameError) {
              set.status = 400;
              return { error: nameError };
            }
          }

          if (nextName && nextName !== existing.name) {
            const [nameExists] = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.name, nextName))
              .limit(1);
            if (nameExists) {
              set.status = 409;
              return { error: "Name already exists" };
            }
          }

          const updatedName = nextName || existing.name;
          const updatedEmail = normalizedEmail || existing.email;
          await db
            .update(users)
            .set({
              name: updatedName,
              email: updatedEmail,
              updatedAt: Date.now(),
            })
            .where(eq(users.id, userId));

          const updated: User = {
            ...current,
            name: updatedName,
            email: updatedEmail,
          };
          updateSessionUser(request, updated);
          return { user: updated };
        }
      }

      const fallback: User = {
        ...current,
        name: nextName || current.name,
        email: nextEmail || current.email,
      };
      updateSessionUser(request, fallback);
      return { user: fallback };
    })
    .post("/api/logout", ({ request, set }) => {
      clearSession(request);
      set.headers["Set-Cookie"] = makeSessionCookie("", 0);
      return { ok: true };
    });
