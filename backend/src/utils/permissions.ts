export const PERMISSIONS = {
  LOGIN: 1 << 0,
  ACCESS_PUBLIC: 1 << 1,
  ACCESS_PRIVATE: 1 << 2,
  ACCESS_RECORDS: 1 << 3,
  ACCESS_WRONG_RECORDS: 1 << 4,
  MANAGE_QUESTION_BANK_OWN: 1 << 9,
  MANAGE_QUESTION_BANK_ALL: 1 << 10,
  MANAGE_QUESTION_BANK: 1 << 10,
  MANAGE_USERS: 1 << 11,
} as const;

export type PermissionValue = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type UserGroup = {
  id: string;
  name: string;
  permissions: number;
};

export const USER_GROUPS: Record<string, UserGroup> = {
  user: {
    id: "user",
    name: "普通用户",
    permissions:
      PERMISSIONS.LOGIN |
      PERMISSIONS.ACCESS_PUBLIC |
      PERMISSIONS.ACCESS_RECORDS |
      PERMISSIONS.ACCESS_WRONG_RECORDS |
      PERMISSIONS.MANAGE_QUESTION_BANK_OWN,
  },
  manager: {
    id: "manager",
    name: "题库管理员",
    permissions:
      PERMISSIONS.LOGIN |
      PERMISSIONS.ACCESS_PUBLIC |
      PERMISSIONS.ACCESS_PRIVATE |
      PERMISSIONS.ACCESS_RECORDS |
      PERMISSIONS.ACCESS_WRONG_RECORDS |
      PERMISSIONS.MANAGE_QUESTION_BANK_ALL,
  },
  admin: {
    id: "admin",
    name: "系统管理员",
    permissions:
      PERMISSIONS.LOGIN |
      PERMISSIONS.ACCESS_PUBLIC |
      PERMISSIONS.ACCESS_PRIVATE |
      PERMISSIONS.ACCESS_RECORDS |
      PERMISSIONS.ACCESS_WRONG_RECORDS |
      PERMISSIONS.MANAGE_QUESTION_BANK_ALL |
      PERMISSIONS.MANAGE_USERS,
  },
};

export function hasPermission(value: number, perm: PermissionValue) {
  return (value & perm) === perm;
}
