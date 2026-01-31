import { Elysia } from "elysia";
import { registerAdminRoutes } from "./admin";
import { registerAuthRoutes } from "./auth";
import { registerProblemSetRoutes } from "./problemSets";
import { registerRecordRoutes } from "./records";

export const registerRoutes = (app: Elysia) =>
  app
    .use(registerAuthRoutes)
    .use(registerAdminRoutes)
    .use(registerProblemSetRoutes)
    .use(registerRecordRoutes);
