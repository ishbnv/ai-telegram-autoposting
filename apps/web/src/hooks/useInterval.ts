import { useEffect, useRef } from "react"

/**
 * Runs `callback` every `delayMs`. The callback is held in a ref so the timer is
 * not torn down and recreated whenever the caller re-renders with a new closure.
 */
export function useInterval(callback: () => void, delayMs: number): void {
  const saved = useRef(callback)

  useEffect(() => {
    saved.current = callback
  }, [callback])

  useEffect(() => {
    const id = setInterval(() => saved.current(), delayMs)
    return () => clearInterval(id)
  }, [delayMs])
}
