import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type FileConfig = {
  dbDialect?: string;
  databaseUrl?: string;
  mysqlUrl?: string;
  sqlitePath?: string;
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
};

function loadFileConfig(): FileConfig {
  const configPath = resolve(process.cwd(), "config.json");
  if (!existsSync(configPath)) return {};
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as FileConfig;
    }
  } catch {
    return {};
  }
  return {};
}

const fileConfig = loadFileConfig();

export const appConfig = {
  dbDialect: String(process.env.DB_DIALECT ?? fileConfig.dbDialect ?? "sqlite")
    .trim()
    .toLowerCase(),
  databaseUrl: String(
    process.env.DATABASE_URL ?? fileConfig.databaseUrl ?? ""
  ).trim(),
  mysqlUrl: String(process.env.MYSQL_URL ?? fileConfig.mysqlUrl ?? "").trim(),
  sqlitePath: String(fileConfig.sqlitePath ?? "data/vtix.db").trim(),
  adminName: String(
    process.env.ADMIN_NAME ?? fileConfig.adminName ?? "Admin"
  ).trim(),
  adminEmail: String(
    process.env.ADMIN_EMAIL ?? fileConfig.adminEmail ?? "admin@vtix.dev"
  ).trim(),
  adminPassword: String(
    process.env.ADMIN_PASSWORD ?? fileConfig.adminPassword ?? "admin1234"
  ),
};
