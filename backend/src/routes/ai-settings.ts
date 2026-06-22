import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db, userAiConfigs } from "../db";
import { appConfig } from "../config";
import { getSessionUser } from "../utils/session";
import {
  AiConfigurationError,
  inferAiProtocol,
  listAvailableAiModels,
  normalizeAiProtocol,
  type AiProtocol,
} from "../services/ai";

const MAX_API_BASE_LENGTH = 1024;
const MAX_API_KEY_LENGTH = 512;
const MAX_MODEL_LENGTH = 128;
const MIN_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 120000;
const AI_MODEL_OPTIONS = [
  { label: "deepseek-v4-flash-ascend", value: "deepseek-v4-flash-ascend" },
];

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeTimeout(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) return null;
  return Math.min(Math.max(rounded, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

type AiSettingsRow = {
  aiApiBase: string | null;
  aiApiKey: string | null;
  aiProtocol: AiProtocol | null;
  aiModel: string | null;
  aiRequestTimeoutMs: number | null;
};

export const registerAiSettingsRoutes = (app: Elysia) =>
  app
    .get("/api/me/ai-settings", async ({ request, set }) => {
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

      const [row] = await db
        .select({
          aiApiBase: userAiConfigs.aiApiBase,
          aiApiKey: userAiConfigs.aiApiKey,
          aiProtocol: userAiConfigs.aiProtocol,
          aiModel: userAiConfigs.aiModel,
          aiRequestTimeoutMs: userAiConfigs.aiRequestTimeoutMs,
        })
        .from(userAiConfigs)
        .where(eq(userAiConfigs.userId, userId))
        .limit(1);

      const hasApiKey = Boolean(row?.aiApiKey && row.aiApiKey.trim());
      return {
        aiApiBase: row?.aiApiBase ?? "",
        aiProtocol:
          normalizeAiProtocol(row?.aiProtocol) ??
          inferAiProtocol(
            row?.aiApiBase || appConfig.aiApiBase,
            row?.aiModel || appConfig.aiModel
          ),
        aiModel: row?.aiModel ?? "",
        aiRequestTimeoutMs: row?.aiRequestTimeoutMs ?? null,
        hasApiKey,
        modelOptions: AI_MODEL_OPTIONS,
        defaults: {
          aiApiBase: appConfig.aiApiBase,
          aiProtocol: inferAiProtocol(appConfig.aiApiBase, appConfig.aiModel),
          aiModel: appConfig.aiModel,
          aiRequestTimeoutMs: appConfig.aiRequestTimeoutMs,
        },
      };
    })
    .put("/api/me/ai-settings", async ({ request, body, set }) => {
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

      const payload = (body ?? {}) as {
        aiApiBase?: unknown;
        aiApiKey?: unknown;
        aiProtocol?: unknown;
        aiModel?: unknown;
        aiRequestTimeoutMs?: unknown;
      };

      const nextApiBase = normalizeString(payload.aiApiBase, MAX_API_BASE_LENGTH);
      const nextApiKey = normalizeString(payload.aiApiKey, MAX_API_KEY_LENGTH);
      const nextProtocol = normalizeAiProtocol(payload.aiProtocol);
      const nextModel = normalizeString(payload.aiModel, MAX_MODEL_LENGTH);
      const nextTimeout = normalizeTimeout(payload.aiRequestTimeoutMs);

      const updates: Partial<AiSettingsRow> & { updatedAt: number } = {
        updatedAt: Date.now(),
      };

      if (payload.aiApiBase !== undefined) {
        updates.aiApiBase = nextApiBase || null;
      }
      // aiApiKey: undefined => keep existing; "" => clear; non-empty => overwrite
      if (payload.aiApiKey !== undefined) {
        updates.aiApiKey = nextApiKey || null;
      }
      if (payload.aiProtocol !== undefined) {
        updates.aiProtocol = nextProtocol;
      }
      if (payload.aiModel !== undefined) {
        updates.aiModel = nextModel || null;
      }
      if (payload.aiRequestTimeoutMs !== undefined) {
        updates.aiRequestTimeoutMs = nextTimeout;
      }

      const [existing] = await db
        .select({ userId: userAiConfigs.userId })
        .from(userAiConfigs)
        .where(eq(userAiConfigs.userId, userId))
        .limit(1);

      if (existing) {
        await db
          .update(userAiConfigs)
          .set(updates)
          .where(eq(userAiConfigs.userId, userId));
      } else {
        await db.insert(userAiConfigs).values({
          userId,
          aiApiBase: updates.aiApiBase ?? null,
          aiApiKey: updates.aiApiKey ?? null,
          aiProtocol: updates.aiProtocol ?? null,
          aiModel: updates.aiModel ?? null,
          aiRequestTimeoutMs: updates.aiRequestTimeoutMs ?? null,
          updatedAt: updates.updatedAt,
        });
      }

      const [row] = await db
        .select({
          aiApiBase: userAiConfigs.aiApiBase,
          aiApiKey: userAiConfigs.aiApiKey,
          aiProtocol: userAiConfigs.aiProtocol,
          aiModel: userAiConfigs.aiModel,
          aiRequestTimeoutMs: userAiConfigs.aiRequestTimeoutMs,
        })
        .from(userAiConfigs)
        .where(eq(userAiConfigs.userId, userId))
        .limit(1);

      return {
        aiApiBase: row?.aiApiBase ?? "",
        aiProtocol:
          normalizeAiProtocol(row?.aiProtocol) ??
          inferAiProtocol(
            row?.aiApiBase || appConfig.aiApiBase,
            row?.aiModel || appConfig.aiModel
          ),
        aiModel: row?.aiModel ?? "",
        aiRequestTimeoutMs: row?.aiRequestTimeoutMs ?? null,
        hasApiKey: Boolean(row?.aiApiKey && row.aiApiKey.trim()),
        modelOptions: AI_MODEL_OPTIONS,
      };
    })
    .post("/api/me/ai-models", async ({ request, body, set }) => {
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

      const payload = (body ?? {}) as {
        aiApiBase?: unknown;
        aiApiKey?: unknown;
        aiProtocol?: unknown;
        aiRequestTimeoutMs?: unknown;
      };

      try {
        return await listAvailableAiModels({
          userId,
          aiApiBase: payload.aiApiBase,
          aiApiKey: payload.aiApiKey,
          aiProtocol: payload.aiProtocol,
          aiRequestTimeoutMs: payload.aiRequestTimeoutMs,
        });
      } catch (error) {
        if (error instanceof AiConfigurationError) {
          set.status = 503;
          return { error: error.message };
        }
        set.status = 502;
        return {
          error:
            error instanceof Error
              ? error.message
              : "Failed to load AI models",
        };
      }
    });
