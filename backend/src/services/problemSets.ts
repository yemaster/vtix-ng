import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import {
  categories,
  db,
  dbDialect,
  problemSetCategories,
  problemSetReactions,
  problemSetProblems,
  problemSets,
  problems,
} from "../db";
import { normalizePage, normalizePageSize } from "../utils/pagination";

type ListJson = {
  categories: string[];
  recommended: string[];
  problems: Record<
    string,
    {
      title: string;
      time: number;
      categories: string[];
    }
  >;
};

type ProblemJson = {
  title: string;
  test?: unknown;
  score?: unknown;
  problems: unknown[];
};

export type TestConfigItem = {
  type: number;
  typeMask?: number;
  number: number;
  score: number;
};

export type ProblemSetItem = {
  id: string;
  code: string;
  title: string;
  year: number;
  categories: string[];
  isPending: boolean;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  reaction?: number;
  recommendedRank: number | null;
  questionCount: number;
  creatorId: string;
  creatorName: string;
  isPublic: boolean;
  inviteCode: string | null;
  createdAt?: number;
  updatedAt?: number;
  test?: TestConfigItem[];
  problems?: unknown[];
};

type ProblemInput = {
  type: number;
  content: string;
  choices?: string[] | null;
  answer: number | number[] | string;
  hint?: string;
};

const dataRoot = resolve(process.cwd(), "../old/public/data");
let seeded = false;
const DEFAULT_TEST_SCORES = [0, 1, 2, 1, 1];
const EXAM_TYPE_MASK_ITEMS = [
  { problemType: 1, mask: 1 },
  { problemType: 2, mask: 2 },
  { problemType: 3, mask: 4 },
  { problemType: 4, mask: 8 },
] as const;
const EXAM_TYPE_MASK_ALL = EXAM_TYPE_MASK_ITEMS.reduce(
  (sum, item) => sum | item.mask,
  0
);

function toSafeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function legacyProblemTypeToMask(type: number) {
  return (
    EXAM_TYPE_MASK_ITEMS.find((item) => item.problemType === type)?.mask ?? 0
  );
}

function normalizeExamMask(value: unknown) {
  const parsed = Math.floor(toSafeNumber(value, 0));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed & EXAM_TYPE_MASK_ALL;
}

function toTestConfigItem(mask: number, number: number, score: number): TestConfigItem {
  return {
    type: mask,
    typeMask: mask,
    number,
    score,
  };
}

function resolveMaskFromConfigItem(item: unknown) {
  if (!item || typeof item !== "object") return 0;
  const rawMask = (item as any).typeMask ?? (item as any).mask;
  if (rawMask !== undefined && rawMask !== null && rawMask !== "") {
    return normalizeExamMask(rawMask);
  }
  const rawType = Math.floor(toSafeNumber((item as any).type, -1));
  if (!Number.isFinite(rawType)) return 0;
  if (rawType >= 1 && rawType <= 4) {
    return legacyProblemTypeToMask(rawType);
  }
  return normalizeExamMask(rawType);
}

function normalizeTestConfigList(raw: unknown): TestConfigItem[] {
  if (!Array.isArray(raw)) return [];
  const order: number[] = [];
  const map = new Map<number, TestConfigItem>();
  for (const item of raw) {
    const mask = resolveMaskFromConfigItem(item);
    if (mask <= 0) continue;
    const number = Math.max(0, Math.floor(toSafeNumber((item as any).number, 0)));
    if (number <= 0) continue;
    const score = Math.max(0, toSafeNumber((item as any).score, 0));
    if (!map.has(mask)) {
      order.push(mask);
      map.set(mask, toTestConfigItem(mask, number, score));
    } else {
      const existing = map.get(mask)!;
      existing.number += number;
      existing.score = score;
    }
  }
  return order.map((mask) => map.get(mask)!).filter(Boolean);
}

function buildDefaultTestConfig(
  counts: number[],
  scores: number[] = DEFAULT_TEST_SCORES
) {
  const result: TestConfigItem[] = [];
  for (const item of EXAM_TYPE_MASK_ITEMS) {
    const count = Math.max(
      0,
      Math.floor(toSafeNumber(counts[item.problemType], 0))
    );
    if (count <= 0) continue;
    const score = Math.max(0, toSafeNumber(scores[item.problemType], 0));
    result.push(toTestConfigItem(item.mask, count, score));
  }
  return result;
}

function normalizeLegacyTestConfig(
  counts: number[],
  scores: number[] = DEFAULT_TEST_SCORES
) {
  const result: TestConfigItem[] = [];
  for (const item of EXAM_TYPE_MASK_ITEMS) {
    const count = Math.max(
      0,
      Math.floor(toSafeNumber(counts[item.problemType], 0))
    );
    if (count <= 0) continue;
    const score = Math.max(0, toSafeNumber(scores[item.problemType], 0));
    result.push(toTestConfigItem(item.mask, count, score));
  }
  return result;
}

function normalizeTestMeta(
  rawTest: unknown,
  rawScore: unknown,
  fallbackCounts?: number[]
) {
  if (Array.isArray(rawTest) && rawTest.length === 0 && fallbackCounts) {
    const scores = Array.isArray(rawScore)
      ? rawScore.map((value) => toSafeNumber(value, 0))
      : DEFAULT_TEST_SCORES;
    return buildDefaultTestConfig(fallbackCounts, scores);
  }
  const normalizedList = normalizeTestConfigList(rawTest);
  if (normalizedList.length > 0) return normalizedList;
  if (Array.isArray(rawTest) && rawTest.every((item) => typeof item === "number")) {
    const scores = Array.isArray(rawScore)
      ? rawScore.map((value) => toSafeNumber(value, 0))
      : DEFAULT_TEST_SCORES;
    return normalizeLegacyTestConfig(
      rawTest.map((value) => toSafeNumber(value, 0)),
      scores
    );
  }
  if (fallbackCounts && fallbackCounts.length > 0) {
    const scores = Array.isArray(rawScore)
      ? rawScore.map((value) => toSafeNumber(value, 0))
      : DEFAULT_TEST_SCORES;
    return buildDefaultTestConfig(fallbackCounts, scores);
  }
  return [];
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

async function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  const existing = await db.select({ id: problemSets.id }).from(problemSets).limit(1);
  if (existing.length > 0) return;
  const listPath = join(dataRoot, "list.json");
  let list: ListJson;
  try {
    list = await readJson<ListJson>(listPath);
  } catch {
    return;
  }

  await db.transaction(async (tx) => {
    for (const [code, meta] of Object.entries(list.problems)) {
      const detailPath = join(dataRoot, `${code}.json`);
      let detail: ProblemJson | null = null;
      try {
        detail = await readJson<ProblemJson>(detailPath);
      } catch {
        detail = null;
      }
      const recommendedRank =
        list.recommended.findIndex((item) => item === code) + 1;
      const rawProblems = Array.isArray(detail?.problems)
        ? (detail?.problems as ProblemInput[])
        : [];
      const questionCount = rawProblems.length;
      const counts = countProblemTypes(rawProblems);
      const testMeta = normalizeTestMeta(detail?.test, detail?.score, counts);
      const now = Date.now();

      const setId = await insertProblemSetRow(tx, {
        code,
        title: meta.title,
        year: meta.time,
        isPending: false,
        viewCount: 0,
        likeCount: 0,
        dislikeCount: 0,
        recommendedRank: recommendedRank > 0 ? recommendedRank : null,
        testMeta,
        scoreMeta: null,
        questionCount,
        creatorId: "system",
        creatorName: "系统",
        isPublic: true,
        inviteCode: null,
        createdAt: now,
        updatedAt: now,
      });

      const categoryIds = await ensureCategories(tx, meta.categories ?? []);
      if (categoryIds.length > 0) {
        await tx.insert(problemSetCategories).values(
          categoryIds.map((categoryId) => ({
            problemSetId: setId,
            categoryId,
          }))
        );
      }

      if (rawProblems.length > 0) {
        const problemIds = await insertProblems(tx, rawProblems);
        if (problemIds.length > 0) {
          await tx.insert(problemSetProblems).values(
            problemIds.map((problemId, index) => ({
              problemSetId: setId,
              problemId,
              orderIndex: index,
            }))
          );
        }
      }
    }
  });
}

function normalizeProblemInput(raw: ProblemInput): ProblemInput | null {
  if (!raw) return null;
  const type = Number(raw.type);
  if (!Number.isFinite(type)) return null;
  const content = String(raw.content ?? "").trim();
  if (!content) return null;
  const hint =
    raw.hint !== undefined && raw.hint !== null ? String(raw.hint).trim() : undefined;
  if (type === 3) {
    const answer = String(raw.answer ?? "").trim();
    if (!answer) return null;
    return { type, content, answer, hint };
  }
  const choices = Array.isArray(raw.choices)
    ? raw.choices.map((item) => String(item))
    : null;
  const answer =
    Array.isArray(raw.answer) || typeof raw.answer === "number" || typeof raw.answer === "string"
      ? raw.answer
      : "";
  return {
    type,
    content,
    choices,
    answer,
    hint,
  };
}

function countProblemTypes(list: ProblemInput[]) {
  const counts = [0, 0, 0, 0, 0];
  for (const item of list) {
    const type = Number(item?.type);
    if (!Number.isFinite(type) || type < 0 || type > 4) continue;
    counts[type] += 1;
  }
  return counts;
}

async function ensureCategories(
  tx: typeof db,
  names: string[]
): Promise<number[]> {
  const normalized = Array.isArray(names)
    ? names.map((name) => String(name).trim()).filter(Boolean)
    : [];
  if (normalized.length === 0) return [];
  const unique = Array.from(new Set(normalized));

  const existingRows = await tx
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(inArray(categories.name, unique));
  const existingMap = new Map(existingRows.map((row) => [row.name, row.id]));
  const missing = unique.filter((name) => !existingMap.has(name));
  if (missing.length > 0) {
    await tx.insert(categories).values(
      missing.map((name) => ({
        name,
      }))
    );
  }
  const finalRows = await tx
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(inArray(categories.name, unique));
  return finalRows.map((row) => row.id);
}

function extractInsertedId(result: unknown): number | null {
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0] as any;
    if (typeof first === "number") return first;
    if (first && typeof first.id === "number") return first.id;
    if (first && typeof first.id === "string" && Number.isFinite(Number(first.id))) {
      return Number(first.id);
    }
  }
  if (typeof result === "number") return result;
  if (result && typeof (result as any).id === "number") return (result as any).id;
  return null;
}

async function insertProblemSetRow(
  tx: typeof db,
  row: {
    code: string;
    title: string;
    year: number;
    isPending: boolean;
    viewCount: number;
    likeCount: number;
    dislikeCount: number;
    recommendedRank: number | null;
    testMeta: TestConfigItem[] | null;
    scoreMeta: number[] | null;
    questionCount: number;
    creatorId: string;
    creatorName: string;
    isPublic: boolean;
    inviteCode: string | null;
    createdAt: number;
    updatedAt: number;
  }
): Promise<number> {
  if (dbDialect === "mysql") {
    const result = await (tx.insert(problemSets).values(row) as any).$returningId();
    const id = extractInsertedId(result);
    if (!id) {
      throw new Error("Failed to insert problem set.");
    }
    return id;
  }
  const result = await tx
    .insert(problemSets)
    .values(row)
    .returning({ id: problemSets.id });
  const id = extractInsertedId(result);
  if (!id) {
    throw new Error("Failed to insert problem set.");
  }
  return id;
}

async function insertProblemRow(
  tx: typeof db,
  row: {
    content: string;
    type: number;
    choices: string[] | null;
    answer: number | number[] | string;
    hint: string | null;
  }
): Promise<number> {
  if (dbDialect === "mysql") {
    const result = await (tx.insert(problems).values(row) as any).$returningId();
    const id = extractInsertedId(result);
    if (!id) {
      throw new Error("Failed to insert problem.");
    }
    return id;
  }
  const result = await tx
    .insert(problems)
    .values(row)
    .returning({ id: problems.id });
  const id = extractInsertedId(result);
  if (!id) {
    throw new Error("Failed to insert problem.");
  }
  return id;
}

async function insertProblems(tx: typeof db, list: ProblemInput[]) {
  const ids: number[] = [];
  for (const raw of list) {
    const normalized = normalizeProblemInput(raw);
    if (!normalized) continue;
    const hint =
      normalized.hint !== undefined && normalized.hint !== null
        ? normalized.hint.trim()
        : null;
    const choices =
      normalized.type === 3
        ? null
        : Array.isArray(normalized.choices)
          ? normalized.choices.map((item) => String(item))
          : null;
    const id = await insertProblemRow(tx, {
      content: normalized.content,
      type: normalized.type,
      choices,
      answer: normalized.answer,
      hint,
    });
    ids.push(id);
  }
  return ids;
}

async function loadCategoriesMap(setIds: number[]) {
  if (setIds.length === 0) return new Map<number, string[]>();
  const rows = await db
    .select({
      problemSetId: problemSetCategories.problemSetId,
      name: categories.name,
    })
    .from(problemSetCategories)
    .innerJoin(categories, eq(problemSetCategories.categoryId, categories.id))
    .where(inArray(problemSetCategories.problemSetId, setIds));

  const map = new Map<number, string[]>();
  for (const row of rows) {
    const list = map.get(row.problemSetId) ?? [];
    list.push(row.name);
    map.set(row.problemSetId, list);
  }
  return map;
}

function toProblemPayload(row: {
  type: number;
  content: string;
  choices: string[] | null;
  answer: number | number[] | string;
  hint: string | null;
}) {
  if (row.hint) {
    return {
      type: row.type,
      content: row.content,
      choices: row.choices ?? undefined,
      answer: row.answer,
      hint: row.hint,
    };
  }
  return {
    type: row.type,
    content: row.content,
    choices: row.choices ?? undefined,
    answer: row.answer,
  };
}

export async function loadProblemSetList(options?: {
  creatorId?: string;
  onlyPublic?: boolean;
  onlyCreatorId?: string;
}) {
  await ensureSeeded();
  const conditions = [];
  if (options?.onlyCreatorId) {
    conditions.push(eq(problemSets.creatorId, options.onlyCreatorId));
  }
  if (options?.onlyPublic) {
    conditions.push(eq(problemSets.isPublic, true));
    conditions.push(eq(problemSets.isPending, false));
  }
  const rows = (await db
    .select()
    .from(problemSets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)) as Array<{
    id: number;
    code: string;
    title: string;
    year: number;
    isPending: boolean;
    viewCount: number;
    likeCount: number;
    dislikeCount: number;
    recommendedRank: number | null;
    testMeta: TestConfigItem[] | number[] | number | null;
    scoreMeta: number[] | null;
    questionCount: number;
    creatorId: string;
    creatorName: string;
    isPublic: boolean;
    inviteCode: string | null;
    createdAt: number;
    updatedAt: number;
  }>;

  const categoriesMap = await loadCategoriesMap(rows.map((row) => row.id));

  const items: ProblemSetItem[] = rows.map((row) => ({
    id: row.code,
    code: row.code,
    title: row.title,
    year: row.year,
    categories: categoriesMap.get(row.id) ?? [],
    isPending: Boolean(row.isPending),
    viewCount: Number(row.viewCount ?? 0),
    likeCount: Number(row.likeCount ?? 0),
    dislikeCount: Number(row.dislikeCount ?? 0),
    recommendedRank: row.recommendedRank ?? null,
    questionCount: Number.isFinite(row.questionCount) ? row.questionCount : 0,
    creatorId: row.creatorId,
    creatorName: row.creatorName,
    isPublic: Boolean(row.isPublic),
    inviteCode: row.inviteCode ?? null,
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? row.createdAt ?? 0),
  }));

  return items.sort((a, b) => {
    const aRec = a.recommendedRank !== null;
    const bRec = b.recommendedRank !== null;
    if (aRec !== bRec) return aRec ? -1 : 1;
    if (a.recommendedRank !== null && b.recommendedRank !== null) {
      if (a.recommendedRank !== b.recommendedRank) {
        return a.recommendedRank - b.recommendedRank;
      }
    }
    if (a.year !== b.year) return b.year - a.year;
    return a.title.localeCompare(b.title, "zh-Hans-CN");
  });
}

export async function loadPublicProblemSetPage(options?: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
}) {
  await ensureSeeded();
  const page = normalizePage(options?.page);
  const limit = normalizePageSize(options?.pageSize);
  const offset = (page - 1) * limit;

  const keyword = String(options?.keyword ?? "").trim();
  const categoryName = String(options?.category ?? "").trim();
  const conditions = [
    eq(problemSets.isPublic, true),
    eq(problemSets.isPending, false),
  ];
  if (keyword) {
    const likeValue = `%${keyword}%`;
    const matches = [
      like(problemSets.title, likeValue),
      like(problemSets.code, likeValue),
      like(problemSets.creatorName, likeValue),
    ];
    const yearValue = Number(keyword);
    if (Number.isFinite(yearValue)) {
      matches.push(eq(problemSets.year, Math.floor(yearValue)));
    }
    conditions.push(or(...matches));
  }
  if (categoryName) {
    const [categoryRow] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, categoryName))
      .limit(1);
    if (!categoryRow) {
      return { items: [], total: 0 };
    }
    const ids = await db
      .select({ problemSetId: problemSetCategories.problemSetId })
      .from(problemSetCategories)
      .where(eq(problemSetCategories.categoryId, categoryRow.id));
    const idList = ids.map((row) => row.problemSetId);
    if (idList.length === 0) {
      return { items: [], total: 0 };
    }
    conditions.push(inArray(problemSets.id, idList));
  }
  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(problemSets)
    .where(whereClause);
  const total = Number(countRow?.count ?? 0);

  const rows = (await db
    .select({
      id: problemSets.id,
      code: problemSets.code,
      title: problemSets.title,
      year: problemSets.year,
      isPending: problemSets.isPending,
      viewCount: problemSets.viewCount,
      likeCount: problemSets.likeCount,
      dislikeCount: problemSets.dislikeCount,
      recommendedRank: problemSets.recommendedRank,
      questionCount: problemSets.questionCount,
      creatorId: problemSets.creatorId,
      creatorName: problemSets.creatorName,
      isPublic: problemSets.isPublic,
      createdAt: problemSets.createdAt,
      updatedAt: problemSets.updatedAt,
    })
    .from(problemSets)
    .where(whereClause)
    .orderBy(
      asc(sql`(${problemSets.recommendedRank} IS NULL)`),
      asc(problemSets.recommendedRank),
      desc(problemSets.year),
      asc(problemSets.title)
    )
    .limit(limit)
    .offset(offset)) as Array<{
    id: number;
    code: string;
    title: string;
    year: number;
    isPending: boolean;
    viewCount: number;
    likeCount: number;
    dislikeCount: number;
    recommendedRank: number | null;
    questionCount: number;
    creatorId: string;
    creatorName: string;
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
  }>;

  const categoriesMap = await loadCategoriesMap(rows.map((row) => row.id));

  const items: ProblemSetItem[] = rows.map((row) => ({
    id: row.code,
    code: row.code,
    title: row.title,
    year: row.year,
    categories: categoriesMap.get(row.id) ?? [],
    isPending: Boolean(row.isPending),
    viewCount: Number(row.viewCount ?? 0),
    likeCount: Number(row.likeCount ?? 0),
    dislikeCount: Number(row.dislikeCount ?? 0),
    recommendedRank: row.recommendedRank ?? null,
    questionCount: Number.isFinite(row.questionCount) ? row.questionCount : 0,
    creatorId: row.creatorId,
    creatorName: row.creatorName,
    isPublic: Boolean(row.isPublic),
    inviteCode: null,
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? row.createdAt ?? 0),
  }));

  return { items, total };
}

export async function loadPublicProblemSetCategories() {
  await ensureSeeded();
  const rows = (await db
    .selectDistinct({ name: categories.name })
    .from(problemSetCategories)
    .innerJoin(categories, eq(problemSetCategories.categoryId, categories.id))
    .innerJoin(problemSets, eq(problemSetCategories.problemSetId, problemSets.id))
    .where(and(eq(problemSets.isPublic, true), eq(problemSets.isPending, false)))
    .orderBy(asc(categories.name))) as Array<{ name: string }>;
  return rows
    .map((row) => String(row.name ?? "").trim())
    .filter(Boolean);
}

export async function loadProblemSetPlazaPage(options?: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  order?: string;
  userId?: string | number;
}) {
  await ensureSeeded();
  const page = normalizePage(options?.page);
  const limit = normalizePageSize(options?.pageSize);
  const offset = (page - 1) * limit;

  const keyword = String(options?.keyword ?? "").trim();
  const conditions = [
    eq(problemSets.isPublic, false),
    eq(problemSets.isPending, false),
  ];
  if (keyword) {
    const likeValue = `%${keyword}%`;
    const matches = [
      like(problemSets.title, likeValue),
      like(problemSets.code, likeValue),
      like(problemSets.creatorName, likeValue),
    ];
    const yearValue = Number(keyword);
    if (Number.isFinite(yearValue)) {
      matches.push(eq(problemSets.year, Math.floor(yearValue)));
    }
    conditions.push(or(...matches));
  }
  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(problemSets)
    .where(whereClause);
  const total = Number(countRow?.count ?? 0);

  const order = String(options?.order ?? "").trim().toLowerCase();
  const orderBy =
    order === "hot"
      ? [
          desc(problemSets.viewCount),
          desc(problemSets.updatedAt),
          desc(problemSets.createdAt),
        ]
      : order === "love"
        ? [
            desc(
              sql`((${problemSets.likeCount} + 1.0) / (${problemSets.dislikeCount} + 1.0))`
            ),
            desc(problemSets.likeCount),
            desc(problemSets.updatedAt),
          ]
        : [desc(problemSets.updatedAt), desc(problemSets.createdAt), asc(problemSets.title)];

  const rows = (await db
    .select({
      id: problemSets.id,
      code: problemSets.code,
      title: problemSets.title,
      year: problemSets.year,
      isPending: problemSets.isPending,
      viewCount: problemSets.viewCount,
      likeCount: problemSets.likeCount,
      dislikeCount: problemSets.dislikeCount,
      recommendedRank: problemSets.recommendedRank,
      questionCount: problemSets.questionCount,
      creatorId: problemSets.creatorId,
      creatorName: problemSets.creatorName,
      isPublic: problemSets.isPublic,
      createdAt: problemSets.createdAt,
      updatedAt: problemSets.updatedAt,
    })
    .from(problemSets)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)) as Array<{
    id: number;
    code: string;
    title: string;
    year: number;
    isPending: boolean;
    viewCount: number;
    likeCount: number;
    dislikeCount: number;
    recommendedRank: number | null;
    questionCount: number;
    creatorId: string;
    creatorName: string;
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
  }>;

  const categoriesMap = await loadCategoriesMap(rows.map((row) => row.id));
  const userId = Number(options?.userId ?? NaN);
  let reactionMap: Map<number, number> = new Map();
  if (Number.isFinite(userId) && rows.length > 0) {
    const reactionRows = await db
      .select({
        problemSetId: problemSetReactions.problemSetId,
        value: problemSetReactions.value,
      })
      .from(problemSetReactions)
      .where(
        and(
          eq(problemSetReactions.userId, userId),
          inArray(
            problemSetReactions.problemSetId,
            rows.map((row) => row.id)
          )
        )
      );
    reactionMap = new Map(
      reactionRows.map((row) => [row.problemSetId, Number(row.value ?? 0)])
    );
  }

  const items: ProblemSetItem[] = rows.map((row) => ({
    id: row.code,
    code: row.code,
    title: row.title,
    year: row.year,
    categories: categoriesMap.get(row.id) ?? [],
    isPending: Boolean(row.isPending),
    viewCount: Number(row.viewCount ?? 0),
    likeCount: Number(row.likeCount ?? 0),
    dislikeCount: Number(row.dislikeCount ?? 0),
    reaction: reactionMap.get(row.id) ?? 0,
    recommendedRank: row.recommendedRank ?? null,
    questionCount: Number.isFinite(row.questionCount) ? row.questionCount : 0,
    creatorId: row.creatorId,
    creatorName: row.creatorName,
    isPublic: Boolean(row.isPublic),
    inviteCode: null,
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? row.createdAt ?? 0),
  }));

  return { items, total };
}

export async function loadAdminProblemSetPage(options?: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
  creatorId?: string;
  onlyCreatorId?: string;
}) {
  await ensureSeeded();
  const page = normalizePage(options?.page);
  const limit = normalizePageSize(options?.pageSize);
  const offset = (page - 1) * limit;

  const keyword = String(options?.keyword ?? "").trim();
  const categoryName = String(options?.category ?? "").trim();
  const creatorId = String(options?.creatorId ?? "").trim();

  const conditions = [];
  if (options?.onlyCreatorId) {
    conditions.push(eq(problemSets.creatorId, options.onlyCreatorId));
  }
  if (creatorId) {
    conditions.push(eq(problemSets.creatorId, creatorId));
  }
  if (keyword) {
    const likeValue = `%${keyword}%`;
    const matches = [
      like(problemSets.title, likeValue),
      like(problemSets.code, likeValue),
      like(problemSets.creatorName, likeValue),
    ];
    const yearValue = Number(keyword);
    if (Number.isFinite(yearValue)) {
      matches.push(eq(problemSets.year, Math.floor(yearValue)));
    }
    conditions.push(or(...matches));
  }
  if (categoryName) {
    const [categoryRow] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, categoryName))
      .limit(1);
    if (!categoryRow) {
      return { items: [], total: 0 };
    }
    const ids = await db
      .select({ problemSetId: problemSetCategories.problemSetId })
      .from(problemSetCategories)
      .where(eq(problemSetCategories.categoryId, categoryRow.id));
    const idList = ids.map((row) => row.problemSetId);
    if (idList.length === 0) {
      return { items: [], total: 0 };
    }
    conditions.push(inArray(problemSets.id, idList));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(problemSets)
    .where(whereClause);
  const total = Number(countRow?.count ?? 0);

  const rows = (await db
    .select({
      id: problemSets.id,
      code: problemSets.code,
      title: problemSets.title,
      year: problemSets.year,
      isPending: problemSets.isPending,
      viewCount: problemSets.viewCount,
      likeCount: problemSets.likeCount,
      dislikeCount: problemSets.dislikeCount,
      recommendedRank: problemSets.recommendedRank,
      questionCount: problemSets.questionCount,
      creatorId: problemSets.creatorId,
      creatorName: problemSets.creatorName,
      isPublic: problemSets.isPublic,
      createdAt: problemSets.createdAt,
      updatedAt: problemSets.updatedAt,
    })
    .from(problemSets)
    .where(whereClause)
    .orderBy(desc(problemSets.updatedAt), desc(problemSets.createdAt))
    .limit(limit)
    .offset(offset)) as Array<{
    id: number;
    code: string;
    title: string;
    year: number;
    isPending: boolean;
    viewCount: number;
    likeCount: number;
    dislikeCount: number;
    recommendedRank: number | null;
    questionCount: number;
    creatorId: string;
    creatorName: string;
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
  }>;

  const categoriesMap = await loadCategoriesMap(rows.map((row) => row.id));

  const items: ProblemSetItem[] = rows.map((row) => ({
    id: row.code,
    code: row.code,
    title: row.title,
    year: row.year,
    categories: categoriesMap.get(row.id) ?? [],
    isPending: Boolean(row.isPending),
    viewCount: Number(row.viewCount ?? 0),
    likeCount: Number(row.likeCount ?? 0),
    dislikeCount: Number(row.dislikeCount ?? 0),
    recommendedRank: row.recommendedRank ?? null,
    questionCount: Number.isFinite(row.questionCount) ? row.questionCount : 0,
    creatorId: row.creatorId,
    creatorName: row.creatorName,
    isPublic: Boolean(row.isPublic),
    inviteCode: null,
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? row.createdAt ?? 0),
  }));

  return { items, total };
}

export async function loadPendingProblemSetPage(options?: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}) {
  await ensureSeeded();
  const page = normalizePage(options?.page);
  const limit = normalizePageSize(options?.pageSize);
  const offset = (page - 1) * limit;

  const keyword = String(options?.keyword ?? "").trim();
  const conditions = [eq(problemSets.isPending, true)];
  if (keyword) {
    const likeValue = `%${keyword}%`;
    const matches = [
      like(problemSets.title, likeValue),
      like(problemSets.code, likeValue),
      like(problemSets.creatorName, likeValue),
    ];
    const yearValue = Number(keyword);
    if (Number.isFinite(yearValue)) {
      matches.push(eq(problemSets.year, Math.floor(yearValue)));
    }
    conditions.push(or(...matches));
  }
  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(problemSets)
    .where(whereClause);
  const total = Number(countRow?.count ?? 0);

  const rows = (await db
    .select({
      id: problemSets.id,
      code: problemSets.code,
      title: problemSets.title,
      year: problemSets.year,
      isPending: problemSets.isPending,
      viewCount: problemSets.viewCount,
      likeCount: problemSets.likeCount,
      dislikeCount: problemSets.dislikeCount,
      recommendedRank: problemSets.recommendedRank,
      questionCount: problemSets.questionCount,
      creatorId: problemSets.creatorId,
      creatorName: problemSets.creatorName,
      isPublic: problemSets.isPublic,
      createdAt: problemSets.createdAt,
      updatedAt: problemSets.updatedAt,
    })
    .from(problemSets)
    .where(whereClause)
    .orderBy(desc(problemSets.updatedAt), desc(problemSets.createdAt))
    .limit(limit)
    .offset(offset)) as Array<{
    id: number;
    code: string;
    title: string;
    year: number;
    isPending: boolean;
    viewCount: number;
    likeCount: number;
    dislikeCount: number;
    recommendedRank: number | null;
    questionCount: number;
    creatorId: string;
    creatorName: string;
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
  }>;

  const categoriesMap = await loadCategoriesMap(rows.map((row) => row.id));

  const items: ProblemSetItem[] = rows.map((row) => ({
    id: row.code,
    code: row.code,
    title: row.title,
    year: row.year,
    categories: categoriesMap.get(row.id) ?? [],
    isPending: Boolean(row.isPending),
    viewCount: Number(row.viewCount ?? 0),
    likeCount: Number(row.likeCount ?? 0),
    dislikeCount: Number(row.dislikeCount ?? 0),
    recommendedRank: row.recommendedRank ?? null,
    questionCount: Number.isFinite(row.questionCount) ? row.questionCount : 0,
    creatorId: row.creatorId,
    creatorName: row.creatorName,
    isPublic: Boolean(row.isPublic),
    inviteCode: null,
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? row.createdAt ?? 0),
  }));

  return { items, total };
}

export async function loadProblemSetDetail(
  code: string,
  options?: {
    creatorId?: string;
    creatorName?: string;
  }
) {
  await ensureSeeded();
  const rows = (await db
    .select()
    .from(problemSets)
    .where(eq(problemSets.code, code))
    .limit(1)) as Array<{
    id: number;
    code: string;
    title: string;
    year: number;
    isPending: boolean;
    viewCount: number;
    likeCount: number;
    dislikeCount: number;
    recommendedRank: number | null;
    testMeta: TestConfigItem[] | number[] | number | null;
    scoreMeta: number[] | null;
    questionCount: number;
    creatorId: string;
    creatorName: string;
    isPublic: boolean;
    inviteCode: string | null;
    createdAt: number;
    updatedAt: number;
  }>;
  const row = rows[0];
  if (!row) return null;

  const categoryMap = await loadCategoriesMap([row.id]);
  const problemRows = (await db
    .select({
      type: problems.type,
      content: problems.content,
      choices: problems.choices,
      answer: problems.answer,
      hint: problems.hint,
      orderIndex: problemSetProblems.orderIndex,
    })
    .from(problemSetProblems)
    .innerJoin(problems, eq(problemSetProblems.problemId, problems.id))
    .where(eq(problemSetProblems.problemSetId, row.id))
    .orderBy(asc(problemSetProblems.orderIndex))) as Array<{
    type: number;
    content: string;
    choices: string[] | null;
    answer: number | number[] | string;
    hint: string | null;
    orderIndex: number;
  }>;

  const counts = [0, 0, 0, 0, 0];
  for (const problem of problemRows) {
    if (problem.type >= 0 && problem.type <= 4) {
      counts[problem.type] += 1;
    }
  }
  const testMeta = normalizeTestMeta(row.testMeta, row.scoreMeta, counts);

  return {
    id: row.code,
    code: row.code,
    title: row.title,
    year: row.year,
    categories: categoryMap.get(row.id) ?? [],
    isPending: Boolean(row.isPending),
    viewCount: Number(row.viewCount ?? 0),
    likeCount: Number(row.likeCount ?? 0),
    dislikeCount: Number(row.dislikeCount ?? 0),
    recommendedRank: row.recommendedRank ?? null,
    questionCount: Number.isFinite(row.questionCount) ? row.questionCount : 0,
    creatorId: options?.creatorId ?? row.creatorId,
    creatorName: options?.creatorName ?? row.creatorName,
    isPublic: Boolean(row.isPublic),
    inviteCode: row.inviteCode ?? null,
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? row.createdAt ?? 0),
    test: testMeta.length ? testMeta : [],
    problems: problemRows.map((problem) => toProblemPayload(problem)),
  } as ProblemSetItem;
}

export async function loadProblemSetMeta(code: string) {
  await ensureSeeded();
  const rows = (await db
    .select({
      code: problemSets.code,
      creatorId: problemSets.creatorId,
      isPublic: problemSets.isPublic,
      inviteCode: problemSets.inviteCode,
      createdAt: problemSets.createdAt,
      updatedAt: problemSets.updatedAt,
    })
    .from(problemSets)
    .where(eq(problemSets.code, code))
    .limit(1)) as Array<{
    code: string;
    creatorId: string;
    isPublic: boolean;
    inviteCode: string | null;
    createdAt: number;
    updatedAt: number;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    code: row.code,
    creatorId: row.creatorId,
    isPublic: Boolean(row.isPublic),
    inviteCode: row.inviteCode ?? null,
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? row.createdAt ?? 0),
  };
}

export async function incrementProblemSetViewCount(code: string) {
  await ensureSeeded();
  await db
    .update(problemSets)
    .set({
      viewCount: sql`${problemSets.viewCount} + 1`,
    })
    .where(eq(problemSets.code, code));
}

export async function setProblemSetReaction(
  code: string,
  userId: number,
  value: number
) {
  await ensureSeeded();
  const normalized = value === -1 ? -1 : 1;
  const now = Date.now();
  return db.transaction(async (tx) => {
    const [setRow] = await tx
      .select({ id: problemSets.id })
      .from(problemSets)
      .where(eq(problemSets.code, code))
      .limit(1);
    if (!setRow) return null;
    const setId = setRow.id;
    const [existing] = await tx
      .select({ value: problemSetReactions.value })
      .from(problemSetReactions)
      .where(
        and(
          eq(problemSetReactions.problemSetId, setId),
          eq(problemSetReactions.userId, userId)
        )
      )
      .limit(1);

    let deltaLike = 0;
    let deltaDislike = 0;
    let reaction = normalized;

    if (!existing) {
      await tx.insert(problemSetReactions).values({
        problemSetId: setId,
        userId,
        value: normalized,
        createdAt: now,
        updatedAt: now,
      });
      if (normalized === 1) {
        deltaLike += 1;
      } else {
        deltaDislike += 1;
      }
    } else if (Number(existing.value) === normalized) {
      await tx
        .delete(problemSetReactions)
        .where(
          and(
            eq(problemSetReactions.problemSetId, setId),
            eq(problemSetReactions.userId, userId)
          )
        );
      reaction = 0;
      if (normalized === 1) {
        deltaLike -= 1;
      } else {
        deltaDislike -= 1;
      }
    } else {
      await tx
        .update(problemSetReactions)
        .set({ value: normalized, updatedAt: now })
        .where(
          and(
            eq(problemSetReactions.problemSetId, setId),
            eq(problemSetReactions.userId, userId)
          )
        );
      if (normalized === 1) {
        deltaLike += 1;
        deltaDislike -= 1;
      } else {
        deltaDislike += 1;
        deltaLike -= 1;
      }
    }

    if (deltaLike !== 0 || deltaDislike !== 0) {
      await tx
        .update(problemSets)
        .set({
          likeCount: sql`${problemSets.likeCount} + ${deltaLike}`,
          dislikeCount: sql`${problemSets.dislikeCount} + ${deltaDislike}`,
        })
        .where(eq(problemSets.id, setId));
    }

    const [counts] = await tx
      .select({
        likeCount: problemSets.likeCount,
        dislikeCount: problemSets.dislikeCount,
      })
      .from(problemSets)
      .where(eq(problemSets.id, setId))
      .limit(1);
    return {
      reaction,
      likeCount: Number(counts?.likeCount ?? 0),
      dislikeCount: Number(counts?.dislikeCount ?? 0),
    };
  });
}

export async function createProblemSet(item: ProblemSetItem) {
  await ensureSeeded();
  const createdAtRaw = Number(item.createdAt ?? NaN);
  const createdAt =
    Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : Date.now();
  const updatedAtRaw = Number(item.updatedAt ?? NaN);
  const updatedAt =
    Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? updatedAtRaw : createdAt;
  const isPublic = Boolean(item.isPublic);
  const isPending = isPublic ? false : Boolean(item.isPending);
  return db.transaction(async (tx) => {
    const problemList = Array.isArray(item.problems)
      ? (item.problems as ProblemInput[])
      : [];
    const counts = countProblemTypes(problemList);
    const testMeta = normalizeTestMeta(item.test, null, counts);
    const categoryIds = await ensureCategories(tx, item.categories ?? []);
    const setId = await insertProblemSetRow(tx, {
      code: item.code,
      title: item.title,
      year: item.year,
      isPending,
      viewCount: Number(item.viewCount ?? 0),
      likeCount: Number(item.likeCount ?? 0),
      dislikeCount: Number(item.dislikeCount ?? 0),
      recommendedRank: item.recommendedRank ?? null,
      testMeta: testMeta.length ? testMeta : null,
      scoreMeta: null,
      questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0,
      creatorId: item.creatorId,
      creatorName: item.creatorName,
      isPublic,
      inviteCode: item.inviteCode ?? null,
      createdAt,
      updatedAt,
    });

    if (categoryIds.length > 0) {
      await tx.insert(problemSetCategories).values(
        categoryIds.map((categoryId) => ({
          problemSetId: setId,
          categoryId,
        }))
      );
    }

    const problemIds = await insertProblems(tx, problemList);
    if (problemIds.length > 0) {
      await tx.insert(problemSetProblems).values(
        problemIds.map((problemId, index) => ({
          problemSetId: setId,
          problemId,
          orderIndex: index,
        }))
      );
    }
    await tx
      .update(problemSets)
      .set({ questionCount: problemIds.length })
      .where(eq(problemSets.id, setId));

    return {
      ...item,
      id: item.code,
      categories: item.categories ?? [],
      questionCount: problemIds.length,
      test: testMeta.length ? testMeta : [],
      isPublic,
      isPending,
      viewCount: Number(item.viewCount ?? 0),
      likeCount: Number(item.likeCount ?? 0),
      dislikeCount: Number(item.dislikeCount ?? 0),
      createdAt,
      updatedAt,
    } as ProblemSetItem;
  });
}

async function deleteProblemSetRelations(
  tx: typeof db,
  setId: number
) {
  const problemIdRows = (await tx
    .select({ problemId: problemSetProblems.problemId })
    .from(problemSetProblems)
    .where(eq(problemSetProblems.problemSetId, setId))) as Array<{
    problemId: number;
  }>;
  const problemIds = problemIdRows.map((row) => row.problemId);

  await tx
    .delete(problemSetCategories)
    .where(eq(problemSetCategories.problemSetId, setId));
  await tx
    .delete(problemSetProblems)
    .where(eq(problemSetProblems.problemSetId, setId));

  if (problemIds.length > 0) {
    await tx.delete(problems).where(inArray(problems.id, problemIds));
  }
}

export async function updateProblemSet(item: ProblemSetItem) {
  await ensureSeeded();
  const updatedAt = Date.now();
  const isPublic = Boolean(item.isPublic);
  const isPending = isPublic ? false : Boolean(item.isPending);
  return db.transaction(async (tx) => {
    const problemList = Array.isArray(item.problems)
      ? (item.problems as ProblemInput[])
      : [];
    const counts = countProblemTypes(problemList);
    const testMeta = normalizeTestMeta(item.test, null, counts);
    const rows = (await tx
      .select({ id: problemSets.id })
      .from(problemSets)
      .where(eq(problemSets.code, item.code))
      .limit(1)) as Array<{ id: number }>;
    if (!rows[0]) {
      throw new Error("Problem set not found.");
    }
    const setId = rows[0].id;

    await tx
      .update(problemSets)
      .set({
        title: item.title,
        year: item.year,
        isPending,
        viewCount: Number(item.viewCount ?? 0),
        likeCount: Number(item.likeCount ?? 0),
        dislikeCount: Number(item.dislikeCount ?? 0),
        recommendedRank: item.recommendedRank ?? null,
        testMeta: testMeta.length ? testMeta : null,
        scoreMeta: null,
        questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0,
        creatorId: item.creatorId,
        creatorName: item.creatorName,
        isPublic,
        inviteCode: item.inviteCode ?? null,
        updatedAt,
      })
      .where(eq(problemSets.id, setId));

    await deleteProblemSetRelations(tx, setId);

    const categoryIds = await ensureCategories(tx, item.categories ?? []);
    if (categoryIds.length > 0) {
      await tx.insert(problemSetCategories).values(
        categoryIds.map((categoryId) => ({
          problemSetId: setId,
          categoryId,
        }))
      );
    }

    const problemIds = await insertProblems(tx, problemList);
    if (problemIds.length > 0) {
      await tx.insert(problemSetProblems).values(
        problemIds.map((problemId, index) => ({
          problemSetId: setId,
          problemId,
          orderIndex: index,
        }))
      );
    }
    await tx
      .update(problemSets)
      .set({ questionCount: problemIds.length })
      .where(eq(problemSets.id, setId));

    return {
      ...item,
      id: item.code,
      categories: item.categories ?? [],
      questionCount: problemIds.length,
      test: testMeta.length ? testMeta : [],
      isPublic,
      isPending,
      viewCount: Number(item.viewCount ?? 0),
      likeCount: Number(item.likeCount ?? 0),
      dislikeCount: Number(item.dislikeCount ?? 0),
      updatedAt,
    } as ProblemSetItem;
  });
}

export async function updateProblemSetRecommended(
  code: string,
  recommendedRank: number | null
) {
  await ensureSeeded();
  const updatedAt = Date.now();
  const rows = (await db
    .select({ id: problemSets.id })
    .from(problemSets)
    .where(eq(problemSets.code, code))
    .limit(1)) as Array<{ id: number }>;
  if (!rows[0]) return false;
  await db
    .update(problemSets)
    .set({ recommendedRank, updatedAt })
    .where(eq(problemSets.id, rows[0].id));
  return true;
}

export async function updateProblemSetFlags(
  code: string,
  flags: { isPublic?: boolean; isPending?: boolean }
) {
  await ensureSeeded();
  const updatedAt = Date.now();
  const rows = (await db
    .select({ id: problemSets.id })
    .from(problemSets)
    .where(eq(problemSets.code, code))
    .limit(1)) as Array<{ id: number }>;
  if (!rows[0]) return false;
  const updates: Record<string, unknown> = {};
  if (typeof flags.isPublic === "boolean") {
    updates.isPublic = flags.isPublic;
    if (flags.isPublic) {
      updates.inviteCode = null;
      updates.isPending = false;
    }
  }
  if (typeof flags.isPending === "boolean") {
    updates.isPending = flags.isPending;
    if (flags.isPending) {
      updates.isPublic = false;
    }
  }
  if (Object.keys(updates).length === 0) {
    return true;
  }
  updates.updatedAt = updatedAt;
  await db
    .update(problemSets)
    .set(updates)
    .where(eq(problemSets.id, rows[0].id));
  return true;
}

export async function deleteProblemSet(code: string) {
  await ensureSeeded();
  return db.transaction(async (tx) => {
    const rows = (await tx
      .select({ id: problemSets.id })
      .from(problemSets)
      .where(eq(problemSets.code, code))
      .limit(1)) as Array<{ id: number }>;
    if (!rows[0]) return false;
    const setId = rows[0].id;
    await deleteProblemSetRelations(tx, setId);
    await tx.delete(problemSets).where(eq(problemSets.id, setId));
    return true;
  });
}
