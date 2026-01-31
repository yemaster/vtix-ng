import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const ITERATIONS = 120_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";
const SALT_BYTES = 16;

export function hashPassword(password: string) {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString(
    "hex"
  );
  return `${salt}.${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(".");
  if (!salt || !expected) return false;
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString(
    "hex"
  );
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
}
