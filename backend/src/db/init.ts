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

function ensureSqliteMessagesReadColumn(
  client: ReturnType<typeof assertSqliteClient>
) {
  const columns = client
    .prepare("PRAGMA table_info(messages)")
    .all() as Array<{ name?: string }>;
  const hasColumn = columns.some((column) => column.name === "is_read");
  if (!hasColumn) {
    client.exec("ALTER TABLE messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;");
  }
}

function ensureSqliteUserGroupLimitColumn(
  client: ReturnType<typeof assertSqliteClient>
) {
  const columns = client
    .prepare("PRAGMA table_info(user_groups)")
    .all() as Array<{ name?: string }>;
  const hasColumn = columns.some((column) => column.name === "private_problem_set_limit");
  if (!hasColumn) {
    client.exec(
      "ALTER TABLE user_groups ADD COLUMN private_problem_set_limit INTEGER NOT NULL DEFAULT -1;"
    );
  }
}

function ensureSqliteUserGroupRecordLimitColumn(
  client: ReturnType<typeof assertSqliteClient>
) {
  const columns = client
    .prepare("PRAGMA table_info(user_groups)")
    .all() as Array<{ name?: string }>;
  const hasColumn = columns.some((column) => column.name === "record_cloud_limit");
  if (!hasColumn) {
    client.exec(
      "ALTER TABLE user_groups ADD COLUMN record_cloud_limit INTEGER NOT NULL DEFAULT -1;"
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

function ensureSqliteProblemSetTimestampColumns(
  client: ReturnType<typeof assertSqliteClient>
) {
  const columns = client
    .prepare("PRAGMA table_info(problem_sets)")
    .all() as Array<{ name?: string }>;
  const hasCreatedAt = columns.some((column) => column.name === "created_at");
  const hasUpdatedAt = columns.some((column) => column.name === "updated_at");
  if (!hasCreatedAt) {
    client.exec(
      "ALTER TABLE problem_sets ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;"
    );
  }
  if (!hasUpdatedAt) {
    client.exec(
      "ALTER TABLE problem_sets ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;"
    );
  }
  client.exec(
    "UPDATE problem_sets SET created_at = strftime('%s','now') * 1000 WHERE created_at = 0;"
  );
  client.exec(
    "UPDATE problem_sets SET updated_at = strftime('%s','now') * 1000 WHERE updated_at = 0;"
  );
}

function ensureSqliteProblemSetPendingColumn(
  client: ReturnType<typeof assertSqliteClient>
) {
  const columns = client
    .prepare("PRAGMA table_info(problem_sets)")
    .all() as Array<{ name?: string }>;
  const hasColumn = columns.some((column) => column.name === "is_pending");
  if (!hasColumn) {
    client.exec(
      "ALTER TABLE problem_sets ADD COLUMN is_pending INTEGER NOT NULL DEFAULT 0;"
    );
  }
}

// comment_floor_seq is declared in CREATE TABLE problems (fresh installs), but
// a DB created before this feature (e.g. by master) already has `problems` and
// won't get the column via CREATE TABLE IF NOT EXISTS. Add it here so the
// comment feature runs on those DBs. Backfill not needed: comments are new, so
// every existing problem correctly starts at seq 0 -> first comment is floor 1.
function ensureSqliteProblemCommentFloorSeqColumn(
  client: ReturnType<typeof assertSqliteClient>
) {
  const columns = client
    .prepare("PRAGMA table_info(problems)")
    .all() as Array<{ name?: string }>;
  const hasColumn = columns.some((column) => column.name === "comment_floor_seq");
  if (!hasColumn) {
    client.exec(
      "ALTER TABLE problems ADD COLUMN comment_floor_seq INTEGER NOT NULL DEFAULT 0;"
    );
  }
}

function ensureSqliteProblemSetStatsColumns(
  client: ReturnType<typeof assertSqliteClient>
) {
  const columns = client
    .prepare("PRAGMA table_info(problem_sets)")
    .all() as Array<{ name?: string }>;
  const hasViewCount = columns.some((column) => column.name === "view_count");
  const hasLikeCount = columns.some((column) => column.name === "like_count");
  const hasDislikeCount = columns.some(
    (column) => column.name === "dislike_count"
  );
  if (!hasViewCount) {
    client.exec(
      "ALTER TABLE problem_sets ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;"
    );
  }
  if (!hasLikeCount) {
    client.exec(
      "ALTER TABLE problem_sets ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;"
    );
  }
  if (!hasDislikeCount) {
    client.exec(
      "ALTER TABLE problem_sets ADD COLUMN dislike_count INTEGER NOT NULL DEFAULT 0;"
    );
  }
}

function ensureSqliteBrawlRecordIndexes(
  client: ReturnType<typeof assertSqliteClient>
) {
  client.exec(
    "CREATE INDEX IF NOT EXISTS idx_brawl_records_player1_created ON brawl_records(player1_id, created_at DESC);"
  );
  client.exec(
    "CREATE INDEX IF NOT EXISTS idx_brawl_records_player2_created ON brawl_records(player2_id, created_at DESC);"
  );
  client.exec(
    "CREATE INDEX IF NOT EXISTS idx_brawl_records_winner_id ON brawl_records(winner_id);"
  );
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

async function ensureMysqlMessagesReadColumn() {
  try {
    await execMysql(
      "ALTER TABLE messages ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT FALSE;"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
}

async function ensureMysqlUserGroupLimitColumn() {
  try {
    await execMysql(
      "ALTER TABLE user_groups ADD COLUMN private_problem_set_limit INT NOT NULL DEFAULT -1;"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
}

async function ensureMysqlUserGroupRecordLimitColumn() {
  try {
    await execMysql(
      "ALTER TABLE user_groups ADD COLUMN record_cloud_limit INT NOT NULL DEFAULT -1;"
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

async function ensureMysqlProblemSetTimestampColumns() {
  try {
    await execMysql(
      "ALTER TABLE problem_sets ADD COLUMN created_at BIGINT NOT NULL DEFAULT 0;"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
  try {
    await execMysql(
      "ALTER TABLE problem_sets ADD COLUMN updated_at BIGINT NOT NULL DEFAULT 0;"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
  await execMysql(
    "UPDATE problem_sets SET created_at = UNIX_TIMESTAMP() * 1000 WHERE created_at = 0;"
  );
  await execMysql(
    "UPDATE problem_sets SET updated_at = UNIX_TIMESTAMP() * 1000 WHERE updated_at = 0;"
  );
}

async function ensureMysqlProblemSetPendingColumn() {
  try {
    await execMysql(
      "ALTER TABLE problem_sets ADD COLUMN is_pending BOOLEAN NOT NULL DEFAULT FALSE;"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
}

// See ensureSqliteProblemCommentFloorSeqColumn: backfill column for DBs that
// predate the comment feature.
async function ensureMysqlProblemCommentFloorSeqColumn() {
  try {
    await execMysql(
      "ALTER TABLE problems ADD COLUMN comment_floor_seq INT NOT NULL DEFAULT 0;"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
}

async function ensureMysqlProblemSetStatsColumns() {
  try {
    await execMysql(
      "ALTER TABLE problem_sets ADD COLUMN view_count INT NOT NULL DEFAULT 0;"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
  try {
    await execMysql(
      "ALTER TABLE problem_sets ADD COLUMN like_count INT NOT NULL DEFAULT 0;"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
  try {
    await execMysql(
      "ALTER TABLE problem_sets ADD COLUMN dislike_count INT NOT NULL DEFAULT 0;"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
}

async function ensureMysqlBrawlRecordIndexes() {
  try {
    await execMysql(
      "CREATE INDEX idx_brawl_records_player1_created ON brawl_records(player1_id, created_at DESC);"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate key name")) {
      throw error;
    }
  }
  try {
    await execMysql(
      "CREATE INDEX idx_brawl_records_player2_created ON brawl_records(player2_id, created_at DESC);"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate key name")) {
      throw error;
    }
  }
  try {
    await execMysql(
      "CREATE INDEX idx_brawl_records_winner_id ON brawl_records(winner_id);"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("duplicate key name")) {
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
      private_problem_set_limit INTEGER NOT NULL DEFAULT -1,
      record_cloud_limit INTEGER NOT NULL DEFAULT -1,
      built_in INTEGER NOT NULL DEFAULT 0
    );
  `);
  ensureSqliteUserGroupLimitColumn(client);
  ensureSqliteUserGroupRecordLimitColumn(client);
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
  client.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      sender_name TEXT NOT NULL,
      receiver_id INTEGER NOT NULL,
      receiver_name TEXT NOT NULL,
      content TEXT NOT NULL,
      type INTEGER NOT NULL,
      link TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS brawl_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      problem_set_code TEXT NOT NULL,
      problem_set_title TEXT NOT NULL,
      player1_id TEXT NOT NULL,
      player1_name TEXT NOT NULL,
      player2_id TEXT NOT NULL,
      player2_name TEXT NOT NULL,
      score1 INTEGER NOT NULL,
      score2 INTEGER NOT NULL,
      winner_id TEXT,
      winner_name TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  ensureSqliteBrawlRecordIndexes(client);
  ensureSqliteNoticePinnedColumn(client);
  ensureSqliteMessagesReadColumn(client);
  ensureSqliteUserRecordsDataColumn(client);
  ensureSqliteUserRecordsSyncColumns(client);
  client.exec(`
    CREATE TABLE IF NOT EXISTS problem_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      year INTEGER NOT NULL,
      is_pending INTEGER NOT NULL DEFAULT 0,
      view_count INTEGER NOT NULL DEFAULT 0,
      like_count INTEGER NOT NULL DEFAULT 0,
      dislike_count INTEGER NOT NULL DEFAULT 0,
      recommended_rank INTEGER,
      creator_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 0,
      invite_code TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
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
      hint TEXT,
      comment_floor_seq INTEGER NOT NULL DEFAULT 0
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
  client.exec(`
    CREATE TABLE IF NOT EXISTS problem_set_reactions (
      problem_set_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      value INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (problem_set_id, user_id),
      FOREIGN KEY (problem_set_id) REFERENCES problem_sets(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS problem_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      problem_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      content TEXT NOT NULL,
      floor INTEGER NOT NULL,
      like_count INTEGER NOT NULL DEFAULT 0,
      reply_to_comment_id INTEGER,
      reply_to_floor INTEGER,
      reply_to_user_name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_problem_comments_problem_floor
      ON problem_comments(problem_id, floor);
    CREATE INDEX IF NOT EXISTS idx_problem_comments_problem_id
      ON problem_comments(problem_id, id);
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS problem_comment_likes (
      comment_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (comment_id, user_id),
      FOREIGN KEY (comment_id) REFERENCES problem_comments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  client.exec(`
    CREATE TABLE IF NOT EXISTS problem_comment_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      reporter_id INTEGER NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      UNIQUE (comment_id, reporter_id),
      FOREIGN KEY (comment_id) REFERENCES problem_comments(id) ON DELETE CASCADE,
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_problem_comment_reports_status
      ON problem_comment_reports(status, created_at);
  `);
  ensureSqliteProblemSetTimestampColumns(client);
  ensureSqliteProblemSetPendingColumn(client);
  ensureSqliteProblemCommentFloorSeqColumn(client);
  ensureSqliteProblemSetStatsColumns(client);
}

async function ensureMysqlTables() {
  await execMysql(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      description TEXT,
      permissions INT NOT NULL,
      private_problem_set_limit INT NOT NULL DEFAULT -1,
      record_cloud_limit INT NOT NULL DEFAULT -1,
      built_in BOOLEAN NOT NULL DEFAULT FALSE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureMysqlUserGroupLimitColumn();
  await ensureMysqlUserGroupRecordLimitColumn();
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
  await execMysql(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sender_id INT NOT NULL,
      sender_name VARCHAR(255) NOT NULL,
      receiver_id INT NOT NULL,
      receiver_name VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      type INT NOT NULL,
      link VARCHAR(512),
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS brawl_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      problem_set_code VARCHAR(191) NOT NULL,
      problem_set_title VARCHAR(255) NOT NULL,
      player1_id VARCHAR(191) NOT NULL,
      player1_name VARCHAR(255) NOT NULL,
      player2_id VARCHAR(191) NOT NULL,
      player2_name VARCHAR(255) NOT NULL,
      score1 INT NOT NULL,
      score2 INT NOT NULL,
      winner_id VARCHAR(191),
      winner_name VARCHAR(255),
      created_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureMysqlBrawlRecordIndexes();
  await ensureMysqlNoticePinnedColumn();
  await ensureMysqlMessagesReadColumn();
  await ensureMysqlUserRecordsDataColumn();
  await ensureMysqlUserRecordsSyncColumns();
  await execMysql(`
    CREATE TABLE IF NOT EXISTS problem_sets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(191) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      year INT NOT NULL,
      is_pending BOOLEAN NOT NULL DEFAULT FALSE,
      view_count INT NOT NULL DEFAULT 0,
      like_count INT NOT NULL DEFAULT 0,
      dislike_count INT NOT NULL DEFAULT 0,
      recommended_rank INT,
      creator_id VARCHAR(191) NOT NULL,
      creator_name VARCHAR(255) NOT NULL,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      invite_code VARCHAR(255),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      test_meta JSON,
      score_meta JSON,
      question_count INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureMysqlProblemSetTimestampColumns();
  await ensureMysqlProblemSetPendingColumn();
  await ensureMysqlProblemCommentFloorSeqColumn();
  await ensureMysqlProblemSetStatsColumns();
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
      hint TEXT,
      comment_floor_seq INT NOT NULL DEFAULT 0
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
  await execMysql(`
    CREATE TABLE IF NOT EXISTS problem_set_reactions (
      problem_set_id INT NOT NULL,
      user_id INT NOT NULL,
      value INT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (problem_set_id, user_id),
      CONSTRAINT fk_psr_problem_set_id FOREIGN KEY (problem_set_id)
        REFERENCES problem_sets(id) ON DELETE CASCADE,
      CONSTRAINT fk_psr_user_id FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS problem_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      problem_id INT NOT NULL,
      user_id INT NOT NULL,
      user_name VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      floor INT NOT NULL,
      like_count INT NOT NULL DEFAULT 0,
      reply_to_comment_id INT,
      reply_to_floor INT,
      reply_to_user_name VARCHAR(255),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_pc_problem_id FOREIGN KEY (problem_id)
        REFERENCES problems(id) ON DELETE CASCADE,
      CONSTRAINT fk_pc_user_id FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_problem_comments_problem_floor (problem_id, floor),
      INDEX idx_problem_comments_problem_id (problem_id, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS problem_comment_likes (
      comment_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (comment_id, user_id),
      CONSTRAINT fk_pcl_comment_id FOREIGN KEY (comment_id)
        REFERENCES problem_comments(id) ON DELETE CASCADE,
      CONSTRAINT fk_pcl_user_id FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await execMysql(`
    CREATE TABLE IF NOT EXISTS problem_comment_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      comment_id INT NOT NULL,
      reporter_id INT NOT NULL,
      reason TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      created_at BIGINT NOT NULL,
      UNIQUE KEY uq_problem_comment_reports (comment_id, reporter_id),
      CONSTRAINT fk_pcr_comment_id FOREIGN KEY (comment_id)
        REFERENCES problem_comments(id) ON DELETE CASCADE,
      CONSTRAINT fk_pcr_reporter_id FOREIGN KEY (reporter_id)
        REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_problem_comment_reports_status (status, created_at)
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
