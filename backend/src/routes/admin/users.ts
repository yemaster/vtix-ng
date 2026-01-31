import { Elysia } from "elysia";
import { createUserDb, listUsersDb, updateUserDb } from "./data";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";

export const registerAdminUserRoutes = (app: Elysia) =>
  app
    .get("/api/admin/users", ({ request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!hasPermission(user.permissions, PERMISSIONS.MANAGE_USERS)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      return listUsersDb();
    })
    .post("/api/admin/users", async ({ request, body, set }) => {
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
          email?: string;
          groupId?: string;
        };
        return await createUserDb(payload);
      } catch (error) {
        set.status = 400;
        return { error: error instanceof Error ? error.message : "Bad Request" };
      }
    })
    .put("/api/admin/users/:id", async ({ params, request, body, set }) => {
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
          email?: string;
          groupId?: string;
        };
        return await updateUserDb(params.id, payload);
      } catch (error) {
        set.status = 400;
        return { error: error instanceof Error ? error.message : "Bad Request" };
      }
    });
