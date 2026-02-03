import { Elysia } from "elysia";
import { loadProblemSetList } from "../services/problemSets";

export const registerStatsRoutes = (app: Elysia) =>
  app.get("/api/stats", async () => {
    const sets = await loadProblemSetList({ onlyPublic: true });
    const totalSets = sets.length;
    const questionCount = sets.reduce((sum, item) => {
      const count = Number.isFinite(item.questionCount) ? item.questionCount : 0;
      return sum + count;
    }, 0);
    const recommendedCount = sets.filter(
      (item) => item.recommendedRank !== null
    ).length;

    return {
      totalSets,
      questionCount,
      recommendedCount,
    };
  });
