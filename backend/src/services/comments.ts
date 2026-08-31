import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  dbDialect,
  problemCommentLikes,
  problemCommentReports,
  problemComments,
  problemSetProblems,
  problemSets,
  problems,
  userGroups,
  users,
} from "../db";
import { hasPermission, PERMISSIONS } from "../utils/permissions";
import type { User } from "../utils/session";
import { createMessage } from "./messages";

export const MAX_COMMENT_LENGTH = 500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

// Report lifecycle: 'open' = awaiting moderation, 'dismissed' = moderator kept
// the comment. Dismissing is a soft status flip (not a delete) so reports stay
// as an audit trail; the admin queue only surfaces 'open' reports.
const REPORT_STATUS = { OPEN: "open", DISMISSED: "dismissed" } as const;

export type CommentReplyTo = {
  commentId: number;
  floor: number;
  userName: string;
  snippet: string;
  deleted: boolean;
};

export type CommentPayload = {
  id: number;
  problemId: number;
  userId: string;
  userName: string;
  content: string;
  floor: number;
  likeCount: number;
  liked: boolean;
  replyTo: CommentReplyTo | null;
  createdAt: number;
  updatedAt: number;
};

export type ReportedCommentReport = {
  reportId: number;
  reason: string | null;
  createdAt: number;
};

export type ReportedCommentGroupPayload = {
  commentId: number;
  problemId: number;
  setTitle: string | null;
  questionNumber: number | null;
  commentUserName: string;
  commentContent: string;
  floor: number;
  likeCount: number;
  openCount: number;
  totalCount: number;
  latestReportAt: number;
  reports: ReportedCommentReport[];
};

// In-memory, single-process rate limiter for posting comments.
const commentPostTimestamps = new Map<number, number[]>();

export function checkCommentRateLimit(userId: number): boolean {
  const now = Date.now();
  const recent = (commentPostTimestamps.get(userId) ?? []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    commentPostTimestamps.set(userId, recent);
    return false;
  }
  recent.push(now);
  commentPostTimestamps.set(userId, recent);
  return true;
}

function toCommentPayload(
  row: {
    id: number;
    problemId: number;
    userId: number;
    userName: string;
    content: string;
    floor: number;
    likeCount: number;
    replyToCommentId: number | null;
    replyToFloor: number | null;
    replyToUserName: string | null;
    createdAt: number;
    updatedAt: number;
  },
  liked: boolean,
  replyToMap: Map<number, CommentReplyTo>
): CommentPayload {
  let replyTo: CommentReplyTo | null = null;
  if (row.replyToCommentId != null) {
    const live = replyToMap.get(Number(row.replyToCommentId));
    if (live) {
      // Parent still exists -> show its live floor/author/snippet.
      replyTo = { ...live, deleted: false };
    } else if (row.replyToFloor != null) {
      // Parent was deleted -> keep floor/author (denormalized), mark content.
      replyTo = {
        commentId: Number(row.replyToCommentId),
        floor: Number(row.replyToFloor),
        userName: row.replyToUserName ?? "",
        snippet: "（原评论已被删除）",
        deleted: true,
      };
    }
  }
  return {
    id: Number(row.id),
    problemId: Number(row.problemId),
    userId: String(row.userId),
    userName: row.userName,
    content: row.content,
    floor: Number(row.floor),
    likeCount: Number(row.likeCount ?? 0),
    liked,
    replyTo,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
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

const COMMENT_SNIPPET_MAX = 40;

function buildCommentSnippet(content: string): string {
  const text = (content ?? "").replace(/\s+/g, " ").trim();
  return text.length > COMMENT_SNIPPET_MAX
    ? `${text.slice(0, COMMENT_SNIPPET_MAX)}…`
    : text;
}

// Each problem row belongs to exactly one problem set; resolve its title and
// 1-based question number within that set for the notification text.
async function resolveProblemContext(
  problemId: number
): Promise<{ title: string; questionNumber: number } | null> {
  if (!Number.isFinite(problemId) || problemId <= 0) return null;
  const [row] = await db
    .select({
      title: problemSets.title,
      orderIndex: problemSetProblems.orderIndex,
    })
    .from(problemSetProblems)
    .innerJoin(problemSets, eq(problemSetProblems.problemSetId, problemSets.id))
    .where(eq(problemSetProblems.problemId, problemId))
    .orderBy(desc(problemSets.updatedAt))
    .limit(1);
  if (!row) return null;
  return {
    title: String(row.title ?? ""),
    questionNumber: Number(row.orderIndex ?? 0) + 1,
  };
}

export async function loadCommentsPage(options: {
  problemId: number;
  page: number;
  pageSize: number;
  sort: "latest" | "hot";
  viewerId?: number;
}): Promise<{ items: CommentPayload[]; total: number }> {
  const { problemId, page, pageSize, sort, viewerId } = options;
  const offset = Math.max(0, (page - 1) * pageSize);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(problemComments)
    .where(eq(problemComments.problemId, problemId));
  const total = Number(countRow?.count ?? 0);

  const order =
    sort === "hot"
      ? [desc(problemComments.likeCount), desc(problemComments.id)]
      : [desc(problemComments.id)];

  const rows = (await db
    .select({
      id: problemComments.id,
      problemId: problemComments.problemId,
      userId: problemComments.userId,
      userName: problemComments.userName,
      content: problemComments.content,
      floor: problemComments.floor,
      likeCount: problemComments.likeCount,
      replyToCommentId: problemComments.replyToCommentId,
      replyToFloor: problemComments.replyToFloor,
      replyToUserName: problemComments.replyToUserName,
      createdAt: problemComments.createdAt,
      updatedAt: problemComments.updatedAt,
    })
    .from(problemComments)
    .where(eq(problemComments.problemId, problemId))
    .orderBy(...order)
    .limit(pageSize)
    .offset(offset)) as Array<{
    id: number;
    problemId: number;
    userId: number;
    userName: string;
    content: string;
    floor: number;
    likeCount: number;
    replyToCommentId: number | null;
    replyToFloor: number | null;
    replyToUserName: string | null;
    createdAt: number;
    updatedAt: number;
  }>;

  let likedSet = new Set<number>();
  if (viewerId && rows.length > 0) {
    const ids = rows.map((row) => Number(row.id));
    const likes = await db
      .select({ commentId: problemCommentLikes.commentId })
      .from(problemCommentLikes)
      .where(
        and(
          eq(problemCommentLikes.userId, viewerId),
          inArray(problemCommentLikes.commentId, ids)
        )
      );
    likedSet = new Set(likes.map((like: { commentId: number }) => Number(like.commentId)));
  }

  // Batch-resolve quoted parent comments (one query, keyed by replyToCommentId),
  // mirroring the likedSet batch. Parents may live on another page/sort order, so
  // resolve by id regardless. A parent missing from this map was deleted; the
  // denormalized replyToFloor/replyToUserName on the child drive the "（原评论已被删除）"
  // marker in toCommentPayload.
  const replyToMap = new Map<number, CommentReplyTo>();
  const replyIds = Array.from(
    new Set(
      rows
        .map((row) => Number(row.replyToCommentId))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
  if (replyIds.length > 0) {
    const parents = await db
      .select({
        id: problemComments.id,
        floor: problemComments.floor,
        userName: problemComments.userName,
        content: problemComments.content,
      })
      .from(problemComments)
      .where(inArray(problemComments.id, replyIds));
    for (const p of parents) {
      replyToMap.set(Number(p.id), {
        commentId: Number(p.id),
        floor: Number(p.floor),
        userName: p.userName,
        snippet: buildCommentSnippet(p.content),
        deleted: false,
      });
    }
  }

  return {
    items: rows.map((row) =>
      toCommentPayload(row, likedSet.has(Number(row.id)), replyToMap)
    ),
    total,
  };
}

export async function createComment(options: {
  problemId: number;
  user: User;
  content: string;
  replyToCommentId?: number;
}): Promise<CommentPayload | { error: string } | null> {
  const { problemId, user } = options;
  const userId = Number(user.id);
  if (!Number.isFinite(userId)) {
    return { error: "Invalid user." };
  }
  const trimmed = options.content.trim();
  if (!trimmed) {
    return { error: "评论内容不能为空。" };
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return { error: `评论不能超过 ${MAX_COMMENT_LENGTH} 个字。` };
  }

  const [problemRow] = await db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.id, problemId))
    .limit(1);
  if (!problemRow) {
    return null;
  }

  // Validate the quote target: it must exist and belong to the same problem.
  // An invalid/missing/cross-problem target is silently ignored — the comment
  // is still created, just without a back-reference.
  type ResolvedReply = {
    commentId: number;
    floor: number;
    userName: string;
    snippet: string;
    authorId: number;
  };
  let resolvedReply: ResolvedReply | null = null;
  const replyRaw = Number(options.replyToCommentId);
  if (Number.isFinite(replyRaw) && replyRaw > 0) {
    const [parent] = await db
      .select({
        id: problemComments.id,
        problemId: problemComments.problemId,
        userId: problemComments.userId,
        userName: problemComments.userName,
        floor: problemComments.floor,
        content: problemComments.content,
      })
      .from(problemComments)
      .where(eq(problemComments.id, replyRaw))
      .limit(1);
    if (parent && Number(parent.problemId) === problemId) {
      resolvedReply = {
        commentId: Number(parent.id),
        floor: Number(parent.floor),
        userName: parent.userName,
        snippet: buildCommentSnippet(parent.content),
        authorId: Number(parent.userId),
      };
    }
  }

  const now = Date.now();

  const created = await db.transaction(async (tx: typeof db) => {
    // Reserve the next floor from a per-problem monotonic counter
    // (problems.commentFloorSeq). It only ever increments, so deleting a
    // comment never reuses its floor (no collisions, no "delete 6 -> repost 6").
    // SQLite returns the new value via RETURNING; MySQL relies on the row write
    // lock to serialize concurrent posts, then reads the value back.
    let floor = 0;
    if (dbDialect === "mysql") {
      await tx
        .update(problems)
        .set({ commentFloorSeq: sql`${problems.commentFloorSeq} + 1` })
        .where(eq(problems.id, problemId));
      const [seqRow] = await tx
        .select({ seq: problems.commentFloorSeq })
        .from(problems)
        .where(eq(problems.id, problemId))
        .limit(1);
      floor = Number(seqRow?.seq ?? 0);
    } else {
      const seqRows = (await tx
        .update(problems)
        .set({ commentFloorSeq: sql`${problems.commentFloorSeq} + 1` })
        .where(eq(problems.id, problemId))
        .returning({ seq: problems.commentFloorSeq })) as Array<
        { seq: number } | undefined
      >;
      floor = Number(seqRows[0]?.seq ?? 0);
    }
    if (floor <= 0) {
      throw new Error("Failed to assign comment floor.");
    }

    const row = {
      problemId,
      userId,
      userName: user.name,
      content: trimmed,
      floor,
      likeCount: 0,
      replyToCommentId: resolvedReply ? resolvedReply.commentId : null,
      replyToFloor: resolvedReply ? resolvedReply.floor : null,
      replyToUserName: resolvedReply ? resolvedReply.userName : null,
      createdAt: now,
      updatedAt: now,
    };

    let id: number | null = null;
    if (dbDialect === "mysql") {
      const result = await (tx.insert(problemComments).values(row) as any).$returningId();
      id = extractInsertedId(result);
    } else {
      const result = await tx
        .insert(problemComments)
        .values(row)
        .returning({ id: problemComments.id });
      id = extractInsertedId(result);
    }
    if (id === null) {
      throw new Error("Failed to insert comment.");
    }

    return { id, floor };
  });

  // Notify the quoted comment's author (message type 4 = comment quote/reply).
  // Skip self-quotes; never block the post on notification failure.
  // Mirrors the like-notification pattern in toggleCommentLike.
  if (resolvedReply && resolvedReply.authorId !== userId) {
    try {
      const context = await resolveProblemContext(problemId);
      const snippet = buildCommentSnippet(trimmed);
      const content = context
        ? `${user.name} 在《${context.title}》第${context.questionNumber}题引用了你的评论：${snippet}`
        : `${user.name} 引用了你的评论：${snippet}`;
      await createMessage({
        senderId: userId,
        senderName: user.name,
        receiverId: resolvedReply.authorId,
        receiverName: resolvedReply.userName,
        content,
        type: 4,
        link: null,
      });
    } catch (error) {
      console.warn("[comments] failed to notify quoted comment author", error);
    }
  }

  return {
    id: created.id,
    problemId,
    userId: String(userId),
    userName: user.name,
    content: trimmed,
    floor: created.floor,
    likeCount: 0,
    liked: false,
    replyTo: resolvedReply
      ? {
          commentId: resolvedReply.commentId,
          floor: resolvedReply.floor,
          userName: resolvedReply.userName,
          snippet: resolvedReply.snippet,
          deleted: false,
        }
      : null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function toggleCommentLike(options: {
  commentId: number;
  userId: number;
  likerName: string;
}): Promise<{ liked: boolean; likeCount: number } | null> {
  const { commentId, userId, likerName } = options;

  const result = await db.transaction(async (tx: typeof db) => {
    const [commentRow] = await tx
      .select({ id: problemComments.id, likeCount: problemComments.likeCount })
      .from(problemComments)
      .where(eq(problemComments.id, commentId))
      .limit(1);
    if (!commentRow) return null;

    const [existing] = await tx
      .select({ commentId: problemCommentLikes.commentId })
      .from(problemCommentLikes)
      .where(
        and(
          eq(problemCommentLikes.commentId, commentId),
          eq(problemCommentLikes.userId, userId)
        )
      )
      .limit(1);

    const now = Date.now();
    if (existing) {
      await tx
        .delete(problemCommentLikes)
        .where(
          and(
            eq(problemCommentLikes.commentId, commentId),
            eq(problemCommentLikes.userId, userId)
          )
        );
      await tx
        .update(problemComments)
        .set({ likeCount: sql`${problemComments.likeCount} - 1` })
        .where(eq(problemComments.id, commentId));
      return { liked: false, likeCount: Math.max(0, Number(commentRow.likeCount) - 1) };
    }

    await tx.insert(problemCommentLikes).values({
      commentId,
      userId,
      createdAt: now,
    });
    await tx
      .update(problemComments)
      .set({ likeCount: sql`${problemComments.likeCount} + 1` })
      .where(eq(problemComments.id, commentId));
    return { liked: true, likeCount: Number(commentRow.likeCount) + 1 };
  });

  // Notify the comment author when someone new likes their comment
  // (message type 2 = comment-like; review notifications use type 1).
  // Skip self-likes and never notify on unliking.
  if (result && result.liked) {
    try {
      const [authorRow] = await db
        .select({
          userId: problemComments.userId,
          userName: problemComments.userName,
          problemId: problemComments.problemId,
          content: problemComments.content,
        })
        .from(problemComments)
        .where(eq(problemComments.id, commentId))
        .limit(1);
      if (authorRow && Number(authorRow.userId) !== userId) {
        const snippet = buildCommentSnippet(authorRow.content);
        const context = await resolveProblemContext(Number(authorRow.problemId));
        const content = context
          ? `${likerName} 赞了你在《${context.title}》第${context.questionNumber}题的评论：${snippet}`
          : `${likerName} 赞了你的评论：${snippet}`;
        await createMessage({
          senderId: userId,
          senderName: likerName,
          receiverId: Number(authorRow.userId),
          receiverName: authorRow.userName,
          content,
          type: 2,
          link: null,
        });
      }
    } catch (error) {
      console.warn("[comments] failed to notify comment author of like", error);
    }
  }

  return result;
}

// Notify every user who can moderate comments (MANAGE_COMMENTS). Message type 3
// = report notification. Skips the reporter when they are themselves a moderator.
async function notifyCommentModerators(options: {
  senderId: number;
  senderName: string;
  content: string;
}) {
  const moderators = (await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userGroups, eq(users.groupId, userGroups.id))
    .where(
      sql`(${userGroups.permissions} & ${PERMISSIONS.MANAGE_COMMENTS}) = ${PERMISSIONS.MANAGE_COMMENTS}`
    )) as Array<{ id: number; name: string }>;
  for (const mod of moderators) {
    if (Number(mod.id) === options.senderId) continue;
    await createMessage({
      senderId: options.senderId,
      senderName: options.senderName,
      receiverId: Number(mod.id),
      receiverName: mod.name,
      content: options.content,
      type: 3,
      link: "/admin/comments",
    });
  }
}

export async function reportComment(options: {
  commentId: number;
  reporterId: number;
  reporterName: string;
  reason?: string;
}): Promise<{ ok: boolean; alreadyReported?: boolean } | null> {
  const { commentId, reporterId, reporterName } = options;
  const reason = options.reason?.trim() || null;

  const [commentRow] = await db
    .select({ id: problemComments.id, problemId: problemComments.problemId })
    .from(problemComments)
    .where(eq(problemComments.id, commentId))
    .limit(1);
  if (!commentRow) return null;

  const [existing] = await db
    .select({ id: problemCommentReports.id })
    .from(problemCommentReports)
    .where(
      and(
        eq(problemCommentReports.commentId, commentId),
        eq(problemCommentReports.reporterId, reporterId)
      )
    )
    .limit(1);
  if (existing) {
    return { ok: true, alreadyReported: true };
  }

  // Notify moderators only when a comment currently has NO open reports, i.e.
  // each new "wave" of reports (after the previous wave was dismissed) pings
  // once. Dismissed reports don't count, so a re-report after dismiss notifies.
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(problemCommentReports)
    .where(
      and(
        eq(problemCommentReports.commentId, commentId),
        eq(problemCommentReports.status, REPORT_STATUS.OPEN)
      )
    );
  const firstReport = Number(countRow?.count ?? 0) === 0;

  await db.insert(problemCommentReports).values({
    commentId,
    reporterId,
    reason,
    status: REPORT_STATUS.OPEN,
    createdAt: Date.now(),
  });

  if (firstReport) {
    try {
      const context = await resolveProblemContext(Number(commentRow.problemId));
      const location = context
        ? `《${context.title}》第${context.questionNumber}题`
        : "一道题目";
      const content = reason
        ? `${reporterName} 举报了${location}的评论：${reason}`
        : `${reporterName} 举报了${location}的评论`;
      await notifyCommentModerators({
        senderId: reporterId,
        senderName: reporterName,
        content,
      });
    } catch (error) {
      console.warn("[comments] failed to notify moderators of report", error);
    }
  }

  return { ok: true };
}

export async function deleteComment(options: {
  commentId: number;
  user: User;
}): Promise<{ ok: boolean; allowed: boolean }> {
  const { commentId, user } = options;
  const userId = Number(user.id);

  const [row] = await db
    .select({ id: problemComments.id, userId: problemComments.userId })
    .from(problemComments)
    .where(eq(problemComments.id, commentId))
    .limit(1);
  if (!row) {
    return { ok: false, allowed: false };
  }

  const isOwner = Number(row.userId) === userId;
  const canManage = hasPermission(user.permissions, PERMISSIONS.MANAGE_COMMENTS);
  if (!isOwner && !canManage) {
    return { ok: false, allowed: false };
  }

  await db.delete(problemComments).where(eq(problemComments.id, commentId));
  return { ok: true, allowed: true };
}

// A moderator kept the comment: flip ALL of its open reports to 'dismissed'
// (the reports stay as an audit trail; they just leave the open queue).
// Idempotent.
export async function dismissOpenReportsForComment(options: {
  commentId: number;
}): Promise<{ ok: boolean }> {
  await db
    .update(problemCommentReports)
    .set({ status: REPORT_STATUS.DISMISSED })
    .where(
      and(
        eq(problemCommentReports.commentId, options.commentId),
        eq(problemCommentReports.status, REPORT_STATUS.OPEN)
      )
    );
  return { ok: true };
}

export async function loadReportedCommentsGrouped(options: {
  page: number;
  pageSize: number;
}): Promise<{ items: ReportedCommentGroupPayload[]; total: number }> {
  const { page, pageSize } = options;
  const offset = Math.max(0, (page - 1) * pageSize);

  // total = number of distinct comments currently carrying an open report.
  const [countRow] = await db
    .select({
      count: sql<number>`count(distinct ${problemCommentReports.commentId})`,
    })
    .from(problemCommentReports)
    .where(eq(problemCommentReports.status, REPORT_STATUS.OPEN));
  const total = Number(countRow?.count ?? 0);

  // One row per comment that has >=1 open report, with open/total counts and
  // the latest open-report time for ordering. Set context via correlated
  // subqueries (mirrors resolveProblemContext; avoids the multi-set fan-out).
  const rows = (await db
    .select({
      commentId: problemComments.id,
      problemId: problemComments.problemId,
      commentUserName: problemComments.userName,
      commentContent: problemComments.content,
      floor: problemComments.floor,
      likeCount: problemComments.likeCount,
      openCount: sql<number>`(
        select count(*) from problem_comment_reports r
        where r.comment_id = problem_comments.id and r.status = 'open'
      )`,
      totalCount: sql<number>`(
        select count(*) from problem_comment_reports r
        where r.comment_id = problem_comments.id
      )`,
      latestReportAt: sql<number>`(
        select max(r.created_at) from problem_comment_reports r
        where r.comment_id = problem_comments.id and r.status = 'open'
      )`,
      setTitle: sql<string | null>`(
        select ps.title from problem_set_problems psp
        inner join problem_sets ps on ps.id = psp.problem_set_id
        where psp.problem_id = problem_comments.problem_id
        order by ps.updated_at desc
        limit 1
      )`,
      orderIndex: sql<number | null>`(
        select psp.order_index from problem_set_problems psp
        inner join problem_sets ps on ps.id = psp.problem_set_id
        where psp.problem_id = problem_comments.problem_id
        order by ps.updated_at desc
        limit 1
      )`,
    })
    .from(problemComments)
    .where(
      sql`exists (select 1 from problem_comment_reports r where r.comment_id = problem_comments.id and r.status = 'open')`
    )
    .orderBy(
      sql`(select max(r.created_at) from problem_comment_reports r where r.comment_id = problem_comments.id and r.status = 'open') desc`
    )
    .limit(pageSize)
    .offset(offset)) as Array<{
    commentId: number;
    problemId: number;
    commentUserName: string;
    commentContent: string;
    floor: number;
    likeCount: number;
    openCount: number;
    totalCount: number;
    latestReportAt: number;
    setTitle: string | null;
    orderIndex: number | null;
  }>;

  // Batch-load the open reports (reasons) for this page's comments in one query.
  const reportsByComment = new Map<number, ReportedCommentReport[]>();
  if (rows.length > 0) {
    const ids = rows.map((r) => Number(r.commentId));
    const openReports = (await db
      .select({
        reportId: problemCommentReports.id,
        commentId: problemCommentReports.commentId,
        reason: problemCommentReports.reason,
        createdAt: problemCommentReports.createdAt,
      })
      .from(problemCommentReports)
      .where(
        and(
          eq(problemCommentReports.status, REPORT_STATUS.OPEN),
          inArray(problemCommentReports.commentId, ids)
        )
      )
      .orderBy(desc(problemCommentReports.createdAt))) as Array<{
      reportId: number;
      commentId: number;
      reason: string | null;
      createdAt: number;
    }>;
    for (const r of openReports) {
      const cid = Number(r.commentId);
      const arr = reportsByComment.get(cid) ?? [];
      arr.push({
        reportId: Number(r.reportId),
        reason: r.reason,
        createdAt: Number(r.createdAt),
      });
      reportsByComment.set(cid, arr);
    }
  }

  return {
    items: rows.map((row) => ({
      commentId: Number(row.commentId),
      problemId: Number(row.problemId),
      setTitle: row.setTitle ?? null,
      questionNumber:
        Number.isFinite(Number(row.orderIndex)) && Number(row.orderIndex) >= 0
          ? Number(row.orderIndex) + 1
          : null,
      commentUserName: row.commentUserName,
      commentContent: row.commentContent,
      floor: Number(row.floor),
      likeCount: Number(row.likeCount),
      openCount: Number(row.openCount ?? 0),
      totalCount: Number(row.totalCount ?? 0),
      latestReportAt: Number(row.latestReportAt ?? 0),
      reports: reportsByComment.get(Number(row.commentId)) ?? [],
    })),
    total,
  };
}
