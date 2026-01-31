import { eq } from "drizzle-orm";
import { db, userGroups, users } from "./index";
import { USER_GROUPS } from "../utils/permissions";
import { hashPassword } from "../utils/password";

const DEFAULT_GROUPS = [
  {
    id: USER_GROUPS.user.id,
    name: USER_GROUPS.user.name,
    description: "Default user group.",
    permissions: USER_GROUPS.user.permissions,
    builtIn: true,
  },
  {
    id: USER_GROUPS.manager.id,
    name: USER_GROUPS.manager.name,
    description: "Question bank manager group.",
    permissions: USER_GROUPS.manager.permissions,
    builtIn: true,
  },
  {
    id: USER_GROUPS.admin.id,
    name: USER_GROUPS.admin.name,
    description: "System administrator group.",
    permissions: USER_GROUPS.admin.permissions,
    builtIn: true,
  },
];

export async function ensureDefaultUserGroups() {
  const existing = await db.select({ id: userGroups.id }).from(userGroups);
  const existingIds = new Set(existing.map((row) => row.id));
  const missing = DEFAULT_GROUPS.filter((group) => !existingIds.has(group.id));
  if (missing.length > 0) {
    await db.insert(userGroups).values(missing);
  }
}

export async function ensureAdminUser() {
  await ensureDefaultUserGroups();

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@vtix.dev";
  const adminName = process.env.ADMIN_NAME ?? "Admin";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin1234";
  const now = Date.now();

  let existing =
    adminEmail
      ? (await db
          .select()
          .from(users)
          .where(eq(users.email, adminEmail))
          .limit(1))[0]
      : undefined;

  if (!existing && adminName) {
    existing = (
      await db.select().from(users).where(eq(users.name, adminName)).limit(1)
    )[0];
  }

  if (!existing) {
    await db.insert(users).values({
      name: adminName,
      email: adminEmail || null,
      passwordHash: hashPassword(adminPassword),
      groupId: USER_GROUPS.admin.id,
      createdAt: now,
      updatedAt: now,
    });
  } else if (existing.groupId !== USER_GROUPS.admin.id) {
    await db
      .update(users)
      .set({
        groupId: USER_GROUPS.admin.id,
        updatedAt: now,
      })
      .where(eq(users.id, existing.id));
  }
}
