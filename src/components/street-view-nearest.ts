/**
 * Exact-spot street photo search + "a block or two" coverage clip.
 *
 * Card taps used to take the first Mapillary photo in a ~300 m box, which in
 * Miami landed on Miamarina instead of Bayfront Park. Now:
 *   1. Search a tiny box at the item's own lat/lng.
 *   2. Nothing there → widen in steps (like the Stay22 map zooming out to the
 *      nearest hotels) until a photo turns up.
 *   3. Pick the photo closest to the spot; on a near tie, the one facing it.
 *
 * The coverage helpers clip the green Mapillary lines to a small circle so the
 * map shows the block or two around the spot, not the whole city.
 */

export type LatLng = { lat: number; lng: number }

export type NearestPhoto = {
  id: string
  lat: number
  lng: number
  /** Metres from the requested spot to the photo. */
  distanceM: number
  /** Search ring (metres) that found it. */
  radiusM: number
}

/** Search rings in metres: exact spot first, then outward. */
export const SEARCH_RADII_M = [15, 30, 60, 120, 250, 500, 1000, 2000, 5000] as const

/** Green coverage radius around the spot — about two city blocks. */
export const FOCUS_RADIUS_M = 200

const EARTH_R = 6_371_000
const toRad = (d: number) => (d * Math.PI) / 180

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Compass bearing (0 = north, clockwise) from a to b. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** lng/lat box of half-size `m` metres around p. */
export function bboxAround(p: LatLng, m: number): [number, number, number, number] {
  const dLat = m / 111_320
  const dLng = m / (111_320 * Math.max(0.01, Math.cos(toRad(p.lat))))
  return [p.lng - dLng, p.lat - dLat, p.lng + dLng, p.lat + dLat]
}

type GraphImage = {
  id?: string
  computed_geometry?: { coordinates?: number[] }
  geometry?: { coordinates?: number[] }
  compass_angle?: number
  computed_compass_angle?: number
  is_pano?: boolean
}

export type Candidate = {
  id: string
  lat: number
  lng: number
  compass?: number
  pano?: boolean
}

function toCandidate(img: GraphImage): Candidate | null {
  const c = img.computed_geometry?.coordinates || img.geometry?.coordinates
  if (!img.id || !c || c.length < 2) return null
  const lng = Number(c[0])
  const lat = Number(c[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const compass = img.computed_compass_angle ?? img.compass_angle
  return {
    id: String(img.id),
    lat,
    lng,
    compass: Number.isFinite(compass) ? Number(compass) : undefined,
    pano: !!img.is_pano,
  }
}

/**
 * Closest candidate to the spot. Photos within 10 m of the closest count as a
 * tie; among those a 360° photo or one pointing at the spot wins.
 */
export function pickNearest(spot: LatLng, cands: Candidate[]): (Candidate & { distanceM: number }) | null {
  if (!cands.length) return null
  const withD = cands.map((c) => ({ ...c, distanceM: distanceM(spot, c) }))
  withD.sort((a, b) => a.distanceM - b.distanceM)
  const best = withD[0]
  const ties = withD.filter((c) => c.distanceM <= best.distanceM + 10)
  const facing = (c: (typeof withD)[number]) => {
    if (c.pano) return 0
    if (c.compass == null || c.distanceM < 3) return 90
    const diff = Math.abs(((bearingDeg(c, spot) - c.compass + 540) % 360) - 180)
    return diff
  }
  ties.sort((a, b) => facing(a) - facing(b) || a.distanceM - b.distanceM)
  return ties[0]
}

const FIELDS_FULL = 'id,computed_geometry,geometry,compass_angle,is_pano'
const FIELDS_SLIM = 'id,geometry'

async function queryBox(
  spot: LatLng,
  radius: number,
  token: string,
  fetchImpl: typeof fetch,
): Promise<Candidate[] | null> {
  const bbox = bboxAround(spot, radius).map((n) => n.toFixed(6)).join(',')
  // In dense city areas, Mapillary Graph API throws "reduce the amount of data"
  // if fields or limits are too large. Query id and geometry with limit=5 first.
  for (const [fields, limit] of [
    [FIELDS_SLIM, 5],
    [FIELDS_SLIM, 15],
    [FIELDS_FULL, 10],
  ] as const) {
    const url =
      `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}` +
      `&fields=${fields}&bbox=${bbox}&limit=${limit}`
    try {
      const res = await fetchImpl(url)
      if (!res.ok) continue
      const json = (await res.json()) as { data?: GraphImage[]; error?: any }
      if (json.error) continue
      if (Array.isArray(json.data) && json.data.length > 0) {
        return json.data.map(toCandidate).filter((c): c is Candidate => !!c)
      }
    } catch {
      // Try next configuration
    }
  }
  return null
}

/**
 * Nearest Mapillary photo to `spot`, widening ring by ring. Returns null when
 * nothing exists within the last ring.
 */
export async function findNearestPhoto(
  spot: LatLng,
  token: string,
  opts: { fetchImpl?: typeof fetch; radii?: readonly number[] } = {},
): Promise<NearestPhoto | null> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const radii = opts.radii ?? SEARCH_RADII_M
  let anyAnswer = false
  for (const radius of radii) {
    const cands = await queryBox(spot, radius, token, fetchImpl)
    if (cands === null) continue
    anyAnswer = true
    const best = pickNearest(spot, cands)
    if (best) {
      return { id: best.id, lat: best.lat, lng: best.lng, distanceM: best.distanceM, radiusM: radius }
    }
  }
  if (!anyAnswer) throw new Error('mapillary unreachable')
  return null
}

/* ── coverage clip ────────────────────────────────────────────────────── */

type Pos = [number, number]

/** Circle polygon ring (lng/lat) around p. */
export function circleRing(p: LatLng, radiusM: number, steps = 64): Pos[] {
  const ring: Pos[] = []
  const kLat = radiusM / 111_320
  const kLng = radiusM / (111_320 * Math.max(0.01, Math.cos(toRad(p.lat))))
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    ring.push([p.lng + kLng * Math.cos(a), p.lat + kLat * Math.sin(a)])
  }
  return ring
}

/**
 * Keep only the parts of each line inside the circle. Works in a flat
 * metre grid around the centre — fine at a couple of hundred metres.
 */
export function clipLinesToCircle(lines: Pos[][], center: LatLng, radiusM: number): Pos[][] {
  const kx = 111_320 * Math.cos(toRad(center.lat))
  const ky = 111_320
  const toXY = (p: Pos) => [(p[0] - center.lng) * kx, (p[1] - center.lat) * ky] as const
  const toLL = (x: number, y: number): Pos => [center.lng + x / kx, center.lat + y / ky]
  const r2 = radiusM * radiusM
  const out: Pos[][] = []
  for (const line of lines) {
    let cur: Pos[] = []
    const flush = () => {
      if (cur.length >= 2) out.push(cur)
      cur = []
    }
    for (let i = 0; i < line.length - 1; i++) {
      const [x0, y0] = toXY(line[i])
      const [x1, y1] = toXY(line[i + 1])
      const dx = x1 - x0
      const dy = y1 - y0
      const a = dx * dx + dy * dy
      const b = 2 * (x0 * dx + y0 * dy)
      const c = x0 * x0 + y0 * y0 - r2
      if (a === 0) continue
      const disc = b * b - 4 * a * c
      if (disc <= 0) {
        flush()
        continue
      }
      const sq = Math.sqrt(disc)
      const t0 = Math.max(0, (-b - sq) / (2 * a))
      const t1 = Math.min(1, (-b + sq) / (2 * a))
      if (t0 >= t1) {
        flush()
        continue
      }
      const start = toLL(x0 + dx * t0, y0 + dy * t0)
      const end = toLL(x0 + dx * t1, y0 + dy * t1)
      if (t0 > 0 || cur.length === 0) {
        flush()
        cur.push(start)
      }
      cur.push(end)
      if (t1 < 1) flush()
    }
    flush()
  }
  return out
}
