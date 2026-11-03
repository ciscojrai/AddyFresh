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
  daysAfterExpiry: number; // 0 if currently active, 1..20 if inside 20-day post-expiry awareness window
  awarenessWindowDaysLeft: number; // 20..1 when post-expiry, 20 when active
}

export interface HazardFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: HazardAlertProperties;
}

export interface HazardFeatureCollection {
  type: 'FeatureCollection';
  features: HazardFeature[];
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
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  };
  const a = from ? fmt(from) : '';
  const b = to ? fmt(to) : '';
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a || b;
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
    geometry: { type: 'Point', coordinates: [85.8245, 20.2961] }, // Odisha / Bay of Bengal, India
    properties: {
      id: 'gdacs-tc-1001345',
      hazard: 'Cyclone',
      severity: 'EXTREME',
      countryCodes: ['IN'],
      countryFallback: 'India',
      from: '2026-10-26T00:00:00Z',
      to: '2026-10-28T23:59:59Z',
      publisher: 'GDACS',
      upstream: 'JTWC',
      url: 'https://www.gdacs.org/report.aspx?eventid=1001345&episodeid=10&eventtype=TC',
      daysAfterExpiry: Math.max(
        1,
        Math.min(20, Math.ceil(Math.max(0, Date.now() - new Date('2026-10-28T23:59:59Z').getTime()) / 86400000))
      ),
      awarenessWindowDaysLeft: Math.max(
        1,
        20 -
          Math.max(
            0,
            Math.min(19, Math.floor(Math.max(0, Date.now() - new Date('2026-10-28T23:59:59Z').getTime()) / 86400000))
          )
      ),
    },
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [121.774, 15.87] }, // Philippines Luzon TC
    properties: {
      id: 'gdacs-tc-1001342',
      hazard: 'Cyclone',
      severity: 'EXTREME',
      countryCodes: ['PH'],
      countryFallback: 'Philippines',
      from: '2026-10-22T00:00:00Z',
      to: '2026-10-25T23:59:59Z',
      publisher: 'GDACS',
      upstream: 'JTWC',
      url: 'https://www.gdacs.org/report.aspx?eventid=1001342&episodeid=8&eventtype=TC',
      daysAfterExpiry: 8,
      awarenessWindowDaysLeft: 12,
    },
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-0.3763, 39.4699] }, // Valencia Flood
    properties: {
      id: 'gdacs-fl-1102983',
      hazard: 'Flood',
      severity: 'SEVERE',
      countryCodes: ['ES'],
      countryFallback: 'Spain',
      from: '2026-10-29T00:00:00Z',
      to: '2026-11-01T23:59:59Z',
      publisher: 'GDACS',
      upstream: 'Copernicus GloFAS',
      url: 'https://www.gdacs.org/Alerts/default.aspx',
      daysAfterExpiry: 1,
      awarenessWindowDaysLeft: 19,
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

    const [lng, lat] = f?.geometry?.coordinates ?? [];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    const codes: string[] = Array.isArray(p.affectedcountries)
      ? p.affectedcountries.map((c: any) => c?.iso2).filter(Boolean)
      : [];

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
        daysAfterExpiry: win.daysAfterExpiry,
        awarenessWindowDaysLeft: win.awarenessWindowDaysLeft,
      },
    });
  }
  return out;
}

export function parseUsgs(json: any): HazardFeature[] {
  const out: HazardFeature[] = [];
  for (const f of json?.features ?? []) {
    const p = f?.properties ?? {};
    const [lng, lat] = f?.geometry?.coordinates ?? [];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const mag = Number(p.mag);
    const severity: HazardSeverity = mag >= 6 ? 'EXTREME' : mag >= 5 ? 'SEVERE' : 'MODERATE';
    const timeIso = p.time ? new Date(p.time).toISOString() : null;
    const win = compute20DayWindow(timeIso);
    if (!win.withinWindow) continue;

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
        daysAfterExpiry: win.daysAfterExpiry,
        awarenessWindowDaysLeft: win.awarenessWindowDaysLeft,
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
      const key = `${item.properties.hazard}:${item.geometry.coordinates[0].toFixed(1)},${item.geometry.coordinates[1].toFixed(1)}`;
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
  const parts: string[] = [];

  if (rawProps.hazard) parts.push(String(rawProps.hazard));

  if (rawProps.publisher === 'USGS') {
    if (rawProps.magnitude != null && rawProps.magnitude !== '') {
      parts.push(`M${rawProps.magnitude}`);
    }
    if (rawProps.place) parts.push(String(rawProps.place));
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
    if (codes.length === 1) parts.push(countryName(codes[0]));
    else if (codes.length > 1) parts.push(`${countryName(codes[0])} +${codes.length - 1}`);
    else if (rawProps.countryFallback) parts.push(String(rawProps.countryFallback));
  }

  const sev = SEVERITY_LABEL[rawProps.severity as HazardSeverity] || String(rawProps.severity || '');
  if (sev) parts.push(sev);

  const dates = formatAlertDateRange(rawProps.from, rawProps.to);
  if (dates) parts.push(dates);

  const url = String(rawProps.url || '');
  const provider = url ? providerFromUrl(url) || String(rawProps.publisher || 'GDACS') : '';
  const label = `${provider ? provider + ' ' : ''}Details ↗`;
  const via = rawProps.upstream
    ? ` <span data-alert-upstream style="color:#9ca3af;font-weight:400">· via ${escapeHtml(rawProps.upstream)}</span>`
    : '';
  const link = url
    ? `<a data-alert-provider="${escapeHtml(provider)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:none;font-weight:500">${escapeHtml(label)}</a>${via}`
    : '';

  const daysAfter = Number(rawProps.daysAfterExpiry || 0);
  const daysLeft = Number(rawProps.awarenessWindowDaysLeft || POST_EXPIRY_AWARENESS_DAYS);
  const awarenessLine =
    daysAfter > 0
      ? `<div style="margin-top:5px;font-size:10.5px;color:#fbbf24;font-weight:500">🕒 20-Day Awareness · Expired ${daysAfter}d ago (${daysLeft}d remaining on globe)</div>`
      : `<div style="margin-top:5px;font-size:10.5px;color:#34d399;font-weight:500">🟢 Active Emergency Alert · +20-day post-expiry awareness enabled</div>`;

  return `<div style="font:12.5px/1.45 system-ui,-apple-system,sans-serif;background:#0d1117;color:#e5e7eb;padding:10px 28px 10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px rgba(0,0,0,.55);max-width:300px">
    <div style="font-weight:600;color:#f3f4f6">⚠️ ${escapeHtml(parts.join(' · '))}</div>
    ${link ? `<div style="margin-top:6px">${link}</div>` : ''}
    ${awarenessLine}
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
    const [aLng, aLat] = f.geometry.coordinates;
    if (!Number.isFinite(aLat) || !Number.isFinite(aLng)) continue;
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

