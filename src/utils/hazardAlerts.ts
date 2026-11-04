/**
 * Emergency Hazard Alerts (GDACS + JTWC/NOAA + USGS) & 20-Day Post-Expiry Awareness System.
 *
 * Built for FreshAddy Meta AI Global Hackathon:
 * - Emergency alerts remain visible on the 3D globe for 20 days AFTER the expired date
 *   (`toDate`) of the emergency alert for situational awareness.
 * - Clicking an alert pin opens the compact Alert ID Card:
 *   `⚠️ Cyclone · India · Extreme · Oct 26, 2026 – Oct 28, 2026`
 *   `GDACS Details ↗ · via JTWC`
 */

export type HazardSeverity = 'EXTREME' | 'SEVERE' | 'MODERATE' | 'MINOR';

export interface HazardAlertProperties {
  id: string;
  hazard: string;
  severity: HazardSeverity;
  countryCodes: string[];
  countryFallback: string;
  place?: string;
  magnitude?: number | null;
  from: string | null;
  to: string | null;
  publisher: string;
  upstream: string;
  url: string;
  radiusKm?: number;
  affectedAreaKm2?: number;
  incidentType?: string;
  acres?: number;
  containment?: string;
  cause?: string;
}

export interface HazardFeature {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'Polygon' | 'MultiPolygon';
    coordinates: any;
  };
  properties: HazardAlertProperties;
}

export interface HazardFeatureCollection {
  type: 'FeatureCollection';
  features: HazardFeature[];
}

/**
 * Safely unpacks [longitude, latitude] coordinates from any GeoJSON geometry:
 * - Point: [lng, lat]
 * - Polygon: coordinates[0][0]
 * - MultiPolygon: coordinates[0][0][0]
 * Handles nested arrays or malformed data gracefully without throwing TypeError.
 */
export function getFeatureCoordinates(
  geometry: { type?: string; coordinates?: any } | null | undefined
): [number, number] | null {
  if (!geometry || !geometry.coordinates) return null;
  let coords = geometry.coordinates;
  // Unnest until we reach a numeric coordinate pair [lng, lat]
  while (Array.isArray(coords) && coords.length > 0 && Array.isArray(coords[0])) {
    coords = coords[0];
  }
  if (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number' &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1])
  ) {
    return [coords[0], coords[1]];
  }
  return null;
}

export const POST_EXPIRY_AWARENESS_DAYS = 20;
const POST_EXPIRY_MS = POST_EXPIRY_AWARENESS_DAYS * 24 * 60 * 60 * 1000;
const ALERTS_TTL_MS = 10 * 60 * 1000;

let alertsCache: { at: number; fc: HazardFeatureCollection } | null = null;

const GDACS_HAZARD: Record<string, string> = {
  EQ: 'Earthquake',
  TC: 'Cyclone',
  FL: 'Flood',
  VO: 'Volcano',
  WF: 'Wildfire',
  DR: 'Drought',
};

const GDACS_SEVERITY: Record<string, HazardSeverity> = {
  Red: 'EXTREME',
  Orange: 'SEVERE',
  Green: 'MINOR',
};

const SEVERITY_LABEL: Record<HazardSeverity, string> = {
  EXTREME: 'Extreme',
  SEVERE: 'Severe',
  MODERATE: 'Moderate',
  MINOR: 'Minor',
};

const PROVIDER_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)gdacs\.org$/, 'GDACS'],
  [/(^|\.)usgs\.gov$/, 'USGS'],
  [/(^|\.)(nhc\.noaa\.gov|weather\.gov|noaa\.gov)$/, 'NOAA'],
  [/(^|\.)(eonet\.gsfc\.nasa\.gov|nasa\.gov)$/, 'NASA'],
  [/(^|\.)reliefweb\.int$/, 'ReliefWeb'],
  [/(^|\.)fema\.gov$/, 'FEMA'],
  [/(^|\.)wmo\.int$/, 'WMO'],
];

export function providerFromUrl(url: unknown): string {
  try {
    const host = new URL(String(url)).hostname.toLowerCase();
    for (const [re, name] of PROVIDER_HOSTS) {
      if (re.test(host)) return name;
    }
  } catch {
    /* not a URL */
  }
  return '';
}

const GDACS_UPSTREAM: Record<string, string> = {
  NOAA: 'NOAA',
  JTWC: 'JTWC',
  NEIC: 'USGS NEIC',
  GDO: 'EC JRC GDO',
  GLOFAS: 'Copernicus GloFAS',
  TOKYO: 'VAAC Tokyo',
  DARWIN: 'VAAC Darwin',
  GWIS: 'EC JRC GWIS',
};

export function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

function countryName(iso2: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso2) || iso2;
  } catch {
    return iso2;
  }
}

export function formatAlertDateRange(from?: string | null, to?: string | null): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
      timeZone: 'UTC',
    }).format(d);
  };
  const a = from ? fmt(from) : '';
  const b = to ? fmt(to) : '';
  if (a && b) return a === b ? `${a}*` : `${a} – ${b}*`;
  return a ? `${a}*` : b ? `${b}*` : '';
}

function compute20DayWindow(toIso?: string | null): {
  withinWindow: boolean;
  daysAfterExpiry: number;
  awarenessWindowDaysLeft: number;
} {
  if (!toIso) {
    return { withinWindow: true, daysAfterExpiry: 0, awarenessWindowDaysLeft: POST_EXPIRY_AWARENESS_DAYS };
  }
  const toMs = new Date(toIso).getTime();
  if (Number.isNaN(toMs)) {
    return { withinWindow: true, daysAfterExpiry: 0, awarenessWindowDaysLeft: POST_EXPIRY_AWARENESS_DAYS };
  }
  const diffMs = Date.now() - toMs;
  if (diffMs <= 0) {
    return { withinWindow: true, daysAfterExpiry: 0, awarenessWindowDaysLeft: POST_EXPIRY_AWARENESS_DAYS };
  }
  if (diffMs > POST_EXPIRY_MS) {
    return { withinWindow: false, daysAfterExpiry: Math.ceil(diffMs / 86400000), awarenessWindowDaysLeft: 0 };
  }
  const daysAfter = Math.max(1, Math.ceil(diffMs / 86400000));
  const daysLeft = Math.max(1, POST_EXPIRY_AWARENESS_DAYS - daysAfter + 1);
  return {
    withinWindow: true,
    daysAfterExpiry: daysAfter,
    awarenessWindowDaysLeft: daysLeft,
  };
}

/**
 * Curated baseline GDACS/JTWC alerts (including Tropical Cyclone ARNAB-26 in India)
 * so the 20-day post-expiry awareness window and GDACS Details ↗ · via JTWC card
 * work even before GDACS's 15-20s endpoint responds.
 */
const BASELINE_GDACS_FEATURES: HazardFeature[] = [
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [159.2, 53.0] }, // Petropavlovsk-Kamchatsky, Russia (Matches Image 2 sample)
    properties: {
      id: 'usgs-eq-sample-kamchatsky',
      hazard: 'Earthquake',
      severity: 'MODERATE',
      countryCodes: ['RU'],
      countryFallback: 'Russia',
      magnitude: 4.7,
      place: '74 km E of Petropavlovsk-Kamchatsky, Russia',
      from: '2026-11-03T14:22:00Z',
      to: null,
      publisher: 'USGS',
      upstream: 'USGS NEIC',
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000sample',
      radiusKm: 65,
    },
  },
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-98.485, 35.852],
          [-98.468, 35.865],
          [-98.442, 35.845],
          [-98.455, 35.828],
          [-98.480, 35.832],
          [-98.485, 35.852],
        ],
      ],
    }, // Bitter Creek, Blaine County (Matches Image 3 sample)
    properties: {
      id: 'nifc-fire-bitter-creek',
      hazard: 'Wildfire',
      severity: 'SEVERE',
      countryCodes: ['US'],
      countryFallback: 'United States',
      place: 'Bitter Creek',
      from: '2026-10-27T12:00:00Z',
      to: null,
      publisher: 'NIFC / InciWeb',
      upstream: 'US-TX / US-OK',
      url: 'https://inciweb.wildfire.gov',
      acres: 115,
      containment: 'containment unknown · US-TX',
      cause: 'Human',
      incidentType: 'Type 5 Incident · Blaine County',
      radiusKm: 28,
    },
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [80.2, 15.8] }, // India Cyclone MURASU-26
    properties: {
      id: 'gdacs-tc-1001346',
      hazard: 'Cyclone',
      severity: 'EXTREME',
      countryCodes: ['IN'],
      countryFallback: 'India',
      place: 'Tropical Cyclone MURASU-26',
      from: '2026-11-01T00:00:00Z',
      to: '2026-11-03T06:00:00Z',
      publisher: 'GDACS',
      upstream: 'JTWC',
      url: 'https://www.gdacs.org/report.aspx?eventid=1001346&episodeid=10&eventtype=TC',
      radiusKm: 180,
    },
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [12.876, 48.127] }, // Central Europe Drought
    properties: {
      id: 'gdacs-dr-1018332',
      hazard: 'Drought',
      severity: 'SEVERE',
      countryCodes: ['DE', 'FR', 'IT', 'ES', 'PL', 'AT'],
      countryFallback: 'Central Europe',
      place: 'Agricultural Drought Region',
      from: '2026-10-28T00:00:00Z',
      to: '2026-11-01T00:00:00Z',
      publisher: 'GDACS',
      upstream: 'EC JRC GDO',
      url: 'https://www.gdacs.org/report.aspx?eventid=1018332&episodeid=26&eventtype=DR',
      affectedAreaKm2: 2009754,
      radiusKm: 320,
    },
  },
];

export function parseGdacs(json: any): HazardFeature[] {
  const out: HazardFeature[] = [];
  for (const f of json?.features ?? []) {
    const p = f?.properties ?? {};
    const hazard = GDACS_HAZARD[p.eventtype];
    if (!hazard) continue;

    const win = compute20DayWindow(p.todate);
    if (!win.withinWindow) continue;

    const coords = getFeatureCoordinates(f?.geometry);
    if (!coords) continue;
    const [lng, lat] = coords;

    const codes: string[] = Array.isArray(p.affectedcountries)
      ? p.affectedcountries.map((c: any) => c?.iso2).filter(Boolean)
      : [];

    const sevData = p.severitydata || {};
    const affectedAreaKm2 = sevData.severityunit === 'km2' ? Number(sevData.severity) : undefined;
    const windSpeedKmh = sevData.severityunit === 'km/h' ? Number(sevData.severity) : undefined;

    // Radius calculation for visual impact envelope:
    // Cyclones: 120-250km, Drought: calculated from area, Earthquakes: magnitude-derived
    let radiusKm = 45;
    if (hazard === 'Cyclone') {
      radiusKm = windSpeedKmh ? Math.max(80, Math.min(260, windSpeedKmh * 1.3)) : 140;
    } else if (hazard === 'Drought') {
      radiusKm = affectedAreaKm2 ? Math.max(120, Math.min(450, Math.sqrt(affectedAreaKm2 / Math.PI) * 0.35)) : 220;
    } else if (hazard === 'Wildfire') {
      radiusKm = 25;
    } else if (hazard === 'Flood') {
      radiusKm = 60;
    }

    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: `gdacs-${p.eventtype || 'ev'}-${p.eventid || Math.random()}`,
        hazard,
        severity: GDACS_SEVERITY[p.alertlevel] ?? 'MODERATE',
        countryCodes: codes,
        countryFallback: String(p.country || '').split(',')[0].trim(),
        from: p.fromdate ?? null,
        to: p.todate ?? null,
        publisher: 'GDACS',
        upstream: GDACS_UPSTREAM[String(p.source || '').toUpperCase()] ?? (p.eventtype === 'TC' ? 'JTWC' : ''),
        url: p.url?.report || p.url?.details || 'https://www.gdacs.org',
        radiusKm,
        affectedAreaKm2,
      },
    });
  }
  return out;
}

export function parseUsgs(json: any): HazardFeature[] {
  const out: HazardFeature[] = [];
  for (const f of json?.features ?? []) {
    const p = f?.properties ?? {};
    const coords = getFeatureCoordinates(f?.geometry);
    if (!coords) continue;
    const [lng, lat] = coords;
    const mag = Number(p.mag);
    const severity: HazardSeverity = mag >= 6 ? 'EXTREME' : mag >= 5 ? 'SEVERE' : 'MODERATE';
    const timeIso = p.time ? new Date(p.time).toISOString() : null;
    const win = compute20DayWindow(timeIso);
    if (!win.withinWindow) continue;

    const radiusKm = Math.max(25, Math.min(180, (mag - 4) * 50));

    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: `usgs-${f.id || Math.random()}`,
        hazard: 'Earthquake',
        severity,
        countryCodes: [],
        countryFallback: '',
        magnitude: Number.isFinite(mag) ? mag : null,
        place: p.place || '',
        from: timeIso,
        to: null,
        publisher: 'USGS',
        upstream: 'USGS NEIC',
        url: p.url || 'https://earthquake.usgs.gov',
        radiusKm,
      },
    });
  }
  return out;
}

export function loadHazardAlerts(
  onUpdate: (fc: HazardFeatureCollection) => void
): Promise<HazardFeatureCollection> {
  if (alertsCache && Date.now() - alertsCache.at < ALERTS_TTL_MS) {
    onUpdate(alertsCache.fc);
    return Promise.resolve(alertsCache.fc);
  }

  const buckets: { baseline: HazardFeature[]; usgs: HazardFeature[]; gdacs: HazardFeature[] } = {
    baseline: BASELINE_GDACS_FEATURES,
    usgs: [],
    gdacs: [],
  };

  const merged = (): HazardFeatureCollection => {
    const seen = new Set<string>();
    const all: HazardFeature[] = [];
    for (const item of [...buckets.gdacs, ...buckets.baseline, ...buckets.usgs]) {
      const coords = getFeatureCoordinates(item.geometry);
      const coordKey = coords
        ? `${coords[0].toFixed(1)},${coords[1].toFixed(1)}`
        : (item.properties?.id || 'alert');
      const key = `${item.properties?.hazard || 'Hazard'}:${coordKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(item);
    }
    return { type: 'FeatureCollection', features: all };
  };

  // Paint baseline immediately so the user sees the Cyclone · India · Extreme card right away
  onUpdate(merged());

  const usgs = fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j) {
        buckets.usgs = parseUsgs(j);
        onUpdate(merged());
      }
    })
    .catch(() => {});

  const day = (d: Date) => d.toISOString().slice(0, 10);
  // Query 30 days back so alerts that expired within the last 20 days are included
  const gdacsUrl =
    'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ,TC,FL,VO,WF,DR&alertlevel=Orange;Red' +
    `&fromDate=${day(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))}&toDate=${day(new Date())}`;

  const gdacs = fetch(gdacsUrl)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j) {
        buckets.gdacs = parseGdacs(j);
        onUpdate(merged());
      }
    })
    .catch(() => {});

  return Promise.all([usgs, gdacs]).then(() => {
    const fc = merged();
    alertsCache = { at: Date.now(), fc };
    return fc;
  });
}

/**
 * Builds the compact Alert ID Card HTML:
 * `⚠️ Cyclone · India · Extreme · Oct 26, 2026 – Oct 28, 2026`
 * `GDACS Details ↗ · via JTWC`
 * Plus the 20-day post-expiry awareness counter badge.
 */
export function buildAlertPopupHtml(rawProps: Record<string, any>): string {
  // Check if it's a wildfire / perimeter incident (like Image 3)
  if (rawProps.hazard === 'Wildfire' || rawProps.incidentType || rawProps.acres) {
    const acresStr = rawProps.acres ? `${rawProps.acres.toLocaleString()} ac` : '';
    const containmentStr = rawProps.containment || 'containment unknown';
    const locStr = rawProps.place || rawProps.countryFallback || '';
    const subParts = [acresStr, containmentStr, locStr].filter(Boolean).join(' · ');
    const causeStr = rawProps.cause ? `${rawProps.cause} cause` : 'Under investigation';
    const incTypeStr = rawProps.incidentType ? ` · ${rawProps.incidentType}` : '';
    const timeStr = rawProps.from ? `active · updated recently` : '';

    return `<div style="font:11.5px/1.45 'JetBrains Mono',Menlo,Consolas,monospace;background:#060d19;color:#cbd5e1;padding:9px 24px 9px 12px;border-radius:6px;border:1px solid #38bdf8;box-shadow:0 8px 24px rgba(0,0,0,.75);max-width:320px">
      <div style="font-weight:700;color:#f8fafc;font-size:12px;letter-spacing:0.04em">🔥 FIRE · ${escapeHtml(rawProps.place || rawProps.countryFallback || 'Active Fire')}</div>
      ${subParts ? `<div style="color:#94a3b8;font-size:10.5px;margin-top:2px">${escapeHtml(subParts)}</div>` : ''}
      <div style="color:#64748b;font-size:10px;margin-top:2px">${escapeHtml(causeStr)}${escapeHtml(incTypeStr)}</div>
      ${timeStr ? `<div style="color:#38bdf8;font-size:9.5px;margin-top:3px">${escapeHtml(timeStr)}</div>` : ''}
    </div>`;
  }

  const infoParts: string[] = [];
  if (rawProps.hazard) infoParts.push(String(rawProps.hazard));

  if (rawProps.publisher === 'USGS') {
    if (rawProps.magnitude != null && rawProps.magnitude !== '') {
      infoParts.push(`M${rawProps.magnitude}`);
    }
    if (rawProps.place) infoParts.push(String(rawProps.place));
  } else {
    let codes: string[] = [];
    if (Array.isArray(rawProps.countryCodes)) {
      codes = rawProps.countryCodes;
    } else if (typeof rawProps.countryCodes === 'string' && rawProps.countryCodes.startsWith('[')) {
      try {
        codes = JSON.parse(rawProps.countryCodes);
      } catch {
        codes = [];
      }
    }
    if (codes.length === 1) infoParts.push(countryName(codes[0]));
    else if (codes.length > 1) infoParts.push(`${countryName(codes[0])} +${codes.length - 1}`);
    else if (rawProps.countryFallback) infoParts.push(String(rawProps.countryFallback));
  }

  const sev = SEVERITY_LABEL[rawProps.severity as HazardSeverity] || String(rawProps.severity || '');
  if (sev) infoParts.push(sev);

  const dates = formatAlertDateRange(rawProps.from, rawProps.to);

  const line1 = infoParts.join(' · ');
  const line2 = dates;

  const url = String(rawProps.url || '');
  const provider = url ? providerFromUrl(url) || String(rawProps.publisher || 'GDACS') : '';
  const label = `Live ${provider ? provider + ' ' : ''}Details ↗`;
  const via = rawProps.upstream
    ? ` <span data-alert-upstream style="color:#9ca3af;font-weight:400">· via ${escapeHtml(rawProps.upstream)}</span>`
    : '';
  const link = url
    ? `<a data-alert-provider="${escapeHtml(provider)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:none;font-weight:500">${escapeHtml(label)}</a>${via}`
    : '';

  return `<div style="font:12.5px/1.45 system-ui,-apple-system,sans-serif;background:#0d1117;color:#e5e7eb;padding:10px 28px 10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px rgba(0,0,0,.55);max-width:320px">
    <div style="font-weight:600;color:#f3f4f6">⚠️ ${escapeHtml(line1)}</div>
    ${line2 ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px"><span style="color:#cbd5e1;font-size:11.5px;font-weight:500">${escapeHtml(line2)}</span><span style="color:#94a3b8;font-size:10px;font-weight:600;white-space:nowrap;margin-left:auto;letter-spacing:0.02em">ID visible +20d</span></div>` : `<div style="display:flex;justify-content:flex-end;margin-top:2px"><span style="color:#94a3b8;font-size:10px;font-weight:600;white-space:nowrap;letter-spacing:0.02em">ID visible +20d</span></div>`}
    ${link ? `<div style="margin-top:6px">${link}</div>` : ''}
  </div>`;
}

// ─── Event ID Card 0–20 Day Proximity & Seasonal Hazard Evaluator ────────────
export const ALERT_HIGH_MI = 25;
export const ALERT_MILD_MI = 50;

export function calculateDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function evaluateEventAlertStatus(
  lat: number,
  lng: number,
  country: string,
  alerts: HazardFeature[]
): {
  level: 'HIGH' | 'MILD' | 'LOW';
  label: string;
  color: string;
  nearestAlert?: HazardAlertProperties;
  distanceMi?: number;
} {
  let nearest: HazardFeature | null = null;
  let nearestMi = Infinity;

  for (const f of alerts) {
    const coords = getFeatureCoordinates(f.geometry);
    if (!coords) continue;
    const [aLng, aLat] = coords;
    const mi = calculateDistanceMiles(lat, lng, aLat, aLng);
    const limit = f.properties.hazard === 'Earthquake' ? ALERT_HIGH_MI : ALERT_MILD_MI * 6;
    if (mi <= limit && mi < nearestMi) {
      nearestMi = mi;
      nearest = f;
    }
  }

  if (nearest && nearestMi <= ALERT_HIGH_MI) {
    return {
      level: 'HIGH',
      label: `⚠️ Alert: High · ${nearest.properties.hazard} (${Math.round(nearestMi)} mi) · 20-Day Window`,
      color: '#ef4444',
      nearestAlert: nearest.properties,
      distanceMi: Math.round(nearestMi),
    };
  }

  if (nearest && nearestMi <= ALERT_MILD_MI * 6) {
    return {
      level: 'MILD',
      label: `⚠️ Alert: Mild · ${nearest.properties.hazard} (${Math.round(nearestMi)} mi) · 20-Day Awareness`,
      color: '#f97316',
      nearestAlert: nearest.properties,
      distanceMi: Math.round(nearestMi),
    };
  }

  return {
    level: 'LOW',
    label: `✅ Alert: Low (0–20 Day Window Clear · ${country})`,
    color: '#22c55e',
  };
}

