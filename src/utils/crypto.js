import crypto from "crypto";
import bcrypt from "bcrypt";

/**
 * Hash password using bcrypt
 * @param {string} password 
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

/**
 * Compare password candidate with a hash
 * @param {string} candidate 
 * @param {string} hash 
 * @returns {Promise<boolean>}
 */
export async function comparePassword(candidate, hash) {
    if (!candidate || !hash) return false;
    return await bcrypt.compare(candidate, hash);
}

/**
 * SHA-256 Hash helper (used for token storage)
 * @param {string} token 
 * @returns {string}
 */
export function hashToken(token) {
    if (!token) return "";
    return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a random secure hex token
 * @returns {string}
 */
export function generateRandomToken() {
    return crypto.randomBytes(32).toString("hex");
}

/**
 * Generate a unique session ID
 * @returns {string}
 */
export function generateSessionId() {
    return crypto.randomUUID();
}

/**
 * A timing-safe constant-time string comparison.
 * Prevents side-channel timing attacks by ensuring comparison takes the same amount of time.
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean}
 */
export function timingSafeCompare(a, b) {
    if (typeof a !== "string" || typeof b !== "string") {
        return false;
    }
    
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    
    if (aBuf.length !== bBuf.length) {
        // Prevent length leaks by performing a dummy comparison
        crypto.timingSafeEqual(aBuf, aBuf);
        return false;
    }
    
    return crypto.timingSafeEqual(aBuf, bBuf);
}
