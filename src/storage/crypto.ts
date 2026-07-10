// Optional passphrase encryption (PLAN.md Phase 5).
// PBKDF2(310k, SHA-256) → AES-GCM-256. The derived key lives in memory and,
// where available, in chrome.storage.session (cleared on browser exit, access
// level restricted to trusted extension contexts). No extension-embedded
// keys — standard mode is honest plaintext.

const PBKDF2_ITERATIONS = 310_000;

export interface Envelope {
  v: 1;
  enc: boolean;
  /** plaintext JSON when enc=false */
  data?: unknown;
  /** base64 iv + ciphertext when enc=true */
  ivB64?: string;
  ctB64?: string;
}

let sessionKey: CryptoKey | null = null;

export class VaultLockedError extends Error {
  constructor() {
    super("Vault is locked. Unlock with your passphrase in the side panel.");
    this.name = "VaultLockedError";
  }
}

function toB64(buf: ArrayBuffer): string {
  let s = "";
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function makeSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return toB64(salt.buffer);
}

export async function deriveKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromB64(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

const SESSION_KEY_ID = "fastapply.vaultKey";

export async function unlock(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const key = await deriveKey(passphrase, saltB64);
  sessionKey = key;
  await persistSessionKey(key);
  return key;
}

export function lock(): void {
  sessionKey = null;
  void chrome?.storage?.session?.remove?.(SESSION_KEY_ID);
}

export function isUnlocked(): boolean {
  return sessionKey !== null;
}

async function persistSessionKey(key: CryptoKey): Promise<void> {
  try {
    const raw = await crypto.subtle.exportKey("raw", key);
    await chrome.storage.session.set({ [SESSION_KEY_ID]: toB64(raw) });
  } catch {
    // storage.session unavailable (tests) — memory-only is fine
  }
}

/** Restore the key after a panel reload within the same browser session. */
export async function restoreSessionKey(): Promise<boolean> {
  if (sessionKey) return true;
  try {
    const got = await chrome.storage.session.get(SESSION_KEY_ID);
    const b64 = got?.[SESSION_KEY_ID];
    if (typeof b64 !== "string") return false;
    sessionKey = await crypto.subtle.importKey(
      "raw",
      fromB64(b64),
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"],
    );
    return true;
  } catch {
    return false;
  }
}

export async function seal(value: unknown, encrypt: boolean): Promise<Envelope> {
  if (!encrypt) return { v: 1, enc: false, data: value };
  if (!sessionKey) throw new VaultLockedError();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sessionKey, pt);
  return { v: 1, enc: true, ivB64: toB64(iv.buffer), ctB64: toB64(ct) };
}

export async function open(env: Envelope): Promise<unknown> {
  if (!env.enc) return env.data;
  if (!sessionKey) throw new VaultLockedError();
  const iv = fromB64(env.ivB64 ?? "");
  const ct = fromB64(env.ctB64 ?? "");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sessionKey, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}
