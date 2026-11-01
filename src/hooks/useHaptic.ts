import { useCallback, useRef } from 'react';
import { haptic, triggerHaptic, HAPTIC_PATTERNS } from '../utils/haptics';

export interface UseHapticReturn {
  triggerHaptic: (pattern?: number | number[]) => boolean;
  triggerGlobePin: () => boolean;
  triggerGlobePinLight: () => boolean;
  triggerPanelOpen: () => boolean;
  triggerPanelClose: () => boolean;
  triggerPanelToggle: () => boolean;
  triggerPullThreshold: () => boolean;
  triggerPullRefresh: () => boolean;
  triggerPullSuccess: () => boolean;
  triggerNav: () => boolean;
  /**
   * Helper for pull-to-refresh: fires threshold vibration exactly once when crossing the threshold distance
   */
  checkPullThresholdHaptic: (currentDistance: number, threshold: number) => void;
  resetPullHaptic: () => void;
}

/**
 * Custom React hook for triggering short haptic vibration patterns via Navigator.vibrate
 * to enhance the tactile feel of 3D globe pins, slide-up panels, and active pull-to-refresh.
 */
export function useHaptic(): UseHapticReturn {
  const pullThresholdFiredRef = useRef(false);

  const handleGlobePin = useCallback(() => haptic.globePin(), []);
  const handleGlobePinLight = useCallback(() => haptic.globePinLight(), []);
  const handlePanelOpen = useCallback(() => haptic.panelOpen(), []);
  const handlePanelClose = useCallback(() => haptic.panelClose(), []);
  const handlePanelToggle = useCallback(() => haptic.panelToggle(), []);
  const handlePullThreshold = useCallback(() => haptic.pullThreshold(), []);
  const handlePullRefresh = useCallback(() => haptic.pullRefresh(), []);
  const handlePullSuccess = useCallback(() => haptic.pullSuccess(), []);
  const handleNav = useCallback(() => haptic.nav(), []);
  const handleCustom = useCallback(
    (pattern: number | number[] = 15) => triggerHaptic(pattern),
    []
  );

  const checkPullThresholdHaptic = useCallback((currentDistance: number, threshold: number) => {
    if (currentDistance >= threshold) {
      if (!pullThresholdFiredRef.current) {
        pullThresholdFiredRef.current = true;
        haptic.pullThreshold();
      }
    } else {
      pullThresholdFiredRef.current = false;
    }
  }, []);

  const resetPullHaptic = useCallback(() => {
    pullThresholdFiredRef.current = false;
  }, []);

  return {
    triggerHaptic: handleCustom,
    triggerGlobePin: handleGlobePin,
    triggerGlobePinLight: handleGlobePinLight,
    triggerPanelOpen: handlePanelOpen,
    triggerPanelClose: handlePanelClose,
    triggerPanelToggle: handlePanelToggle,
    triggerPullThreshold: handlePullThreshold,
    triggerPullRefresh: handlePullRefresh,
    triggerPullSuccess: handlePullSuccess,
    triggerNav: handleNav,
    checkPullThresholdHaptic,
    resetPullHaptic,
  };
}
