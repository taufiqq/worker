// src/utils/generateToken.js

/**
 * Fungsi helper untuk menghasilkan token acak yang aman.
 */
export function generateSecureToken(length = 16) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}