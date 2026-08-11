import { useEffect, useRef, useState } from 'react'

/**
 * Measures an element's width and re-measures when it changes.
 *
 * The timeline draws in real pixels rather than scaling a fixed viewBox, because a scaled SVG
 * would also scale the axis text and, more importantly, put a transform between a pointer's
 * position and the coordinates the value is computed from. Knowing the true width keeps that
 * mapping direct.
 *
 * The width starts at 0, which is one render with nothing drawn; the observer fires immediately
 * after mount. Callers skip drawing until the width is known rather than guessing a default,
 * since a wrong guess would be visible as a jump.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
