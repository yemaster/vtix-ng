import {
  bigint,
  boolean,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  varchar,
} from "drizzle-orm/mysql-core";

const VARCHAR_ID = 191;
type TestConfigItem = {
  type: number;
  typeMask?: number;
  number: number;
  score: number;
};
type TestMeta = TestConfigItem[] | number[] | number | null;

export const problemSets = mysqlTable("problem_sets", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: VARCHAR_ID }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  year: int("year").notNull(),
  isPending: boolean("is_pending").notNull().default(false),
  viewCount: int("view_count").notNull().default(0),
  likeCount: int("like_count").notNull().default(0),
  dislikeCount: int("dislike_count").notNull().default(0),
  recommendedRank: int("recommended_rank"),
  creatorId: varchar("creator_id", { length: VARCHAR_ID }).notNull(),
  creatorName: varchar("creator_name", { length: 255 }).notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  inviteCode: varchar("invite_code", { length: 255 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  testMeta: json("test_meta").$type<TestMeta>(),
  scoreMeta: json("score_meta").$type<number[] | null>(),
  questionCount: int("question_count").notNull().default(0),
});

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: VARCHAR_ID }).notNull().unique(),
});

export const userGroups = mysqlTable("user_groups", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  permissions: int("permissions").notNull(),
  privateProblemSetLimit: int("private_problem_set_limit").notNull().default(-1),
  recordCloudLimit: int("record_cloud_limit").notNull().default(-1),
  builtIn: boolean("built_in").notNull().default(false),
});

export const problemSetCategories = mysqlTable(
  "problem_set_categories",
  {
    problemSetId: int("problem_set_id")
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    categoryId: int("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.problemSetId, table.categoryId] }),
  })
);

export const problems = mysqlTable("problems", {
  id: int("id").autoincrement().primaryKey(),
  content: text("content").notNull(),
  type: int("type").notNull(),
  choices: json("choices").$type<string[] | null>(),
  answer: json("answer").$type<number | number[] | string>().notNull(),
  hint: text("hint"),
});

export const problemSetProblems = mysqlTable(
  "problem_set_problems",
  {
    problemSetId: int("problem_set_id")
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    problemId: int("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    orderIndex: int("order_index").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.problemSetId, table.problemId] }),
  })
);

export const problemSetReactions = mysqlTable(
  "problem_set_reactions",
  {
    problemSetId: int("problem_set_id")
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: int("value").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.problemSetId, table.userId] }),
  })
);

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: VARCHAR_ID }).notNull().unique(),
  email: varchar("email", { length: VARCHAR_ID }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  groupId: varchar("group_id", { length: 64 })
    .notNull()
    .references(() => userGroups.id, { onDelete: "restrict" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const userRecords = mysqlTable(
  "user_records",
  {
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recordId: varchar("record_id", { length: 128 }).notNull(),
    recordData: json("record_data").$type<Record<string, unknown> | null>(),
    syncSeq: bigint("sync_seq", { mode: "number" }),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    updatedAt: bigint("updated_at", { mode: "number" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.recordId] }),
  })
);

export const notices = mysqlTable("notices", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  authorId: int("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  authorName: varchar("author_name", { length: 255 }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  senderId: int("sender_id").notNull(),
  senderName: varchar("sender_name", { length: 255 }).notNull(),
  receiverId: int("receiver_id").notNull(),
  receiverName: varchar("receiver_name", { length: 255 }).notNull(),
  content: text("content").notNull(),
  type: int("type").notNull(),
  link: varchar("link", { length: 512 }),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
