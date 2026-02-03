import { randomBytes } from "crypto";
import { Elysia } from "elysia";
import {
  createProblemSet,
  loadProblemSetDetail,
  updateProblemSet,
  type TestConfigItem,
} from "../../services/problemSets";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";
import { normalizeProblems } from "./normalize";

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
  const list: TestConfigItem[] = [];
  for (const type of [1, 2, 3, 4, 0]) {
    const number = Math.max(0, Math.floor(toSafeNumber(counts[type], 0)));
    if (number <= 0) continue;
    const score = Math.max(0, toSafeNumber(scores[type], 0));
    list.push({ type, number, score });
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
    const list = rawTest.map((value, type) => ({
      type,
      number: Math.max(0, Math.floor(toSafeNumber(value, 0))),
      score: Math.max(0, toSafeNumber(scores[type], 0)),
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
        isPublic?: boolean;
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
      const isPublic = canManageAll ? Boolean(payload.isPublic) : false;
      const inviteCode = isPublic
        ? null
        : payload.inviteCode
          ? String(payload.inviteCode).trim() || null
          : null;
      const testMeta = normalizeTestConfig(payload.test, payload.score, counts);
      // Use a random long string for the code to avoid leaking title info.
      const code = randomBytes(16).toString("hex");
      const item = await createProblemSet({
        id: code,
        code,
        title,
        year,
        categories,
        isNew: true,
        recommendedRank: null,
        questionCount: problems.length,
        creatorId: user.id,
        creatorName: user.name,
        isPublic,
        inviteCode,
        test: testMeta,
        problems,
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
        isPublic?: boolean;
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
      const nextIsPublic = canManageAll
        ? Boolean(payload.isPublic ?? existing.isPublic)
        : Boolean(existing.isPublic);
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
        inviteCode,
        test: testMeta,
        problems,
      });
      return updated;
    });
