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
}

export function parseHash(): ParsedHash {
  const hash = new URLSearchParams(location.hash.slice(1))
  return {
    videoId: hash.get('v') || null,
    seed: hash.has('s') ? parseInt(hash.get('s')!, 10) : null,
    offset: hash.has('o') ? parseFloat(hash.get('o')!) : null,
    isLive: hash.has('l'),
  }
}

export interface HashParams {
  videoId?: string | null
  seed?: number | null
  offset?: string | number | null
  isLive?: boolean
}

export function buildShareHash({ videoId, seed, offset, isLive }: HashParams): string {
  const params = new URLSearchParams()
  if (videoId) params.set('v', videoId)
  if (seed != null) params.set('s', String(seed))
  if (offset != null) params.set('o', String(offset))
  if (isLive) params.set('l', '1')
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
}

export function getTarget({ seed, baseOffset, isLive = false, getDuration }: TargetParams): number {
  const elapsed = (now() - seed) / 1000
  let target = baseOffset + elapsed

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
