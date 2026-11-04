/**
 * Place line for the in-app street photo.
 *
 * Mapillary image objects only carry a point (computed_geometry, else
 * geometry). They do not carry a street address. The line is a reverse
 * geocode of that point with Nominatim, then Photon — both already used
 * for geocoding in this app. Nothing here opens a browser.
 */

export type LatLng = { lat: number; lng: number }

type NominatimAddress = Record<string, string | undefined>
type PhotonProps = Record<string, string | undefined>
type PhotonFeature = { properties?: PhotonProps }

const ROAD_VALUES = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "pedestrian",
  "road",
])

export function formatStreetCity(
  street: string | null | undefined,
  city: string | null | undefined,
): string | null {
  const s = (street || "").replace(/\s+/g, " ").trim()
  const c = (city || "").replace(/\s+/g, " ").trim()
  if (!s && !c) return null
  if (s && c) return `${s}, ${c}`
  return s || c
}

export function addressFromNominatim(address: NominatimAddress | null | undefined): string | null {
  if (!address) return null
  const road =
    address.road ||
    address.pedestrian ||
    address.footway ||
    address.residential ||
    address.cycleway
  const street = [address.house_number, road].filter(Boolean).join(" ")
  const city =
    address.city || address.town || address.village || address.hamlet || address.municipality
  return formatStreetCity(street, city)
}

export function addressFromPhoton(features: PhotonFeature[] | null | undefined): string | null {
  const rows = features || []
  for (const feature of rows) {
    const props = feature.properties || {}
    if (props.osm_key === "highway" && props.osm_value && ROAD_VALUES.has(props.osm_value) && props.name) {
      const city = props.city || props.locality || props.district
      const line = formatStreetCity(props.name, city)
      if (line) return line
    }
  }
  for (const feature of rows) {
    const props = feature.properties || {}
    const street = [props.housenumber, props.street].filter(Boolean).join(" ")
    const city = props.city || props.locality
    const line = formatStreetCity(street, city)
    if (line && street) return line
  }
  return null
}

function finitePoint(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

async function readJson(res: Response): Promise<unknown> {
  return res.json()
}

export async function mapillaryImagePoint(
  imageId: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LatLng | null> {
  const url =
    `https://graph.mapillary.com/${encodeURIComponent(imageId)}` +
    `?access_token=${encodeURIComponent(token)}&fields=computed_geometry,geometry`
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return null
    const data = (await readJson(res)) as {
      computed_geometry?: { coordinates?: number[] }
      geometry?: { coordinates?: number[] }
    }
    const coords = data.computed_geometry?.coordinates || data.geometry?.coordinates
    if (!coords || coords.length < 2) return null
    return finitePoint(Number(coords[1]), Number(coords[0]))
  } catch {
    return null
  }
}

async function nominatimReverse(point: LatLng, fetchImpl: typeof fetch): Promise<string | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${point.lat}&lon=${point.lng}` +
    `&format=jsonv2&addressdetails=1&zoom=16`
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } })
    if (!res.ok) return null
    const data = (await readJson(res)) as { address?: NominatimAddress }
    return addressFromNominatim(data.address)
  } catch {
    return null
  }
}

async function photonReverse(point: LatLng, fetchImpl: typeof fetch): Promise<string | null> {
  const url = `https://photon.komoot.io/reverse?lat=${point.lat}&lon=${point.lng}&limit=8`
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } })
    if (!res.ok) return null
    const data = (await readJson(res)) as { features?: PhotonFeature[] }
    return addressFromPhoton(data.features)
  } catch {
    return null
  }
}

export async function reverseStreetCity(
  point: LatLng,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const fromNominatim = await nominatimReverse(point, fetchImpl)
  if (fromNominatim) return fromNominatim
  return photonReverse(point, fetchImpl)
}

/* ── Place-level lines for ID cards ──────────────────────────────────────
 *
 * Same Nominatim → Photon pair as the street line above, but at city zoom:
 * "City, Region, Country" instead of "123 Road, City". The ID card uses this
 * when a pin only carries lat/lng (most cinema/lore pins), so the card shows a
 * real place instead of a placeholder. Callers cache the result.
 */

/** Trim, drop empties, and drop case-insensitive repeats ("Iceland, Iceland"). */
export function joinPlaceParts(parts: Array<string | null | undefined>): string | null {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of parts) {
    const s = (raw || "").replace(/\s+/g, " ").trim()
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out.length ? out.join(", ") : null
}

export function placeFromNominatim(address: NominatimAddress | null | undefined): string | null {
  if (!address) return null
  const locality =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.hamlet ||
    address.suburb
  const region =
    address.state || address.region || address.province || address.state_district || address.county
  return joinPlaceParts([locality, region, address.country])
}

export function placeFromPhoton(features: PhotonFeature[] | null | undefined): string | null {
  for (const feature of features || []) {
    const props = feature.properties || {}
    const locality =
      props.city ||
      props.locality ||
      props.district ||
      (props.osm_key === "place" ? props.name : undefined)
    const line = joinPlaceParts([locality, props.state || props.county, props.country])
    if (line) return line
  }
  return null
}

async function nominatimReversePlace(point: LatLng, fetchImpl: typeof fetch): Promise<string | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${point.lat}&lon=${point.lng}` +
    `&format=jsonv2&addressdetails=1&zoom=10`
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } })
    if (!res.ok) return null
    const data = (await readJson(res)) as { address?: NominatimAddress }
    return placeFromNominatim(data.address)
  } catch {
    return null
  }
}

async function photonReversePlace(point: LatLng, fetchImpl: typeof fetch): Promise<string | null> {
  const url = `https://photon.komoot.io/reverse?lat=${point.lat}&lon=${point.lng}&limit=3`
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } })
    if (!res.ok) return null
    const data = (await readJson(res)) as { features?: PhotonFeature[] }
    return placeFromPhoton(data.features)
  } catch {
    return null
  }
}

/** "City, Region, Country" for a point, or null over open water / on failure. */
export async function reversePlaceLabel(
  point: LatLng,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const p = finitePoint(point.lat, point.lng)
  if (!p) return null
  const fromNominatim = await nominatimReversePlace(p, fetchImpl)
  if (fromNominatim) return fromNominatim
  return photonReversePlace(p, fetchImpl)
}

/** Point for a human place line (card has a city/country but no lat/lng). */
export async function forwardGeocodePlace(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LatLng | null> {
  const q = query.replace(/\s+/g, " ").trim()
  if (!q) return null
  try {
    const res = await fetchImpl(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=1`,
      { headers: { Accept: "application/json" } },
    )
    if (res.ok) {
      const rows = (await readJson(res)) as Array<{ lat?: string; lon?: string }>
      const hit = rows?.[0]
      const p = hit ? finitePoint(Number(hit.lat), Number(hit.lon)) : null
      if (p) return p
    }
  } catch {
    /* fall through to Photon */
  }
  try {
    const res = await fetchImpl(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`,
      { headers: { Accept: "application/json" } },
    )
    if (!res.ok) return null
    const data = (await readJson(res)) as {
      features?: Array<{ geometry?: { coordinates?: number[] } }>
    }
    const c = data.features?.[0]?.geometry?.coordinates
    return c && c.length >= 2 ? finitePoint(Number(c[1]), Number(c[0])) : null
  } catch {
    return null
  }
}
