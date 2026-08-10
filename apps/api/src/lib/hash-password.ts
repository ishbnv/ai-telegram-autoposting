import { createInterface } from "node:readline/promises"

import { hashPassword } from "./password"

/**
 * `pnpm --filter @workspace/api hash-password` — prints the value to put in
 * ADMIN_PASSWORD_HASH. Reads from stdin so the password never lands in shell
 * history or in the process list.
 */
async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  const password = await rl.question("Password: ")
  rl.close()

  if (password.length < 8) {
    process.stderr.write(
      "Refusing to hash a password shorter than 8 characters.\n"
    )
    process.exitCode = 1
    return
  }

  process.stdout.write(`${await hashPassword(password)}\n`)
}

await main()
