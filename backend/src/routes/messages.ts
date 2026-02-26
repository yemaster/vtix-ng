import { Elysia } from "elysia";
import { loadUnreadMessageCount, loadUserMessagesPage, markMessagesRead } from "../services/messages";
import { normalizePage, normalizePageSize } from "../utils/pagination";
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
      const page = normalizePage((query as any)?.page);
      const pageSize = normalizePageSize((query as any)?.pageSize);
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
