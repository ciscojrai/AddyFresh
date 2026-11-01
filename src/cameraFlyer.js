/**
 * cameraFlyer.js - Programmatic Camera Fly-To & 3D Globe Mode Controller
 *
 * Supports:
 * - Google Maps Photorealistic 3D Maps element (<gmp-map-3d> / Map3DElement)
 * - MapLibre GL 3D / 2D interactive map
 * - Interactive WebGL Three.js Cyber Globe
 */

/**
 * Programmatically flies camera to a specific coordinate
 * @param {Object} options
 * @param {number} options.lat - Latitude (-90 to 90)
 * @param {number} options.lng - Longitude (-180 to 180)
 * @param {number} [options.tilt=67.5] - Camera tilt angle in degrees (0 = top-down, 90 = horizon)
 * @param {number} [options.heading=0] - Compass heading in degrees (0 = North)
 * @param {number} [options.range=1000] - Distance/altitude in meters
 * @param {number} [options.duration=1500] - Animation duration in ms
 * @param {'globe'|'map'|'auto'} [options.target='auto'] - Specific view target
 */
export function flyCameraToCoordinate(options) {
  if (!options || typeof options.lat !== 'number' || typeof options.lng !== 'number') {
    console.warn('[cameraFlyer] Invalid coordinates passed to flyCameraToCoordinate', options);
    return;
  }

  const {
    lat,
    lng,
    tilt = 67.5,
    heading = 0,
    range = 1000,
    duration = 1500,
    target = 'auto'
  } = options;

  // 1. Dispatch custom event for App and GlobeView listeners
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('freshaddy:fly-camera', {
        detail: { lat, lng, tilt, heading, range, duration, target }
      })
    );
  }

  // 2. Check for Google Photorealistic 3D Map element (<gmp-map-3d>)
  if (typeof document !== 'undefined') {
    const gmp3D = document.querySelector('gmp-map-3d');
    if (gmp3D) {
      try {
        if (typeof gmp3D.flyCameraTo === 'function') {
          gmp3D.flyCameraTo({
            endCamera: {
              center: { lat, lng, altitude: range },
              tilt,
              heading
            },
            duration
          });
        } else {
          // Fallback direct attributes
          gmp3D.setAttribute('center', `${lat},${lng}`);
          gmp3D.setAttribute('tilt', String(tilt));
          gmp3D.setAttribute('heading', String(heading));
          gmp3D.setAttribute('range', String(range));
        }
      } catch (err) {
        console.warn('[cameraFlyer] Google Map3DElement flyCamera error:', err);
      }
    }
  }

  // 3. Check for global or attached MapLibre Map instance
  if (typeof window !== 'undefined' && window.__freshaddy_map) {
    const map = window.__freshaddy_map;
    try {
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(13, 18 - Math.log2(Math.max(100, range) / 50)),
        pitch: Math.min(85, tilt),
        bearing: heading,
        duration,
        essential: true
      });
    } catch (err) {
      console.warn('[cameraFlyer] MapLibre flyTo error:', err);
    }
  }
}

/**
 * Hook up or toggle the 3D globe mode layout
 * @param {'globe'|'map'|'photorealistic-3d'|boolean} [mode] - Desired mode or boolean (true = 3D globe, false = map)
 */
export function toggle3DGlobeMode(mode) {
  if (typeof window === 'undefined') return;

  let targetMode = 'globe';
  if (typeof mode === 'boolean') {
    targetMode = mode ? 'globe' : 'map';
  } else if (mode === 'globe' || mode === 'map' || mode === 'photorealistic-3d') {
    targetMode = mode;
  } else {
    // Toggle based on current state
    const current = window.__freshaddy_current_mode || 'globe';
    targetMode = current === 'globe' ? 'map' : 'globe';
  }

  window.__freshaddy_current_mode = targetMode;
  window.dispatchEvent(
    new CustomEvent('freshaddy:toggle-view-mode', {
      detail: { mode: targetMode }
    })
  );

  return targetMode;
}

// Expose on global window object for console / MCP / external script usage
if (typeof window !== 'undefined') {
  window.flyCameraToCoordinate = flyCameraToCoordinate;
  window.toggle3DGlobeMode = toggle3DGlobeMode;
}
