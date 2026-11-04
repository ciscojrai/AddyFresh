import type { EventItem } from '../types';

/**
 * Chat file upload parser: Pagos reads a dummy data file and puts it on the globe.
 * Accepted shapes, all dummy-safe (no real events are claimed):
 * - A flat JSON array of items with name/title, lat/latitude, lng/lon/longitude
 * - { pins: [...] }, { items: [...] }, { events: [...] }
 * - The AddyFresh dummy packages format: { rows: [{ category, pills: { Pill: [items] } }] }
 * - B2B format: { pins: [{ name, category, latitude, longitude, fact }] }
 * - CSV with a header row containing name, lat, lng (and optional place, date, category)
 * Every parsed item becomes an EventItem, so the globe draws it as a pin and
 * the feed can show it, exactly like a pill tap.
 */

function toEvent(raw: any, idx: number): EventItem | null {
  const lat = Number(raw.lat ?? raw.latitude);
  const lng = Number(raw.lng ?? raw.lon ?? raw.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const title = String(raw.title ?? raw.name ?? 'Uploaded pin');
  const category = String(raw.category ?? raw.pill ?? raw.row ?? 'Uploaded');
  return {
    id: `upload-${Date.now()}-${idx}`,
    title,
    city: String(raw.place ?? raw.city ?? ''),
    country: '',
    date: String(raw.date ?? 'Uploaded'),
    category,
    tags: [category],
    lat,
    lng,
    description: String(raw.fact ?? raw.description ?? ''),
  };
}

function flattenJson(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) {
    const out: any[] = [];
    for (const row of data.rows) {
      const pills = row.pills || {};
      for (const [pill, items] of Object.entries<any>(pills)) {
        if (Array.isArray(items)) items.forEach((it) => out.push({ ...it, pill, row: row.category }));
      }
    }
    return out;
  }
  for (const key of ['pins', 'items', 'events', 'landmarks']) {
    if (data && Array.isArray(data[key])) return data[key];
  }
  return [];
}

function parseCsv(text: string): any[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
}

export async function parseUploadFile(file: File): Promise<EventItem[]> {
  const text = await file.text();
  let raw: any[] = [];
  if (file.name.toLowerCase().endsWith('.csv')) {
    raw = parseCsv(text);
  } else {
    try {
      raw = flattenJson(JSON.parse(text));
    } catch {
      raw = parseCsv(text);
    }
  }
  return raw.map(toEvent).filter((e): e is EventItem => e !== null);
}
