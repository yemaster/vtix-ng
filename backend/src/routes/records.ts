import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db, userRecords } from "../db";
import { getSessionUser } from "../utils/session";

type PracticeRecord = {
  id: string;
  updatedAt?: number;
};

async function getUserRecords(userId: number) {
  const rows = (await db
    .select()
    .from(userRecords)
    .where(eq(userRecords.userId, userId))) as Array<{
    recordId: string;
    updatedAt: number | null;
  }>;
  return rows
    .map((row) => ({
      id: row.recordId,
      updatedAt: row.updatedAt ?? undefined,
    }))
    .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
}

async function mergeUserRecords(userId: number, incoming: PracticeRecord[]) {
  const existing = await getUserRecords(userId);
  const recordMap = new Map(existing.map((item) => [item.id, item]));
  for (const record of incoming) {
    if (!record || typeof record.id !== "string") continue;
    recordMap.set(record.id, record);
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
        updatedAt: record.updatedAt ?? null,
      }))
    );
  }
  return merged;
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
      return { records: await getUserRecords(userId) };
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
    });
