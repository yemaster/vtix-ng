import { Elysia } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { db, notices } from "../../db";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";

type NoticeGuard =
  | { user: NonNullable<ReturnType<typeof getSessionUser>> }
  | { error: "Unauthorized" | "Forbidden" };

function ensureNoticePermission(
  request: Request,
  set: { status?: number | string }
): NoticeGuard {
  const user = getSessionUser(request);
  if (!user) {
    set.status = 401;
    return { error: "Unauthorized" } as const;
  }
  if (!hasPermission(user.permissions, PERMISSIONS.MANAGE_NOTICES)) {
    set.status = 403;
    return { error: "Forbidden" } as const;
  }
  return { user } as const;
}

export const registerAdminNoticeRoutes = (app: Elysia) =>
  app
    .get("/api/admin/notices", async ({ request, set }) => {
      const guard = ensureNoticePermission(request, set);
      if ("error" in guard) {
        return guard;
      }
      const rows = (await db
        .select()
        .from(notices)
        .orderBy(desc(notices.isPinned), desc(notices.updatedAt))) as Array<{
        id: number;
        title: string;
        content: string;
        isPinned: boolean;
        authorName: string;
        createdAt: number;
        updatedAt: number;
      }>;
      return rows.map((item) => ({
        id: String(item.id),
        title: item.title,
        content: item.content,
        isPinned: Boolean(item.isPinned),
        authorName: item.authorName,
        createdAt: Number(item.createdAt),
        updatedAt: Number(item.updatedAt),
      }));
    })
    .post("/api/admin/notices", async ({ request, body, set }) => {
      const guard = ensureNoticePermission(request, set);
      if ("error" in guard) {
        return guard;
      }
      const user = guard.user;
      const payload = (body ?? {}) as {
        title?: string;
        content?: string;
        isPinned?: boolean;
      };
      const title = String(payload.title ?? "").trim();
      const content = String(payload.content ?? "").trim();
      const isPinned = Boolean(payload.isPinned);
      if (!title || !content) {
        set.status = 400;
        return { error: "Title and content required." };
      }
      const now = Date.now();
      await db.insert(notices).values({
        title,
        content,
        isPinned,
        authorId: Number(user.id),
        authorName: user.name,
        createdAt: now,
        updatedAt: now,
      });
      const [created] = await db
        .select()
        .from(notices)
        .where(
          and(
            eq(notices.authorId, Number(user.id)),
            eq(notices.createdAt, now),
            eq(notices.title, title)
          )
        )
        .limit(1);
      return {
        id: String(created?.id ?? ""),
        title,
        content,
        isPinned,
        authorName: user.name,
        createdAt: Number(created?.createdAt ?? now),
        updatedAt: Number(created?.updatedAt ?? now),
      };
    })
    .put("/api/admin/notices/:id", async ({ params, request, body, set }) => {
      const guard = ensureNoticePermission(request, set);
      if ("error" in guard) {
        return guard;
      }
      const noticeId = Number(params.id);
      if (!Number.isFinite(noticeId)) {
        set.status = 400;
        return { error: "Invalid notice id." };
      }
      const [existing] = await db
        .select()
        .from(notices)
        .where(eq(notices.id, noticeId))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Notice not found." };
      }
      const payload = (body ?? {}) as {
        title?: string;
        content?: string;
        isPinned?: boolean;
      };
      const title = String(payload.title ?? existing.title).trim();
      const content = String(payload.content ?? existing.content).trim();
      const isPinned =
        typeof payload.isPinned === "boolean"
          ? payload.isPinned
          : Boolean(existing.isPinned);
      if (!title || !content) {
        set.status = 400;
        return { error: "Title and content required." };
      }
      const updatedAt = Date.now();
      await db
        .update(notices)
        .set({ title, content, isPinned, updatedAt })
        .where(eq(notices.id, noticeId));
      return {
        id: String(existing.id),
        title,
        content,
        isPinned,
        authorName: existing.authorName,
        createdAt: Number(existing.createdAt),
        updatedAt,
      };
    })
    .delete("/api/admin/notices/:id", async ({ params, request, set }) => {
      const guard = ensureNoticePermission(request, set);
      if ("error" in guard) {
        return guard;
      }
      const noticeId = Number(params.id);
      if (!Number.isFinite(noticeId)) {
        set.status = 400;
        return { error: "Invalid notice id." };
      }
      const [existing] = await db
        .select({ id: notices.id })
        .from(notices)
        .where(eq(notices.id, noticeId))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Notice not found." };
      }
      await db.delete(notices).where(eq(notices.id, noticeId));
      return { ok: true };
    });
