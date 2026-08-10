import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto"

// promisify() picks the three-argument overload and drops the options one, so
// the wrapper is written out by hand.
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) {
        reject(error)
        return
      }
      resolve(key)
    })
  })
}

const KEY_LENGTH = 64
const SALT_LENGTH = 16
/** 2^15 is the cost that makes offline guessing expensive without hurting login. */
const COST = 2 ** 15
const BLOCK_SIZE = 8
const PARALLELISM = 1
/** 128 * N * r is ~33 MB here, over the 32 MB default, so raise the ceiling. */
const MAX_MEMORY = 64 * 1024 * 1024

const PREFIX = "scrypt"

/**
 * scrypt from the standard library rather than argon2: one admin password does
 * not justify a native dependency that has to be rebuilt for every base image.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = (await scryptAsync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAX_MEMORY,
  })) as Buffer

  return [
    PREFIX,
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$")
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== PREFIX) {
    return false
  }

  const [, cost, blockSize, parallelism, salt, expected] = parts
  const expectedKey = Buffer.from(expected ?? "", "base64url")

  if (expectedKey.length === 0) {
    return false
  }

  const derived = (await scryptAsync(
    password,
    Buffer.from(salt ?? "", "base64url"),
    expectedKey.length,
    {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelism),
      maxmem: MAX_MEMORY,
    }
  )) as Buffer

  return timingSafeEqual(derived, expectedKey)
}
