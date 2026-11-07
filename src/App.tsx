import { useEffect, useRef, useState } from 'react'
import { createParticleField, type PointerState } from './particles'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fieldRef = useRef(createParticleField())
  const pointerRef = useRef<PointerState>({ x: 0, y: 0, active: false })
  const playingRef = useRef(true)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const field = fieldRef.current
    let raf = 0
    let last = performance.now()

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      field.resize(w, h, dpr)
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointerRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      }
      field.setPointer(pointerRef.current)
    }

    const onPointerLeave = () => {
      pointerRef.current = { ...pointerRef.current, active: false }
      field.setPointer(pointerRef.current)
    }

    const onPointerDown = (e: PointerEvent) => {
      onPointerMove(e)
      if (playingRef.current) field.formMLH()
    }

    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      field.tick(dt, !playingRef.current)
      field.draw(ctx)
      raf = requestAnimationFrame(frame)
    }

    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('pointerdown', onPointerDown)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050508] text-zinc-100">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-5 pt-5 sm:px-8 sm:pt-6">
        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Cursor Demo
        </h1>
        <button
          type="button"
          aria-label={playing ? 'Pause animation' : 'Play animation'}
          className="pointer-events-auto rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-zinc-100 backdrop-blur-sm transition hover:bg-white/10"
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
      </header>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full touch-none"
        aria-label="Interactive particle field"
      />
    </div>
  )
}
