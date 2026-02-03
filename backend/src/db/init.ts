import { dbDialect, mysqlPool, sqliteClient } from "./index";

function assertSqliteClient() {
  if (!sqliteClient) {
    throw new Error("SQLite client not initialized.");
  }
  return sqliteClient;
}

async function execMysql(sql: string) {
  if (!mysqlPool) {
    throw new Error("MySQL pool not initialized.");
  }
  await mysqlPool.execute(sql);
}

function ensureSqliteNoticePinnedColumn(client: ReturnType<typeof assertSqliteClient>) {
  const columns = client
    .prepare("PRAGMA table_info(notices)")
    .all() as Array<{ name?: string }>;
  const hasColumn = columns.some((column) => column.name === "is_pinned");
  if (!hasColumn) {
    client.exec(
      "ALTER TABLE notices ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;"
    );
  }
}

function ensureSqliteUserRecordsDataColumn(
  client: ReturnType<typeof assertSqliteClient>
) {
  const columns = client
    .prepare("PRAGMA table_info(user_records)")
    .all() as Array<{ name?: string }>;
  const hasColumn = columns.some((column) => column.name === "record_data");
  if (!hasColumn) {
    client.exec("ALTER TABLE user_records ADD COLUMN record_data TEXT;");
  }
}

function ensureSqliteUserRecordsSyncColumns(
  client: ReturnType<typeof assertSqliteClient>
) {
  const columns = client
    .prepare("PRAGMA table_info(user_records)")
    .all() as Array<{ name?: string }>;
  const hasSyncSeq = columns.some((column) => column.name === "sync_seq");
  const hasDeletedAt = columns.some((column) => column.name === "deleted_at");
  if (!hasSyncSeq) {
    client.exec("ALTER TABLE user_records ADD COLUMN sync_seq INTEGER;");
  }
  if (!hasDeletedAt) {
    client.exec("ALTER TABLE user_records ADD COLUMN deleted_at INTEGER;");
  }
}

async function ensureMysqlNoticePinnedColumn() {
  try {
    await execMysql(
      "ALTER TABLE notices ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE;"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
}

async function ensureMysqlUserRecordsDataColumn() {
  try {
    await execMysql("ALTER TABLE user_records ADD COLUMN record_data JSON;");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
}

async function ensureMysqlUserRecordsSyncColumns() {
  try {
    await execMysql("ALTER TABLE user_records ADD COLUMN sync_seq BIGINT;");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
  try {
    await execMysql("ALTER TABLE user_records ADD COLUMN deleted_at BIGINT;");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
}

async function ensureSqliteTables() {
  const client = assertSqliteClient();
  client.exec("PRAGMA foreign_keys = ON;");
  client.exec(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      permissions INTEGER NOT NULL,
      built_in INTEGER NOT NULL DEFAULT 0
    );
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      group_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE RESTRICT
    );
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS user_records (
      user_id INTEGER NOT NULL,
      record_id TEXT NOT NULL,
      record_data TEXT,
      sync_seq INTEGER,
      deleted_at INTEGER,
      updated_at INTEGER,
      PRIMARY KEY (user_id, record_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      author_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT
    );
  `);
  ensureSqliteNoticePinnedColumn(client);
  ensureSqliteUserRecordsDataColumn(client);
  ensureSqliteUserRecordsSyncColumns(client);
  client.exec(`
    CREATE TABLE IF NOT EXISTS problem_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      year INTEGER NOT NULL,
      is_new INTEGER NOT NULL DEFAULT 0,
      recommended_rank INTEGER,
      creator_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 0,
      invite_code TEXT,
      test_meta TEXT,
      score_meta TEXT,
      question_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS problem_set_categories (
      problem_set_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (problem_set_id, category_id),
      FOREIGN KEY (problem_set_id) REFERENCES problem_sets(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS problems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      type INTEGER NOT NULL,
      choices TEXT,
      answer TEXT NOT NULL,
      hint TEXT
    );
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS problem_set_problems (
      problem_set_id INTEGER NOT NULL,
      problem_id INTEGER NOT NULL,
      order_index INTEGER NOT NULL,
      PRIMARY KEY (problem_set_id, problem_id),
      FOREIGN KEY (problem_set_id) REFERENCES problem_sets(id) ON DELETE CASCADE,
      FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
    );
  `);
}

async function ensureMysqlTables() {
  await execMysql(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      permissions INT NOT NULL,
      built_in BOOLEAN NOT NULL DEFAULT FALSE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      email VARCHAR(191) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      group_id VARCHAR(64) NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_users_group_id FOREIGN KEY (group_id)
        REFERENCES user_groups(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS user_records (
      user_id INT NOT NULL,
      record_id VARCHAR(128) NOT NULL,
      record_data JSON,
      sync_seq BIGINT,
      deleted_at BIGINT,
      updated_at BIGINT,
      PRIMARY KEY (user_id, record_id),
      CONSTRAINT fk_user_records_user_id FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS notices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      author_id INT NOT NULL,
      author_name VARCHAR(255) NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_notices_author_id FOREIGN KEY (author_id)
        REFERENCES users(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureMysqlNoticePinnedColumn();
  await ensureMysqlUserRecordsDataColumn();
  await ensureMysqlUserRecordsSyncColumns();
  await execMysql(`
    CREATE TABLE IF NOT EXISTS problem_sets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(191) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      year INT NOT NULL,
      is_new BOOLEAN NOT NULL DEFAULT FALSE,
      recommended_rank INT,
      creator_id VARCHAR(191) NOT NULL,
      creator_name VARCHAR(255) NOT NULL,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      invite_code VARCHAR(255),
      test_meta JSON,
      score_meta JSON,
      question_count INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS problem_set_categories (
      problem_set_id INT NOT NULL,
      category_id INT NOT NULL,
      PRIMARY KEY (problem_set_id, category_id),
      CONSTRAINT fk_psc_problem_set_id FOREIGN KEY (problem_set_id)
        REFERENCES problem_sets(id) ON DELETE CASCADE,
      CONSTRAINT fk_psc_category_id FOREIGN KEY (category_id)
        REFERENCES categories(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS problems (
      id INT AUTO_INCREMENT PRIMARY KEY,
      content TEXT NOT NULL,
      type INT NOT NULL,
      choices JSON,
      answer JSON NOT NULL,
      hint TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS problem_set_problems (
      problem_set_id INT NOT NULL,
      problem_id INT NOT NULL,
      order_index INT NOT NULL,
      PRIMARY KEY (problem_set_id, problem_id),
      CONSTRAINT fk_psp_problem_set_id FOREIGN KEY (problem_set_id)
        REFERENCES problem_sets(id) ON DELETE CASCADE,
      CONSTRAINT fk_psp_problem_id FOREIGN KEY (problem_id)
        REFERENCES problems(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

export async function ensureDatabaseReady() {
  if (dbDialect === "mysql") {
    await ensureMysqlTables();
    return;
  }
  await ensureSqliteTables();
}
