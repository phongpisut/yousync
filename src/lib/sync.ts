export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()

  const patterns: RegExp[] = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/|youtube\.com\/embed\/)([\w-]{11})/,
    /^([\w-]{11})$/, // plain video ID
  ]

  for (const p of patterns) {
    const m = trimmed.match(p)
    if (m && m[1]) return m[1]
  }

  return null
}

export interface ParsedHash {
  videoId: string | null
  seed: number | null
  offset: number | null
  isLive: boolean
  buffer: number
}

export function parseHash(): ParsedHash {
  const hash = new URLSearchParams(location.hash.slice(1))
  return {
    videoId: hash.get('v') || null,
    seed: hash.has('s') ? parseInt(hash.get('s')!, 10) : null,
    offset: hash.has('o') ? parseFloat(hash.get('o')!) : null,
    isLive: hash.has('l'),
    buffer: hash.has('b') ? parseFloat(hash.get('b')!) : 0,
  }
}

export interface HashParams {
  videoId?: string | null
  seed?: number | null
  offset?: string | number | null
  isLive?: boolean
  buffer?: number
}

export function buildShareHash({ videoId, seed, offset, isLive, buffer }: HashParams): string {
  const params = new URLSearchParams()
  if (videoId) params.set('v', videoId)
  if (seed != null) params.set('s', String(seed))
  if (offset != null) params.set('o', String(offset))
  if (isLive) params.set('l', '1')
  if (buffer != null && buffer !== 0) params.set('b', String(buffer))
  return params.toString()
}

export function getShareUrl(hashString: string): string {
  const base = location.origin + location.pathname
  return base + '#' + hashString
}

// Time calibration
// NOTE: worldtimeapi.org is a free public service. It won't survive massive
// traffic (e.g. 1M+ users). If it fails or is rate-limited, we gracefully
// fall back to the local device clock. For high-traffic production use,
// replace the URL below with your own lightweight time endpoint or a CDN
// that serves a plain Unix timestamp.
let timeOffset: number = 0
let calibrated: boolean = false

interface WorldTimeApiResponse {
  utc_datetime: string
}

export async function calibrateTime(): Promise<void> {
  try {
    const start = performance.now()
    const res = await fetch('https://worldtimeapi.org/api/ip')
    const data = (await res.json()) as WorldTimeApiResponse
    const rtt = performance.now() - start
    const serverTime = new Date(data.utc_datetime).getTime() + (rtt / 2)
    timeOffset = serverTime - Date.now()
    calibrated = true
  } catch {
    timeOffset = 0
    calibrated = false
  }
}

export function now(): number {
  return Date.now() + timeOffset
}

export function isCalibrated(): boolean {
  return calibrated
}

// Sync math
const LIVE_BUFFER = 10 // stay 10s behind edge

export interface TargetParams {
  seed: number
  baseOffset: number
  isLive?: boolean
  getDuration?: () => number | undefined
  buffer?: number
}

export function getTarget({ seed, baseOffset, isLive = false, getDuration, buffer = 0 }: TargetParams): number {
  const elapsed = Math.max(0, (now() - seed) / 1000)
  let target = baseOffset + elapsed + buffer

  if (isLive && typeof getDuration === 'function') {
    const duration = getDuration()
    if (duration != null && target > duration - LIVE_BUFFER) {
      target = duration - LIVE_BUFFER
    }
  }

  return Math.max(0, target)
}

export function getElapsedSeconds(seed: number): number {
  return (now() - seed) / 1000
}

export function parseYouTubeTime(input: string | null | undefined): number | null {
  if (!input) return null
  const trimmed = input.trim()

  // Full URL with t= param
  try {
    const url = new URL(trimmed)
    const t = url.searchParams.get('t')
    if (t) {
      const parsed = parseTimeString(t)
      if (parsed != null) return parsed
    }
  } catch {
    // not a URL
  }

  // Just a time string like "2m3s", "123", "02:03"
  return parseTimeString(trimmed)
}

export function parseTimeString(str: string): number | null {
  str = str.trim()

  // plain seconds (e.g. "123")
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10)
  }

  // YouTube-style duration (e.g. "1h2m3s", "2m3s", "1h", "30s")
  const durationMatch = str.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)$/i)
  if (durationMatch) {
    const h = parseInt(durationMatch[1] || '0', 10)
    const m = parseInt(durationMatch[2] || '0', 10)
    const s = parseInt(durationMatch[3] || '0', 10)
    return h * 3600 + m * 60 + s
  }

  // Colon-separated (e.g. "01:02:03", "02:03", "1:30")
  const colonParts = str.split(':').map(Number)
  if (colonParts.length >= 2 && colonParts.every((n) => !isNaN(n))) {
    if (colonParts.length === 3) {
      const [h, m, s] = colonParts
      return h * 3600 + m * 60 + s
    }
    if (colonParts.length === 2) {
      const [m, s] = colonParts
      return m * 60 + s
    }
  }

  return null
}
