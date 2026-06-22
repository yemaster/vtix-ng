import { Elysia } from "elysia";
import { registerAdminRoutes } from "./admin";
import { registerAuthRoutes } from "./auth";
import { registerNoticeRoutes } from "./notices";
import { registerProblemSetRoutes } from "./problemSets";
import { registerRecordRoutes } from "./records";
import { registerStatsRoutes } from "./stats";
import { registerVersionRoutes } from "./version";
import { registerMessageRoutes } from "./messages";
import { registerBrawlRoutes } from "./brawl";
import { registerAiRoutes } from "./ai";
import { registerAiSettingsRoutes } from "./ai-settings";

export const registerRoutes = (app: Elysia) =>
  app
    .use(registerAuthRoutes)
    .use(registerVersionRoutes)
    .use(registerStatsRoutes)
    .use(registerNoticeRoutes)
    .use(registerBrawlRoutes)
    .use(registerMessageRoutes)
    .use(registerAiRoutes)
    .use(registerAiSettingsRoutes)
    .use(registerAdminRoutes)
    .use(registerProblemSetRoutes)
    .use(registerRecordRoutes);
