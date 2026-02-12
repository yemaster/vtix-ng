import { Elysia } from "elysia";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, dbDialect, userGroups, userRecords } from "../db";
import { getSessionUser } from "../utils/session";
import { USER_GROUPS } from "../utils/permissions";

type PracticeRecord = {
  id: string;
  updatedAt?: number;
  deletedAt?: number;
  [key: string]: unknown;
};

type IndexedPatch<T> = {
  index: number;
  value: T;
};

type PracticeRecordDelta = {
  id: string;
  updatedAt?: number;
  baseUpdatedAt?: number;
  deletedAt?: number;
  testTitle?: string;
  practiceMode?: number;
  setType?: boolean[];
  setShuffle?: boolean;
  progress?: {
    currentProblemId?: number;
    currentAnswer?: unknown[];
    timeSpentSeconds?: number;
    answerPatches?: IndexedPatch<unknown[]>[];
    submittedPatches?: IndexedPatch<boolean>[];
  };
  problemStatePatches?: IndexedPatch<number>[];
  appendErrorProblems?: unknown[];
  resetErrorProblems?: boolean;
};

const DEFAULT_RECORD_LIMIT = -1;
const SQLITE_INSERT_CHUNK_SIZE = 120;
const MYSQL_INSERT_CHUNK_SIZE = 500;

function normalizeLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RECORD_LIMIT;
  const floored = Math.floor(parsed);
  return floored > 0 ? floored : DEFAULT_RECORD_LIMIT;
}

function getUserRecordInsertChunkSize() {
  return dbDialect === "sqlite"
    ? SQLITE_INSERT_CHUNK_SIZE
    : MYSQL_INSERT_CHUNK_SIZE;
}

async function insertUserRecordsInChunks(
  rows: Array<{
    userId: number;
    recordId: string;
    recordData: PracticeRecord;
    deletedAt: number | null;
    updatedAt: number | null;
    syncSeq?: number | null;
  }>
) {
  if (rows.length === 0) return;
  const chunkSize = getUserRecordInsertChunkSize();
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    await db.insert(userRecords).values(chunk);
  }
}

async function resolveRecordLimit(groupId: string) {
  const fallback = USER_GROUPS.user.recordCloudLimit;
  const [group] = await db
    .select({ recordCloudLimit: userGroups.recordCloudLimit })
    .from(userGroups)
    .where(eq(userGroups.id, groupId))
    .limit(1);
  return normalizeLimit(group?.recordCloudLimit ?? fallback);
}

function applyRecordLimit<T extends { updatedAt?: number }>(
  records: T[],
  limit: number
) {
  const sorted = [...records].sort(
    (a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0)
  );
  if (!Number.isFinite(limit) || limit <= 0) {
    return { records: sorted, trimmed: 0 };
  }
  const total = sorted.length;
  const trimmed = Math.max(0, total - limit);
  if (!trimmed) {
    return { records: sorted, trimmed: 0 };
  }
  return { records: sorted.slice(Math.max(0, total - limit)), trimmed };
}

function normalizeRecord(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  if (!id) return null;
  const updatedRaw = record.updatedAt;
  const updatedAt =
    typeof updatedRaw === "number"
      ? updatedRaw
      : typeof updatedRaw === "string"
      ? Number(updatedRaw)
      : undefined;
  const deletedRaw = record.deletedAt;
  const deletedAt =
    typeof deletedRaw === "number"
      ? deletedRaw
      : typeof deletedRaw === "string"
      ? Number(deletedRaw)
      : undefined;
  const safeUpdatedAt =
    typeof updatedAt === "number" && Number.isFinite(updatedAt)
      ? updatedAt
      : undefined;
  const safeDeletedAt =
    typeof deletedAt === "number" && Number.isFinite(deletedAt)
      ? deletedAt
      : undefined;
  const finalUpdatedAt =
    safeUpdatedAt !== undefined
      ? safeUpdatedAt
      : safeDeletedAt !== undefined
      ? safeDeletedAt
      : undefined;
  return {
    ...record,
    id,
    ...(finalUpdatedAt !== undefined ? { updatedAt: finalUpdatedAt } : {}),
    ...(safeDeletedAt !== undefined ? { deletedAt: safeDeletedAt } : {}),
  } as PracticeRecord;
}

function toSafeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function cloneJsonValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function normalizeIndexedPatches<T>(
  input: unknown,
  valueGuard: (value: unknown) => value is T
) {
  if (!Array.isArray(input)) return [] as IndexedPatch<T>[];
  const patches: IndexedPatch<T>[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const indexRaw = toSafeNumber(row.index);
    if (indexRaw === undefined) continue;
    const index = Math.floor(indexRaw);
    if (!Number.isFinite(index) || index < 0) continue;
    if (!valueGuard(row.value)) continue;
    patches.push({ index, value: cloneJsonValue(row.value) });
  }
  return patches;
}

function normalizeRecordDelta(input: unknown, recordId: string) {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id || id !== recordId) return null;

  const progressRaw =
    row.progress && typeof row.progress === "object"
      ? (row.progress as Record<string, unknown>)
      : undefined;
  const progress =
    progressRaw
      ? {
          ...(toSafeNumber(progressRaw.currentProblemId) !== undefined
            ? { currentProblemId: Math.floor(toSafeNumber(progressRaw.currentProblemId) as number) }
            : {}),
          ...(Array.isArray(progressRaw.currentAnswer)
            ? { currentAnswer: cloneJsonValue(progressRaw.currentAnswer) }
            : {}),
          ...(toSafeNumber(progressRaw.timeSpentSeconds) !== undefined
            ? { timeSpentSeconds: Math.max(0, Math.floor(toSafeNumber(progressRaw.timeSpentSeconds) as number)) }
            : {}),
          answerPatches: normalizeIndexedPatches(
            progressRaw.answerPatches,
            (value): value is unknown[] => Array.isArray(value)
          ),
          submittedPatches: normalizeIndexedPatches(
            progressRaw.submittedPatches,
            (value): value is boolean => typeof value === "boolean"
          ),
        }
      : undefined;

  const delta: PracticeRecordDelta = {
    id,
    ...(toSafeNumber(row.updatedAt) !== undefined
      ? { updatedAt: toSafeNumber(row.updatedAt) }
      : {}),
    ...(toSafeNumber(row.baseUpdatedAt) !== undefined
      ? { baseUpdatedAt: toSafeNumber(row.baseUpdatedAt) }
      : {}),
    ...(toSafeNumber(row.deletedAt) !== undefined
      ? { deletedAt: toSafeNumber(row.deletedAt) }
      : {}),
    ...(typeof row.testTitle === "string" ? { testTitle: row.testTitle } : {}),
    ...(toSafeNumber(row.practiceMode) !== undefined
      ? { practiceMode: Math.floor(toSafeNumber(row.practiceMode) as number) }
      : {}),
    ...(Array.isArray(row.setType)
      ? {
          setType: row.setType
            .slice(0, 5)
            .map((value) => Boolean(value)),
        }
      : {}),
    ...(typeof row.setShuffle === "boolean" ? { setShuffle: row.setShuffle } : {}),
    ...(progress ? { progress } : {}),
    problemStatePatches: normalizeIndexedPatches(
      row.problemStatePatches,
      (value): value is number => typeof value === "number" && Number.isFinite(value)
    ).map((patch) => ({ ...patch, value: Math.floor(patch.value) })),
    appendErrorProblems: Array.isArray(row.appendErrorProblems)
      ? cloneJsonValue(row.appendErrorProblems)
      : undefined,
    ...(typeof row.resetErrorProblems === "boolean"
      ? { resetErrorProblems: row.resetErrorProblems }
      : {}),
  };

  return delta;
}

function applyIndexedPatches<T>(base: T[], patches: IndexedPatch<T>[]) {
  if (!patches.length) return base;
  const next = [...base];
  for (const patch of patches) {
    if (!Number.isFinite(patch.index) || patch.index < 0) continue;
    next[patch.index] = cloneJsonValue(patch.value);
  }
  return next;
}

function applyRecordDelta(base: PracticeRecord, delta: PracticeRecordDelta) {
  const next = cloneJsonValue(base) as PracticeRecord;
  const baseProgress =
    next.progress && typeof next.progress === "object"
      ? (next.progress as Record<string, unknown>)
      : {};

  if (typeof delta.testTitle === "string") {
    next.testTitle = delta.testTitle;
  }
  if (typeof delta.practiceMode === "number" && Number.isFinite(delta.practiceMode)) {
    next.practiceMode = delta.practiceMode;
  }
  if (Array.isArray(delta.setType) && delta.setType.length > 0) {
    next.setType = delta.setType.slice(0, 5);
  }
  if (typeof delta.setShuffle === "boolean") {
    next.setShuffle = delta.setShuffle;
  }
  if (typeof delta.deletedAt === "number" && Number.isFinite(delta.deletedAt) && delta.deletedAt > 0) {
    next.deletedAt = delta.deletedAt;
  }

  const progressDelta = delta.progress;
  if (progressDelta) {
    if (typeof progressDelta.currentProblemId === "number" && Number.isFinite(progressDelta.currentProblemId)) {
      baseProgress.currentProblemId = progressDelta.currentProblemId;
    }
    if (Array.isArray(progressDelta.currentAnswer)) {
      baseProgress.currentAnswer = cloneJsonValue(progressDelta.currentAnswer);
    }
    if (typeof progressDelta.timeSpentSeconds === "number" && Number.isFinite(progressDelta.timeSpentSeconds)) {
      baseProgress.timeSpentSeconds = Math.max(0, Math.floor(progressDelta.timeSpentSeconds));
    }
    if (progressDelta.answerPatches && progressDelta.answerPatches.length > 0) {
      const baseAnswerList = Array.isArray(baseProgress.answerList)
        ? (baseProgress.answerList as unknown[][])
        : [];
      baseProgress.answerList = applyIndexedPatches(baseAnswerList, progressDelta.answerPatches);
    }
    if (progressDelta.submittedPatches && progressDelta.submittedPatches.length > 0) {
      const baseSubmitted = Array.isArray(baseProgress.submittedList)
        ? (baseProgress.submittedList as boolean[])
        : [];
      baseProgress.submittedList = applyIndexedPatches(baseSubmitted, progressDelta.submittedPatches);
    }
    next.progress = baseProgress;
  }

  if (delta.problemStatePatches && delta.problemStatePatches.length > 0) {
    const baseProblemState = Array.isArray(next.problemState)
      ? (next.problemState as number[])
      : [];
    next.problemState = applyIndexedPatches(baseProblemState, delta.problemStatePatches);
  }

  if (delta.resetErrorProblems) {
    next.errorProblems = [];
  }
  if (Array.isArray(delta.appendErrorProblems) && delta.appendErrorProblems.length > 0) {
    const baseErrorProblems = Array.isArray(next.errorProblems)
      ? (next.errorProblems as unknown[])
      : [];
    next.errorProblems = baseErrorProblems.concat(cloneJsonValue(delta.appendErrorProblems));
  }

  const fallbackUpdatedAt =
    typeof next.updatedAt === "number" && Number.isFinite(next.updatedAt)
      ? next.updatedAt
      : 0;
  const updatedAt =
    typeof delta.updatedAt === "number" && Number.isFinite(delta.updatedAt)
      ? delta.updatedAt
      : fallbackUpdatedAt || Date.now();
  next.updatedAt = updatedAt;
  return normalizeRecord(next);
}

function materializeRecord(row: {
  recordId: string;
  recordData?: Record<string, unknown> | null;
  updatedAt: number | null;
  deletedAt?: number | null;
}) {
  const data =
    row.recordData && typeof row.recordData === "object"
      ? (row.recordData as Record<string, unknown>)
      : {};
  const merged = normalizeRecord({
    ...data,
    id: typeof data.id === "string" ? data.id : row.recordId,
    updatedAt:
      typeof data.updatedAt === "number" ? data.updatedAt : row.updatedAt ?? undefined,
    deletedAt:
      typeof data.deletedAt === "number" ? data.deletedAt : row.deletedAt ?? undefined,
  });
  return (
    merged ?? {
      id: row.recordId,
      updatedAt: row.updatedAt ?? undefined,
      ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}),
    }
  );
}

async function getUserRecords(
  userId: number,
  since?: number,
  includeDeleted = false
) {
  const sinceValue =
    typeof since === "number" && Number.isFinite(since) && since > 0
      ? since
      : undefined;
  const baseWhere = eq(userRecords.userId, userId);
  const whereWithSince = sinceValue
    ? and(baseWhere, gte(userRecords.updatedAt, sinceValue))
    : baseWhere;
  const whereClause = includeDeleted
    ? whereWithSince
    : and(whereWithSince, sql`${userRecords.deletedAt} IS NULL`);
  const rows = (await db
    .select()
    .from(userRecords)
    .where(whereClause)) as Array<{
    recordId: string;
    recordData?: Record<string, unknown> | null;
    updatedAt: number | null;
    deletedAt: number | null;
  }>;
  return rows
    .map((row) => materializeRecord(row))
    .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
}

async function mergeUserRecords(
  userId: number,
  incoming: PracticeRecord[],
  limit: number
) {
  const existing = await getUserRecords(userId, undefined, true);
  const recordMap = new Map(existing.map((item) => [item.id, item]));
  for (const raw of incoming) {
    const record = normalizeRecord(raw);
    if (!record) continue;
    const prev = recordMap.get(record.id);
    if (!prev) {
      recordMap.set(record.id, record);
      continue;
    }
    const prevTime = prev.updatedAt ?? 0;
    const nextTime = record.updatedAt ?? 0;
    recordMap.set(record.id, nextTime >= prevTime ? record : prev);
  }
  const { records: merged } = applyRecordLimit(
    Array.from(recordMap.values()),
    limit
  );

  await db.delete(userRecords).where(eq(userRecords.userId, userId));
  if (merged.length > 0) {
    await insertUserRecordsInChunks(
      merged.map((record) => ({
        userId,
        recordId: record.id,
        recordData: record,
        deletedAt: record.deletedAt ?? null,
        updatedAt: record.updatedAt ?? null,
        syncSeq: null,
      }))
    );
  }
  return merged;
}

async function syncUserRecords(
  userId: number,
  incoming: PracticeRecord[],
  limit: number,
  since?: number
) {
  const sinceValue =
    typeof since === "number" && Number.isFinite(since) && since > 0
      ? since
      : 0;
  const rows = (await db
    .select()
    .from(userRecords)
    .where(eq(userRecords.userId, userId))) as Array<{
    recordId: string;
    recordData?: Record<string, unknown> | null;
    updatedAt: number | null;
    deletedAt: number | null;
    syncSeq: number | null;
  }>;
  const recordMap = new Map<
    string,
    {
      record: PracticeRecord;
      updatedAt: number;
      deletedAt?: number;
      syncSeq: number;
    }
  >();
  let maxSyncSeq = 0;
  for (const row of rows) {
    const materialized = materializeRecord(row);
    const updatedAt = materialized.updatedAt ?? 0;
    const deletedAt =
      typeof materialized.deletedAt === "number" ? materialized.deletedAt : undefined;
    const syncSeq = typeof row.syncSeq === "number" ? row.syncSeq : 0;
    if (syncSeq > maxSyncSeq) maxSyncSeq = syncSeq;
    recordMap.set(materialized.id, {
      record: materialized,
      updatedAt,
      deletedAt,
      syncSeq,
    });
  }

  let nextSync = Math.max(maxSyncSeq, sinceValue);
  const missingSeq = Array.from(recordMap.values()).filter(
    (item) => !item.syncSeq || item.syncSeq <= 0
  );
  if (missingSeq.length > 0) {
    missingSeq
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .forEach((item) => {
        nextSync += 1;
        item.syncSeq = nextSync;
      });
  }
  for (const raw of incoming) {
    const record = normalizeRecord(raw);
    if (!record) continue;
    const incomingUpdatedAt = record.updatedAt ?? 0;
    const existing = recordMap.get(record.id);
    const existingUpdatedAt = existing?.updatedAt ?? 0;
    if (!existing || incomingUpdatedAt >= existingUpdatedAt) {
      nextSync += 1;
      recordMap.set(record.id, {
        record,
        updatedAt: incomingUpdatedAt,
        deletedAt:
          typeof record.deletedAt === "number" ? record.deletedAt : undefined,
        syncSeq: nextSync,
      });
    }
  }

  const { records: merged, trimmed } = applyRecordLimit(
    Array.from(recordMap.values()).sort((a, b) => a.updatedAt - b.updatedAt),
    limit
  );

  await db.delete(userRecords).where(eq(userRecords.userId, userId));
  if (merged.length > 0) {
    await insertUserRecordsInChunks(
      merged.map((item) => ({
        userId,
        recordId: item.record.id,
        recordData: item.record,
        updatedAt: item.updatedAt || null,
        deletedAt: item.deletedAt ?? null,
        syncSeq: item.syncSeq || null,
      }))
    );
  }

  const cursor = Math.max(
    sinceValue,
    merged.reduce((max, item) => Math.max(max, item.syncSeq || 0), 0),
    nextSync
  );
  const changes = merged
    .filter((item) => (item.syncSeq || 0) > sinceValue)
    .map((item) => item.record);

  return { records: changes, cursor, trimmed, limit };
}

async function getUserMaxSyncSeq(userId: number) {
  const rows = (await db
    .select({
      maxSyncSeq: sql<number>`COALESCE(MAX(${userRecords.syncSeq}), 0)`,
    })
    .from(userRecords)
    .where(eq(userRecords.userId, userId))) as Array<{ maxSyncSeq: number | null }>;
  const value = Number(rows[0]?.maxSyncSeq ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

async function trimUserRecordRows(userId: number, limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  const rows = (await db
    .select({
      recordId: userRecords.recordId,
      updatedAt: userRecords.updatedAt,
    })
    .from(userRecords)
    .where(eq(userRecords.userId, userId))) as Array<{
    recordId: string;
    updatedAt: number | null;
  }>;
  if (rows.length <= limit) return 0;
  const toDelete = rows
    .slice()
    .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
    .slice(0, Math.max(0, rows.length - limit))
    .map((item) => item.recordId)
    .filter(Boolean);
  if (toDelete.length === 0) return 0;
  await db
    .delete(userRecords)
    .where(
      and(
        eq(userRecords.userId, userId),
        inArray(userRecords.recordId, toDelete)
      )
    );
  return toDelete.length;
}

async function upsertSingleUserRecord(options: {
  userId: number;
  record: PracticeRecord;
  limit: number;
}) {
  const maxSyncSeq = await getUserMaxSyncSeq(options.userId);
  const nextSyncSeq = maxSyncSeq + 1;
  await db
    .delete(userRecords)
    .where(
      and(
        eq(userRecords.userId, options.userId),
        eq(userRecords.recordId, options.record.id)
      )
    );
  await db.insert(userRecords).values({
    userId: options.userId,
    recordId: options.record.id,
    recordData: options.record,
    deletedAt: options.record.deletedAt ?? null,
    updatedAt: options.record.updatedAt ?? null,
    syncSeq: nextSyncSeq,
  });
  const trimmed = await trimUserRecordRows(options.userId, options.limit);
  const cursor = Math.max(nextSyncSeq, await getUserMaxSyncSeq(options.userId));
  return { cursor, trimmed };
}

export const registerRecordRoutes = (app: Elysia) =>
  app
    .get("/api/records", async ({ request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const userId = Number(user.id);
      if (!Number.isFinite(userId)) {
        set.status = 400;
        return { error: "Invalid user id" };
      }
      const url = new URL(request.url);
      const sinceRaw = url.searchParams.get("since");
      const since = sinceRaw ? Number(sinceRaw) : undefined;
      return { records: await getUserRecords(userId, since, false) };
    })
    .post("/api/records", async ({ request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const userId = Number(user.id);
      if (!Number.isFinite(userId)) {
        set.status = 400;
        return { error: "Invalid user id" };
      }
      const limit = await resolveRecordLimit(user.groupId);
      const payload = (body ?? {}) as { records?: unknown };
      const incoming = Array.isArray(payload.records) ? payload.records : [];
      const merged = await mergeUserRecords(
        userId,
        incoming as PracticeRecord[],
        limit
      );
      return { records: merged };
    })
    .post("/api/records/sync", async ({ request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const userId = Number(user.id);
      if (!Number.isFinite(userId)) {
        set.status = 400;
        return { error: "Invalid user id" };
      }
      const limit = await resolveRecordLimit(user.groupId);
      const payload = (body ?? {}) as { records?: unknown; since?: unknown };
      const incoming = Array.isArray(payload.records) ? payload.records : [];
      const since =
        typeof payload.since === "number"
          ? payload.since
          : typeof payload.since === "string"
          ? Number(payload.since)
          : undefined;
      try {
        const result = await syncUserRecords(
          userId,
          incoming as PracticeRecord[],
          limit,
          since
        );
        return result;
      } catch (error) {
        set.status = 500;
        return {
          error: error instanceof Error ? error.message : "Record sync failed",
        };
      }
    })
    .post("/api/records/sync-item", async ({ request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const userId = Number(user.id);
      if (!Number.isFinite(userId)) {
        set.status = 400;
        return { error: "Invalid user id" };
      }
      const limit = await resolveRecordLimit(user.groupId);
      const payload = (body ?? {}) as {
        since?: unknown;
        recordId?: unknown;
        fullRecord?: unknown;
        delta?: unknown;
      };
      const recordId =
        typeof payload.recordId === "string" ? payload.recordId.trim() : "";
      if (!recordId) {
        set.status = 400;
        return { error: "Invalid record id" };
      }
      const sinceRaw =
        typeof payload.since === "number"
          ? payload.since
          : typeof payload.since === "string"
          ? Number(payload.since)
          : 0;
      const since =
        Number.isFinite(sinceRaw) && sinceRaw > 0 ? Math.floor(sinceRaw) : 0;
      const currentCursor = await getUserMaxSyncSeq(userId);

      const [existingRow] = (await db
        .select()
        .from(userRecords)
        .where(
          and(
            eq(userRecords.userId, userId),
            eq(userRecords.recordId, recordId)
          )
        )
        .limit(1)) as Array<{
        recordId: string;
        recordData?: Record<string, unknown> | null;
        updatedAt: number | null;
        deletedAt: number | null;
      }>;
      const existingRecord = existingRow ? materializeRecord(existingRow) : null;

      if (payload.fullRecord !== undefined) {
        const normalized = normalizeRecord(payload.fullRecord);
        if (!normalized || normalized.id !== recordId) {
          set.status = 400;
          return { error: "Invalid full record payload" };
        }
        const existingUpdatedAt = Number(existingRecord?.updatedAt ?? 0);
        const incomingUpdatedAt = Number(normalized.updatedAt ?? 0);
        if (
          existingRecord &&
          Number.isFinite(existingUpdatedAt) &&
          existingUpdatedAt > incomingUpdatedAt
        ) {
          return {
            recordExists: true,
            needFull: false,
            conflict: true,
            cursor: Math.max(currentCursor, since),
            records: [existingRecord],
            record: existingRecord,
            trimmed: 0,
            limit,
          };
        }
        const result = await upsertSingleUserRecord({
          userId,
          record: normalized,
          limit,
        });
        return {
          recordExists: Boolean(existingRecord),
          needFull: false,
          conflict: false,
          cursor: Math.max(result.cursor, since),
          records: [normalized],
          record: normalized,
          trimmed: result.trimmed,
          limit,
        };
      }

      const delta = normalizeRecordDelta(payload.delta, recordId);
      if (!delta) {
        set.status = 400;
        return { error: "Invalid delta payload" };
      }
      if (!existingRecord) {
        return {
          recordExists: false,
          needFull: true,
          conflict: false,
          cursor: Math.max(currentCursor, since),
          records: [],
          limit,
        };
      }

      const existingUpdatedAt = Number(existingRecord.updatedAt ?? 0);
      const baseUpdatedAt = Number(delta.baseUpdatedAt ?? 0);
      if (baseUpdatedAt > 0 && existingUpdatedAt > baseUpdatedAt) {
        return {
          recordExists: true,
          needFull: true,
          conflict: true,
          cursor: Math.max(currentCursor, since),
          records: [existingRecord],
          record: existingRecord,
          limit,
        };
      }

      const nextRecord = applyRecordDelta(existingRecord, delta);
      if (!nextRecord) {
        return {
          recordExists: true,
          needFull: true,
          conflict: true,
          cursor: Math.max(currentCursor, since),
          records: [existingRecord],
          record: existingRecord,
          limit,
        };
      }

      const nextUpdatedAt = Number(nextRecord.updatedAt ?? 0);
      if (nextUpdatedAt < existingUpdatedAt) {
        return {
          recordExists: true,
          needFull: false,
          conflict: false,
          noOp: true,
          cursor: Math.max(currentCursor, since),
          records: [],
          record: existingRecord,
          trimmed: 0,
          limit,
        };
      }

      const result = await upsertSingleUserRecord({
        userId,
        record: nextRecord,
        limit,
      });
      return {
        recordExists: true,
        needFull: false,
        conflict: false,
        cursor: Math.max(result.cursor, since),
        records: [nextRecord],
        record: nextRecord,
        trimmed: result.trimmed,
        limit,
      };
    })
    .post("/api/records/meta", async ({ request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const userId = Number(user.id);
      if (!Number.isFinite(userId)) {
        set.status = 400;
        return { error: "Invalid user id" };
      }
      const payload = (body ?? {}) as { ids?: unknown };
      const rawIds = Array.isArray(payload.ids) ? payload.ids : [];
      const ids = rawIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
        .slice(0, 200);
      if (ids.length === 0) {
        return { ids: [] };
      }
      const rows = (await db
        .select({ recordId: userRecords.recordId })
        .from(userRecords)
        .where(
          and(
            eq(userRecords.userId, userId),
            inArray(userRecords.recordId, ids),
            sql`${userRecords.deletedAt} IS NULL`
          )
        )) as Array<{ recordId: string }>;
      return { ids: rows.map((row) => row.recordId) };
    });
