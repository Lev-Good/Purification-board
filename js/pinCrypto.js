/**
 * One-way hashing for the app's local PIN (Web Crypto — PBKDF2/SHA-256).
 *
 * The PIN is never stored (or sent anywhere) in a form that can be reversed:
 * only a random per-record salt and the resulting hash are kept. Unlocking
 * means re-deriving the hash from the entered digits and comparing it to the
 * stored one — the original PIN itself is never recoverable from storage.
 *
 * Pure Web Crypto (`crypto.subtle`), so this runs identically in the browser
 * build, the Electron renderer, and plain Node test runs.
 */

const PBKDF2_ITERATIONS = 100000;
const HASH_ALGO = 'SHA-256';
const KEY_LENGTH_BITS = 256;
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

function generateSalt() {
    return toBase64(crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES)));
}

async function derivePinHash(pin, saltB64) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: fromBase64(saltB64), iterations: PBKDF2_ITERATIONS, hash: HASH_ALGO },
        keyMaterial, KEY_LENGTH_BITS
    );
    return toBase64(new Uint8Array(bits));
}

/**
 * Builds a fresh {v, salt, hash} record for a newly-set PIN.
 */
export async function createPinRecord(pin) {
    const salt = generateSalt();
    const hash = await derivePinHash(pin, salt);
    return { v: 2, salt, hash };
}

/**
 * Checks an entered PIN against a stored record without ever recovering the
 * original PIN.
 */
export async function verifyPinRecord(pin, record) {
    if (!record || !record.salt || !record.hash) return false;
    const hash = await derivePinHash(pin, record.salt);
    return hash === record.hash;
}
