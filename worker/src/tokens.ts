// ─── Capability tokens — stateless, HMAC-SHA256 signed (see DESIGN.md) ────────
// Format:  base64url(claimsJson) + "." + base64url(hmac)
// No accounts: possession of a valid token for a shareId IS the capability.

export interface TokenClaims {
  /** shareId this token is scoped to. */
  sid: string;
  role: 'author' | 'reader';
  /** readerId — present on reader tokens only. */
  rid?: string;
  /** issued-at, epoch ms. */
  iat: number;
}

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeToString(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return bin;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    utf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signToken(claims: TokenClaims, secret: string): Promise<string> {
  const payload = b64urlEncode(utf8(JSON.stringify(claims)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, utf8(payload));
  return `${payload}.${b64urlEncode(sig)}`;
}

/** Verify signature + return claims, or null if malformed/forged. Does not check
 *  scope (`sid`/`role`) — callers assert those against the request. */
export async function verifyToken(token: string, secret: string): Promise<TokenClaims | null> {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  const key = await hmacKey(secret);
  let sigBytes: Uint8Array;
  try {
    sigBytes = Uint8Array.from(b64urlDecodeToString(sigPart), c => c.charCodeAt(0));
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, utf8(payload));
  if (!ok) return null;
  try {
    const claims = JSON.parse(b64urlDecodeToString(payload)) as TokenClaims;
    if (!claims || typeof claims.sid !== 'string' || (claims.role !== 'author' && claims.role !== 'reader')) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

/** Extract a bearer token from the Authorization header. */
export function bearer(req: Request): string | null {
  const h = req.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
