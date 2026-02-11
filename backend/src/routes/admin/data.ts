import { eq, or } from "drizzle-orm";
import { db, userGroups, users } from "../../db";
import { ensureDefaultUserGroups } from "../../db/seed";
import { USER_GROUPS } from "../../utils/permissions";
import { hashPassword } from "../../utils/password";

const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD ?? "vtix1234";

export type AdminUserGroup = {
  id: string;
  name: string;
  description: string | null;
  permissions: number;
  privateProblemSetLimit: number;
  builtIn?: boolean;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  groupId: string;
  groupName: string;
  permissions: number;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function makeGroupId(name: string, existing: Set<string>) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const seed = base || "group";
  let candidate = seed;
  let index = 1;
  while (existing.has(candidate)) {
    candidate = `${seed}-${index}`;
    index += 1;
  }
  return candidate;
}

async function loadGroupMap() {
  await ensureDefaultUserGroups();
  const groups = (await db.select().from(userGroups)) as AdminUserGroup[];
  const map = new Map<string, AdminUserGroup>();
  for (const group of groups) {
    map.set(group.id, group);
  }
  return { groups, map };
}

export async function listUserGroupsDb() {
  const { groups } = await loadGroupMap();
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description ?? "",
    permissions: group.permissions,
    privateProblemSetLimit: Number(group.privateProblemSetLimit ?? -1),
    builtIn: Boolean(group.builtIn),
  }));
}

export async function createUserGroupDb(payload: {
  name?: string;
  description?: string;
  permissions?: number;
  privateProblemSetLimit?: number;
}) {
  const name = String(payload.name ?? "").trim();
  if (!name) {
    throw new Error("Name required");
  }
  const description = String(payload.description ?? "").trim();
  const permissions = Number(payload.permissions ?? 0);
  const limitRaw = Number(payload.privateProblemSetLimit ?? -1);
  const privateProblemSetLimit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : -1;
  const { groups } = await loadGroupMap();
  const id = makeGroupId(name, new Set(groups.map((group) => group.id)));
  const group: AdminUserGroup = {
    id,
    name,
    description,
    permissions,
    privateProblemSetLimit,
    builtIn: false,
  };
  await db.insert(userGroups).values(group);
  return group;
}

export async function updateUserGroupDb(
  id: string,
  payload: {
    name?: string;
    description?: string;
    permissions?: number;
    privateProblemSetLimit?: number;
  }
) {
  const [existing] = await db
    .select()
    .from(userGroups)
    .where(eq(userGroups.id, id))
    .limit(1);
  if (!existing) {
    throw new Error("Group not found");
  }
  const name = String(payload.name ?? existing.name).trim();
  if (!name) {
    throw new Error("Name required");
  }
  const description = String(payload.description ?? existing.description ?? "").trim();
  const permissions =
    payload.permissions !== undefined
      ? Number(payload.permissions)
      : Number(existing.permissions);
  const limitRaw =
    payload.privateProblemSetLimit !== undefined
      ? Number(payload.privateProblemSetLimit)
      : Number(existing.privateProblemSetLimit ?? -1);
  const privateProblemSetLimit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : -1;
  await db
    .update(userGroups)
    .set({
      name,
      description,
      permissions,
      privateProblemSetLimit,
    })
    .where(eq(userGroups.id, id));
  return {
    id,
    name,
    description,
    permissions,
    privateProblemSetLimit,
    builtIn: Boolean(existing.builtIn),
  };
}

export async function listUsersDb() {
  const { map } = await loadGroupMap();
  const rows = (await db.select().from(users)) as Array<{
    id: number;
    name: string;
    email: string | null;
    groupId: string;
    permissions?: number;
  }>;
  return rows.map((user) => {
    const group = map.get(user.groupId) ?? map.get(USER_GROUPS.user.id);
    return {
      id: String(user.id),
      name: user.name,
      email: user.email ?? "",
      groupId: user.groupId,
      groupName: group?.name ?? USER_GROUPS.user.name,
      permissions: group?.permissions ?? USER_GROUPS.user.permissions,
    } as AdminUser;
  });
}

export async function createUserDb(payload: {
  name?: string;
  email?: string;
  groupId?: string;
}) {
  const nameRaw = String(payload.name ?? "").trim();
  const emailRaw = String(payload.email ?? "").trim();
  if (!nameRaw && !emailRaw) {
    throw new Error("User id required");
  }
  const name = nameRaw || (emailRaw ? emailRaw.split("@")[0] : "user");
  const email = emailRaw ? normalizeEmail(emailRaw) : "";
  const now = Date.now();

  const [exists] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      email
        ? or(eq(users.name, name), eq(users.email, email))
        : eq(users.name, name)
    )
    .limit(1);
  if (exists) {
    throw new Error("User exists");
  }

  const { map } = await loadGroupMap();
  const groupId = map.has(String(payload.groupId ?? ""))
    ? String(payload.groupId)
    : USER_GROUPS.user.id;

  await db.insert(users).values({
    name,
    email: email || null,
    passwordHash: hashPassword(DEFAULT_PASSWORD),
    groupId,
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(users)
    .where(eq(users.name, name))
    .limit(1);
  if (!created) {
    throw new Error("User not found");
  }
  const group = map.get(groupId) ?? map.get(USER_GROUPS.user.id);
  return {
    id: String(created.id),
    name: created.name,
    email: created.email ?? "",
    groupId,
    groupName: group?.name ?? USER_GROUPS.user.name,
    permissions: group?.permissions ?? USER_GROUPS.user.permissions,
  } as AdminUser;
}

export async function updateUserDb(
  id: string,
  payload: { name?: string; email?: string; groupId?: string }
) {
  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    throw new Error("User not found");
  }
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing) {
    throw new Error("User not found");
  }

  const nextName =
    payload.name !== undefined ? String(payload.name).trim() : existing.name;
  if (!nextName) {
    throw new Error("Name required");
  }
  const nextEmail =
    payload.email !== undefined
      ? String(payload.email ?? "").trim()
      : existing.email ?? "";
  const normalizedEmail = nextEmail ? normalizeEmail(nextEmail) : "";

  if (normalizedEmail && normalizedEmail !== existing.email) {
    const [emailExists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (emailExists && emailExists.id !== existing.id) {
      throw new Error("User exists");
    }
  }

  if (nextName !== existing.name) {
    const [nameExists] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.name, nextName))
      .limit(1);
    if (nameExists && nameExists.id !== existing.id) {
      throw new Error("User exists");
    }
  }

  const { map } = await loadGroupMap();
  const groupId = map.has(String(payload.groupId ?? ""))
    ? String(payload.groupId)
    : existing.groupId;

  await db
    .update(users)
    .set({
      name: nextName,
      email: normalizedEmail || null,
      groupId,
      updatedAt: Date.now(),
    })
    .where(eq(users.id, userId));

  const group = map.get(groupId) ?? map.get(USER_GROUPS.user.id);
  return {
    id: String(existing.id),
    name: nextName,
    email: normalizedEmail || "",
    groupId,
    groupName: group?.name ?? USER_GROUPS.user.name,
    permissions: group?.permissions ?? USER_GROUPS.user.permissions,
  } as AdminUser;
}
