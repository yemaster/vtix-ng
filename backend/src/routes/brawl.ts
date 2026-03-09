import { Elysia } from "elysia";
import { loadBrawlProblemSetPage, loadBrawlUserSpace } from "../services/brawl";
import { getSessionUser } from "../utils/session";

export const registerBrawlRoutes = (app: Elysia) =>
  app
    .get("/api/brawl/problem-sets", async ({ query, request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const pageRaw = Number((query as Record<string, unknown>)?.page ?? NaN);
      const pageSizeRaw = Number(
        (query as Record<string, unknown>)?.pageSize ?? NaN
      );
      const keyword =
        typeof (query as Record<string, unknown>)?.q === "string"
          ? String((query as Record<string, unknown>).q)
          : "";
      const { items, total } = await loadBrawlProblemSetPage({
        page: pageRaw,
        pageSize: pageSizeRaw,
        keyword,
      });
      set.headers["x-total-count"] = String(total);
      return items;
    })
    .get("/api/brawl/user-space", async ({ query, set }) => {
      const name =
        typeof (query as Record<string, unknown>)?.name === "string"
          ? String((query as Record<string, unknown>).name).trim()
          : "";
      if (!name) {
        set.status = 400;
        return { error: "Invalid name" };
      }
      const pageRaw = Number((query as Record<string, unknown>)?.page ?? NaN);
      const pageSizeRaw = Number(
        (query as Record<string, unknown>)?.pageSize ?? NaN
      );
      const data = await loadBrawlUserSpace({
        userName: name,
        page: pageRaw,
        pageSize: pageSizeRaw,
      });
      if (!data) {
        set.status = 404;
        return { error: "User not found" };
      }
      set.headers["x-total-count"] = String(data.total);
      return data;
    });
