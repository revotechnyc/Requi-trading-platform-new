/**
 * AES-256-GCM helpers for storing broker OAuth tokens at rest.
 * Key material comes from APP_SECRET (or ROBINHOOD_TOKEN_KEY override).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

function keyBytes(): Buffer {
  const material =
    process.env.ROBINHOOD_TOKEN_KEY?.trim() ||
    env.appSecret ||
    "local-dev-broker-token-key";
  return createHash("sha256").update(material).digest();
}

/** Returns `iv.tag.ciphertext` as base64url segments joined by `.` */
export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

export function openSecret(sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 3) throw new Error("Invalid sealed secret");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
