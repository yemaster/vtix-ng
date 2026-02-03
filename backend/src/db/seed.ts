import { eq, sql } from "drizzle-orm";
import { db, userGroups, users } from "./index";
import { appConfig } from "../config";
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
    console.log(
      `Seeded ${missing.length} default user group(s): ${missing
        .map((group) => group.id)
        .join(", ")}`
    );
  }
}

export async function ensureAdminUser() {
  await ensureDefaultUserGroups();

  const adminEmail = appConfig.adminEmail;
  const adminName = appConfig.adminName;
  const adminPassword = appConfig.adminPassword;
  const now = Date.now();

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users);
  const totalUsers = Number(countRow?.count ?? 0);
  if (totalUsers > 0) {
    console.log("Admin seed skipped: users already exist.");
    return;
  }

  await db.insert(users).values({
    name: adminName,
    email: adminEmail || null,
    passwordHash: hashPassword(adminPassword),
    groupId: USER_GROUPS.admin.id,
    createdAt: now,
    updatedAt: now,
  });
  console.log(
    `Seeded default admin user: ${adminName} (${adminEmail || "no-email"})`
  );
}
