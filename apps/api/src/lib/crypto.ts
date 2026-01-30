import { createHash, randomBytes } from "crypto";

/**
 * Hash a token using SHA-256
 * Used for session tokens - fast lookup, secure storage
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Alphabet without underscores (used in key format as separator)
const KEY_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Generate a random string using a safe alphabet (no underscores)
 */
function randomString(length: number): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  }
  return result;
}

/**
 * Parse an API key into its components
 * Format: clawnet_KEYID123_SECRETSECRETSECRETSECRET
 */
export function parseApiKey(token: string): { keyId: string; fullKey: string } | null {
  if (!token.startsWith("clawnet_")) {
    return null;
  }
  
  // Remove prefix and split by underscore
  const withoutPrefix = token.slice(8); // Remove "clawnet_"
  const underscoreIndex = withoutPrefix.indexOf("_");
  
  if (underscoreIndex === -1) {
    return null;
  }
  
  const keyId = withoutPrefix.slice(0, underscoreIndex);
  const secret = withoutPrefix.slice(underscoreIndex + 1);
  
  if (!keyId || keyId.length !== 8 || !secret || secret.length < 24) {
    return null;
  }
  
  return { keyId, fullKey: token };
}

/**
 * Generate an API key
 * Returns { keyId, fullKey } where keyId is for lookup and fullKey is the complete key
 */
export function generateApiKey(): { keyId: string; fullKey: string } {
  const keyId = randomString(8);   // 8 chars for lookup
  const secret = randomString(32); // 32 chars secret
  const fullKey = `clawnet_${keyId}_${secret}`;
  return { keyId, fullKey };
}
