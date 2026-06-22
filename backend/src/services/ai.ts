import { db, userAiConfigs } from "../db";
import { appConfig } from "../config";
import { eq } from "drizzle-orm";

type AiProblem = {
  type?: unknown;
  content?: unknown;
  choices?: unknown;
  answer?: unknown;
  hint?: unknown;
};

export type ProblemExplanationInput = {
  testTitle?: unknown;
  questionIndex?: unknown;
  problem?: unknown;
  userAnswer?: unknown;
  userId?: number;
};

type ResolvedAiConfig = {
  aiApiBase: string;
  aiApiKey: string;
  aiProtocol: AiProtocol;
  aiModel: string;
  aiRequestTimeoutMs: number;
};

export type AiProtocol = "openai" | "anthropic";

export type AiModelOption = {
  label: string;
  value: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  model?: unknown;
  usage?: unknown;
  error?: {
    message?: unknown;
  };
};

type ChatCompletionStreamResponse = {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
    message?: {
      content?: unknown;
    };
  }>;
  model?: unknown;
  error?: {
    message?: unknown;
  };
};

type AnthropicMessageResponse = {
  content?: Array<{
    type?: unknown;
    text?: unknown;
  }>;
  model?: unknown;
  error?: {
    message?: unknown;
  };
};

type ModelsResponse = {
  data?: Array<{
    id?: unknown;
    name?: unknown;
    display_name?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
};

type PreparedProblemExplanationRequest = {
  config: ResolvedAiConfig;
  testTitle: string;
  questionIndex: number | null;
  problem: AiProblem;
  userAnswer: unknown;
};

export type ProblemExplanationStreamCallbacks = {
  onToken: (token: string) => void;
  onModel?: (model: string) => void;
};

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

async function resolveAiConfig(userId?: number): Promise<ResolvedAiConfig> {
  let userBase: string | null = null;
  let userKey: string | null = null;
  let userProtocol: AiProtocol | null = null;
  let userModel: string | null = null;
  let userTimeout: number | null = null;

  if (typeof userId === "number" && Number.isFinite(userId)) {
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
    if (row) {
      userBase = row.aiApiBase?.trim() ? row.aiApiBase.trim() : null;
      userKey = row.aiApiKey?.trim() ? row.aiApiKey.trim() : null;
      userProtocol = normalizeAiProtocol(row.aiProtocol);
      userModel = row.aiModel?.trim() ? row.aiModel.trim() : null;
      userTimeout =
        typeof row.aiRequestTimeoutMs === "number" &&
        Number.isFinite(row.aiRequestTimeoutMs)
          ? row.aiRequestTimeoutMs
          : null;
    }
  }

  const aiApiBase = userBase ?? appConfig.aiApiBase;
  const aiModel = userModel ?? appConfig.aiModel;
  return {
    aiApiBase,
    aiApiKey: userKey ?? appConfig.aiApiKey,
    aiProtocol: userProtocol ?? inferAiProtocol(aiApiBase, aiModel),
    aiModel,
    aiRequestTimeoutMs: userTimeout ?? appConfig.aiRequestTimeoutMs,
  };
}

function normalizeTimeout(value: number) {
  if (!Number.isFinite(value)) return 30000;
  return Math.min(Math.max(Math.floor(value), 5000), 120000);
}

export function normalizeAiProtocol(value: unknown): AiProtocol | null {
  if (value !== "openai" && value !== "anthropic") return null;
  return value;
}

export function inferAiProtocol(aiApiBase: string, aiModel: string): AiProtocol {
  const base = aiApiBase.toLowerCase();
  const model = aiModel.toLowerCase();
  if (base.includes("anthropic.com") || model.startsWith("claude-")) {
    return "anthropic";
  }
  return "openai";
}

function endpointFromConfig(config: ResolvedAiConfig, protocol: AiProtocol) {
  const base = config.aiApiBase.replace(/\/+$/, "");
  if (protocol === "anthropic") {
    return base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
  }
  return `${base}/chat/completions`;
}

function modelsEndpointFromConfig(config: ResolvedAiConfig, protocol: AiProtocol) {
  const base = config.aiApiBase.replace(/\/+$/, "");
  if (protocol === "anthropic") {
    return base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
  }
  return `${base}/models`;
}

function toProblem(value: unknown): AiProblem | null {
  if (!value || typeof value !== "object") return null;
  const problem = value as AiProblem;
  if (typeof problem.content !== "string" || !problem.content.trim()) {
    return null;
  }
  return problem;
}

function optionLabel(index: number) {
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[index] ?? String(index + 1);
}

function formatType(type: unknown) {
  if (type === 1) return "单选题";
  if (type === 2) return "多选题";
  if (type === 3) return "填空题";
  if (type === 4) return "判断题";
  return "题目";
}

function getChoices(problem: AiProblem) {
  return Array.isArray(problem.choices)
    ? problem.choices.map((item) => String(item ?? ""))
    : [];
}

function formatIndexedAnswer(problem: AiProblem, answer: unknown) {
  const choices = getChoices(problem);
  const formatOne = (value: unknown) => {
    if (typeof value !== "number" || !Number.isInteger(value)) return String(value ?? "");
    const label = optionLabel(value);
    const text = choices[value];
    return text ? `${label}. ${text}` : label;
  };
  if (Array.isArray(answer)) {
    return answer.map(formatOne).filter(Boolean).join("；") || "未作答";
  }
  return formatOne(answer) || "未作答";
}

function formatAnswer(problem: AiProblem, answer: unknown) {
  if (problem.type === 1 || problem.type === 2 || problem.type === 4) {
    return formatIndexedAnswer(problem, answer);
  }
  return String(answer ?? "").trim() || "未提供";
}

function formatProblem(problem: AiProblem) {
  const choices = getChoices(problem);
  const choiceText = choices.length
    ? choices.map((choice, index) => `${optionLabel(index)}. ${choice}`).join("\n")
    : "无选项";
  const hint =
    typeof problem.hint === "string" && problem.hint.trim()
      ? problem.hint.trim()
      : "无";
  return [
    `题型：${formatType(problem.type)}`,
    `题干：${String(problem.content ?? "").trim()}`,
    `选项：\n${choiceText}`,
    `标准答案：${formatAnswer(problem, problem.answer)}`,
    `题库原解析：${hint}`,
  ].join("\n");
}

function buildPrompt(input: {
  testTitle: string;
  questionIndex: number | null;
  problem: AiProblem;
  userAnswer: unknown;
}) {
  const userAnswerText = Array.isArray(input.userAnswer)
    ? formatAnswer(input.problem, input.userAnswer)
    : "未提交或未记录";
  const title = input.testTitle ? `题库：${input.testTitle}\n` : "";
  const index = input.questionIndex ? `题号：${input.questionIndex}\n` : "";
  return `${title}${index}${formatProblem(input.problem)}
用户作答：${userAnswerText}

请给出这道题的学习型解析。要求：
1. 先直接说明正确答案。
2. 解释正确答案为什么成立。
3. 如果用户作答错误，指出错因；如果用户未作答或作答正确，说明容易混淆的点。
4. 最后给一个简短记忆点。
5. 不要编造教材页码、出处或外部链接。`;
}

async function prepareProblemExplanationRequest(
  input: ProblemExplanationInput
): Promise<PreparedProblemExplanationRequest | { error: string }> {
  const problem = toProblem(input.problem);
  if (!problem) {
    return { error: "Invalid problem" };
  }

  const config = await resolveAiConfig(input.userId);

  if (!config.aiApiKey) {
    throw new AiConfigurationError("AI_API_KEY is not configured");
  }

  const testTitle =
    typeof input.testTitle === "string" ? input.testTitle.trim() : "";
  const questionIndex =
    typeof input.questionIndex === "number" && Number.isFinite(input.questionIndex)
      ? Math.max(1, Math.floor(input.questionIndex))
      : null;

  return {
    config,
    testTitle,
    questionIndex,
    problem,
    userAnswer: input.userAnswer,
  };
}

function buildRequestBody(
  request: PreparedProblemExplanationRequest,
  stream: boolean,
  protocol: AiProtocol
) {
  const system =
    "你是一个严谨的课程助教，擅长用中文解释选择题和填空题。回答要准确、简洁、面向复习。";
  const prompt = buildPrompt({
    testTitle: request.testTitle,
    questionIndex: request.questionIndex,
    problem: request.problem,
    userAnswer: request.userAnswer,
  });
  if (protocol === "anthropic") {
    return {
      model: request.config.aiModel,
      system,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 900,
      stream,
    };
  }
  return {
    model: request.config.aiModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 900,
    stream,
  };
}

async function readUpstreamError(response: Response) {
  const data = (await response.json().catch(() => null)) as
    | ChatCompletionResponse
    | AnthropicMessageResponse
    | null;
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message.trim();
  }
  return `AI request failed with status ${response.status}`;
}

function parseStreamChunk(raw: string): ChatCompletionStreamResponse | null {
  if (!raw || raw === "[DONE]") return null;
  try {
    return JSON.parse(raw) as ChatCompletionStreamResponse;
  } catch {
    return null;
  }
}

function extractStreamDelta(data: ChatCompletionStreamResponse) {
  const choice = data.choices?.[0];
  const delta = choice?.delta?.content ?? choice?.message?.content;
  return typeof delta === "string" ? delta : "";
}

function buildHeaders(
  config: ResolvedAiConfig,
  protocol: AiProtocol
): Record<string, string> {
  if (protocol === "anthropic") {
    return {
      "x-api-key": config.aiApiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
  }
  return {
    Authorization: `Bearer ${config.aiApiKey}`,
    "Content-Type": "application/json",
  };
}

function extractAnthropicText(data: AnthropicMessageResponse) {
  return (
    data.content
      ?.map((item) => (item.type === "text" && typeof item.text === "string" ? item.text : ""))
      .join("")
      .trim() ?? ""
  );
}

function parseStreamData(raw: string): any | null {
  if (!raw || raw === "[DONE]") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractStreamModel(data: any, protocol: AiProtocol) {
  if (protocol === "anthropic") {
    return typeof data?.message?.model === "string" ? data.message.model : "";
  }
  return typeof data?.model === "string" ? data.model : "";
}

function extractStreamToken(data: any, protocol: AiProtocol) {
  if (protocol === "anthropic") {
    if (data?.type === "content_block_delta" && typeof data?.delta?.text === "string") {
      return data.delta.text;
    }
    if (data?.type === "content_block_start" && typeof data?.content_block?.text === "string") {
      return data.content_block.text;
    }
    return "";
  }
  return extractStreamDelta(data as ChatCompletionStreamResponse);
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalTimeout(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? normalizeTimeout(value)
    : null;
}

function extractModelOptions(data: ModelsResponse): AiModelOption[] {
  const seen = new Set<string>();
  const options: AiModelOption[] = [];
  for (const item of data.data ?? []) {
    const value = typeof item.id === "string" ? item.id.trim() : "";
    if (!value || seen.has(value)) continue;
    const label =
      typeof item.display_name === "string" && item.display_name.trim()
        ? item.display_name.trim()
        : typeof item.name === "string" && item.name.trim()
          ? item.name.trim()
          : value;
    seen.add(value);
    options.push({ label, value });
  }
  return options;
}

export async function listAvailableAiModels(input: {
  userId?: number;
  aiApiBase?: unknown;
  aiApiKey?: unknown;
  aiProtocol?: unknown;
  aiRequestTimeoutMs?: unknown;
}) {
  const saved = await resolveAiConfig(input.userId);
  const hasApiBaseInput = input.aiApiBase !== undefined;
  const inputApiBase = normalizeOptionalString(input.aiApiBase);
  const aiApiBase = hasApiBaseInput
    ? inputApiBase ?? appConfig.aiApiBase
    : saved.aiApiBase;
  const aiApiKey =
    input.aiApiKey === undefined
      ? saved.aiApiKey
      : normalizeOptionalString(input.aiApiKey) ?? "";
  const inputProtocol = normalizeAiProtocol(input.aiProtocol);
  const aiProtocol = inputProtocol ?? (hasApiBaseInput ? inferAiProtocol(aiApiBase, saved.aiModel) : saved.aiProtocol);
  const aiRequestTimeoutMs =
    normalizeOptionalTimeout(input.aiRequestTimeoutMs) ?? saved.aiRequestTimeoutMs;
  const config: ResolvedAiConfig = {
    aiApiBase,
    aiApiKey,
    aiProtocol,
    aiModel: saved.aiModel,
    aiRequestTimeoutMs,
  };

  if (!config.aiApiKey) {
    throw new AiConfigurationError("AI_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    normalizeTimeout(config.aiRequestTimeoutMs)
  );
  try {
    const response = await fetch(modelsEndpointFromConfig(config, aiProtocol), {
      method: "GET",
      headers: buildHeaders(config, aiProtocol),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(await readUpstreamError(response));
    }
    const data = (await response.json().catch(() => ({}))) as ModelsResponse;
    const modelOptions = extractModelOptions(data);
    if (!modelOptions.length) {
      throw new Error("AI model list response did not include models");
    }
    return {
      modelOptions,
      protocol: aiProtocol,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function createProblemExplanation(input: ProblemExplanationInput) {
  const prepared = await prepareProblemExplanationRequest(input);
  if ("error" in prepared) return prepared;

  const { config } = prepared;
  const protocol = config.aiProtocol;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    normalizeTimeout(config.aiRequestTimeoutMs)
  );
  try {
    const response = await fetch(endpointFromConfig(config, protocol), {
      method: "POST",
      headers: buildHeaders(config, protocol),
      signal: controller.signal,
      body: JSON.stringify(buildRequestBody(prepared, false, protocol)),
    });
    if (!response.ok) {
      throw new Error(await readUpstreamError(response));
    }
    const data = (await response.json().catch(() => ({}))) as
      | ChatCompletionResponse
      | AnthropicMessageResponse;
    const explanation =
      protocol === "anthropic"
        ? extractAnthropicText(data as AnthropicMessageResponse)
        : (data as ChatCompletionResponse).choices?.[0]?.message?.content;
    if (typeof explanation !== "string" || !explanation.trim()) {
      throw new Error("AI response did not include explanation text");
    }
    return {
      explanation: explanation.trim(),
      model: typeof data.model === "string" ? data.model : config.aiModel,
      usage: protocol === "openai" ? (data as ChatCompletionResponse).usage ?? null : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function streamProblemExplanation(
  input: ProblemExplanationInput,
  callbacks: ProblemExplanationStreamCallbacks
) {
  const prepared = await prepareProblemExplanationRequest(input);
  if ("error" in prepared) return prepared;

  const { config } = prepared;
  const protocol = config.aiProtocol;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    normalizeTimeout(config.aiRequestTimeoutMs)
  );

  try {
    const response = await fetch(endpointFromConfig(config, protocol), {
      method: "POST",
      headers: buildHeaders(config, protocol),
      signal: controller.signal,
      body: JSON.stringify(buildRequestBody(prepared, true, protocol)),
    });
    if (!response.ok) {
      throw new Error(await readUpstreamError(response));
    }
    if (!response.body) {
      throw new Error("AI response did not include a stream body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let explanation = "";
    let model = config.aiModel;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const raw = trimmed.slice("data:".length).trim();
      if (!raw || raw === "[DONE]") return;
      const data = parseStreamData(raw);
      if (!data) return;
      if (typeof data.error?.message === "string" && data.error.message.trim()) {
        throw new Error(data.error.message.trim());
      }
      const nextModel = extractStreamModel(data, protocol);
      if (nextModel && nextModel.trim() !== model) {
        model = nextModel.trim();
        callbacks.onModel?.(model);
      }
      const delta = extractStreamToken(data, protocol);
      if (!delta) return;
      explanation += delta;
      callbacks.onToken(delta);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          handleLine(line);
        }
      }
      if (done) break;
    }
    if (buffer.trim()) {
      handleLine(buffer);
    }
    if (!explanation.trim()) {
      throw new Error("AI response did not include explanation text");
    }
    return {
      explanation: explanation.trim(),
      model,
      usage: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
