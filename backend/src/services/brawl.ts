import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import type { Socket } from "socket.io";
import type { Server } from "socket.io";
import { brawlRecords, db, problemSets, users } from "../db";
import { normalizePage, normalizePageSize } from "../utils/pagination";
import { getSessionUserByToken, parseCookies } from "../utils/session";
import { loadProblemSetDetail } from "./problemSets";

const TARGET_SCORE = 8;
const NEXT_ROUND_DELAY_MS = 1000;
const DISCONNECT_GRACE_MS = 30_000;

type SupportedQuestionType = 1 | 2 | 4;

type BrawlQuestion = {
  id: string;
  type: SupportedQuestionType;
  content: string;
  choices: string[];
  answer: number[];
};

type BrawlRoundState = {
  round: number;
  question: BrawlQuestion;
  lockedByUserId: string | null;
  resolved: boolean;
};

type BrawlPlayer = {
  userId: string;
  userName: string;
  score: number;
  connected: boolean;
  disconnectDeadlineAt: number | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
};

type BrawlMatchState = {
  id: string;
  problemSetCode: string;
  problemSetTitle: string;
  players: [BrawlPlayer, BrawlPlayer];
  questionPool: BrawlQuestion[];
  usedQuestionIndexes: Set<number>;
  roundIndex: number;
  currentRound: BrawlRoundState | null;
  finished: boolean;
  nextRoundTimer: ReturnType<typeof setTimeout> | null;
};

type SocketAuthState = {
  token: string;
  userId: string;
  userName: string;
};

type BrawlProblemSetPageOptions = {
  page?: number;
  pageSize?: number;
  keyword?: string;
};

type BrawlUserSpaceOptions = {
  userName: string;
  page?: number;
  pageSize?: number;
};

type BrawlProblemSetItem = {
  code: string;
  title: string;
  year: number;
  creatorName: string;
  isPublic: boolean;
  questionCount: number;
  onlineCount: number;
};

type BrawlUserSummary = {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

type BrawlUserRecordItem = {
  id: number;
  problemSetCode: string;
  problemSetTitle: string;
  opponentId: string;
  opponentName: string;
  selfScore: number;
  opponentScore: number;
  result: "win" | "lose" | "draw";
  createdAt: number;
};

const socketAuthById = new Map<string, SocketAuthState>();
const socketIdsByUserId = new Map<string, Set<string>>();
const userProfileById = new Map<string, { userId: string; userName: string }>();
const selectedSetByUserId = new Map<string, string>();
const onlineUsersBySet = new Map<string, Set<string>>();
const queuedSetByUserId = new Map<string, string>();
const queueBySetCode = new Map<string, string[]>();
const matchIdByUserId = new Map<string, string>();
const matchById = new Map<string, BrawlMatchState>();
const matchingSetLocks = new Set<string>();

let ioServer: Server | null = null;

function toSafeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeAnswerPayload(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  const set = new Set<number>();
  for (const item of value) {
    const parsed = Math.floor(toSafeNumber(item));
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    set.add(parsed);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function normalizeAnswerByType(type: SupportedQuestionType, value: unknown) {
  if (type === 2) {
    if (!Array.isArray(value)) return null;
    const normalized = normalizeAnswerPayload(value);
    return normalized.length > 0 ? normalized : null;
  }
  const parsed = Math.floor(toSafeNumber(value));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return [parsed];
}

function parseBrawlQuestion(raw: unknown, index: number): BrawlQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const typeRaw = Math.floor(toSafeNumber(row.type));
  if (typeRaw !== 1 && typeRaw !== 2 && typeRaw !== 4) return null;
  const type = typeRaw as SupportedQuestionType;
  const content = String(row.content ?? "").trim();
  if (!content) return null;
  const answer = normalizeAnswerByType(type, row.answer);
  if (!answer) return null;
  const rawChoices = Array.isArray(row.choices)
    ? row.choices.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const choices =
    type === 4
      ? rawChoices.length >= 2
        ? [rawChoices[0] as string, rawChoices[1] as string]
        : ["正确", "错误"]
      : rawChoices;
  if (!choices.length) return null;
  return {
    id: `brawl-question-${index + 1}`,
    type,
    content,
    choices,
    answer,
  };
}

function evaluateAnswer(question: BrawlQuestion, answers: number[]) {
  if (question.type === 2) {
    if (answers.length !== question.answer.length) return false;
    for (let index = 0; index < question.answer.length; index += 1) {
      if (question.answer[index] !== answers[index]) return false;
    }
    return true;
  }
  return answers.length === 1 && answers[0] === question.answer[0];
}

function getOpponent(match: BrawlMatchState, userId: string) {
  return match.players[0].userId === userId ? match.players[1] : match.players[0];
}

function getPlayer(match: BrawlMatchState, userId: string) {
  return match.players.find((item) => item.userId === userId) ?? null;
}

function areAllPlayersConnected(match: BrawlMatchState) {
  return match.players.every((player) => player.connected);
}

function clearPlayerDisconnectTimer(player: BrawlPlayer) {
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
}

function buildLobbySnapshot() {
  const onlineCounts: Record<string, number> = {};
  for (const [code, users] of onlineUsersBySet.entries()) {
    if (users.size > 0) {
      onlineCounts[code] = users.size;
    }
  }
  const queueCounts: Record<string, number> = {};
  for (const [code, queue] of queueBySetCode.entries()) {
    if (queue.length > 0) {
      queueCounts[code] = queue.length;
    }
  }
  return { onlineCounts, queueCounts };
}

function broadcastLobbySnapshot() {
  ioServer?.emit("brawl:lobby-state", buildLobbySnapshot());
}

function emitToUser(userId: string, event: string, payload: Record<string, unknown>) {
  const socketIds = socketIdsByUserId.get(userId);
  if (!socketIds || socketIds.size === 0) return;
  for (const socketId of socketIds) {
    ioServer?.to(socketId).emit(event, payload);
  }
}

function emitQueueStatus(userId: string) {
  const setCode = queuedSetByUserId.get(userId) ?? null;
  const queue = setCode ? queueBySetCode.get(setCode) ?? [] : [];
  const position = setCode ? queue.findIndex((item) => item === userId) + 1 : 0;
  emitToUser(userId, "brawl:queue-status", {
    queued: Boolean(setCode),
    setCode,
    position: position > 0 ? position : null,
  });
}

function emitQueueStatusForSet(setCode: string) {
  const queue = queueBySetCode.get(setCode) ?? [];
  for (const userId of queue) {
    emitQueueStatus(userId);
  }
}

function addUserToOnlineSet(setCode: string, userId: string) {
  const set = onlineUsersBySet.get(setCode) ?? new Set<string>();
  set.add(userId);
  onlineUsersBySet.set(setCode, set);
}

function removeUserFromOnlineSet(setCode: string, userId: string) {
  const set = onlineUsersBySet.get(setCode);
  if (!set) return;
  set.delete(userId);
  if (set.size === 0) {
    onlineUsersBySet.delete(setCode);
  }
}

function setSelectedProblemSet(userId: string, setCode: string | null) {
  const previous = selectedSetByUserId.get(userId);
  if (previous && previous !== setCode) {
    removeUserFromOnlineSet(previous, userId);
  }
  if (!setCode) {
    selectedSetByUserId.delete(userId);
    return;
  }
  selectedSetByUserId.set(userId, setCode);
  addUserToOnlineSet(setCode, userId);
}

function removeUserFromQueue(userId: string) {
  const setCode = queuedSetByUserId.get(userId);
  if (!setCode) return;
  queuedSetByUserId.delete(userId);
  const queue = queueBySetCode.get(setCode) ?? [];
  const next = queue.filter((item) => item !== userId);
  if (next.length > 0) {
    queueBySetCode.set(setCode, next);
  } else {
    queueBySetCode.delete(setCode);
  }
  emitQueueStatus(userId);
  emitQueueStatusForSet(setCode);
}

function enqueueUser(userId: string, setCode: string) {
  removeUserFromQueue(userId);
  const queue = queueBySetCode.get(setCode) ?? [];
  if (!queue.includes(userId)) {
    queue.push(userId);
  }
  queueBySetCode.set(setCode, queue);
  queuedSetByUserId.set(userId, setCode);
  emitQueueStatus(userId);
  emitQueueStatusForSet(setCode);
}

function normalizeQueue(setCode: string) {
  const queue = queueBySetCode.get(setCode) ?? [];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const userId of queue) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    const socketIds = socketIdsByUserId.get(userId);
    const selected = selectedSetByUserId.get(userId);
    if (!socketIds || socketIds.size === 0) continue;
    if (selected !== setCode) continue;
    if (matchIdByUserId.has(userId)) continue;
    next.push(userId);
  }
  if (next.length > 0) {
    queueBySetCode.set(setCode, next);
  } else {
    queueBySetCode.delete(setCode);
  }
  return next;
}

function serializeScores(match: BrawlMatchState) {
  return match.players.map((player) => ({
    userId: player.userId,
    userName: player.userName,
    score: player.score,
  }));
}

function serializeQuestion(question: BrawlQuestion) {
  return {
    id: question.id,
    type: question.type,
    content: question.content,
    choices: question.choices,
  };
}

function emitMatchEvent(
  match: BrawlMatchState,
  event: string,
  payload: Record<string, unknown>
) {
  for (const player of match.players) {
    emitToUser(player.userId, event, payload);
  }
}

function emitPlayerPresence(match: BrawlMatchState, player: BrawlPlayer) {
  emitMatchEvent(match, "brawl:player-presence", {
    matchId: match.id,
    userId: player.userId,
    connected: player.connected,
    disconnectDeadlineAt: player.disconnectDeadlineAt,
  });
}

function emitCurrentPresence(match: BrawlMatchState) {
  for (const player of match.players) {
    emitPlayerPresence(match, player);
  }
}

function pickRandomQuestion(match: BrawlMatchState) {
  if (match.questionPool.length === 0) return null;
  if (match.usedQuestionIndexes.size >= match.questionPool.length) {
    match.usedQuestionIndexes.clear();
  }
  const availableIndexes: number[] = [];
  for (let index = 0; index < match.questionPool.length; index += 1) {
    if (!match.usedQuestionIndexes.has(index)) {
      availableIndexes.push(index);
    }
  }
  if (!availableIndexes.length) return null;
  const pick = availableIndexes[Math.floor(Math.random() * availableIndexes.length)] as number;
  match.usedQuestionIndexes.add(pick);
  const question = match.questionPool[pick];
  if (!question) return null;
  return {
    ...question,
    choices: [...question.choices],
    answer: [...question.answer],
  };
}

async function loadBrawlQuestionPool(setCode: string) {
  const detail = await loadProblemSetDetail(setCode);
  if (!detail) return null;
  const rawProblems = Array.isArray(detail.problems) ? detail.problems : [];
  const questions = rawProblems
    .map((problem, index) => parseBrawlQuestion(problem, index))
    .filter((item): item is BrawlQuestion => Boolean(item));
  if (!questions.length) return null;
  return {
    title: detail.title,
    questions,
  };
}

function cleanupMatch(match: BrawlMatchState) {
  if (match.nextRoundTimer) {
    clearTimeout(match.nextRoundTimer);
    match.nextRoundTimer = null;
  }
  for (const player of match.players) {
    clearPlayerDisconnectTimer(player);
    player.disconnectDeadlineAt = null;
  }
  matchById.delete(match.id);
  for (const player of match.players) {
    matchIdByUserId.delete(player.userId);
  }
}

async function createBrawlRecord(match: BrawlMatchState, winnerUserId: string | null) {
  const [player1, player2] = match.players;
  const winner =
    winnerUserId && player1.userId === winnerUserId
      ? player1
      : winnerUserId && player2.userId === winnerUserId
      ? player2
      : null;
  await db.insert(brawlRecords).values({
    problemSetCode: match.problemSetCode,
    problemSetTitle: match.problemSetTitle,
    player1Id: player1.userId,
    player1Name: player1.userName,
    player2Id: player2.userId,
    player2Name: player2.userName,
    score1: player1.score,
    score2: player2.score,
    winnerId: winner?.userId ?? null,
    winnerName: winner?.userName ?? null,
    createdAt: Date.now(),
  });
}

function finishMatch(
  matchId: string,
  winnerUserId: string | null,
  reason: "score-target" | "opponent-left" | "disconnect-timeout" | "system"
) {
  const match = matchById.get(matchId);
  if (!match || match.finished) return;
  match.finished = true;
  emitMatchEvent(match, "brawl:match-finished", {
    matchId: match.id,
    problemSetCode: match.problemSetCode,
    problemSetTitle: match.problemSetTitle,
    targetScore: TARGET_SCORE,
    reason,
    winnerUserId,
    winnerName: winnerUserId ? getPlayer(match, winnerUserId)?.userName ?? null : null,
    scores: serializeScores(match),
  });
  void createBrawlRecord(match, winnerUserId).catch(() => null);
  cleanupMatch(match);
  broadcastLobbySnapshot();
}

function dispatchNextRound(matchId: string) {
  const match = matchById.get(matchId);
  if (!match || match.finished) return;
  if (!areAllPlayersConnected(match)) return;
  const question = pickRandomQuestion(match);
  if (!question) {
    finishMatch(match.id, null, "system");
    return;
  }
  match.roundIndex += 1;
  match.currentRound = {
    round: match.roundIndex,
    question,
    lockedByUserId: null,
    resolved: false,
  };
  emitMatchEvent(match, "brawl:new-question", {
    matchId: match.id,
    round: match.roundIndex,
    question: serializeQuestion(question),
    scores: serializeScores(match),
  });
}

async function isSelectableProblemSet(code: string) {
  const [row] = await db
    .select({ code: problemSets.code })
    .from(problemSets)
    .where(and(eq(problemSets.code, code), eq(problemSets.isPending, false)))
    .limit(1);
  return Boolean(row);
}

async function startMatch(setCode: string, userAId: string, userBId: string) {
  const userA = userProfileById.get(userAId);
  const userB = userProfileById.get(userBId);
  if (!userA || !userB) {
    return;
  }
  const loaded = await loadBrawlQuestionPool(setCode);
  if (!loaded) {
    emitToUser(userAId, "brawl:error", { message: "题库中没有可用于乱斗的题目。" });
    emitToUser(userBId, "brawl:error", { message: "题库中没有可用于乱斗的题目。" });
    return;
  }
  const match: BrawlMatchState = {
    id: crypto.randomUUID(),
    problemSetCode: setCode,
    problemSetTitle: loaded.title,
    players: [
      {
        userId: userA.userId,
        userName: userA.userName,
        score: 0,
        connected: true,
        disconnectDeadlineAt: null,
        disconnectTimer: null,
      },
      {
        userId: userB.userId,
        userName: userB.userName,
        score: 0,
        connected: true,
        disconnectDeadlineAt: null,
        disconnectTimer: null,
      },
    ],
    questionPool: loaded.questions,
    usedQuestionIndexes: new Set<number>(),
    roundIndex: 0,
    currentRound: null,
    finished: false,
    nextRoundTimer: null,
  };
  matchById.set(match.id, match);
  matchIdByUserId.set(userA.userId, match.id);
  matchIdByUserId.set(userB.userId, match.id);

  emitToUser(userA.userId, "brawl:match-found", {
    matchId: match.id,
    problemSetCode: setCode,
    problemSetTitle: loaded.title,
    targetScore: TARGET_SCORE,
    self: { userId: userA.userId, userName: userA.userName },
    opponent: { userId: userB.userId, userName: userB.userName },
    scores: serializeScores(match),
  });
  emitToUser(userB.userId, "brawl:match-found", {
    matchId: match.id,
    problemSetCode: setCode,
    problemSetTitle: loaded.title,
    targetScore: TARGET_SCORE,
    self: { userId: userB.userId, userName: userB.userName },
    opponent: { userId: userA.userId, userName: userA.userName },
    scores: serializeScores(match),
  });
  emitCurrentPresence(match);
  dispatchNextRound(match.id);
}

async function tryMatchForSet(setCode: string) {
  if (matchingSetLocks.has(setCode)) return;
  matchingSetLocks.add(setCode);
  try {
    // Keep matching while queue has enough users.
    while (true) {
      const queue = normalizeQueue(setCode);
      if (queue.length < 2) break;
      const userAId = queue.shift();
      const userBId = queue.shift();
      if (!userAId || !userBId) break;
      queueBySetCode.set(setCode, queue);
      queuedSetByUserId.delete(userAId);
      queuedSetByUserId.delete(userBId);
      emitQueueStatus(userAId);
      emitQueueStatus(userBId);
      emitQueueStatusForSet(setCode);
      await startMatch(setCode, userAId, userBId);
    }
  } finally {
    matchingSetLocks.delete(setCode);
    broadcastLobbySnapshot();
  }
}

function authorizeSocket(socket: Socket) {
  const cookieHeader =
    typeof socket.handshake.headers.cookie === "string"
      ? socket.handshake.headers.cookie
      : null;
  const cookies = parseCookies(cookieHeader);
  const token = cookies.vtix_session;
  if (!token) return null;
  const user = getSessionUserByToken(token);
  if (!user) return null;
  return {
    token,
    userId: user.id,
    userName: user.name,
  } as SocketAuthState;
}

function resolveSocketAuth(socket: Socket) {
  const state = socketAuthById.get(socket.id);
  if (!state) return null;
  const current = getSessionUserByToken(state.token);
  if (!current || current.id !== state.userId) {
    socket.emit("brawl:auth-required", { reason: "login-required" });
    socket.disconnect(true);
    return null;
  }
  return state;
}

function emitMatchResume(userId: string, match: BrawlMatchState) {
  const self = getPlayer(match, userId);
  if (!self) return;
  const opponent = getOpponent(match, userId);
  const round = match.currentRound;
  emitToUser(userId, "brawl:match-resume", {
    matchId: match.id,
    problemSetCode: match.problemSetCode,
    problemSetTitle: match.problemSetTitle,
    targetScore: TARGET_SCORE,
    self: { userId: self.userId, userName: self.userName },
    opponent: { userId: opponent.userId, userName: opponent.userName },
    scores: serializeScores(match),
    round: round?.round ?? match.roundIndex,
    question: round ? serializeQuestion(round.question) : null,
    roundResolved: round?.resolved ?? false,
    lockedByUserId: round?.lockedByUserId ?? null,
    players: match.players.map((player) => ({
      userId: player.userId,
      userName: player.userName,
      connected: player.connected,
      disconnectDeadlineAt: player.disconnectDeadlineAt,
    })),
    disconnectGraceMs: DISCONNECT_GRACE_MS,
  });
}

function handleUserBackOnline(userId: string) {
  const matchId = matchIdByUserId.get(userId);
  if (!matchId) return;
  const match = matchById.get(matchId);
  if (!match || match.finished) return;
  const player = getPlayer(match, userId);
  if (!player) return;
  if (!player.connected) {
    player.connected = true;
    player.disconnectDeadlineAt = null;
    clearPlayerDisconnectTimer(player);
    emitPlayerPresence(match, player);
  }
  emitMatchResume(userId, match);
  const round = match.currentRound;
  if (!match.nextRoundTimer && (!round || round.resolved) && areAllPlayersConnected(match)) {
    dispatchNextRound(match.id);
  }
}

function handleUserOffline(userId: string) {
  removeUserFromQueue(userId);
  const selectedSet = selectedSetByUserId.get(userId);
  if (selectedSet) {
    setSelectedProblemSet(userId, null);
  }
  const matchId = matchIdByUserId.get(userId);
  if (!matchId) return;
  const match = matchById.get(matchId);
  if (!match || match.finished) return;
  const player = getPlayer(match, userId);
  if (!player) return;
  if (!player.connected && player.disconnectDeadlineAt) return;
  player.connected = false;
  player.disconnectDeadlineAt = Date.now() + DISCONNECT_GRACE_MS;
  clearPlayerDisconnectTimer(player);
  emitPlayerPresence(match, player);
  player.disconnectTimer = setTimeout(() => {
    const currentMatch = matchById.get(match.id);
    if (!currentMatch || currentMatch.finished) return;
    const currentPlayer = getPlayer(currentMatch, userId);
    if (!currentPlayer || currentPlayer.connected) return;
    const opponent = getOpponent(currentMatch, userId);
    opponent.score = Math.max(opponent.score, TARGET_SCORE);
    finishMatch(currentMatch.id, opponent.userId, "disconnect-timeout");
  }, DISCONNECT_GRACE_MS);
}

function handleSocketDisconnect(socketId: string) {
  const state = socketAuthById.get(socketId);
  socketAuthById.delete(socketId);
  if (!state) return;
  const socketIds = socketIdsByUserId.get(state.userId);
  if (!socketIds) return;
  socketIds.delete(socketId);
  if (socketIds.size > 0) return;
  socketIdsByUserId.delete(state.userId);
  userProfileById.delete(state.userId);
  handleUserOffline(state.userId);
  broadcastLobbySnapshot();
}

function handleSubmitAnswer(socket: Socket, payload: unknown) {
  const auth = resolveSocketAuth(socket);
  if (!auth) return;
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const clientMatchId =
    typeof row.matchId === "string" ? row.matchId.trim() : "";
  const matchId = matchIdByUserId.get(auth.userId);
  if (!matchId) {
    socket.emit("brawl:error", { message: "当前不在对局中。" });
    return;
  }
  if (clientMatchId && clientMatchId !== matchId) {
    socket.emit("brawl:error", { message: "对局信息已失效，请刷新页面。" });
    return;
  }
  const match = matchById.get(matchId);
  if (!match || match.finished) return;
  if (!areAllPlayersConnected(match)) {
    socket.emit("brawl:error", { message: "对手掉线中，当前回合已暂停。" });
    return;
  }
  const round = match.currentRound;
  if (!round || round.resolved) return;
  if (round.lockedByUserId && round.lockedByUserId !== auth.userId) {
    socket.emit("brawl:round-locked", {
      matchId: match.id,
      round: round.round,
      lockedByUserId: round.lockedByUserId,
    });
    return;
  }
  if (round.lockedByUserId === auth.userId) return;

  round.lockedByUserId = auth.userId;
  emitMatchEvent(match, "brawl:round-locked", {
    matchId: match.id,
    round: round.round,
    lockedByUserId: auth.userId,
  });

  const player = getPlayer(match, auth.userId);
  if (!player) return;
  const opponent = getOpponent(match, auth.userId);
  const answers = normalizeAnswerPayload(row.answers);
  const passed = evaluateAnswer(round.question, answers);
  const scorer = passed ? player : opponent;
  scorer.score += 1;
  round.resolved = true;

  emitMatchEvent(match, "brawl:round-result", {
    matchId: match.id,
    round: round.round,
    submittedByUserId: auth.userId,
    passed,
    scoredUserId: scorer.userId,
    scores: serializeScores(match),
    correctAnswer: round.question.answer,
  });

  const winner =
    match.players.find((item) => item.score >= TARGET_SCORE) ?? null;
  if (winner) {
    finishMatch(match.id, winner.userId, "score-target");
    return;
  }
  if (match.nextRoundTimer) {
    clearTimeout(match.nextRoundTimer);
  }
  match.nextRoundTimer = setTimeout(() => {
    match.nextRoundTimer = null;
    dispatchNextRound(match.id);
  }, NEXT_ROUND_DELAY_MS);
}

export function initializeBrawlSocketServer(io: Server) {
  ioServer = io;
  io.on("connection", (socket) => {
    const auth = authorizeSocket(socket);
    if (!auth) {
      socket.emit("brawl:auth-required", { reason: "login-required" });
      socket.disconnect(true);
      return;
    }

    socketAuthById.set(socket.id, auth);
    const socketIds = socketIdsByUserId.get(auth.userId) ?? new Set<string>();
    socketIds.add(socket.id);
    socketIdsByUserId.set(auth.userId, socketIds);
    userProfileById.set(auth.userId, {
      userId: auth.userId,
      userName: auth.userName,
    });
    handleUserBackOnline(auth.userId);

    const selectedSet = selectedSetByUserId.get(auth.userId);
    if (selectedSet) {
      addUserToOnlineSet(selectedSet, auth.userId);
    }

    socket.emit("brawl:connected", {
      userId: auth.userId,
      userName: auth.userName,
      targetScore: TARGET_SCORE,
    });
    socket.emit("brawl:selected-set", {
      setCode: selectedSetByUserId.get(auth.userId) ?? null,
    });
    emitQueueStatus(auth.userId);
    socket.emit("brawl:lobby-state", buildLobbySnapshot());

    socket.on(
      "brawl:latency-probe",
      (_payload: unknown, ack?: () => void) => {
        if (!resolveSocketAuth(socket)) return;
        if (typeof ack === "function") {
          ack();
        }
      }
    );

    socket.on("brawl:lobby-chat-send", (payload: unknown) => {
      const current = resolveSocketAuth(socket);
      if (!current) return;
      const row =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {};
      const text = String(row.message ?? row.text ?? "").trim().slice(0, 256);
      if (!text) return;
      const setCodeRaw = String(row.setId ?? row.setCode ?? "")
        .trim()
        .slice(0, 256);
      const setTitleRaw = String(row.setTitle ?? "")
        .trim()
        .slice(0, 256);
      const userNameRaw = String(row.userName ?? "").trim();
      ioServer?.emit("brawl:lobby-chat", {
        id: crypto.randomUUID(),
        userId: current.userId,
        userName: userNameRaw || current.userName,
        text,
        setCode: setCodeRaw || null,
        setTitle: setTitleRaw || null,
        sentAt: Date.now(),
      });
    });

    socket.on("brawl:select-set", async (payload: unknown) => {
      const current = resolveSocketAuth(socket);
      if (!current) return;
      if (matchIdByUserId.has(current.userId)) {
        socket.emit("brawl:error", { message: "对局中不能切换题库。" });
        return;
      }
      const row =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const nextCode = typeof row.code === "string" ? row.code.trim() : "";
      if (!nextCode) {
        removeUserFromQueue(current.userId);
        setSelectedProblemSet(current.userId, null);
        emitToUser(current.userId, "brawl:selected-set", { setCode: null });
        broadcastLobbySnapshot();
        return;
      }
      const exists = await isSelectableProblemSet(nextCode);
      if (!exists) {
        socket.emit("brawl:error", { message: "题库不存在或不可用。" });
        return;
      }
      removeUserFromQueue(current.userId);
      setSelectedProblemSet(current.userId, nextCode);
      emitToUser(current.userId, "brawl:selected-set", { setCode: nextCode });
      broadcastLobbySnapshot();
    });

    socket.on("brawl:start-match", async () => {
      const current = resolveSocketAuth(socket);
      if (!current) return;
      if (matchIdByUserId.has(current.userId)) {
        socket.emit("brawl:error", { message: "你已在对局中。" });
        return;
      }
      const selected = selectedSetByUserId.get(current.userId);
      if (!selected) {
        socket.emit("brawl:error", { message: "请先选择题库。" });
        return;
      }
      const exists = await isSelectableProblemSet(selected);
      if (!exists) {
        socket.emit("brawl:error", { message: "题库不存在或不可用。" });
        return;
      }
      enqueueUser(current.userId, selected);
      broadcastLobbySnapshot();
      await tryMatchForSet(selected);
    });

    socket.on("brawl:cancel-match", () => {
      const current = resolveSocketAuth(socket);
      if (!current) return;
      removeUserFromQueue(current.userId);
      broadcastLobbySnapshot();
    });

    socket.on("brawl:submit-answer", (payload: unknown) => {
      handleSubmitAnswer(socket, payload);
    });

    socket.on("disconnect", () => {
      handleSocketDisconnect(socket.id);
    });
  });
}

export function getBrawlOnlineCount(problemSetCode: string) {
  return onlineUsersBySet.get(problemSetCode)?.size ?? 0;
}

export async function loadBrawlProblemSetPage(options?: BrawlProblemSetPageOptions) {
  const page = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  const offset = (page - 1) * pageSize;
  const keyword = String(options?.keyword ?? "").trim();
  const conditions: any[] = [eq(problemSets.isPending, false)];

  if (keyword) {
    const likeValue = `%${keyword}%`;
    const matcher = [
      like(problemSets.title, likeValue),
      like(problemSets.code, likeValue),
      like(problemSets.creatorName, likeValue),
    ];
    const maybeYear = Math.floor(toSafeNumber(keyword));
    if (Number.isFinite(maybeYear)) {
      matcher.push(eq(problemSets.year, maybeYear));
    }
    conditions.push(or(...matcher));
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(problemSets)
    .where(whereClause);
  const total = Number(countRow?.count ?? 0);

  const rows = (await db
    .select({
      code: problemSets.code,
      title: problemSets.title,
      year: problemSets.year,
      creatorName: problemSets.creatorName,
      isPublic: problemSets.isPublic,
      questionCount: problemSets.questionCount,
      recommendedRank: problemSets.recommendedRank,
      updatedAt: problemSets.updatedAt,
      createdAt: problemSets.createdAt,
    })
    .from(problemSets)
    .where(whereClause)
    .orderBy(
      desc(problemSets.isPublic),
      asc(sql`(${problemSets.recommendedRank} IS NULL)`),
      asc(problemSets.recommendedRank),
      desc(problemSets.updatedAt),
      desc(problemSets.createdAt),
      asc(problemSets.title)
    )
    .limit(pageSize)
    .offset(offset)) as Array<{
    code: string;
    title: string;
    year: number;
    creatorName: string;
    isPublic: boolean;
    questionCount: number;
    recommendedRank: number | null;
    updatedAt: number;
    createdAt: number;
  }>;

  const items: BrawlProblemSetItem[] = rows.map((row) => ({
    code: row.code,
    title: row.title,
    year: Number(row.year ?? 0),
    creatorName: row.creatorName,
    isPublic: Boolean(row.isPublic),
    questionCount: Number(row.questionCount ?? 0),
    onlineCount: getBrawlOnlineCount(row.code),
  }));

  return { items, total };
}

async function resolveBrawlUser(userName: string) {
  const normalized = String(userName ?? "").trim();
  if (!normalized) return null;
  const [row] = (await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.name, normalized))
    .limit(1)) as Array<{ id: number; name: string }>;
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
  };
}

export async function loadBrawlUserSpace(options: BrawlUserSpaceOptions) {
  const user = await resolveBrawlUser(options.userName);
  if (!user) return null;

  const page = normalizePage(options.page);
  const pageSize = normalizePageSize(options.pageSize);
  const offset = (page - 1) * pageSize;

  const whereClause = or(
    eq(brawlRecords.player1Id, user.id),
    eq(brawlRecords.player2Id, user.id)
  );

  const [summaryRow] = (await db
    .select({
      totalMatches: sql<number>`COUNT(*)`,
      wins: sql<number>`COALESCE(SUM(CASE WHEN ${brawlRecords.winnerId} = ${user.id} THEN 1 ELSE 0 END), 0)`,
      draws: sql<number>`COALESCE(SUM(CASE WHEN ${brawlRecords.winnerId} IS NULL THEN 1 ELSE 0 END), 0)`,
    })
    .from(brawlRecords)
    .where(whereClause)) as Array<{
    totalMatches: number | null;
    wins: number | null;
    draws: number | null;
  }>;

  const totalMatches = Number(summaryRow?.totalMatches ?? 0);
  const wins = Number(summaryRow?.wins ?? 0);
  const draws = Number(summaryRow?.draws ?? 0);
  const losses = Math.max(0, totalMatches - wins - draws);
  const winRate = totalMatches > 0 ? Number(((wins / totalMatches) * 100).toFixed(1)) : 0;

  const rows = (await db
    .select({
      id: brawlRecords.id,
      problemSetCode: brawlRecords.problemSetCode,
      problemSetTitle: brawlRecords.problemSetTitle,
      player1Id: brawlRecords.player1Id,
      player1Name: brawlRecords.player1Name,
      player2Id: brawlRecords.player2Id,
      player2Name: brawlRecords.player2Name,
      score1: brawlRecords.score1,
      score2: brawlRecords.score2,
      winnerId: brawlRecords.winnerId,
      createdAt: brawlRecords.createdAt,
    })
    .from(brawlRecords)
    .where(whereClause)
    .orderBy(desc(brawlRecords.createdAt), desc(brawlRecords.id))
    .limit(pageSize)
    .offset(offset)) as Array<{
    id: number;
    problemSetCode: string;
    problemSetTitle: string;
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    score1: number;
    score2: number;
    winnerId: string | null;
    createdAt: number;
  }>;

  const records: BrawlUserRecordItem[] = rows.map((row) => {
    const selfIsPlayer1 = row.player1Id === user.id;
    const selfScore = Number(selfIsPlayer1 ? row.score1 : row.score2);
    const opponentScore = Number(selfIsPlayer1 ? row.score2 : row.score1);
    const opponentId = selfIsPlayer1 ? row.player2Id : row.player1Id;
    const opponentName = selfIsPlayer1 ? row.player2Name : row.player1Name;
    const result: "win" | "lose" | "draw" = row.winnerId
      ? row.winnerId === user.id
        ? "win"
        : "lose"
      : "draw";
    return {
      id: Number(row.id ?? 0),
      problemSetCode: row.problemSetCode,
      problemSetTitle: row.problemSetTitle,
      opponentId,
      opponentName,
      selfScore,
      opponentScore,
      result,
      createdAt: Number(row.createdAt ?? 0),
    };
  });

  const summary: BrawlUserSummary = {
    totalMatches,
    wins,
    losses,
    draws,
    winRate,
  };

  return {
    userId: user.id,
    userName: user.name,
    summary,
    records,
    total: totalMatches,
    page,
    pageSize,
  };
}
