import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { env } from "../lib/env";

/**
 * Private Governance Vault — encrypted-at-rest storage for confidential
 * governing documents.
 *
 * SECURITY BOUNDARY (architectural, not conversational):
 * - Source documents exist ONLY as AES-256-GCM ciphertext on disk.
 * - Plaintext is decrypted in memory, used by the compiler, and discarded.
 * - Nothing in this module is ever imported by frontend code; the static
 *   server only serves dist/public, so the vault is unreachable by browsers.
 * - No endpoint may return raw or reconstructed document content.
 */

const VAULT_DIR = join(process.cwd(), "governance", "vault");
const MANIFEST_PATH = join(VAULT_DIR, "manifest.json");

export interface VaultEntry {
  docKey: string;
  title: string;
  version: string;
  sha256: string; // integrity hash of the plaintext source
  file: string; // ciphertext filename inside the vault
  bytes: number;
  registeredAt: string;
}

interface Manifest {
  version: 1;
  entries: VaultEntry[];
}

/** Derive a 32-byte key. Production must supply GOVERNANCE_VAULT_KEY. */
export function vaultKey(): Buffer {
  const secret = env.governanceVaultKey || "requi-dev-vault-key-CHANGE-ME";
  if (!env.governanceVaultKey && env.isProduction) {
    throw new Error("GOVERNANCE_VAULT_KEY is required in production — refusing to open the governance vault");
  }
  return scryptSync(secret, "requi-governance-vault-v1", 32);
}

export function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function readManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return { version: 1, entries: [] };
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

function writeManifest(m: Manifest) {
  mkdirSync(VAULT_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

export function listVaultDocuments(): VaultEntry[] {
  return readManifest().entries;
}

/** Store a plaintext document as authenticated ciphertext (idempotent by docKey). */
export function sealDocument(docKey: string, title: string, version: string, plaintext: Buffer): VaultEntry {
  mkdirSync(VAULT_DIR, { recursive: true });
  const manifest = readManifest();
  const existing = manifest.entries.find((e) => e.docKey === docKey);
  if (existing) return existing;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const file = `${docKey}.enc`;
  writeFileSync(join(VAULT_DIR, file), Buffer.concat([iv, tag, ciphertext]));

  const entry: VaultEntry = {
    docKey,
    title,
    version,
    sha256: sha256(plaintext),
    file,
    bytes: plaintext.length,
    registeredAt: new Date().toISOString(),
  };
  manifest.entries.push(entry);
  writeManifest(manifest);
  return entry;
}

/** Decrypt a document in memory. Integrity is verified against the registry hash. */
export function openDocument(docKey: string): { plaintext: Buffer; entry: VaultEntry } {
  const entry = readManifest().entries.find((e) => e.docKey === docKey);
  if (!entry) throw new Error(`Vault document not registered: ${docKey}`);
  const raw = readFileSync(join(VAULT_DIR, entry.file));
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (sha256(plaintext) !== entry.sha256) {
    throw new Error(`Vault integrity failure: ${docKey} — ciphertext does not match registry hash`);
  }
  return { plaintext, entry };
}

export function vaultSealed(): boolean {
  return existsSync(VAULT_DIR) && readdirSync(VAULT_DIR).some((f) => f.endsWith(".enc"));
}
