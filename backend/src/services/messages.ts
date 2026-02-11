import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, dbDialect, messages } from "../db";

export type MessageItem = {
  id: number;
  senderId: number;
  senderName: string;
  receiverId: number;
  receiverName: string;
  content: string;
  type: number;
  link: string | null;
  isRead: boolean;
  createdAt: number;
};

export async function createMessage(
  payload: Omit<MessageItem, "id" | "createdAt" | "isRead"> & { createdAt?: number }
) {
  const createdAt =
    Number.isFinite(Number(payload.createdAt)) && Number(payload.createdAt) > 0
      ? Number(payload.createdAt)
      : Date.now();
  const row = {
    senderId: payload.senderId,
    senderName: payload.senderName,
    receiverId: payload.receiverId,
    receiverName: payload.receiverName,
    content: payload.content,
    type: payload.type,
    link: payload.link ?? null,
    isRead: false,
    createdAt,
  };
  let id = 0;
  if (dbDialect === "mysql") {
    const result = await (db.insert(messages).values(row) as any).$returningId();
    const first = Array.isArray(result) && result.length > 0 ? result[0] : null;
    id = Number(first?.id ?? first ?? 0);
  } else {
    const result = await db
      .insert(messages)
      .values(row)
      .returning({ id: messages.id });
    id = Array.isArray(result) && result.length > 0 ? Number(result[0]?.id ?? 0) : 0;
  }
  return {
    id,
    ...row,
  } as MessageItem;
}

export async function loadUserMessagesPage(options: {
  receiverId: number;
  page?: number;
  pageSize?: number;
}) {
  const pageRaw = Number(options.page ?? 1);
  const pageSizeRaw = Number(options.pageSize ?? 12);
  const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
  const limit = Number.isFinite(pageSizeRaw)
    ? Math.min(Math.max(pageSizeRaw, 1), 50)
    : 12;
  const offset = (page - 1) * limit;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(eq(messages.receiverId, options.receiverId));
  const total = Number(countRow?.count ?? 0);

  const rows = (await db
    .select()
    .from(messages)
    .where(eq(messages.receiverId, options.receiverId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit)
    .offset(offset)) as MessageItem[];

  return { items: rows, total };
}

export async function loadUnreadMessageCount(receiverId: number) {
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(and(eq(messages.receiverId, receiverId), eq(messages.isRead, false)));
  return Number(countRow?.count ?? 0);
}

export async function markMessagesRead(receiverId: number, ids: number[]) {
  if (!ids.length) return;
  await db
    .update(messages)
    .set({ isRead: true })
    .where(and(eq(messages.receiverId, receiverId), inArray(messages.id, ids)));
}
