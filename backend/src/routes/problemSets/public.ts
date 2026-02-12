import { Elysia } from "elysia";
import {
  incrementProblemSetViewCount,
  loadProblemSetDetail,
  loadProblemSetMeta,
  loadPublicProblemSetCategories,
  loadProblemSetList,
  loadProblemSetPlazaPage,
  loadPublicProblemSetPage,
  setProblemSetReaction,
} from "../../services/problemSets";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";

export const registerPublicProblemSetRoutes = (app: Elysia) =>
  app
    .get("/api/problem-sets", async ({ query, set }) => {
      const pageRaw = Number((query as any)?.page ?? NaN);
      const pageSizeRaw = Number((query as any)?.pageSize ?? NaN);
      const keyword =
        typeof (query as any)?.q === "string" ? String((query as any).q) : "";
      const category =
        typeof (query as any)?.category === "string"
          ? String((query as any).category)
          : "";
      const shouldPaginate =
        Number.isFinite(pageRaw) ||
        Number.isFinite(pageSizeRaw) ||
        Boolean(keyword.trim()) ||
        Boolean(category.trim());
      if (!shouldPaginate) {
        return loadProblemSetList({ onlyPublic: true });
      }
      const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
      const pageSize = Number.isFinite(pageSizeRaw)
        ? Math.min(Math.max(pageSizeRaw, 1), 50)
        : 12;
      const { items, total } = await loadPublicProblemSetPage({
        page,
        pageSize,
        keyword,
        category,
      });
      set.headers["x-total-count"] = String(total);
      return items;
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
    .get("/api/problem-sets/categories", async () => {
      const items = await loadPublicProblemSetCategories();
      return { items };
    })
    .get("/api/problem-sets/plaza", async ({ query, set, request }) => {
      const pageRaw = Number((query as any)?.page ?? 1);
      const pageSizeRaw = Number((query as any)?.pageSize ?? 12);
      const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
      const pageSize = Number.isFinite(pageSizeRaw)
        ? Math.min(Math.max(pageSizeRaw, 1), 50)
        : 12;
      const keyword =
        typeof (query as any)?.q === "string" ? String((query as any).q) : "";
      const order =
        typeof (query as any)?.order === "string"
          ? String((query as any).order)
          : "";
      const user = getSessionUser(request);

      const { items, total } = await loadProblemSetPlazaPage({
        page,
        pageSize,
        keyword,
        order,
        userId: user?.id,
      });
      set.headers["x-total-count"] = String(total);
      return items;
    })
    .post("/api/problem-sets/:code/reaction", async ({ params, request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const userId = Number(user.id ?? NaN);
      if (!Number.isFinite(userId)) {
        set.status = 400;
        return { error: "Invalid user." };
      }
      const payload = (body ?? {}) as { value?: number };
      const value = Number(payload.value ?? NaN);
      if (value !== 1 && value !== -1) {
        set.status = 400;
        return { error: "Invalid reaction value." };
      }
      const result = await setProblemSetReaction(params.code, userId, value);
      if (!result) {
        set.status = 404;
        return { error: "Problem set not found." };
      }
      return result;
    })
    .get("/api/problem-sets/:code/meta", async ({ params, set, request, query }) => {
      const user = getSessionUser(request);
      const detail = await loadProblemSetMeta(params.code);
      if (!detail) {
        set.status = 404;
        return { error: "Problem set not found." };
      }
      const invite = String(query.invite ?? "").trim();
      const inviteCode = String(detail.inviteCode ?? "").trim();
      const isOwner = Boolean(user && detail.creatorId === user.id);
      const isAdmin = Boolean(user && hasPermission(user.permissions, PERMISSIONS.MANAGE_USERS));
      const hasPrivatePerm = Boolean(
        user && hasPermission(user.permissions, PERMISSIONS.ACCESS_PRIVATE)
      );
      const inviteMatch = invite.length > 0 && invite === inviteCode;
      const canAccess =
        detail.isPublic ||
        !inviteCode ||
        isOwner ||
        isAdmin ||
        hasPrivatePerm ||
        inviteMatch;
      if (!canAccess) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      return {
        code: detail.code,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      };
    })
    .get("/api/problem-sets/:code", async ({ params, set, request, query }) => {
      const user = getSessionUser(request);
      const detail = await loadProblemSetDetail(params.code);
      if (!detail) {
        set.status = 404;
        return { error: "Problem set not found." };
      }
      const invite = String(query.invite ?? "").trim();
      const inviteCode = String(detail.inviteCode ?? "").trim();
      const isOwner = Boolean(user && detail.creatorId === user.id);
      const isAdmin = Boolean(user && hasPermission(user.permissions, PERMISSIONS.MANAGE_USERS));
      const hasPrivatePerm = Boolean(
        user && hasPermission(user.permissions, PERMISSIONS.ACCESS_PRIVATE)
      );
      const inviteMatch = invite.length > 0 && invite === inviteCode;
      const canAccess =
        detail.isPublic ||
        !inviteCode ||
        isOwner ||
        isAdmin ||
        hasPrivatePerm ||
        inviteMatch;
      if (canAccess) {
        await incrementProblemSetViewCount(detail.code);
        return {
          ...detail,
          viewCount: Number(detail.viewCount ?? 0) + 1,
        };
      }
      set.status = 403;
      return { error: "Forbidden" };
    });
