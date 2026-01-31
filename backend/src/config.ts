import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type FileConfig = {
  dbDialect?: string;
  databaseUrl?: string;
  mysqlUrl?: string;
  sqlitePath?: string;
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
};
