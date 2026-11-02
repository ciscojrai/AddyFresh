import * as maplibregl from 'maplibre-gl';
import workerScript from '../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?raw';

/**
 * Configure MapLibre Web Worker safely in Vite / Cloud environments.
 * Uses an inline blob URL generated from the real MapLibre worker bundle.
 */
export function initMapLibreWorker(): void {
  if (typeof window === 'undefined') return;

  try {
    const existingUrl = maplibregl.getWorkerUrl();
    if (!existingUrl && workerScript) {
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerBlobUrl = URL.createObjectURL(blob);
      maplibregl.setWorkerUrl(workerBlobUrl);
    }
  } catch (err) {
    console.warn('[MapLibre] Could not initialize blob worker:', err);
  }
}
