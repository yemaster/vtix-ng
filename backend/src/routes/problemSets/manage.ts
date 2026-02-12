import { randomBytes } from "crypto";
import { Elysia } from "elysia";
import { and, eq, sql } from "drizzle-orm";
import {
  createProblemSet,
  loadProblemSetDetail,
  updateProblemSet,
  type TestConfigItem,
} from "../../services/problemSets";
import { db, problemSets, userGroups } from "../../db";
import { PERMISSIONS, USER_GROUPS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";
import { normalizeProblems } from "./normalize";

const DEFAULT_TEST_SCORES = [0, 1, 2, 1, 1];
const MAX_QUESTION_COUNT = 4096;
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
  const list: TestConfigItem[] = [];
  for (const item of EXAM_TYPE_MASK_ITEMS) {
    const number = Math.max(
      0,
      Math.floor(toSafeNumber(counts[item.problemType], 0))
    );
    if (number <= 0) continue;
    const score = Math.max(0, toSafeNumber(scores[item.problemType], 0));
    list.push(toTestConfigItem(item.mask, number, score));
  }
  return list;
}

function normalizeTestConfig(
  rawTest: unknown,
  rawScore: unknown,
  fallbackCounts: number[]
) {
  if (Array.isArray(rawTest) && rawTest.length === 0) {
    const scores = Array.isArray(rawScore)
      ? rawScore.map((value) => toSafeNumber(value, 0))
      : DEFAULT_TEST_SCORES;
    return buildDefaultTestConfig(fallbackCounts, scores);
  }
  const normalized = normalizeTestConfigList(rawTest);
  if (normalized.length > 0) return normalized;
  if (Array.isArray(rawTest) && rawTest.every((item) => typeof item === "number")) {
    const scores = Array.isArray(rawScore)
      ? rawScore.map((value) => toSafeNumber(value, 0))
      : DEFAULT_TEST_SCORES;
    const list = EXAM_TYPE_MASK_ITEMS.map((item) => ({
      type: item.mask,
      typeMask: item.mask,
      number: Math.max(
        0,
        Math.floor(toSafeNumber(rawTest[item.problemType], 0))
      ),
      score: Math.max(0, toSafeNumber(scores[item.problemType], 0)),
    }));
    return normalizeTestConfigList(list);
  }
  const scores = Array.isArray(rawScore)
    ? rawScore.map((value) => toSafeNumber(value, 0))
    : DEFAULT_TEST_SCORES;
  return buildDefaultTestConfig(fallbackCounts, scores);
}

export const registerProblemSetManageRoutes = (app: Elysia) =>
  app
    .post("/api/problem-sets", async ({ request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const payload = (body ?? {}) as {
        title?: string;
        year?: number;
        categories?: string[];
        inviteCode?: string | null;
        problems?: unknown;
        test?: unknown;
        score?: unknown;
      };
      const title = String(payload.title ?? "").trim();
      if (!title) {
        set.status = 400;
        return { error: "Title required" };
      }
      const year = Number(payload.year ?? new Date().getFullYear());
      const categories = Array.isArray(payload.categories)
        ? payload.categories.map((c) => String(c)).filter(Boolean)
        : [];
      const canManageAll = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_ALL
      );
      const canManageOwn = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_OWN
      );
      if (!canManageAll && !canManageOwn) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const { list: problems, counts } = normalizeProblems(payload.problems);
      if (!problems.length) {
        set.status = 400;
        return { error: "至少需要一题。" };
      }
      if (problems.length > MAX_QUESTION_COUNT) {
        set.status = 400;
        return { error: `题目数量超过上限（${MAX_QUESTION_COUNT}）。` };
      }
      const isPublic = false;
      const isPending = true;
      const inviteCode = isPublic
        ? null
        : payload.inviteCode
          ? String(payload.inviteCode).trim() || null
          : null;
      if (!isPublic) {
        const [group] = await db
          .select({ privateProblemSetLimit: userGroups.privateProblemSetLimit })
          .from(userGroups)
          .where(eq(userGroups.id, user.groupId))
          .limit(1);
        const limitRaw =
          group?.privateProblemSetLimit ?? USER_GROUPS.user.privateProblemSetLimit;
        const privateLimit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : -1;
        if (privateLimit !== -1) {
          const [countRow] = await db
            .select({ count: sql<number>`count(*)` })
            .from(problemSets)
            .where(and(eq(problemSets.creatorId, user.id), eq(problemSets.isPublic, false)));
          const existingCount = Number(countRow?.count ?? 0);
          if (existingCount >= privateLimit) {
            set.status = 400;
            return { error: "非公开题库数量已达到上限。" };
          }
        }
      }
      const testMeta = normalizeTestConfig(payload.test, payload.score, counts);
      // Use a random long string for the code to avoid leaking title info.
      const code = randomBytes(16).toString("hex");
      const item = await createProblemSet({
        id: code,
        code,
        title,
        year,
        categories,
        isPending,
        recommendedRank: null,
        questionCount: problems.length,
        creatorId: user.id,
        creatorName: user.name,
        isPublic,
        inviteCode,
        test: testMeta,
        problems,
        viewCount: 0,
        dislikeCount: 0,
        likeCount: 0
      });
      return item;
    })
    .put("/api/problem-sets/:code", async ({ params, request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const existing = await loadProblemSetDetail(params.code);
      if (!existing) {
        set.status = 404;
        return { error: "Problem set not found." };
      }
      const canManageAll = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_ALL
      );
      const canManageOwn = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_OWN
      );
      const isOwner = existing.creatorId === user.id;
      if (!canManageAll && !(canManageOwn && isOwner)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const payload = (body ?? {}) as {
        title?: string;
        year?: number;
        categories?: string[];
        inviteCode?: string | null;
        problems?: unknown;
        test?: unknown;
        score?: unknown;
      };
      const title = String(payload.title ?? existing.title ?? "").trim();
      if (!title) {
        set.status = 400;
        return { error: "Title required" };
      }
      const year = Number(payload.year ?? existing.year ?? new Date().getFullYear());
      const categories = Array.isArray(payload.categories)
        ? payload.categories.map((c) => String(c)).filter(Boolean)
        : existing.categories ?? [];
      const { list: problems, counts } = normalizeProblems(
        payload.problems ?? existing.problems
      );
      if (!problems.length) {
        set.status = 400;
        return { error: "至少需要一题。" };
      }
      if (problems.length > MAX_QUESTION_COUNT) {
        set.status = 400;
        return { error: `题目数量超过上限（${MAX_QUESTION_COUNT}）。` };
      }
      const nextIsPublic = false;
      const nextIsPending = existing.isPublic ? true : Boolean(existing.isPending);
      const inviteCode = nextIsPublic
        ? null
        : canManageAll
          ? payload.inviteCode
            ? String(payload.inviteCode).trim() || null
            : existing.inviteCode ?? null
          : existing.inviteCode ?? null;
      const testMeta = normalizeTestConfig(
        payload.test ?? existing.test ?? [],
        payload.score,
        counts
      );
      const updated = await updateProblemSet({
        ...existing,
        title,
        year,
        categories,
        questionCount: problems.length,
        isPublic: nextIsPublic,
        isPending: nextIsPending,
        inviteCode,
        test: testMeta,
        problems,
      });
      return updated;
    });
