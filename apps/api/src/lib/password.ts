import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

/** Hashes a plaintext password for storage (users.password_hash). Never store or log the plaintext. */
export const hashPassword = (plaintext: string): Promise<string> => bcrypt.hash(plaintext, SALT_ROUNDS)

/** Verifies a plaintext password against a stored hash. */
export const verifyPassword = (plaintext: string, hash: string): Promise<boolean> => bcrypt.compare(plaintext, hash)

/**
 * Minimum shape a new password must meet. Deliberately simple (length
 * only, no composition rules) — composition requirements are widely
 * considered to push people toward weaker, more predictable passwords
 * (NIST SP 800-63B); length is the lever that actually matters.
 */
export const isPasswordStrongEnough = (plaintext: string): boolean => plaintext.length >= 10
