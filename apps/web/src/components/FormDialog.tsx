import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from "@ui"
import type { ReactNode } from "react"

import styles from "./FormDialog.module.scss"

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = "Save",
  pending = false,
  error,
  /** Widens the dialog for two-column bodies. */
  wide = false,
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel?: string
  pending?: boolean
  error?: string | null
  wide?: boolean
  onSubmit: () => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? "sm:max-w-4xl" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <div className={styles.fields}>{children}</div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  /** Fills the remaining height of a `DialogColumn`. One per column. */
  grow = false,
  children,
}: {
  label: string
  hint?: ReactNode
  htmlFor?: string
  grow?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={grow ? `${styles.field} ${styles.fieldGrow}` : styles.field}
    >
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  )
}

/**
 * Splits a dialog body into "what it produces" on the left and "how it runs" on
 * the right. Collapses to a single column on narrow screens.
 */
export function DialogColumns({ children }: { children: ReactNode }) {
  return <div className={styles.columns}>{children}</div>
}

export function DialogColumn({ children }: { children: ReactNode }) {
  return <div className={styles.column}>{children}</div>
}
