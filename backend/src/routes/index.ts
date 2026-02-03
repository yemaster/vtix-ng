import { Elysia } from "elysia";
import { registerAdminRoutes } from "./admin";
import { registerAuthRoutes } from "./auth";
import { registerNoticeRoutes } from "./notices";
import { registerProblemSetRoutes } from "./problemSets";
import { registerRecordRoutes } from "./records";
import { registerStatsRoutes } from "./stats";
import { registerVersionRoutes } from "./version";

export const registerRoutes = (app: Elysia) =>
  app
    .use(registerAuthRoutes)
    .use(registerVersionRoutes)
    .use(registerStatsRoutes)
    .use(registerNoticeRoutes)
    .use(registerAdminRoutes)
    .use(registerProblemSetRoutes)
    .use(registerRecordRoutes);
