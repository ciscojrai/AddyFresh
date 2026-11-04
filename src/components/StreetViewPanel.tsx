import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StreetViewTarget } from '../types';
import { useHaptic } from '../hooks/useHaptic';
import { Footprints, Loader2, X } from 'lucide-react';
import type { FilterSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import {
  circleRing,
  clipLinesToCircle,
  findNearestPhoto,
  FOCUS_RADIUS_M,
  type LatLng,
  type NearestPhoto,
} from './street-view-nearest';
import { mapillaryImagePoint, reverseStreetCity } from './street-view-address';

const TOKEN: string | undefined = import.meta.env.VITE_MAPILLARY_TOKEN || 'MLY|28444101915232228|0e9a0afbabfb720b9bfd451c70e27fa8';
const TOKEN_QS: string = encodeURIComponent(TOKEN);

const SRC_ID = 'mapillary-coverage';
const SEQ_LAYER = 'mapillary-sequences';
const IMG_LAYER = 'mapillary-images';
const FOCUS_SRC = 'mapillary-focus';
const FOCUS_LAYER = 'mapillary-focus-lines';
const MLY_GREEN = '#05CB63';

const NO_FEATURES = ['==', ['literal', 1], ['literal', 0]] as unknown as FilterSpecification;

type Found = NearestPhoto & { label?: string };
type Status = 'idle' | 'searching' | 'viewing' | 'empty' | 'error';

function getMap(): MapLibreMap | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).map ||
    (window as any).__freshaddy_map ||
    (window as any).mapInstance ||
    null
  );
}

function focusFilter(foci: LatLng[]): FilterSpecification {
  if (!foci.length) return NO_FEATURES;
  return [
    'within',
    {
      type: 'MultiPolygon',
      coordinates: foci.map((f) => [circleRing(f, FOCUS_RADIUS_M)]),
    },
  ] as unknown as FilterSpecification;
}

function ensureCoverage(m: MapLibreMap): boolean {
  if (!TOKEN) return false;
  let added = false;
  try {
    if (!m.getSource(SRC_ID)) {
      m.addSource(SRC_ID, {
        type: 'vector',
        tiles: [
          `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${TOKEN_QS}`,
        ],
        minzoom: 6,
        maxzoom: 14,
      });
      added = true;
    }
    if (!m.getLayer(SEQ_LAYER)) {
      m.addLayer({
        id: SEQ_LAYER,
        type: 'line',
        source: SRC_ID,
        'source-layer': 'sequence',
        filter: NO_FEATURES,
        paint: { 'line-color': MLY_GREEN, 'line-opacity': 0, 'line-width': 1 },
      });
      added = true;
    }
    if (!m.getSource(FOCUS_SRC)) {
      m.addSource(FOCUS_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      added = true;
    }
    if (!m.getLayer(FOCUS_LAYER)) {
      m.addLayer({
        id: FOCUS_LAYER,
        type: 'line',
        source: FOCUS_SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': MLY_GREEN,
          'line-opacity': 0.85,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 3.5, 19, 5],
        },
      });
      added = true;
    }
    if (!m.getLayer(IMG_LAYER)) {
      m.addLayer({
        id: IMG_LAYER,
        type: 'circle',
        source: SRC_ID,
        'source-layer': 'image',
        minzoom: 13,
        filter: NO_FEATURES,
        paint: { 'circle-radius': 4.5, 'circle-color': MLY_GREEN, 'circle-opacity': 0.9 },
      });
      added = true;
    }
  } catch {}
  return added;
}

function drawFocus(m: MapLibreMap, foci: LatLng[]) {
  if (!m.getStyle()) return;
  try {
    if (m.getLayer(IMG_LAYER)) {
      m.setFilter(IMG_LAYER, focusFilter(foci));
    }
    const src = m.getSource(FOCUS_SRC) as GeoJSONSource | undefined;
    if (!src) return;
    const features: any[] = [];
    if (foci.length && m.getLayer(SEQ_LAYER)) {
      for (const f of foci) {
        const p = m.project([f.lng, f.lat]);
        const rPix = Math.max(40, (FOCUS_RADIUS_M / 111320) * 256 * Math.pow(2, m.getZoom()));
        const rendered = m.queryRenderedFeatures(
          [
            [p.x - rPix, p.y - rPix],
            [p.x + rPix, p.y + rPix],
          ],
          { layers: [SEQ_LAYER] }
        );
        const lines: [number, number][][] = [];
        for (const feat of rendered) {
          const geom = feat.geometry;
          if (geom.type === 'LineString') {
            lines.push(geom.coordinates as [number, number][]);
          } else if (geom.type === 'MultiLineString') {
            for (const c of geom.coordinates) {
              lines.push(c as [number, number][]);
            }
          }
        }
        for (const piece of clipLinesToCircle(lines, f, FOCUS_RADIUS_M)) {
          features.push({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: piece },
          });
        }
      }
    }
    src.setData({ type: 'FeatureCollection', features });
  } catch {}
}

function removeCoverage(m: MapLibreMap) {
  try {
    for (const id of [SEQ_LAYER, IMG_LAYER, FOCUS_LAYER]) {
      if (m.getLayer(id)) m.removeLayer(id);
    }
    for (const id of [SRC_ID, FOCUS_SRC]) {
      if (m.getSource(id)) m.removeSource(id);
    }
  } catch {}
}

function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.max(1, Math.round(m))} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

interface StreetViewPanelProps {
  target: StreetViewTarget | null;
  onClose: () => void;
}

export const StreetViewPanel: React.FC<StreetViewPanelProps> = ({ target, onClose }) => {
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [imageId, setImageId] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const viewerHostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const { triggerPanelOpen, triggerPanelClose } = useHaptic();

  // Draw green lines on top globe around target coordinates
  useEffect(() => {
    if (!target) return;
    const m = getMap();
    if (!m) return;

    ensureCoverage(m);
    drawFocus(m, [{ lat: target.lat, lng: target.lng }]);

    // Smoothly fly globe to street level (zoom 16) with 50° pitch so the green lines are crystal clear
    m.flyTo({
      center: [target.lng, target.lat],
      zoom: 16.5,
      pitch: 52,
      duration: 1600,
    });

    const onIdle = () => drawFocus(m, [{ lat: target.lat, lng: target.lng }]);
    m.on('idle', onIdle);

    return () => {
      m.off('idle', onIdle);
      removeCoverage(m);
    };
  }, [target?.lat, target?.lng]);

  // Lookup nearest street photo
  useEffect(() => {
    if (!target) {
      setImageId(null);
      setFound(null);
      setPlaceLabel(null);
      setStatus('idle');
      return;
    }

    triggerPanelOpen();
    setStatus('searching');
    setImageId(null);
    setFound(null);
    setPlaceLabel(null);

    let cancelled = false;

    findNearestPhoto({ lat: target.lat, lng: target.lng }, TOKEN)
      .then(async (photo) => {
        if (cancelled) return;
        if (!photo) {
          setStatus('empty');
          return;
        }
        setFound({ ...photo, label: target.title });
        setImageId(photo.id);
        setStatus('viewing');

        // Reverse-geocode photo coords for street / city line
        try {
          const pt = await mapillaryImagePoint(photo.id, TOKEN);
          if (cancelled) return;
          const coords = pt ?? { lat: photo.lat, lng: photo.lng };
          const addr = await reverseStreetCity(coords);
          if (!cancelled && addr) setPlaceLabel(addr);
        } catch {}
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [target?.lat, target?.lng, target?.title, triggerPanelOpen]);

  // Attach interactive mapillary-js viewer to the bottom sheet
  useEffect(() => {
    if (!imageId || !TOKEN || !viewerHostRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        await import('mapillary-js/dist/mapillary.css');
        const { Viewer } = await import('mapillary-js');
        if (cancelled || !viewerHostRef.current) return;
        viewerRef.current?.remove();
        viewerRef.current = new Viewer({
          accessToken: TOKEN,
          container: viewerHostRef.current,
          imageId,
        });
      } catch (err) {
        console.warn('[Mapillary Viewer]:', err);
      }
    })();

    return () => {
      cancelled = true;
      viewerRef.current?.remove();
      viewerRef.current = null;
    };
  }, [imageId]);

  if (!target) return null;

  const handleClose = () => {
    triggerPanelClose();
    onClose();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY !== null) {
      const diff = e.touches[0].clientY - touchStartY;
      if (diff > 50) {
        handleClose();
        setTouchStartY(null);
      }
    }
  };

  const handleTouchEnd = () => {
    setTouchStartY(null);
  };

  return (
    <div
      role="dialog"
      aria-label="Street View Panel"
      className="app-streetview absolute bottom-0 left-0 right-0 z-50 h-[58%] min-h-[300px] max-h-[460px] bg-[#070c18] border-t-2 border-emerald-400/90 rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.95),0_0_30px_rgba(5,203,99,0.3)] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
    >
      {/* 1. Drag / Tap Handle */}
      <div
        onClick={handleClose}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full flex flex-col items-center justify-center pt-2.5 pb-1.5 cursor-pointer group select-none hover:bg-slate-900/40 transition-colors shrink-0"
        title="Tap handle to close Street View"
      >
        <div className="w-14 h-1.5 rounded-full bg-slate-500 group-hover:bg-emerald-400 group-hover:w-16 transition-all duration-200 shadow-sm" />
      </div>

      {/* 2. Top Header Bar */}
      <div className="px-3.5 py-1.5 flex items-center justify-between border-b border-slate-800/80 bg-[#090e1c] shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Footprints className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <h4 className="text-xs font-bold text-slate-100 truncate leading-snug">
              {target.title}
            </h4>
          </div>
          {found && status === 'viewing' ? (
            <div className="text-[11px] font-semibold text-emerald-400 truncate mt-0.5">
              Photo {fmtDistance(found.distanceM)} from {target.title}
            </div>
          ) : placeLabel ? (
            <div className="text-[10px] text-slate-400 truncate mt-0.5">
              {placeLabel}
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 truncate mt-0.5">
              {target.location}
            </div>
          )}
        </div>

        <button
          onClick={handleClose}
          className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Close Street View"
        >
          <X size={16} />
        </button>
      </div>

      {/* 3. Interactive Mapillary 360 Viewer */}
      <div className="relative flex-1 w-full bg-black overflow-hidden">
        <div ref={viewerHostRef} className="w-full h-full" />

        {status !== 'viewing' && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center bg-slate-950/85">
            {status === 'searching' ? (
              <span className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Finding nearest Mapillary 360° photo…
              </span>
            ) : status === 'empty' ? (
              <span className="text-xs text-slate-400 leading-relaxed">
                No street photos within 5 km of this location yet. Check the green lines on the top globe for nearby coverage!
              </span>
            ) : (
              <span className="text-xs text-slate-400 leading-relaxed">
                Couldn't load Mapillary street view. Please try again.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
