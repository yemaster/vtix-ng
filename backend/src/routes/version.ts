import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Elysia } from "elysia";

type VersionInfo = {
  name: string;
  version: string;
  buildTime?: string;
};

const versionInfo: VersionInfo = (() => {
  try {
    const raw = readFileSync(resolve(process.cwd(), "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { name?: string; version?: string };
    return {
      name: String(parsed.name ?? "backend"),
      version: String(parsed.version ?? "unknown"),
      buildTime: process.env.BACKEND_BUILD_TIME
        ? String(process.env.BACKEND_BUILD_TIME)
        : undefined,
    };
  } catch {
    return {
      name: "backend",
      version: "unknown",
      buildTime: process.env.BACKEND_BUILD_TIME
        ? String(process.env.BACKEND_BUILD_TIME)
        : undefined,
    };
  }
})();

export const registerVersionRoutes = (app: Elysia) =>
  app.get("/api/version", () => versionInfo);
