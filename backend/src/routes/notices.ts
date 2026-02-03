import { Elysia } from "elysia";
import { desc, eq, sql } from "drizzle-orm";
import { db, notices } from "../db";

export const registerNoticeRoutes = (app: Elysia) =>
  app
    .get("/api/notices", async ({ query, set }) => {
      const limitRaw = Number(query.limit ?? 6);
      const offsetRaw = Number(query.offset ?? 0);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), 50)
        : 6;
      const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(notices);
      const total = Number(countRow?.count ?? 0);
      set.headers["x-total-count"] = String(total);

      const rows = await db
        .select()
        .from(notices)
        .orderBy(desc(notices.isPinned), desc(notices.createdAt))
        .limit(limit)
        .offset(offset);
      return rows.map((item) => ({
        id: String(item.id),
        title: item.title,
        authorName: item.authorName,
        isPinned: Boolean(item.isPinned),
        createdAt: Number(item.createdAt),
        updatedAt: Number(item.updatedAt),
      }));
    })
    .get("/api/notices/:id", async ({ params, set }) => {
      const noticeId = Number(params.id);
      if (!Number.isFinite(noticeId)) {
        set.status = 400;
        return { error: "Invalid notice id." };
      }
      const [detail] = await db
        .select()
        .from(notices)
        .where(eq(notices.id, noticeId))
        .limit(1);
      if (!detail) {
        set.status = 404;
        return { error: "Notice not found." };
      }
      return {
        id: String(detail.id),
        title: detail.title,
        content: detail.content,
        authorName: detail.authorName,
        isPinned: Boolean(detail.isPinned),
        createdAt: Number(detail.createdAt),
        updatedAt: Number(detail.updatedAt),
      };
    });
