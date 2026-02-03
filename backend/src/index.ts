import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { db } from "./db";
import { ensureDatabaseReady } from "./db/init";
import { ensureAdminUser } from "./db/seed";
import { registerRoutes } from "./routes";

await ensureDatabaseReady();
await ensureAdminUser();

const app = new Elysia()
  .use(cors({ origin: true, credentials: true, exposeHeaders: ["x-total-count"] }))
  .decorate("db", db)
  .use(registerRoutes)
  .get("/", () => "Hello Vtix")
  .listen(3000);

console.log(
  `vtix-backend is running at ${app.server?.hostname}:${app.server?.port}`
);
