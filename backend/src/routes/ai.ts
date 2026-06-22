import { Elysia } from "elysia";
import {
  AiConfigurationError,
  streamProblemExplanation,
  type ProblemExplanationInput,
} from "../services/ai";
import { getSessionUser } from "../utils/session";

export const registerAiRoutes = (app: Elysia) =>
  app.post("/api/ai/problem-explanation", async ({ request, body, set }) => {
    const user = getSessionUser(request);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const encoder = new TextEncoder();
    const payload = {
      ...(body ?? {}),
      userId: Number(user.id),
    } as ProblemExplanationInput;

    function serialize(event: string, data: Record<string, unknown>) {
      return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    return new Response(
      new ReadableStream({
        async start(controller) {
          const send = (event: string, data: Record<string, unknown>) => {
            controller.enqueue(serialize(event, data));
          };
          try {
            const result = await streamProblemExplanation(payload, {
              onToken: (delta) => send("token", { delta }),
              onModel: (model) => send("model", { model }),
            });
            if ("error" in result) {
              send("error", { error: result.error, status: 400 });
              return;
            }
            send("done", {
              explanation: result.explanation,
              model: result.model,
              usage: result.usage ?? null,
            });
          } catch (error) {
            send("error", {
              error:
                error instanceof Error && error.message.trim()
                  ? error.message.trim()
                  : "AI explanation failed",
              status: error instanceof AiConfigurationError ? 503 : 502,
            });
          } finally {
            controller.close();
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      }
    );
  });
