import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 1;

export class VaultKey {
  readonly #key: Buffer;

  private constructor(key: Buffer) {
    this.#key = key;
  }

  static fromBase64(b64: string): VaultKey {
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) {
      throw new Error('COURIER_VAULT_KEY must be 32 bytes, base64-encoded');
    }
    return new VaultKey(key);
  }

  static generate(): VaultKey {
    return new VaultKey(randomBytes(32));
  }

  /** Fresh key material for writing to a 0600 key file. */
  static generateBase64(): string {
    return randomBytes(32).toString('base64');
  }

  /** Never serialise the key by accident (logs, JSON, util.inspect). */
  toJSON(): string {
    return '[VaultKey]';
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '[VaultKey]';
  }

  /**
   * Seal plaintext. `aad` binds the ciphertext to its context (the handle id),
   * so a sealed blob cannot be replayed under a different handle.
   * Layout: version(1) | iv(12) | tag(16) | ciphertext
   */
  seal(plaintext: Uint8Array, aad: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALG, this.#key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct]);
  }

  open(blob: Uint8Array, aad: string): Buffer {
    const buf = Buffer.from(blob);
    if (buf.length < 1 + IV_BYTES + TAG_BYTES || buf[0] !== VERSION) {
      throw new Error('vault: malformed ciphertext');
    }
    const iv = buf.subarray(1, 1 + IV_BYTES);
    const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const ct = buf.subarray(1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALG, this.#key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}
