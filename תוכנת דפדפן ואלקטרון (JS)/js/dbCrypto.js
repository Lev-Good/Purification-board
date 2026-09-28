/**
 * Encrypts the events database (`js/storage.js`'s `taharahDB`) at rest —
 * AES-GCM-256, with the key derived from the user's PIN via PBKDF2/SHA-256
 * (Web Crypto). The key is never persisted: it is re-derived from the PIN
 * every time the app unlocks, and lives only in memory for that session.
 *
 * Uses a salt independent of `js/pinCrypto.js`'s PIN-verification salt, so
 * the two derived secrets (verification hash vs. encryption key) are
 * cryptographically unrelated even though both come from the same PIN.
 */

const PBKDF2_ITERATIONS = 100000;
const IV_LENGTH_BYTES = 12; // standard AES-GCM nonce size
const SALT_LENGTH_BYTES = 16;

function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export function generateDbSalt() {
    return toBase64(crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES)));
}

/**
 * Derives a non-extractable AES-GCM-256 CryptoKey from the PIN and a salt.
 */
export async function deriveDbKey(pin, saltB64) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: fromBase64(saltB64), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a plain JS object. Returns the fresh IV alongside the
 * ciphertext - AES-GCM requires a new random IV on every encryption.
 */
export async function encryptDb(key, dbObject) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const plaintext = new TextEncoder().encode(JSON.stringify(dbObject || {}));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return { iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)) };
}

/**
 * Decrypts back to a plain JS object. Throws (GCM auth-tag mismatch) if the
 * key or ciphertext is wrong/corrupted - callers must not treat that as
 * "empty database" and must never silently discard what's on disk.
 */
export async function decryptDb(key, ivB64, dataB64) {
    const iv = fromBase64(ivB64);
    const ciphertext = fromBase64(dataB64);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
}
