import { USER_GROUPS } from "./utils/permissions";
import type { User } from "./utils/session";

export type AdminUserGroup = {
  id: string;
  name: string;
  description: string;
  permissions: number;
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

const userGroups: AdminUserGroup[] = [
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

const users: AdminUser[] = [
  {
    id: "admin",
    name: "Admin",
    email: "admin@vtix.dev",
    groupId: USER_GROUPS.admin.id,
    groupName: USER_GROUPS.admin.name,
    permissions: USER_GROUPS.admin.permissions,
  },
];

function resolveGroup(groupId: string) {
  return userGroups.find((group) => group.id === groupId) ?? null;
}

function makeGroupId(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const seed = base || "group";
  let candidate = seed;
  let index = 1;
  while (userGroups.some((group) => group.id === candidate)) {
    candidate = `${seed}-${index}`;
    index += 1;
  }
  return candidate;
}

function syncUsersForGroup(group: AdminUserGroup) {
  for (const user of users) {
    if (user.groupId === group.id) {
      user.groupName = group.name;
      user.permissions = group.permissions;
    }
  }
}

export function listUserGroups() {
  return userGroups.map((group) => ({ ...group }));
}

export function createUserGroup(payload: {
  name?: string;
  description?: string;
  permissions?: number;
}) {
  const name = String(payload.name ?? "").trim();
  if (!name) {
    throw new Error("Name required");
  }
  const description = String(payload.description ?? "").trim();
  const permissions = Number(payload.permissions ?? 0);
  const group: AdminUserGroup = {
    id: makeGroupId(name),
    name,
    description,
    permissions,
  };
  userGroups.push(group);
  return group;
}

export function updateUserGroup(
  id: string,
  payload: { name?: string; description?: string; permissions?: number }
) {
  const group = resolveGroup(id);
  if (!group) {
    throw new Error("Group not found");
  }
  const name = String(payload.name ?? group.name).trim();
  if (!name) {
    throw new Error("Name required");
  }
  group.name = name;
  group.description = String(payload.description ?? group.description ?? "").trim();
  if (payload.permissions !== undefined) {
    group.permissions = Number(payload.permissions);
  }
  syncUsersForGroup(group);
  return group;
}

export function listUsers(currentUser?: User | null) {
  if (currentUser) {
    ensureUser(currentUser);
  }
  return users.map((user) => ({ ...user }));
}

export function createUser(payload: {
  name?: string;
  email?: string;
  groupId?: string;
}) {
  const name = String(payload.name ?? "").trim();
  const email = String(payload.email ?? "").trim();
  const id = (email || name).toLowerCase();
  if (!id) {
    throw new Error("User id required");
  }
  if (users.some((user) => user.id === id)) {
    throw new Error("User exists");
  }
  const group = resolveGroup(String(payload.groupId ?? "")) ?? userGroups[0];
  const user: AdminUser = {
    id,
    name: name || id,
    email,
    groupId: group.id,
    groupName: group.name,
    permissions: group.permissions,
  };
  users.push(user);
  return user;
}

export function updateUser(
  id: string,
  payload: { name?: string; email?: string; groupId?: string }
) {
  const user = users.find((item) => item.id === id);
  if (!user) {
    throw new Error("User not found");
  }
  const name = payload.name !== undefined ? String(payload.name).trim() : user.name;
  user.name = name || user.name;
  if (payload.email !== undefined) {
    user.email = String(payload.email ?? "").trim();
  }
  if (payload.groupId) {
    const group = resolveGroup(String(payload.groupId)) ?? resolveGroup(USER_GROUPS.user.id);
    if (group) {
      user.groupId = group.id;
      user.groupName = group.name;
      user.permissions = group.permissions;
    }
  }
  return user;
}

export function ensureUser(sessionUser: User) {
  const existing = users.find((item) => item.id === sessionUser.id);
  if (existing) {
    existing.name = sessionUser.name;
    existing.email = sessionUser.email;
    if (sessionUser.groupId) {
      const group = resolveGroup(sessionUser.groupId) ?? resolveGroup(USER_GROUPS.user.id);
      if (group) {
        existing.groupId = group.id;
        existing.groupName = group.name;
        existing.permissions = group.permissions;
      }
    }
    return existing;
  }
  const group = resolveGroup(sessionUser.groupId) ?? resolveGroup(USER_GROUPS.user.id);
  const newUser: AdminUser = {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    groupId: group?.id ?? USER_GROUPS.user.id,
    groupName: group?.name ?? USER_GROUPS.user.name,
    permissions: group?.permissions ?? USER_GROUPS.user.permissions,
  };
  users.push(newUser);
  return newUser;
}
