import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import * as mysqlSchema from "./schema.mysql";
import * as sqliteSchema from "./schema.sqlite";
import { appConfig } from "../config";

const dialect = appConfig.dbDialect;
const useMysql = dialect === "mysql";

const schema = useMysql ? mysqlSchema : sqliteSchema;

let db: any;
let sqliteClient: Database | null = null;
let mysqlPool: ReturnType<typeof createPool> | null = null;

if (useMysql) {
  const mysqlUrl = appConfig.databaseUrl || appConfig.mysqlUrl;
  if (!mysqlUrl) {
    throw new Error("DATABASE_URL is required when DB_DIALECT=mysql");
  }
  const pool = createPool(mysqlUrl);
  mysqlPool = pool;
  db = drizzleMysql(pool, { schema: mysqlSchema });
} else {
  const dbPath = appConfig.databaseUrl || appConfig.sqlitePath || "data/vtix.db";
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqliteClient = sqlite;
  db = drizzleSqlite(sqlite, { schema: sqliteSchema });
}

export const dbDialect = useMysql ? "mysql" : "sqlite";
export const problemSets = schema.problemSets;
export const categories = schema.categories;
export const problemSetCategories = schema.problemSetCategories;
export const problems = schema.problems;
export const problemSetProblems = schema.problemSetProblems;
export const users = schema.users;
export const userGroups = schema.userGroups;
export const userRecords = schema.userRecords;
export { db, schema, sqliteClient, mysqlPool };
