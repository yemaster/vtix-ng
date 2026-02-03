import { randomBytes } from "crypto";
import { Elysia } from "elysia";
import {
  createProblemSet,
  deleteProblemSet,
  loadProblemSetDetail,
  loadProblemSetList,
  updateProblemSetFlags,
  updateProblemSetRecommended,
} from "../../services/problemSets";
import { PERMISSIONS, hasPermission } from "../../utils/permissions";
import { getSessionUser } from "../../utils/session";
import { normalizeProblems } from "../problemSets/normalize";

function generateUniqueCode(existing: Set<string>) {
  let code = "";
  do {
    code = randomBytes(16).toString("hex");
  } while (existing.has(code));
  existing.add(code);
  return code;
}

export const registerAdminProblemSetRoutes = (app: Elysia) =>
  app
    .get("/api/admin/problem-sets", async ({ request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
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
      return loadProblemSetList(
        canManageAll ? undefined : { onlyCreatorId: user.id }
      );
    })
    .get("/api/admin/problem-sets/export", async ({ request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const canManageAll = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_ALL
      );
      if (!canManageAll) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const list = await loadProblemSetList();
      const items = [];
      for (const item of list) {
        const detail = await loadProblemSetDetail(item.code);
        if (detail) {
          items.push(detail);
        }
      }
      const exportedAt = new Date().toISOString();
      set.headers["content-type"] = "application/json";
      set.headers["content-disposition"] =
        `attachment; filename="vtix-problem-sets-${exportedAt.slice(0, 10)}.json"`;
      return {
        version: 1,
        exportedAt,
        items,
      };
    })
    .post("/api/admin/problem-sets/export", async ({ request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const canManageAll = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_ALL
      );
      if (!canManageAll) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const payload = (body ?? {}) as { codes?: unknown };
      const codes = Array.isArray(payload.codes)
        ? payload.codes.map((code) => String(code)).filter(Boolean)
        : [];
      if (!codes.length) {
        set.status = 400;
        return { error: "No codes to export." };
      }
      const uniqueCodes = Array.from(new Set(codes));
      const items = [];
      const missing: string[] = [];
      for (const code of uniqueCodes) {
        const detail = await loadProblemSetDetail(code);
        if (detail) {
          items.push(detail);
        } else {
          missing.push(code);
        }
      }
      const exportedAt = new Date().toISOString();
      set.headers["content-type"] = "application/json";
      set.headers["content-disposition"] =
        `attachment; filename="vtix-problem-sets-selected-${exportedAt.slice(0, 10)}.json"`;
      return {
        version: 1,
        exportedAt,
        items,
        missing,
      };
    })
    .post("/api/admin/problem-sets/import", async ({ request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const canManageAll = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_ALL
      );
      if (!canManageAll) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const payload = (body ?? {}) as {
        items?: unknown;
        problemSets?: unknown;
      };
      const rawItems = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.items)
          ? payload.items
          : Array.isArray(payload.problemSets)
            ? payload.problemSets
            : [];
      if (!rawItems.length) {
        set.status = 400;
        return { error: "No items to import." };
      }
      const existingCodes = new Set(
        (await loadProblemSetList()).map((item) => item.code)
      );
      let imported = 0;
      let skipped = 0;
      const errors: Array<{ index: number; reason: string }> = [];

      for (let index = 0; index < rawItems.length; index += 1) {
        const raw = rawItems[index] as Record<string, unknown> | null;
        if (!raw || typeof raw !== "object") {
          skipped += 1;
          errors.push({ index, reason: "Invalid item." });
          continue;
        }
        const title = String(raw.title ?? "").trim();
        if (!title) {
          skipped += 1;
          errors.push({ index, reason: "Title required." });
          continue;
        }
        const { list: problems } = normalizeProblems(raw.problems);
        if (!problems.length) {
          skipped += 1;
          errors.push({ index, reason: "Empty problems." });
          continue;
        }
        const yearValue = Number(raw.year ?? new Date().getFullYear());
        const year = Number.isFinite(yearValue)
          ? yearValue
          : new Date().getFullYear();
        const categories = Array.isArray(raw.categories)
          ? raw.categories.map((item) => String(item)).filter(Boolean)
          : [];
        const isNew = Boolean(raw.isNew);
        const recommendedRank = Number.isFinite(Number(raw.recommendedRank))
          ? Number(raw.recommendedRank)
          : null;
        const isPublic = Boolean(raw.isPublic);
        const inviteCode = isPublic
          ? null
          : raw.inviteCode
            ? String(raw.inviteCode).trim() || null
            : null;
        const rawCode = typeof raw.code === "string" ? raw.code.trim() : "";
        let code = rawCode;
        if (!code || existingCodes.has(code)) {
          code = generateUniqueCode(existingCodes);
        } else {
          existingCodes.add(code);
        }
        const creatorId = String(raw.creatorId ?? user.id);
        const creatorName = String(raw.creatorName ?? user.name ?? user.id);
        const test = Array.isArray(raw.test) ? raw.test : [];

        try {
          await createProblemSet({
            id: code,
            code,
            title,
            year,
            categories,
            isNew,
            recommendedRank,
            questionCount: problems.length,
            creatorId,
            creatorName,
            isPublic,
            inviteCode,
            test,
            problems,
          });
          imported += 1;
        } catch (error) {
          skipped += 1;
          errors.push({
            index,
            reason: error instanceof Error ? error.message : "Import failed.",
          });
        }
      }

      return {
        imported,
        skipped,
        errors: errors.slice(0, 50),
      };
    })
    .post(
      "/api/admin/problem-sets/batch-delete",
      async ({ request, body, set }) => {
        const user = getSessionUser(request);
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
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
        const payload = (body ?? {}) as { codes?: unknown };
        const codes = Array.isArray(payload.codes)
          ? payload.codes.map((code) => String(code)).filter(Boolean)
          : [];
        if (!codes.length) {
          set.status = 400;
          return { error: "No codes to delete." };
        }
        const uniqueCodes = Array.from(new Set(codes));
        const allowed = canManageAll
          ? null
          : new Set(
              (await loadProblemSetList({ onlyCreatorId: user.id })).map(
                (item) => item.code
              )
            );
        let deleted = 0;
        let skipped = 0;
        const forbidden: string[] = [];
        const missing: string[] = [];
        for (const code of uniqueCodes) {
          if (allowed && !allowed.has(code)) {
            skipped += 1;
            forbidden.push(code);
            continue;
          }
          const ok = await deleteProblemSet(code);
          if (ok) {
            deleted += 1;
          } else {
            skipped += 1;
            missing.push(code);
          }
        }
        return {
          deleted,
          skipped,
          forbidden,
          missing,
        };
      }
    )
    .post(
      "/api/admin/problem-sets/batch-update",
      async ({ request, body, set }) => {
        const user = getSessionUser(request);
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        const canManageAll = hasPermission(
          user.permissions,
          PERMISSIONS.MANAGE_QUESTION_BANK_ALL
        );
        if (!canManageAll) {
          set.status = 403;
          return { error: "Forbidden" };
        }
        const payload = (body ?? {}) as {
          codes?: unknown;
          action?: string;
        };
        const codes = Array.isArray(payload.codes)
          ? payload.codes.map((code) => String(code)).filter(Boolean)
          : [];
        if (!codes.length) {
          set.status = 400;
          return { error: "No codes to update." };
        }
        const action = String(payload.action ?? "");
        const allowed = new Set([
          "public",
          "private",
          "new",
          "not_new",
          "recommend",
          "unrecommend",
        ]);
        if (!allowed.has(action)) {
          set.status = 400;
          return { error: "Invalid action." };
        }
        const uniqueCodes = Array.from(new Set(codes));
        const list = await loadProblemSetList();
        const map = new Map(list.map((item) => [item.code, item]));
        let updated = 0;
        let skipped = 0;
        const missing: string[] = [];

        if (action === "public" || action === "private") {
          const isPublic = action === "public";
          for (const code of uniqueCodes) {
            if (!map.has(code)) {
              missing.push(code);
              continue;
            }
            await updateProblemSetFlags(code, { isPublic });
            updated += 1;
          }
          return { updated, skipped, missing };
        }

        if (action === "new" || action === "not_new") {
          const isNew = action === "new";
          for (const code of uniqueCodes) {
            if (!map.has(code)) {
              missing.push(code);
              continue;
            }
            await updateProblemSetFlags(code, { isNew });
            updated += 1;
          }
          return { updated, skipped, missing };
        }

        let maxRank = list.reduce((max, item) => {
          const rank = item.recommendedRank ?? 0;
          return rank > max ? rank : max;
        }, 0);

        if (action === "recommend") {
          for (const code of uniqueCodes) {
            const item = map.get(code);
            if (!item) {
              missing.push(code);
              continue;
            }
            if (item.recommendedRank !== null) {
              skipped += 1;
              continue;
            }
            maxRank += 1;
            await updateProblemSetRecommended(code, maxRank);
            updated += 1;
          }
          return { updated, skipped, missing };
        }

        if (action === "unrecommend") {
          for (const code of uniqueCodes) {
            const item = map.get(code);
            if (!item) {
              missing.push(code);
              continue;
            }
            if (item.recommendedRank === null) {
              skipped += 1;
              continue;
            }
            await updateProblemSetRecommended(code, null);
            updated += 1;
          }
          return { updated, skipped, missing };
        }

        return { updated, skipped, missing };
      }
    )
    .put(
      "/api/admin/problem-sets/:code/recommended",
      async ({ params, request, body, set }) => {
        const user = getSessionUser(request);
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
        const canManageAll = hasPermission(
          user.permissions,
          PERMISSIONS.MANAGE_QUESTION_BANK_ALL
        );
        if (!canManageAll) {
          set.status = 403;
          return { error: "Forbidden" };
        }
        const payload = (body ?? {}) as { recommendedRank?: number | null };
        const raw = payload.recommendedRank;
        let recommendedRank: number | null = null;
        if (raw !== null && raw !== undefined && raw !== "") {
          const parsed = Number(raw);
          if (!Number.isFinite(parsed) || parsed < 0) {
            set.status = 400;
            return { error: "Invalid recommended rank." };
          }
          recommendedRank = parsed;
        }
        const ok = await updateProblemSetRecommended(
          params.code,
          recommendedRank
        );
        if (!ok) {
          set.status = 404;
          return { error: "Not Found" };
        }
        return { ok: true, recommendedRank };
      }
    )
    .put("/api/admin/problem-sets/:code/flags", async ({ params, request, body, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
      const canManageAll = hasPermission(
        user.permissions,
        PERMISSIONS.MANAGE_QUESTION_BANK_ALL
      );
      if (!canManageAll) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const payload = (body ?? {}) as { isNew?: boolean; isPublic?: boolean };
      const nextIsNew =
        typeof payload.isNew === "boolean" ? payload.isNew : undefined;
      const nextIsPublic =
        typeof payload.isPublic === "boolean" ? payload.isPublic : undefined;
      const ok = await updateProblemSetFlags(params.code, {
        isNew: nextIsNew,
        isPublic: nextIsPublic,
      });
      if (!ok) {
        set.status = 404;
        return { error: "Not Found" };
      }
      return { ok: true, isNew: nextIsNew, isPublic: nextIsPublic };
    })
    .delete("/api/admin/problem-sets/:code", async ({ params, request, set }) => {
      const user = getSessionUser(request);
      if (!user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }
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
      if (!canManageAll) {
        const detail = await loadProblemSetList({ onlyCreatorId: user.id });
        if (!detail.find((item) => item.code === params.code)) {
          set.status = 403;
          return { error: "Forbidden" };
        }
      }
      const ok = await deleteProblemSet(params.code);
      if (!ok) {
        set.status = 404;
        return { error: "Not Found" };
      }
      return { ok: true };
    });
