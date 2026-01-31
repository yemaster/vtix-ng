export type RawProblem = {
  type?: number;
  content?: string;
  choices?: unknown;
  answer?: unknown;
  hint?: string;
};

function normalizeChoices(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item).trim());
}

export function normalizeProblems(raw: unknown) {
  if (!Array.isArray(raw)) return { list: [], counts: [0, 0, 0, 0, 0] };
  const list: RawProblem[] = raw;
  const normalized: RawProblem[] = [];
  const counts = [0, 0, 0, 0, 0];
  for (const item of list) {
    const type = Number(item?.type);
    if (![1, 2, 3, 4].includes(type)) continue;
    const content = String(item?.content ?? "").trim();
    if (!content) continue;
    const hint = String(item?.hint ?? "").trim();
    if (type === 3) {
      const answer = String(item?.answer ?? "").trim();
      if (!answer) continue;
      normalized.push({ type, content, answer, hint: hint || undefined });
      counts[type] += 1;
      continue;
    }
    const choices = normalizeChoices(item?.choices);
    if (choices.length < 2 || choices.some((choice) => !choice)) continue;
    if (type === 2) {
      const answer = Array.isArray(item?.answer)
        ? item.answer
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value))
        : [];
      const unique = Array.from(new Set(answer)).filter(
        (value) => value >= 0 && value < choices.length
      );
      if (!unique.length) continue;
      normalized.push({
        type,
        content,
        choices,
        answer: unique,
        hint: hint || undefined,
      });
      counts[type] += 1;
      continue;
    }
    const answer = Number(item?.answer);
    if (!Number.isFinite(answer) || answer < 0 || answer >= choices.length) {
      continue;
    }
    if (type === 4) {
      normalized.push({
        type,
        content,
        choices: [choices[0], choices[1]],
        answer,
        hint: hint || undefined,
      });
      counts[type] += 1;
      continue;
    }
    normalized.push({
      type,
      content,
      choices,
      answer,
      hint: hint || undefined,
    });
    counts[type] += 1;
  }
  return { list: normalized, counts };
}
