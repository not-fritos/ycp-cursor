export type PointerState = {
  x: number
  y: number
  active: boolean
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  ox: number
  oy: number
  phase: number
  freq: number
  amp: number
  size: number
  targetX: number
  targetY: number
  hasTarget: boolean
}

export type ParticleField = {
  resize: (width: number, height: number, dpr: number) => void
  setPointer: (pointer: PointerState) => void
  formMLH: () => void
  tick: (dt: number, paused: boolean) => void
  draw: (ctx: CanvasRenderingContext2D) => void
}

const ATTRACT_RADIUS = 140
const ATTRACT_STRENGTH = 0.085
const FORM_HOLD_MS = 1300
const FORM_EASE = 0.12
const DRIFT_RETURN = 0.018
const DAMPING = 0.92

function particleCountForSize(width: number, height: number): number {
  const area = width * height
  const raw = Math.round(area / 900)
  return Math.max(800, Math.min(2000, raw))
}

function sampleMLHPoints(
  width: number,
  height: number,
  count: number,
): Array<{ x: number; y: number }> {
  const canvas = document.createElement('canvas')
  const scale = Math.min(width, height)
  const fontSize = Math.max(72, Math.floor(scale * 0.28))
  canvas.width = Math.max(1, Math.floor(width))
  canvas.height = Math.max(1, Math.floor(height))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText('MLH', canvas.width / 2, canvas.height / 2)

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const candidates: Array<{ x: number; y: number }> = []
  const step = Math.max(2, Math.floor(fontSize / 36))

  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const i = (y * canvas.width + x) * 4
      if (data[i]! > 180) {
        candidates.push({ x, y })
      }
    }
  }

  if (candidates.length === 0) {
    return Array.from({ length: count }, () => ({
      x: width * 0.5,
      y: height * 0.5,
    }))
  }

  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i < count; i++) {
    const src = candidates[Math.floor((i / count) * candidates.length)]!
    const jitter = step * 0.35
    points.push({
      x: src.x + (Math.random() - 0.5) * jitter,
      y: src.y + (Math.random() - 0.5) * jitter,
    })
  }
  return points
}

function createParticle(width: number, height: number): Particle {
  const x = Math.random() * width
  const y = Math.random() * height
  return {
    x,
    y,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    ox: x,
    oy: y,
    phase: Math.random() * Math.PI * 2,
    freq: 0.35 + Math.random() * 0.9,
    amp: 8 + Math.random() * 28,
    size: 1 + Math.random() * 1.8,
    targetX: x,
    targetY: y,
    hasTarget: false,
  }
}

export function createParticleField(): ParticleField {
  let width = 1
  let height = 1
  let dpr = 1
  let particles: Particle[] = []
  let pointer: PointerState = { x: 0, y: 0, active: false }
  let formUntil = 0
  let time = 0

  const ensureParticles = () => {
    const target = particleCountForSize(width, height)
    if (particles.length === target) return
    if (particles.length < target) {
      while (particles.length < target) {
        particles.push(createParticle(width, height))
      }
    } else {
      particles.length = target
    }
  }

  const redistributeOrigins = () => {
    for (const p of particles) {
      p.ox = Math.random() * width
      p.oy = Math.random() * height
      if (!p.hasTarget) {
        p.x = p.ox + (Math.random() - 0.5) * 20
        p.y = p.oy + (Math.random() - 0.5) * 20
      }
    }
  }

  return {
    resize(nextWidth, nextHeight, nextDpr) {
      const changed =
        Math.abs(nextWidth - width) > 1 || Math.abs(nextHeight - height) > 1
      width = Math.max(1, nextWidth)
      height = Math.max(1, nextHeight)
      dpr = nextDpr
      ensureParticles()
      if (changed) redistributeOrigins()
    },

    setPointer(next) {
      pointer = next
    },

    formMLH() {
      const points = sampleMLHPoints(width, height, particles.length)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!
        const t = points[i]!
        p.targetX = t.x
        p.targetY = t.y
        p.hasTarget = true
      }
      formUntil = performance.now() + FORM_HOLD_MS
    },

    tick(dt, paused) {
      if (paused) return
      const clamped = Math.min(dt, 0.05)
      time += clamped

      const forming = performance.now() < formUntil
      if (!forming) {
        for (const p of particles) p.hasTarget = false
      }

      for (const p of particles) {
        if (p.hasTarget) {
          const dx = p.targetX - p.x
          const dy = p.targetY - p.y
          p.vx += dx * FORM_EASE
          p.vy += dy * FORM_EASE
          p.vx *= 0.78
          p.vy *= 0.78
        } else {
          const driftX =
            Math.sin(time * p.freq + p.phase) * p.amp +
            Math.sin(time * 0.21 + p.ox * 0.01) * 6
          const driftY =
            Math.cos(time * p.freq * 0.85 + p.phase) * p.amp * 0.7 +
            Math.cos(time * 0.17 + p.oy * 0.01) * 6
          const homeX = p.ox + driftX
          const homeY = p.oy + driftY
          p.vx += (homeX - p.x) * DRIFT_RETURN
          p.vy += (homeY - p.y) * DRIFT_RETURN

          if (pointer.active) {
            const dx = pointer.x - p.x
            const dy = pointer.y - p.y
            const distSq = dx * dx + dy * dy
            const r = ATTRACT_RADIUS
            if (distSq < r * r && distSq > 0.01) {
              const dist = Math.sqrt(distSq)
              const force = (1 - dist / r) * ATTRACT_STRENGTH
              p.vx += dx * force
              p.vy += dy * force
            }
          }
          p.vx *= DAMPING
          p.vy *= DAMPING
        }

        p.x += p.vx
        p.y += p.vy

        if (p.x < -20) p.x = width + 20
        else if (p.x > width + 20) p.x = -20
        if (p.y < -20) p.y = height + 20
        else if (p.y > height + 20) p.y = -20
      }
    },

    draw(ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      ctx.fillStyle = 'rgba(120, 170, 255, 0.55)'
      for (const p of particles) {
        const alpha = 0.35 + Math.min(0.55, (Math.abs(p.vx) + Math.abs(p.vy)) * 0.35)
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  }
}
