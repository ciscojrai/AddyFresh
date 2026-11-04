/**
 * In-app street view requests. Kept out of the toggle/controller modules
 * so those two can keep importing each other without a cycle.
 * A request never builds a mapillary.com URL.
 */

export const STREET_VIEW_OPEN_AT_EVENT = "addy.streetview.openat";

/** `label` is the item name, shown as "Photo 40 m from <label>". */
export type StreetViewPoint = { lat: number; lng: number; label?: string };

export function stashStreetViewAt(lat: number, lng: number, label?: string): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __addyStreetViewAt?: StreetViewPoint | null };
  const detail: StreetViewPoint = label ? { lat, lng, label } : { lat, lng };
  w.__addyStreetViewAt = detail;
  window.dispatchEvent(
    new CustomEvent<StreetViewPoint>(STREET_VIEW_OPEN_AT_EVENT, { detail }),
  );
}

export function consumeStreetViewAt(): StreetViewPoint | null {
  const w = window as unknown as { __addyStreetViewAt?: StreetViewPoint | null };
  const point = w.__addyStreetViewAt ?? null;
  w.__addyStreetViewAt = null;
  return point;
}
