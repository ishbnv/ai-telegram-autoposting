import { Button } from "@ui"
import { useEffect, useRef, useState } from "react"
import type { ComponentProps } from "react"

/** Long enough to read the second label, short enough not to linger. */
const ARM_TIMEOUT_MS = 4_000

type Props = Omit<ComponentProps<typeof Button>, "onClick"> & {
  onConfirm: () => void
  /** Shown once armed. Say what is actually lost. */
  confirmLabel: string
}

/**
 * A destructive action that takes two clicks.
 *
 * Deleting a source cascades to the news it collected, so a stray click used to
 * be unrecoverable with no dialog in the way. This asks for the second click in
 * place rather than pulling in a modal, and disarms itself so a half-pressed
 * button cannot sit there waiting to catch someone later.
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel,
  children,
  ...props
}: Props) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  if (!armed) {
    return (
      <Button
        {...props}
        onClick={() => {
          setArmed(true)
          timer.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
        }}
      >
        {children}
      </Button>
    )
  }

  return (
    <Button
      {...props}
      variant="destructive"
      onClick={() => {
        clearTimeout(timer.current)
        setArmed(false)
        onConfirm()
      }}
    >
      {confirmLabel}
    </Button>
  )
}
