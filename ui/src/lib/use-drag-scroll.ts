import { useEffect, type RefObject } from 'react'

/** How far the pointer moves before a press becomes a drag (px). */
const THRESHOLD = 6
/** How much of its speed a fling keeps each frame, at 60 frames a second. */
const FRICTION = 0.94

/**
 * Lets a mouse drag a sideways scroller, as a finger already can: press, pull, and let go with a
 * little glide. A drag never opens the poster it began on. Touch and pen keep the browser's own
 * scrolling.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let pressed = false
    let dragging = false
    let startX = 0
    let startLeft = 0
    let lastX = 0
    let lastTime = 0
    let velocity = 0 // px per ms, in scroll direction
    let frame = 0

    const stopGlide = () => cancelAnimationFrame(frame)

    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return
      stopGlide()
      pressed = true
      dragging = false
      startX = lastX = event.clientX
      startLeft = el.scrollLeft
      lastTime = event.timeStamp
      velocity = 0
    }

    const onMove = (event: PointerEvent) => {
      if (!pressed) return
      const dx = event.clientX - startX
      if (!dragging) {
        if (Math.abs(dx) < THRESHOLD) return
        dragging = true
        el.setPointerCapture(event.pointerId)
        el.dataset.dragging = ''
      }
      el.scrollLeft = startLeft - dx
      const dt = event.timeStamp - lastTime
      if (dt > 0) velocity = (lastX - event.clientX) / dt
      lastX = event.clientX
      lastTime = event.timeStamp
    }

    const onUp = (event: PointerEvent) => {
      if (!pressed) return
      pressed = false
      if (!dragging) return
      el.releasePointerCapture(event.pointerId)
      // A pause before letting go is no fling.
      if (event.timeStamp - lastTime > 80) velocity = 0
      let last = performance.now()
      const glide = (now: number) => {
        const dt = now - last
        last = now
        el.scrollLeft += velocity * dt
        velocity *= Math.pow(FRICTION, dt / 16.7)
        if (Math.abs(velocity) > 0.02) frame = requestAnimationFrame(glide)
        else delete el.dataset.dragging
      }
      frame = requestAnimationFrame(glide)
    }

    // The click that ends a drag lands on a poster: swallow it.
    const onClick = (event: MouseEvent) => {
      if (!dragging) return
      dragging = false
      event.preventDefault()
      event.stopPropagation()
    }

    // Links and images would otherwise start the browser's own drag and drop.
    const onDragStart = (event: DragEvent) => event.preventDefault()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('click', onClick, true)
    el.addEventListener('dragstart', onDragStart)
    return () => {
      stopGlide()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('click', onClick, true)
      el.removeEventListener('dragstart', onDragStart)
    }
  }, [ref])
}
