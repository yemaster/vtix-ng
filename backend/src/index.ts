import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import http from "node:http";
import { Readable } from "node:stream";
import { Server as SocketIOServer } from "socket.io";
import { db } from "./db";
import { ensureDatabaseReady } from "./db/init";
import { ensureAdminUser } from "./db/seed";
import { registerRoutes } from "./routes";
import { initializeBrawlSocketServer } from "./services/brawl";

await ensureDatabaseReady();
await ensureAdminUser();

const app = new Elysia()
  .use(cors({ origin: true, credentials: true, exposeHeaders: ["x-total-count"] }))
  .decorate("db", db)
  .use(registerRoutes)
  .get("/", () => "Hello Vtix");

type NodeRequestInit = RequestInit & { duplex?: "half" };

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? "localhost:3000";
    const url = `http://${host}${req.url ?? "/"}`;
    const headers = new Headers();
    for (const [key, rawValue] of Object.entries(req.headers)) {
      if (rawValue === undefined) continue;
      if (Array.isArray(rawValue)) {
        for (const value of rawValue) {
          headers.append(key, value);
        }
      } else {
        headers.set(key, rawValue);
      }
    }
    const method = req.method ?? "GET";
    const hasBody = method !== "GET" && method !== "HEAD";
    const init: NodeRequestInit = { method, headers };
    if (hasBody) {
      // Node-style request streams require explicit duplex mode.
      init.body = Readable.toWeb(req) as unknown as BodyInit;
      init.duplex = "half";
    }
    const request = new Request(url, init);

    const response = await app.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    if (!response.body) {
      res.end();
      return;
    }
    Readable.fromWeb(response.body as any).pipe(res);
  } catch (error) {
    res.statusCode = 500;
    res.end(
      error instanceof Error ? error.message : "Internal Server Error"
    );
  }
});

const io = new SocketIOServer(server, {
  cors: {
    origin: true,
    credentials: true,
  },
  path: "/socket.io",
});
initializeBrawlSocketServer(io);

server.listen(3000);

console.log(
  `vtix-backend is running at 0.0.0.0:3000`
);
