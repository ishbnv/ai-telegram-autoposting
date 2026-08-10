import { Alert, AlertDescription, AlertTitle, Skeleton } from "@ui"
import type { ReactNode } from "react"

import type { AsyncStatus } from "@/store/collection"

import styles from "./DataState.module.scss"

/**
 * The three states every list screen has to render. Kept in one place so a new
 * page cannot forget the error branch.
 */
export function DataState({
  status,
  error,
  isEmpty,
  emptyMessage,
  children,
}: {
  status: AsyncStatus
  error: string | null
  isEmpty: boolean
  emptyMessage: string
  children: ReactNode
}) {
  if (status === "loading") {
    return (
      <div className={styles.skeletons}>
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    )
  }

  if (status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load this</AlertTitle>
        <AlertDescription>{error ?? "Unknown error"}</AlertDescription>
      </Alert>
    )
  }

  if (isEmpty) {
    return <p className={styles.empty}>{emptyMessage}</p>
  }

  return <>{children}</>
}
