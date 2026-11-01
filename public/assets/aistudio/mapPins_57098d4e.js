import * as maplibregl from 'maplibre-gl';
import { haptic } from './utils/haptics';

// mapPins.js
export function addEventPinsToMap(map, events) {
  if (!map || !events || !Array.isArray(events)) return;
  events.forEach(ev => {
    if (!ev || typeof ev.lng !== 'number' || typeof ev.lat !== 'number') return;
    const el = document.createElement('div');
    el.className = 'event-pin';
    el.dataset.eventId = ev.id;
    el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#22d3ee;box-shadow:0 0 12px #22d3ee;cursor:pointer;';
    el.onclick = () => {
      haptic.globePin();
      window.dispatchEvent(new CustomEvent('newaddy:open-id-card', { detail: ev }));
    };
    try {
      new maplibregl.Marker({ element: el }).setLngLat([ev.lng, ev.lat]).addTo(map);
    } catch (err) {
      console.warn('Could not add marker to map:', err);
    }
  });
}
