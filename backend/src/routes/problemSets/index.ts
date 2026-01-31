import { Elysia } from "elysia";
import { registerProblemSetManageRoutes } from "./manage";
import { registerMyProblemSetRoutes } from "./mine";
import { registerPublicProblemSetRoutes } from "./public";

export const registerProblemSetRoutes = (app: Elysia) =>
  app
    .use(registerPublicProblemSetRoutes)
    .use(registerMyProblemSetRoutes)
    .use(registerProblemSetManageRoutes);
