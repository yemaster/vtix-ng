import { Elysia } from "elysia";
import { loadProblemSetList } from "../../services/problemSets";
import { getSessionUser } from "../../utils/session";

export const registerMyProblemSetRoutes = (app: Elysia) =>
  app.get("/api/my-problem-sets", async ({ request, set }) => {
    const user = getSessionUser(request);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
    return loadProblemSetList({
      onlyCreatorId: user.id,
    });
  });
