import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

type TestConfigItem = { type: number; number: number; score: number };
type TestMeta = TestConfigItem[] | number[] | number | null;

export const problemSets = sqliteTable("problem_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  year: integer("year").notNull(),
  isNew: integer("is_new", { mode: "boolean" }).notNull().default(false),
  recommendedRank: integer("recommended_rank"),
  creatorId: text("creator_id").notNull(),
  creatorName: text("creator_name").notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  inviteCode: text("invite_code"),
  testMeta: text("test_meta", { mode: "json" })
    .$type<TestMeta>()
    .default(null),
  scoreMeta: text("score_meta", { mode: "json" })
    .$type<number[] | null>()
    .default(null),
  questionCount: integer("question_count").notNull().default(0),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const problemSetCategories = sqliteTable(
  "problem_set_categories",
  {
    problemSetId: integer("problem_set_id")
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.problemSetId, table.categoryId] }),
  })
);

export const problems = sqliteTable("problems", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  type: integer("type").notNull(),
  choices: text("choices", { mode: "json" })
    .$type<string[] | null>()
    .default(null),
  answer: text("answer", { mode: "json" })
    .$type<number | number[] | string>()
    .notNull(),
  hint: text("hint"),
});

export const problemSetProblems = sqliteTable(
  "problem_set_problems",
  {
    problemSetId: integer("problem_set_id")
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    problemId: integer("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.problemSetId, table.problemId] }),
  })
);

export const userGroups = sqliteTable("user_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: integer("permissions").notNull(),
  builtIn: integer("built_in", { mode: "boolean" }).notNull().default(false),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash").notNull(),
  groupId: text("group_id")
    .notNull()
    .references(() => userGroups.id, { onDelete: "restrict" }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const userRecords = sqliteTable(
  "user_records",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recordId: text("record_id").notNull(),
    recordData: text("record_data", { mode: "json" })
      .$type<Record<string, unknown> | null>()
      .default(null),
    syncSeq: integer("sync_seq"),
    deletedAt: integer("deleted_at"),
    updatedAt: integer("updated_at"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.recordId] }),
  })
);

export const notices = sqliteTable("notices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  authorName: text("author_name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
