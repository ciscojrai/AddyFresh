/**
 * Tactile Haptic Vibration Patterns via Navigator.vibrate
 * Safe cross-platform helper with fallbacks and preset patterns.
 */

export const HAPTIC_PATTERNS = {
  // Light subtle tap for navigation and micro-interactions
  nav: 10,
  
  // Sharp tactile notch when 3D globe pins are interacted with
  globePin: [16, 25, 14],
  globePinLight: 12,

  // Slide-up panels: open, close, and handle toggling
  panelOpen: [14, 20, 12],
  panelClose: 12,
  panelToggle: 16,

  // Active pull-to-refresh tactile stages
  pullThreshold: 22,         // Distinct notch snap when reaching pull threshold
  pullRefresh: [15, 30, 20], // Engaged refresh pulse
  pullSuccess: [14, 40, 26], // Cheerful double-bump on data arrival
};

export type HapticType = keyof typeof HAPTIC_PATTERNS;

/**
 * Triggers a vibration pattern if supported by the browser/device.
 */
export function triggerHaptic(pattern: number | number[] = 15): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      return navigator.vibrate(pattern);
    }
  } catch (err) {
    // Silently ignore permission or platform restrictions
  }

  return false;
}

/**
 * Trigger named preset haptic patterns directly
 */
export const haptic = {
  nav: () => triggerHaptic(HAPTIC_PATTERNS.nav),
  globePin: () => triggerHaptic(HAPTIC_PATTERNS.globePin),
  globePinLight: () => triggerHaptic(HAPTIC_PATTERNS.globePinLight),
  panelOpen: () => triggerHaptic(HAPTIC_PATTERNS.panelOpen),
  panelClose: () => triggerHaptic(HAPTIC_PATTERNS.panelClose),
  panelToggle: () => triggerHaptic(HAPTIC_PATTERNS.panelToggle),
  pullThreshold: () => triggerHaptic(HAPTIC_PATTERNS.pullThreshold),
  pullRefresh: () => triggerHaptic(HAPTIC_PATTERNS.pullRefresh),
  pullSuccess: () => triggerHaptic(HAPTIC_PATTERNS.pullSuccess),
  custom: (pattern: number | number[]) => triggerHaptic(pattern),
};
