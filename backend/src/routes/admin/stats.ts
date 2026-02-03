import { Elysia } from "elysia";
import { gte, sql } from "drizzle-orm";
import { db, userRecords } from "../../db";
import { loadProblemSetList } from "../../services/problemSets";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";

export const registerAdminStatsRoutes = (app: Elysia) =>
  app
    .get("/api/admin/stats", async ({ request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const canViewStats = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_USERS
      );
      if (!canViewStats) {
        set.status = 403;
        return { error: "Forbidden" };
      }

      const sets = await loadProblemSetList();
      const totalSets = sets.length;
      const publicSets = sets.filter((item) => item.isPublic).length;
      const creatorCount = new Set(sets.map((item) => item.creatorId)).size;
      const questionCount = sets.reduce((sum, item) => {
        const count = Number.isFinite(item.questionCount) ? item.questionCount : 0;
        return sum + count;
      }, 0);
      const [visitRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userRecords);
      const visitCount = Number(visitRow?.count ?? 0);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [visitTodayRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userRecords)
        .where(gte(userRecords.updatedAt, todayStart.getTime()));
      const visitToday = Number(visitTodayRow?.count ?? 0);

      return {
        totalSets,
        publicSets,
        activeUsers: creatorCount,
        visitCount,
        practiceCount: questionCount,
        deltas: {
          totalSets7d: 0,
          publicSets7d: 0,
          activeUsersToday: 0,
          visitToday,
          practiceToday: 0,
        },
      };
    });
