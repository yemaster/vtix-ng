import { Elysia } from "elysia";
import {
  createProblemSet,
  loadProblemSetDetail,
  updateProblemSet,
} from "../../services/problemSets";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";
import { normalizeProblems } from "./normalize";

export const registerProblemSetManageRoutes = (app: Elysia) =>
  app
    .post("/api/problem-sets", async ({ request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const payload = (body ?? {}) as {
        title?: string;
        year?: number;
        categories?: string[];
        isPublic?: boolean;
        inviteCode?: string | null;
        problems?: unknown;
        test?: number | number[];
        score?: number[];
      };
      const title = String(payload.title ?? "").trim();
      if (!title) {
        set.status = 400;
        return { error: "Title required" };
      }
      const year = Number(payload.year ?? new Date().getFullYear());
      const categories = Array.isArray(payload.categories)
        ? payload.categories.map((c) => String(c)).filter(Boolean)
        : [];
      const canManageAll = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_ALL
      );
      const canManageOwn = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_OWN
      );
      if (!canManageAll && !canManageOwn) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const { list: problems, counts } = normalizeProblems(payload.problems);
      if (!problems.length) {
        set.status = 400;
        return { error: "至少需要一题。" };
      }
      const isPublic = canManageAll ? Boolean(payload.isPublic) : false;
      const inviteCode = isPublic
        ? null
        : payload.inviteCode
          ? String(payload.inviteCode).trim() || null
          : null;
      const testMeta = Array.isArray(payload.test)
        ? payload.test.map((value) => Number(value))
        : typeof payload.test === "number"
          ? payload.test
          : counts;
      const scoreMeta = Array.isArray(payload.score)
        ? payload.score.map((value) => Number(value))
        : [0, 1, 2, 1, 1];
      const codeBase = title
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "")
        .slice(0, 8);
      const code = `${codeBase || "set"}-${Date.now().toString(36)}`;
      const item = await createProblemSet({
        id: code,
        code,
        title,
        year,
        categories,
        isNew: true,
        recommendedRank: null,
        questionCount: problems.length,
        creatorId: user.id,
        creatorName: user.name,
        isPublic,
        inviteCode,
        test: testMeta,
        score: scoreMeta as [number, number, number, number, number],
        problems,
      });
      return item;
    })
    .put("/api/problem-sets/:code", async ({ params, request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const existing = await loadProblemSetDetail(params.code);
      if (!existing) {
        set.status = 404;
        return { error: "Problem set not found." };
      }
      const canManageAll = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_ALL
      );
      const canManageOwn = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_OWN
      );
      const isOwner = existing.creatorId === user.id;
      if (!canManageAll && !(canManageOwn && isOwner)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const payload = (body ?? {}) as {
        title?: string;
        year?: number;
        categories?: string[];
        isPublic?: boolean;
        inviteCode?: string | null;
        problems?: unknown;
        test?: number | number[];
        score?: number[];
      };
      const title = String(payload.title ?? existing.title ?? "").trim();
      if (!title) {
        set.status = 400;
        return { error: "Title required" };
      }
      const year = Number(payload.year ?? existing.year ?? new Date().getFullYear());
      const categories = Array.isArray(payload.categories)
        ? payload.categories.map((c) => String(c)).filter(Boolean)
        : existing.categories ?? [];
      const { list: problems, counts } = normalizeProblems(
        payload.problems ?? existing.problems
      );
      if (!problems.length) {
        set.status = 400;
        return { error: "至少需要一题。" };
      }
      const nextIsPublic = canManageAll
        ? Boolean(payload.isPublic ?? existing.isPublic)
        : Boolean(existing.isPublic);
      const inviteCode = nextIsPublic
        ? null
        : canManageAll
          ? payload.inviteCode
            ? String(payload.inviteCode).trim() || null
            : existing.inviteCode ?? null
          : existing.inviteCode ?? null;
      const testMeta = Array.isArray(payload.test)
        ? payload.test.map((value) => Number(value))
        : typeof payload.test === "number"
          ? payload.test
          : existing.test ?? counts;
      const scoreMeta = Array.isArray(payload.score)
        ? payload.score.map((value) => Number(value))
        : existing.score ?? [0, 1, 2, 1, 1];
      const updated = await updateProblemSet({
        ...existing,
        title,
        year,
        categories,
        questionCount: problems.length,
        isPublic: nextIsPublic,
        inviteCode,
        test: testMeta,
        score: scoreMeta as [number, number, number, number, number],
        problems,
      });
      return updated;
    });
