import { Elysia } from "elysia";
import {
  createUserGroupDb,
  listUserGroupsDb,
  updateUserGroupDb,
} from "./data";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";

export const registerAdminUserGroupRoutes = (app: Elysia) =>
  app
    .get("/api/admin/user-groups", ({ request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!hasPermission(user.permissions, PERMISSIONS.MANAGE_USERS)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      return listUserGroupsDb();
    })
    .post("/api/admin/user-groups", async ({ request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!hasPermission(user.permissions, PERMISSIONS.MANAGE_USERS)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      try {
        const payload = (body ?? {}) as {
          name?: string;
          description?: string;
          permissions?: number;
          privateProblemSetLimit?: number;
        };
        return await createUserGroupDb(payload);
      } catch (error) {
        set.status = 400;
        return { error: error instanceof Error ? error.message : "Bad Request" };
      }
    })
    .put("/api/admin/user-groups/:id", async ({ params, request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!hasPermission(user.permissions, PERMISSIONS.MANAGE_USERS)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      try {
        const payload = (body ?? {}) as {
          name?: string;
          description?: string;
          permissions?: number;
          privateProblemSetLimit?: number;
        };
        return await updateUserGroupDb(params.id, payload);
      } catch (error) {
        set.status = 400;
        return { error: error instanceof Error ? error.message : "Bad Request" };
      }
    });
