import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

/** AES-256-GCM. Output: base64url(iv | tag | ciphertext) */
export function seal(data: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}

export function unseal<T>(token: string, secret: string): T | null {
  try {
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    return JSON.parse(pt) as T;
  } catch {
    return null; // tampered, wrong secret, or malformed
  }
}

/** PKCE (RFC 7636) S256 */
export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomState() {
  return randomBytes(24).toString("base64url");
}
