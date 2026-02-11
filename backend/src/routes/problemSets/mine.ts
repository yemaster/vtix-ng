import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db, problemSets } from "../../db";
import { loadProblemSetList, updateProblemSetFlags } from "../../services/problemSets";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";

export const registerMyProblemSetRoutes = (app: Elysia) =>
  app
    .get("/api/my-problem-sets", async ({ request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      return loadProblemSetList({
        onlyCreatorId: user.id,
      });
    })
    .post("/api/my-problem-sets/:code/publish-request", async ({ request, params, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const canManageOwn = hasPermission(user.permissions, PERMISSIONS.MANAGE_QUESTION_BANK_OWN);
      const canManageAll = hasPermission(user.permissions, PERMISSIONS.MANAGE_QUESTION_BANK_ALL);
      if (!canManageOwn || canManageAll) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const [detail] = await db
        .select({
          creatorId: problemSets.creatorId,
          isPublic: problemSets.isPublic,
          isPending: problemSets.isPending,
        })
        .from(problemSets)
        .where(eq(problemSets.code, params.code))
        .limit(1);
      if (!detail) {
        set.status = 404;
        return { error: "Problem set not found." };
      }
      if (detail.creatorId !== user.id) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      if (detail.isPublic) {
        set.status = 400;
        return { error: "Problem set already public." };
      }
      if (detail.isPending) {
        set.status = 400;
        return { error: "Problem set already pending." };
      }
      const ok = await updateProblemSetFlags(params.code, { isPending: true });
      if (!ok) {
        set.status = 500;
        return { error: "Failed to update status." };
      }
      return { success: true };
    });
