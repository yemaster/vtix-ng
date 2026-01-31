import { Elysia } from "elysia";
import { registerAdminProblemSetRoutes } from "./problemSets";
import { registerAdminStatsRoutes } from "./stats";
import { registerAdminUserGroupRoutes } from "./userGroups";
import { registerAdminUserRoutes } from "./users";

export const registerAdminRoutes = (app: Elysia) =>
  app
    .use(registerAdminStatsRoutes)
    .use(registerAdminProblemSetRoutes)
    .use(registerAdminUserGroupRoutes)
    .use(registerAdminUserRoutes);
