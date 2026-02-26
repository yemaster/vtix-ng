import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

type TestConfigItem = {
  type: number;
  typeMask?: number;
  number: number;
  score: number;
};
type TestMeta = TestConfigItem[] | number[] | number | null;

export const problemSets = sqliteTable("problem_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  year: integer("year").notNull(),
  isPending: integer("is_pending", { mode: "boolean" }).notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  likeCount: integer("like_count").notNull().default(0),
  dislikeCount: integer("dislike_count").notNull().default(0),
  recommendedRank: integer("recommended_rank"),
  creatorId: text("creator_id").notNull(),
  creatorName: text("creator_name").notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  inviteCode: text("invite_code"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
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

export const problemSetReactions = sqliteTable(
  "problem_set_reactions",
  {
    problemSetId: integer("problem_set_id")
      .notNull()
      .references(() => problemSets.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.problemSetId, table.userId] }),
  })
);

export const userGroups = sqliteTable("user_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: integer("permissions").notNull(),
  privateProblemSetLimit: integer("private_problem_set_limit").notNull().default(-1),
  recordCloudLimit: integer("record_cloud_limit").notNull().default(-1),
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

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  senderId: integer("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  receiverId: integer("receiver_id").notNull(),
  receiverName: text("receiver_name").notNull(),
  content: text("content").notNull(),
  type: integer("type").notNull(),
  link: text("link"),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const brawlRecords = sqliteTable("brawl_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  problemSetCode: text("problem_set_code").notNull(),
  problemSetTitle: text("problem_set_title").notNull(),
  player1Id: text("player1_id").notNull(),
  player1Name: text("player1_name").notNull(),
  player2Id: text("player2_id").notNull(),
  player2Name: text("player2_name").notNull(),
  score1: integer("score1").notNull(),
  score2: integer("score2").notNull(),
  winnerId: text("winner_id"),
  winnerName: text("winner_name"),
  createdAt: integer("created_at").notNull(),
});
