import { Elysia } from "elysia";
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

      const sets = await loadProblemSetList(
        canManageAll ? undefined : { onlyCreatorId: user.id }
      );
      const totalSets = sets.length;
      const publicSets = sets.filter((item) => item.isPublic).length;
      const creatorCount = new Set(sets.map((item) => item.creatorId)).size;
      const questionCount = sets.reduce((sum, item) => {
        const count = Number.isFinite(item.questionCount) ? item.questionCount : 0;
        return sum + count;
      }, 0);

      return {
        totalSets,
        publicSets,
        activeUsers: creatorCount,
        practiceCount: questionCount,
        deltas: {
          totalSets7d: 0,
          publicSets7d: 0,
          activeUsersToday: 0,
          practiceToday: 0,
        },
      };
    })
    .get("/api/admin/trends", async ({ request, set }) => {
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

      const sets = await loadProblemSetList(
        canManageAll ? undefined : { onlyCreatorId: user.id }
      );
      const bucket = new Map<
        number,
        { totalSets: number; publicSets: number; questions: number }
      >();

      for (const item of sets) {
        const year = Number(item.year ?? new Date().getFullYear());
        const record =
          bucket.get(year) ?? { totalSets: 0, publicSets: 0, questions: 0 };
        record.totalSets += 1;
        if (item.isPublic) {
          record.publicSets += 1;
        }
        record.questions += Number.isFinite(item.questionCount)
          ? item.questionCount
          : 0;
        bucket.set(year, record);
      }

      const years = Array.from(bucket.keys()).sort((a, b) => a - b);
      const series = [
        {
          key: "totalSets",
          label: "题库数量",
          values: years.map((year) => bucket.get(year)?.totalSets ?? 0),
        },
        {
          key: "publicSets",
          label: "公开题库",
          values: years.map((year) => bucket.get(year)?.publicSets ?? 0),
        },
        {
          key: "questions",
          label: "题目数",
          values: years.map((year) => bucket.get(year)?.questions ?? 0),
        },
      ];

      return { years, series };
    });
