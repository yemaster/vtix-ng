import { Elysia } from "elysia";
import {
  checkCommentRateLimit,
  createComment,
  deleteComment,
  dismissOpenReportsForComment,
  loadCommentsPage,
  loadReportedCommentsGrouped,
  reportComment,
  toggleCommentLike,
} from "../services/comments";
import { normalizePage, normalizePageSize } from "../utils/pagination";
import { PERMISSIONS, hasPermission } from "../utils/permissions";
import { getSessionUser } from "../utils/session";

function normalizeSort(value: unknown): "latest" | "hot" {
  return value === "hot" ? "hot" : "latest";
}

export const registerCommentRoutes = (app: Elysia) =>
  app
    .get("/api/problems/:id/comments", async ({ params, query, request, set }) => {
      const problemId = Number(params.id);
      if (!Number.isFinite(problemId) || problemId <= 0) {
        set.status = 400;
        return { error: "Invalid problem id." };
      }
      const page = normalizePage((query as any)?.page);
      const pageSize = normalizePageSize((query as any)?.pageSize, 10);
      const sort = normalizeSort((query as any)?.sort);
      const viewer = getSessionUser(request);
      const viewerId = viewer ? Number(viewer.id) : undefined;

      const { items, total } = await loadCommentsPage({
        problemId,
        page,
        pageSize,
        sort,
        viewerId: Number.isFinite(viewerId) ? viewerId : undefined,
      });
      set.headers["x-total-count"] = String(total);
      return items;
    })
    .post("/api/problems/:id/comments", async ({ params, body, request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const problemId = Number(params.id);
      if (!Number.isFinite(problemId) || problemId <= 0) {
        set.status = 400;
        return { error: "Invalid problem id." };
      }
      const userId = Number(user.id);
      if (!Number.isFinite(userId) || !checkCommentRateLimit(userId)) {
        set.status = 429;
        return { error: "评论过于频繁，请稍后再试。" };
      }
      const payload = (body ?? {}) as { content?: string; replyToCommentId?: number };
      const content = typeof payload.content === "string" ? payload.content : "";
      const replyRaw = Number(payload.replyToCommentId);
      const replyToCommentId =
        Number.isFinite(replyRaw) && replyRaw > 0 ? replyRaw : undefined;

      const result = await createComment({ problemId, user, content, replyToCommentId });
      if (result === null) {
        set.status = 404;
        return { error: "题目不存在。" };
      }
      if ("error" in result) {
        set.status = 400;
        return { error: result.error };
      }
      set.status = 201;
      return result;
    })
    .post("/api/comments/:id/like", async ({ params, request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const commentId = Number(params.id);
      if (!Number.isFinite(commentId) || commentId <= 0) {
        set.status = 400;
        return { error: "Invalid comment id." };
      }
      const result = await toggleCommentLike({
        commentId,
        userId: Number(user.id),
        likerName: user.name,
      });
      if (!result) {
        set.status = 404;
        return { error: "评论不存在。" };
      }
      return result;
    })
    .post("/api/comments/:id/report", async ({ params, body, request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const commentId = Number(params.id);
      if (!Number.isFinite(commentId) || commentId <= 0) {
        set.status = 400;
        return { error: "Invalid comment id." };
      }
      const payload = (body ?? {}) as { reason?: string };
      const reason =
        typeof payload.reason === "string" ? payload.reason.slice(0, 200) : "";

      const result = await reportComment({
        commentId,
        reporterId: Number(user.id),
        reporterName: user.name,
        reason,
      });
      if (result === null) {
        set.status = 404;
        return { error: "评论不存在。" };
      }
      return result;
    })
    .delete("/api/comments/:id", async ({ params, request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const commentId = Number(params.id);
      if (!Number.isFinite(commentId) || commentId <= 0) {
        set.status = 400;
        return { error: "Invalid comment id." };
      }
      const result = await deleteComment({ commentId, user });
      if (!result.allowed) {
        set.status = 403;
        return { error: "无权删除该评论。" };
      }
      return { ok: true };
    })
    .get("/api/admin/comments/reported", async ({ query, request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!hasPermission(user.permissions, PERMISSIONS.MANAGE_COMMENTS)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const page = normalizePage((query as any)?.page);
      const pageSize = normalizePageSize((query as any)?.pageSize, 20);
      const { items, total } = await loadReportedCommentsGrouped({ page, pageSize });
      set.headers["x-total-count"] = String(total);
      return items;
    })
    .post("/api/admin/comments/:id/dismiss-reports", async ({ params, request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      if (!hasPermission(user.permissions, PERMISSIONS.MANAGE_COMMENTS)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const commentId = Number(params.id);
      if (!Number.isFinite(commentId) || commentId <= 0) {
        set.status = 400;
        return { error: "Invalid comment id." };
      }
      await dismissOpenReportsForComment({ commentId });
      return { ok: true };
    });
