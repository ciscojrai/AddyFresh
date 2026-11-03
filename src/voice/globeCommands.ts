/**
 * Bridges spoken globe commands to the globe component.
 *
 * The globe is a Cesium/MapLibre surface owned by GlobeView, which exposes no ref.
 * Rather than duplicate its camera math here, the voice layer dispatches window events
 * and GlobeView answers them with the same handlers its own buttons use. That keeps one
 * implementation of zoom and pan, so voice and touch can never drift apart.
 */
import type { VoiceIntent } from './intents.js';

/** Event names GlobeView listens for. */
export const GLOBE_EVENTS = {
  zoom: 'freshaddy:voice-zoom', // { dir: 'in' | 'out' }
  pan: 'freshaddy:voice-pan', // { dir: 'left' | 'right' }
} as const;

/** Sends a local intent to the globe. Returns false when the intent is not a globe move. */
export function runGlobeIntent(intent: VoiceIntent): boolean {
  if (typeof window === 'undefined') return false;
  if (intent.kind === 'zoom') {
    window.dispatchEvent(new CustomEvent(GLOBE_EVENTS.zoom, { detail: { dir: intent.dir } }));
    return true;
  }
  if (intent.kind === 'pan') {
    window.dispatchEvent(new CustomEvent(GLOBE_EVENTS.pan, { detail: { dir: intent.dir } }));
    return true;
  }
  return false;
}
