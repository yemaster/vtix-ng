import { Elysia } from "elysia";
import { loadProblemSetDetail, loadProblemSetList } from "../../services/problemSets";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";

export const registerPublicProblemSetRoutes = (app: Elysia) =>
  app
    .get("/api/problem-sets", async () => {
      return loadProblemSetList({ onlyPublic: true });
    })
    .get("/api/problem-sets/recommended", async ({ query }) => {
      const limitRaw = Number((query as any)?.limit ?? 0);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 0;
      const list = await loadProblemSetList({ onlyPublic: true });
      const recommended = list
        .filter((item) => item.recommendedRank !== null)
        .sort((a, b) => {
          const aRank = a.recommendedRank ?? 0;
          const bRank = b.recommendedRank ?? 0;
          return aRank - bRank;
        });
      return limit > 0 ? recommended.slice(0, limit) : recommended;
    })
    .get("/api/problem-sets/:code", async ({ params, set, request, query }) => {
      const user = getSessionUser(request);
      const detail = await loadProblemSetDetail(params.code);
      if (!detail) {
        set.status = 404;
        return { error: "Problem set not found." };
      }
      if (detail.isPublic) {
        if (user && !hasPermission(user.permissions, PERMISSIONS.ACCESS_PUBLIC)) {
          set.status = 403;
          return { error: "Forbidden" };
        }
        return detail;
      }
      const invite = String(query.invite ?? "");
      const isOwner = Boolean(user && detail.creatorId === user.id);
      const isAdmin = Boolean(user && hasPermission(user.permissions, PERMISSIONS.MANAGE_USERS));
      const hasPrivatePerm = Boolean(
        user && hasPermission(user.permissions, PERMISSIONS.ACCESS_PRIVATE)
      );
      const inviteMatch = Boolean(detail.inviteCode && invite === detail.inviteCode);
      if (isOwner || isAdmin || hasPrivatePerm || inviteMatch) {
        return detail;
      }
      set.status = 403;
      return { error: "Forbidden" };
    });
