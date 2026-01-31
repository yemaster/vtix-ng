export type PracticeRecord = {
  id: string;
  updatedAt?: number;
};

const userRecords = new Map<string, PracticeRecord[]>();

function getSortTime(record: PracticeRecord) {
  return typeof record.updatedAt === "number" ? record.updatedAt : 0;
}

export function getUserRecords(userId: string) {
  return userRecords.get(userId) ?? [];
}

export function mergeUserRecords(userId: string, incoming: PracticeRecord[]) {
  const existing = getUserRecords(userId);
  const recordMap = new Map(existing.map((item) => [item.id, item]));
  for (const record of incoming) {
    if (!record || typeof record.id !== "string") continue;
    recordMap.set(record.id, record);
  }
  let merged = Array.from(recordMap.values());
  merged = merged
    .sort((a, b) => getSortTime(a) - getSortTime(b))
    .slice(Math.max(0, merged.length - 10));
  userRecords.set(userId, merged);
  return merged;
}
