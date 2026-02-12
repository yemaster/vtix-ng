export type User = {
  id: string;
  name: string;
  email: string;
  groupId: string;
  groupName: string;
  permissions: number;
  privateProblemSetLimit: number;
  recordCloudLimit: number;
};

const sessions = new Map<string, User>();

export function parseCookies(header: string | null) {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (!key) continue;
    result[key] = decodeURIComponent(rest.join("="));
  }
  return result;
}

export function getSessionUser(request: Request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies.vtix_session;
  if (!token) return null;
  return sessions.get(token) ?? null;
}

export function updateSessionUser(request: Request, nextUser: User) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies.vtix_session;
  if (!token) return null;
  if (!sessions.has(token)) return null;
  sessions.set(token, nextUser);
  return nextUser;
}

export function createSession(user: User) {
  const token = crypto.randomUUID();
  sessions.set(token, user);
  return token;
}

export function clearSession(request: Request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies.vtix_session;
  if (token) {
    sessions.delete(token);
  }
}
