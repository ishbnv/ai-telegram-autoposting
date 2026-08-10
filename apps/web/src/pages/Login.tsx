import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@ui"
import { useState } from "react"

import { useAuth } from "@/store/auth"

import styles from "./Login.module.scss"

export function LoginPage() {
  const [password, setPassword] = useState("")
  const { login, pending, error } = useAuth()

  return (
    <div className={styles.screen}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            The password is the one hashed into ADMIN_PASSWORD_HASH.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              void login(password)
            }}
          >
            <div className={styles.field}>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}

            <Button type="submit" disabled={pending || password.length === 0}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
