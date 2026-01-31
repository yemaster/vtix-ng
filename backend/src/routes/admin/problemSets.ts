import { Elysia } from "elysia";
import { deleteProblemSet, loadProblemSetList } from "../../services/problemSets";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";

export const registerAdminProblemSetRoutes = (app: Elysia) =>
  app
    .get("/api/admin/problem-sets", async ({ request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const canManageAll =
        hasPermission(user.permissions, PERMISSIONS.MANAGE_QUESTION_BANK_ALL) ||
        hasPermission(user.permissions, PERMISSIONS.MANAGE_USERS);
      const canManageOwn = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_OWN
      );
      if (!canManageAll && !canManageOwn) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      return loadProblemSetList(
        canManageAll ? undefined : { onlyCreatorId: user.id }
      );
    })
    .delete("/api/admin/problem-sets/:code", async ({ params, request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const canManageAll =
        hasPermission(user.permissions, PERMISSIONS.MANAGE_QUESTION_BANK_ALL) ||
        hasPermission(user.permissions, PERMISSIONS.MANAGE_USERS);
      const canManageOwn = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_OWN
      );
      if (!canManageAll && !canManageOwn) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      if (!canManageAll) {
        const detail = await loadProblemSetList({ onlyCreatorId: user.id });
        if (!detail.find((item) => item.code === params.code)) {
          set.status = 403;
          return { error: "Forbidden" };
        }
      }
      const ok = await deleteProblemSet(params.code);
      if (!ok) {
        set.status = 404;
        return { error: "Not Found" };
      }
      return { ok: true };
    });
