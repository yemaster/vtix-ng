import { Elysia } from "elysia";
import { loadUnreadMessageCount, loadUserMessagesPage, markMessagesRead } from "../services/messages";
import { getSessionUser } from "../utils/session";

export const registerMessageRoutes = (app: Elysia) =>
  app
    .get("/api/messages/unread-count", async ({ request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const receiverId = Number(user.id);
      if (!Number.isFinite(receiverId)) {
        set.status = 400;
        return { error: "Invalid user" };
      }
      const count = await loadUnreadMessageCount(receiverId);
      return { count };
    })
    .get("/api/messages", async ({ request, query, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const receiverId = Number(user.id);
      if (!Number.isFinite(receiverId)) {
        set.status = 400;
        return { error: "Invalid user" };
      }
      const pageRaw = Number((query as any)?.page ?? 1);
      const pageSizeRaw = Number((query as any)?.pageSize ?? 12);
      const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
      const pageSize = Number.isFinite(pageSizeRaw)
        ? Math.min(Math.max(pageSizeRaw, 1), 50)
        : 12;
      const unreadCount = await loadUnreadMessageCount(receiverId);
      const { items, total } = await loadUserMessagesPage({
        receiverId,
        page,
        pageSize,
      });
      const ids = items.map((item) => item.id).filter((id) => Number.isFinite(id));
      if (ids.length) {
        await markMessagesRead(receiverId, ids);
      }
      set.headers["x-total-count"] = String(total);
      set.headers["x-unread-count"] = String(unreadCount);
      return items;
    });
