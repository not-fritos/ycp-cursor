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
const FORM_HOLD_MS = 1400
const FORM_EASE = 0.28
const DRIFT_RETURN = 0.018
const DAMPING = 0.92

type Pt = { x: number; y: number }

function particleCountForSize(width: number, height: number): number {
  const area = width * height
  const raw = Math.round(area / 900)
  return Math.max(800, Math.min(2000, raw))
}

/** Sample points along a polyline with roughly even spacing. */
function samplePolyline(points: Pt[], spacing: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const steps = Math.max(1, Math.ceil(len / spacing))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      out.push({ x: a.x + dx * t, y: a.y + dy * t })
    }
  }
  if (points.length) out.push(points[points.length - 1]!)
  return out
}

/** Build MLH glyph outlines in local unit space, then scale into the viewport. */
function sampleMLHPoints(width: number, height: number, count: number): Pt[] {
  const unit = 100
  // Glyphs designed in a ~320x100 box (3 letters with gaps)
  const glyphs: Pt[][] = [
    // M
    [
      { x: 0, y: 100 },
      { x: 0, y: 0 },
      { x: 35, y: 55 },
      { x: 70, y: 0 },
      { x: 70, y: 100 },
    ],
    // L
    [
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 160, y: 100 },
    ],
    // H
    [
      { x: 190, y: 0 },
      { x: 190, y: 100 },
    ],
    [
      { x: 250, y: 0 },
      { x: 250, y: 100 },
    ],
    [
      { x: 190, y: 50 },
      { x: 250, y: 50 },
    ],
  ]

  const spacing = 3.2
  const local: Pt[] = []
  for (const poly of glyphs) {
    local.push(...samplePolyline(poly, spacing))
  }

  // Thicken strokes with slight offsets so letters read clearly
  const thickened: Pt[] = [...local]
  for (const p of local) {
    thickened.push({ x: p.x + 2.2, y: p.y })
    thickened.push({ x: p.x - 2.2, y: p.y })
    thickened.push({ x: p.x, y: p.y + 2.2 })
    thickened.push({ x: p.x, y: p.y - 2.2 })
  }

  const boxW = 250
  const boxH = unit
  const scale = Math.min(width * 0.72, height * 0.42) / Math.max(boxW, boxH)
  const drawW = boxW * scale
  const drawH = boxH * scale
  const ox = (width - drawW) / 2
  const oy = (height - drawH) / 2

  const world = thickened.map((p) => ({
    x: ox + p.x * scale,
    y: oy + p.y * scale,
  }))

  if (world.length === 0) {
    return Array.from({ length: count }, () => ({
      x: width * 0.5,
      y: height * 0.5,
    }))
  }

  // Shuffle then cycle so particles cover the whole word
  for (let i = world.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = world[i]!
    world[i] = world[j]!
    world[j] = tmp
  }

  const points: Pt[] = []
  for (let i = 0; i < count; i++) {
    const src = world[i % world.length]!
    points.push({
      x: src.x + (Math.random() - 0.5) * 1.5,
      y: src.y + (Math.random() - 0.5) * 1.5,
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
        p.vx = 0
        p.vy = 0
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
          p.vx = dx * FORM_EASE
          p.vy = dy * FORM_EASE
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

        if (!p.hasTarget) {
          if (p.x < -20) p.x = width + 20
          else if (p.x > width + 20) p.x = -20
          if (p.y < -20) p.y = height + 20
          else if (p.y > height + 20) p.y = -20
        }
      }
    },

    draw(ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const forming = performance.now() < formUntil
      ctx.fillStyle = forming
        ? 'rgba(210, 230, 255, 0.95)'
        : 'rgba(120, 170, 255, 0.55)'
      for (const p of particles) {
        const alpha = forming
          ? 0.9
          : 0.35 + Math.min(0.55, (Math.abs(p.vx) + Math.abs(p.vy)) * 0.35)
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, forming ? Math.max(1.4, p.size) : p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  }
}
