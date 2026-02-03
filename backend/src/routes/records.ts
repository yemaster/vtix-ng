import { Elysia } from "elysia";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, userRecords } from "../db";
import { getSessionUser } from "../utils/session";

type PracticeRecord = {
  id: string;
  updatedAt?: number;
  deletedAt?: number;
  [key: string]: unknown;
};

const MAX_RECORDS = 10;

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

async function mergeUserRecords(userId: number, incoming: PracticeRecord[]) {
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
  let merged = Array.from(recordMap.values());
  merged = merged
    .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
    .slice(Math.max(0, merged.length - 10));

  await db.delete(userRecords).where(eq(userRecords.userId, userId));
  if (merged.length > 0) {
    await db.insert(userRecords).values(
      merged.map((record) => ({
        userId,
        recordId: record.id,
        recordData: record,
        deletedAt: record.deletedAt ?? null,
        updatedAt: record.updatedAt ?? null,
      }))
    );
  }
  return merged;
}

async function syncUserRecords(
  userId: number,
  incoming: PracticeRecord[],
  since?: number
) {
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

  let nextSync = maxSyncSeq;
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

  let merged = Array.from(recordMap.values())
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(Math.max(0, recordMap.size - MAX_RECORDS));

  await db.delete(userRecords).where(eq(userRecords.userId, userId));
  if (merged.length > 0) {
    await db.insert(userRecords).values(
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

  const cursor = merged.reduce(
    (max, item) => Math.max(max, item.syncSeq || 0),
    0
  );
  const sinceValue =
    typeof since === "number" && Number.isFinite(since) && since > 0
      ? since
      : 0;
  const changes = merged
    .filter((item) => (item.syncSeq || 0) > sinceValue)
    .map((item) => item.record);

  return { records: changes, cursor };
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
      const payload = (body ?? {}) as { records?: unknown };
      const incoming = Array.isArray(payload.records) ? payload.records : [];
      const merged = await mergeUserRecords(userId, incoming as PracticeRecord[]);
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
      const payload = (body ?? {}) as { records?: unknown; since?: unknown };
      const incoming = Array.isArray(payload.records) ? payload.records : [];
      const since =
        typeof payload.since === "number"
          ? payload.since
          : typeof payload.since === "string"
          ? Number(payload.since)
          : undefined;
      const result = await syncUserRecords(
        userId,
        incoming as PracticeRecord[],
        since
      );
      return result;
    });
