import * as maplibregl from 'maplibre-gl';
import workerScript from '../public/maplibre-gl-worker.js?raw';

/**
 * Configure MapLibre Web Worker safely in Vite / Cloud environments.
 * Uses an inline blob URL generated from the standalone IIFE worker bundle.
 * This prevents 404 / HTML-fallback errors from Vite dev server or relative worker URL resolution.
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
