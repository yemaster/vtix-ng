import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  categories,
  db,
  dbDialect,
  problemSetCategories,
  problemSetProblems,
  problemSets,
  problems,
} from "../db";

type ListJson = {
  categories: string[];
  recommended: string[];
  problems: Record<
    string,
    {
      title: string;
      time: number;
      categories: string[];
      new: boolean;
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
  number: number;
  score: number;
};

export type ProblemSetItem = {
  id: string;
  code: string;
  title: string;
  year: number;
  categories: string[];
  isNew: boolean;
  recommendedRank: number | null;
  questionCount: number;
  creatorId: string;
  creatorName: string;
  isPublic: boolean;
  inviteCode: string | null;
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

function toSafeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTestConfigList(raw: unknown): TestConfigItem[] {
  if (!Array.isArray(raw)) return [];
  const order: number[] = [];
  const map = new Map<number, TestConfigItem>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = Math.floor(toSafeNumber((item as any).type, -1));
    if (!Number.isFinite(type) || type < 0 || type > 4) continue;
    const number = Math.max(0, Math.floor(toSafeNumber((item as any).number, 0)));
    if (number <= 0) continue;
    const score = Math.max(0, toSafeNumber((item as any).score, 0));
    if (!map.has(type)) {
      order.push(type);
      map.set(type, { type, number, score });
    } else {
      const existing = map.get(type)!;
      existing.number += number;
      existing.score = score;
    }
  }
  return order.map((type) => map.get(type)!).filter(Boolean);
}

function buildDefaultTestConfig(
  counts: number[],
  scores: number[] = DEFAULT_TEST_SCORES
) {
  const result: TestConfigItem[] = [];
  for (const type of [1, 2, 3, 4, 0]) {
    const count = Math.max(0, Math.floor(toSafeNumber(counts[type], 0)));
    if (count <= 0) continue;
    const score = Math.max(0, toSafeNumber(scores[type], 0));
    result.push({ type, number: count, score });
  }
  return result;
}

function normalizeLegacyTestConfig(
  counts: number[],
  scores: number[] = DEFAULT_TEST_SCORES
) {
  const result: TestConfigItem[] = [];
  const maxLen = Math.max(counts.length, scores.length);
  for (let type = 0; type < maxLen; type += 1) {
    const count = Math.max(0, Math.floor(toSafeNumber(counts[type], 0)));
    if (count <= 0) continue;
    const score = Math.max(0, toSafeNumber(scores[type], 0));
    result.push({ type, number: count, score });
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

      const setId = await insertProblemSetRow(tx, {
        code,
        title: meta.title,
        year: meta.time,
        isNew: meta.new,
        recommendedRank: recommendedRank > 0 ? recommendedRank : null,
        testMeta,
        scoreMeta: null,
        questionCount,
        creatorId: "system",
        creatorName: "系统",
        isPublic: true,
        inviteCode: null,
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
    isNew: boolean;
    recommendedRank: number | null;
    testMeta: TestConfigItem[] | null;
    scoreMeta: number[] | null;
    questionCount: number;
    creatorId: string;
    creatorName: string;
    isPublic: boolean;
    inviteCode: string | null;
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
  }
  const rows = (await db
    .select()
    .from(problemSets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)) as Array<{
    id: number;
    code: string;
    title: string;
    year: number;
    isNew: boolean;
    recommendedRank: number | null;
    testMeta: TestConfigItem[] | number[] | number | null;
    scoreMeta: number[] | null;
    questionCount: number;
    creatorId: string;
    creatorName: string;
    isPublic: boolean;
    inviteCode: string | null;
  }>;

  const categoriesMap = await loadCategoriesMap(rows.map((row) => row.id));

  const items: ProblemSetItem[] = rows.map((row) => ({
    id: row.code,
    code: row.code,
    title: row.title,
    year: row.year,
    categories: categoriesMap.get(row.id) ?? [],
    isNew: Boolean(row.isNew),
    recommendedRank: row.recommendedRank ?? null,
    questionCount: Number.isFinite(row.questionCount) ? row.questionCount : 0,
    creatorId: row.creatorId,
    creatorName: row.creatorName,
    isPublic: Boolean(row.isPublic),
    inviteCode: row.inviteCode ?? null,
  }));

  return items.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
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
    isNew: boolean;
    recommendedRank: number | null;
    testMeta: TestConfigItem[] | number[] | number | null;
    scoreMeta: number[] | null;
    questionCount: number;
    creatorId: string;
    creatorName: string;
    isPublic: boolean;
    inviteCode: string | null;
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
    isNew: Boolean(row.isNew),
    recommendedRank: row.recommendedRank ?? null,
    questionCount: Number.isFinite(row.questionCount) ? row.questionCount : 0,
    creatorId: options?.creatorId ?? row.creatorId,
    creatorName: options?.creatorName ?? row.creatorName,
    isPublic: Boolean(row.isPublic),
    inviteCode: row.inviteCode ?? null,
    test: testMeta.length ? testMeta : [],
    problems: problemRows.map((problem) => toProblemPayload(problem)),
  } as ProblemSetItem;
}

export async function createProblemSet(item: ProblemSetItem) {
  await ensureSeeded();
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
      isNew: Boolean(item.isNew),
      recommendedRank: item.recommendedRank ?? null,
      testMeta: testMeta.length ? testMeta : null,
      scoreMeta: null,
      questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0,
      creatorId: item.creatorId,
      creatorName: item.creatorName,
      isPublic: Boolean(item.isPublic),
      inviteCode: item.inviteCode ?? null,
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
        isNew: Boolean(item.isNew),
        recommendedRank: item.recommendedRank ?? null,
        testMeta: testMeta.length ? testMeta : null,
        scoreMeta: null,
        questionCount: Number.isFinite(item.questionCount) ? item.questionCount : 0,
        creatorId: item.creatorId,
        creatorName: item.creatorName,
        isPublic: Boolean(item.isPublic),
        inviteCode: item.inviteCode ?? null,
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
    } as ProblemSetItem;
  });
}

export async function updateProblemSetRecommended(
  code: string,
  recommendedRank: number | null
) {
  await ensureSeeded();
  const rows = (await db
    .select({ id: problemSets.id })
    .from(problemSets)
    .where(eq(problemSets.code, code))
    .limit(1)) as Array<{ id: number }>;
  if (!rows[0]) return false;
  await db
    .update(problemSets)
    .set({ recommendedRank })
    .where(eq(problemSets.id, rows[0].id));
  return true;
}

export async function updateProblemSetFlags(
  code: string,
  flags: { isNew?: boolean; isPublic?: boolean }
) {
  await ensureSeeded();
  const rows = (await db
    .select({ id: problemSets.id })
    .from(problemSets)
    .where(eq(problemSets.code, code))
    .limit(1)) as Array<{ id: number }>;
  if (!rows[0]) return false;
  const updates: Record<string, unknown> = {};
  if (typeof flags.isNew === "boolean") {
    updates.isNew = flags.isNew;
  }
  if (typeof flags.isPublic === "boolean") {
    updates.isPublic = flags.isPublic;
    if (flags.isPublic) {
      updates.inviteCode = null;
    }
  }
  if (Object.keys(updates).length === 0) {
    return true;
  }
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
