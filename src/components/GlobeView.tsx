import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { EventItem, Mood, CameraPerspective, ThemeMode } from '../types';
import {
  Plus,
  Minus,
  Globe,
  Compass,
  Box,
  Eye,
  RotateCw,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  MousePointer2,
  CloudRain,
  TriangleAlert,
} from 'lucide-react';
import { haptic } from '../utils/haptics';
import { initMapLibreWorker } from '../maplibreWorker';
import { VoiceButton } from './VoiceButton';
import type { SessionState } from '../voice/conversation';
import {
  loadHazardAlerts,
  buildAlertPopupHtml,
  HazardFeature,
  HazardFeatureCollection,
} from '../utils/hazardAlerts';

interface GlobeViewProps {
  events: EventItem[];
  selectedEvent: EventItem | null;
  onSelectEvent: (event: EventItem) => void;
  activeMood: Mood;
  radarActive?: boolean;
  perspective?: CameraPerspective;
  themeMode?: ThemeMode;
  /** Voice-session state, shown on the button in the bottom-right dock. */
  voiceState?: SessionState;
  voiceSecondsLeft?: number;
  onToggleVoice?: () => void;
}

// Approximate camera altitude in meters from MapLibre zoom level
function zoomToAltitudeMeters(zoom: number): number {
  const orbitMeters = 18500000 / Math.pow(2, Math.max(0, zoom - 1.2));
  return Math.max(45, Math.round(orbitMeters));
}

// Create a clean, modern event pin dot for Cesium 3D billboards with high-visibility pulsing rings
function createCesiumPinDataUrl(color: string, isSelected: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cx = 32;
  const cy = 32;

  if (isSelected) {
    // Large outer radar halo
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.fill();

    // Secondary pulse ring
    ctx.beginPath();
    ctx.arc(cx, cy, 21, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Solid core pin circle
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Center bright white dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else {
    // Unselected subtle pin
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  return canvas.toDataURL();
}

export const GlobeView: React.FC<GlobeViewProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  activeMood,
  radarActive,
  voiceState = 'closed',
  voiceSecondsLeft = 0,
  onToggleVoice,
}) => {
  const starCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const cesiumViewerRef = useRef<any>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const autoRotateRef = useRef<boolean>(true);
  const isUserInteractingRef = useRef<boolean>(false);

  const envMeta = (import.meta as any).env || {};
  const cesiumToken =
    envMeta.VITE_CESIUM_ION_TOKEN ||
    envMeta.AGY_CESIUM_KEY ||
    envMeta.VITE_AGY_CESIUM_KEY ||
    envMeta.CESIUM_KEY ||
    envMeta.VITE_CESIUM_KEY ||
    (typeof window !== 'undefined' ? (window as any).AGY_CESIUM_KEY || (window as any).CESIUM_ION_TOKEN : '') ||
    '';
  if (typeof window !== 'undefined' && (window as any).Cesium && cesiumToken) {
    try {
      (window as any).Cesium.Ion.defaultAccessToken = cesiumToken;
    } catch {
      // ignore
    }
  }
  const [engineMode, setEngineMode] = useState<'cesium' | 'maplibre'>(() =>
    cesiumToken ? 'cesium' : 'maplibre'
  );
  const [cesiumReady, setCesiumReady] = useState<boolean>(false);

  const [autoRotate, setAutoRotate] = useState(true);
  const [radarOn, setRadarOn] = useState<boolean>(() => Boolean(radarActive));
  const [radarOpacity, setRadarOpacity] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('radar-opacity'));
      return Number.isFinite(saved) && saved >= 10 && saved <= 90 ? saved : 65;
    } catch {
      return 65;
    }
  });
  const [alertsOn, setAlertsOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('alerts-on') !== '0';
    } catch {
      return true;
    }
  });
  const [hazardFeatures, setHazardFeatures] = useState<HazardFeature[]>([]);
  const [activeAlertCard, setActiveAlertCard] = useState<HazardFeature | null>(null);
  const radarLayerCesiumRef = useRef<any>(null);
  const [telemetry, setTelemetry] = useState({
    lat: 30.2672,
    lng: -97.7431,
    zoom: 1.75,
    pitch: 0,
    bearing: 0,
    altMeters: 16143645,
  });

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  // 1. Deep-space starfield background canvas
  useEffect(() => {
    const canvas = starCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stars = Array.from({ length: 260 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.3 + 0.3,
      a: Math.random() * 0.65 + 0.2,
    }));

    const draw = () => {
      const w = (canvas.width = canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
      const h = (canvas.height = canvas.clientHeight * Math.min(window.devicePixelRatio || 1, 2));
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.05, w * 0.5, h * 0.5, w * 0.65);
      grad.addColorStop(0, 'rgba(14, 38, 76, 0.32)');
      grad.addColorStop(0.55, 'rgba(5, 13, 28, 0.18)');
      grad.addColorStop(1, 'rgba(2, 5, 13, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      stars.forEach((s) => {
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(216, 236, 255, ${s.a})`;
        ctx.fill();
      });
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // 2A. Initialize Cesium Ion + Google Photorealistic 3D Tiles Viewer (Primary 3D Engine)
  useEffect(() => {
    const container = cesiumContainerRef.current;
    const Cesium = (window as any).Cesium;
    if (!container || !Cesium || !cesiumToken) {
      setEngineMode('maplibre');
      return;
    }

    let viewer: any = null;
    let spinRaf: number = 0;
    let handler: any = null;

    try {
      Cesium.Ion.defaultAccessToken = cesiumToken;

      viewer = new Cesium.Viewer(container, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        vrButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        navigationInstructionsInitiallyVisible: false,
        scene3DOnly: true,
        skyBox: false,
        requestRenderMode: false,
        contextOptions: {
          webgl: {
            alpha: true,
            antialias: true,
          },
        },
      });

      cesiumViewerRef.current = viewer;
      (window as any).__freshaddy_cesium = viewer;

      // Configure deep-space transparent sky & bright cyan-blue atmospheric limb glow
      viewer.scene.backgroundColor = Cesium.Color.TRANSPARENT;
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#041022');
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.showGroundAtmosphere = true;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.skyAtmosphere.hueShift = -0.04;
        viewer.scene.skyAtmosphere.saturationShift = 0.25;
        viewer.scene.skyAtmosphere.brightnessShift = 0.12;
      }

      // Load Cesium World Terrain + Bathymetry and Google Photorealistic 3D Tiles (Asset 2275207)
      (async () => {
        try {
          if (typeof Cesium.createWorldTerrainAsync === 'function') {
            const terrain = await Cesium.createWorldTerrainAsync();
            if (!viewer.isDestroyed()) {
              viewer.terrainProvider = terrain;
            }
          }
        } catch (e) {
          console.warn('[Cesium Terrain fallback]:', e);
        }

        try {
          // Asset 2275207 = Google Photorealistic 3D Tiles on Cesium Ion
          const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207, {
            maximumScreenSpaceError: 16,
          });
          if (!viewer.isDestroyed()) {
            viewer.scene.primitives.add(tileset);
          }
        } catch (e) {
          console.warn('[Cesium Google 3D Tiles fallback to OSM Buildings]:', e);
          try {
            if (typeof Cesium.createOsmBuildingsAsync === 'function') {
              const osmBuildings = await Cesium.createOsmBuildingsAsync();
              if (!viewer.isDestroyed()) {
                viewer.scene.primitives.add(osmBuildings);
              }
            }
          } catch {
            // ignore
          }
        }
      })();

      // Initial orbital camera position over North America / Pacific
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 16143645),
        orientation: {
          heading: 0,
          pitch: -Cesium.Math.PI_OVER_TWO,
          roll: 0,
        },
      });

      // Sync Cesium camera telemetry (MGRS, DMS, Altitude, Pitch, Equivalent Zoom)
      const onCameraChanged = () => {
        if (!viewer || viewer.isDestroyed()) return;
        const carto = viewer.camera.positionCartographic;
        if (!carto) return;
        const lat = Cesium.Math.toDegrees(carto.latitude);
        const lng = Cesium.Math.toDegrees(carto.longitude);
        const height = Math.max(25, Math.round(carto.height));
        const pitchDeg = Math.max(0, Math.min(85, Math.round(90 + Cesium.Math.toDegrees(viewer.camera.pitch))));
        const eqZoom = Math.max(
          1.2,
          Math.min(19.2, 1.2 + Math.log2(18500000 / Math.max(45, height)))
        );
        setTelemetry({
          lat,
          lng,
          zoom: eqZoom,
          pitch: pitchDeg,
          bearing: Cesium.Math.toDegrees(viewer.camera.heading),
          altMeters: height,
        });
      };
      viewer.camera.percentageChanged = 0.01;
      viewer.camera.changed.addEventListener(onCameraChanged);

      // Click handler on Cesium entities (Event Reticle Pins)
      handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement: any) => {
        isUserInteractingRef.current = true;
        const picked = viewer.scene.pick(movement.position);
        if (Cesium.defined(picked) && picked.id && picked.id._hazardFeature) {
          const hf = picked.id._hazardFeature as HazardFeature;
          haptic.globePin();
          setActiveAlertCard(hf);
          const [lng, lat] = hf.geometry.coordinates;
          const currentHeight = viewer.camera.positionCartographic?.height || 16000000;
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lng, lat, Math.min(currentHeight, 4800000)),
            duration: 1.4,
          });
          return;
        }
        if (Cesium.defined(picked) && picked.id && picked.id._freshaddyEvent) {
          const ev = picked.id._freshaddyEvent as EventItem;
          haptic.globePin();
          onSelectEvent(ev);
          const currentHeight = viewer.camera.positionCartographic?.height || 16000000;
          const targetHeight = currentHeight > 15000 ? 650 : Math.max(220, currentHeight * 0.45);
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(ev.lng, ev.lat - 0.0045, targetHeight),
            orientation: {
              heading: Cesium.Math.toRadians(-18),
              pitch: Cesium.Math.toRadians(-32),
              roll: 0,
            },
            duration: 2.2,
          });
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      handler.setInputAction(() => {
        isUserInteractingRef.current = true;
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
      handler.setInputAction(() => {
        isUserInteractingRef.current = false;
      }, Cesium.ScreenSpaceEventType.LEFT_UP);
      handler.setInputAction(() => {
        isUserInteractingRef.current = true;
      }, Cesium.ScreenSpaceEventType.WHEEL);

      // Gentle orbital spin when in space (height > 4,500 km)
      const spinCesium = () => {
        spinRaf = requestAnimationFrame(spinCesium);
        if (
          autoRotateRef.current &&
          !isUserInteractingRef.current &&
          viewer &&
          !viewer.isDestroyed()
        ) {
          const h = viewer.camera.positionCartographic?.height || 0;
          if (h > 4500000) {
            viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.00075);
          }
        }
      };
      spinRaf = requestAnimationFrame(spinCesium);

      setCesiumReady(true);
    } catch (err) {
      console.warn('[GlobeView] Cesium init error, falling back to MapLibre 3D Globe:', err);
      setEngineMode('maplibre');
    }

    return () => {
      cancelAnimationFrame(spinRaf);
      if (handler) {
        try {
          handler.destroy();
        } catch {
          // ignore
        }
      }
      if (viewer && !viewer.isDestroyed()) {
        try {
          viewer.destroy();
        } catch {
          // ignore
        }
      }
      cesiumViewerRef.current = null;
    };
  }, [cesiumToken]);

  // Populate Cesium Entities for Events + Dynamic Street Telemetry (`VEH-xxxxxx`, Camera Nodes)
  useEffect(() => {
    const viewer = cesiumViewerRef.current;
    const Cesium = (window as any).Cesium;
    if (!viewer || viewer.isDestroyed() || !Cesium || !cesiumReady) return;

    // Remove previous dynamic event entities
    const toRemove: any[] = [];
    viewer.entities.values.forEach((ent: any) => {
      if (ent._isDynamicPin) {
        toRemove.push(ent);
      }
    });
    toRemove.forEach((ent) => viewer.entities.remove(ent));

    // If an event is selected, only show the selected event; otherwise show all events
    const displayEvents = selectedEvent
      ? events.filter((ev) => ev.id === selectedEvent.id)
      : events;

    displayEvents.forEach((ev) => {
      const isSelected = selectedEvent?.id === ev.id;
      const accent = isSelected ? '#38bdf8' : activeMood.color || '#22d3ee';
      const cleanTitle = ev.title.length > 22 ? ev.title.slice(0, 21) + '…' : ev.title;

      // Event Pin Billboard + Clean Title Label (Selected is high-visibility 48x48 cyan radar beacon)
      const pinEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ev.lng, ev.lat, 35),
        billboard: {
          image: createCesiumPinDataUrl(accent, isSelected),
          width: isSelected ? 48 : 24,
          height: isSelected ? 48 : 24,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `  ${cleanTitle}  `,
          font: isSelected
            ? 'bold 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            : '600 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fillColor: Cesium.Color.fromCssColorString(isSelected ? '#38bdf8' : '#ffffff'),
          outlineColor: Cesium.Color.fromCssColorString('#020617'),
          outlineWidth: isSelected ? 4 : 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString(
            isSelected ? '#031024' : '#0f172a'
          ).withAlpha(0.95),
          backgroundPadding: isSelected
            ? new Cesium.Cartesian2(10, 6)
            : new Cesium.Cartesian2(7, 4),
          pixelOffset: new Cesium.Cartesian2(0, isSelected ? -30 : -22),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      pinEntity._isDynamicPin = true;
      pinEntity._freshaddyEvent = ev;
    });
  }, [events, selectedEvent, activeMood, cesiumReady, onSelectEvent]);

  // 2B. Initialize MapLibre GL v6 3D Satellite + Hybrid Street + 3D Buildings Globe (Always warm & synced)
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    initMapLibreWorker();

    const hybridGlobeStyle: maplibregl.StyleSpecification = {
      version: 8,
      glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
      sources: {
        'esri-world-imagery': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: 'Esri, Maxar, Earthstar Geographics',
        },
        'esri-reference-labels': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: 'Esri',
        },
      },
      layers: [
        {
          id: 'space-bg',
          type: 'background',
          paint: {
            'background-color': 'rgba(2, 5, 13, 0)',
          },
        },
        {
          id: 'satellite-globe-layer',
          type: 'raster',
          source: 'esri-world-imagery',
          minzoom: 0,
          maxzoom: 20,
          paint: {
            'raster-contrast': 0.14,
            'raster-saturation': 0.12,
            'raster-brightness-min': 0.04,
            'raster-fade-duration': 150,
          },
        },
        {
          id: 'hybrid-street-labels',
          type: 'raster',
          source: 'esri-reference-labels',
          minzoom: 2,
          maxzoom: 20,
          paint: {
            'raster-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2,
              0.55,
              6,
              0.85,
              14,
              0.95,
            ],
          },
        },
      ],
    };

    const map = new maplibregl.Map({
      container,
      style: hybridGlobeStyle,
      center: [-95.5, 30.2],
      zoom: 1.75,
      minZoom: 1.1,
      maxZoom: 19.2,
      pitch: 0,
      maxPitch: 75,
      bearing: 0,
      attributionControl: false,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
    });

    mapRef.current = map;
    (window as any).__freshaddy_globe_active = true;
    (window as any).map = map;
    (window as any).__freshaddy_map = map;

    map.on('style.load', () => {
      try {
        map.setProjection({ type: 'globe' } as any);
      } catch (err) {
        console.warn('[GlobeView] globe projection fallback:', err);
      }

      if (typeof map.setSky === 'function') {
        try {
          map.setSky({
            'sky-color': '#020612',
            'horizon-color': '#38bdf8',
            'fog-color': '#040a18',
            'atmosphere-blend': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0,
              0.92,
              5,
              0.68,
              9,
              0.25,
              13,
              0.05,
            ],
          } as any);
        } catch {
          // ignore
        }
      }

      try {
        if (!map.getSource('openfreemap')) {
          map.addSource('openfreemap', {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
          });
          map.addLayer(
            {
              id: 'fresh-3d-buildings',
              source: 'openfreemap',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 13.5,
              paint: {
                'fill-extrusion-color': '#1e293b',
                'fill-extrusion-height': [
                  'coalesce',
                  ['get', 'render_height'],
                  ['get', 'height'],
                  18,
                ],
                'fill-extrusion-base': [
                  'coalesce',
                  ['get', 'render_min_height'],
                  ['get', 'min_height'],
                  0,
                ],
                'fill-extrusion-opacity': 0.72,
              },
            },
            'hybrid-street-labels'
          );
        }
      } catch {
        // optional 3D building layer
      }
    });

    const updateTelemetry = () => {
      if (cesiumViewerRef.current && engineMode === 'cesium') return;
      const center = map.getCenter();
      const z = map.getZoom();
      const p = map.getPitch();
      const b = map.getBearing();
      setTelemetry({
        lat: center.lat,
        lng: center.lng,
        zoom: z,
        pitch: p,
        bearing: b,
        altMeters: zoomToAltitudeMeters(z),
      });
    };

    map.on('move', updateTelemetry);
    map.on('zoom', () => {
      const z = map.getZoom();
      if (z > 12.5 && map.getPitch() < 35 && isUserInteractingRef.current) {
        const targetPitch = Math.min(62, (z - 12.5) * 16);
        map.setPitch(targetPitch);
      } else if (z < 5.5 && map.getPitch() > 5) {
        map.setPitch(Math.max(0, (z - 3.5) * 15));
      }
      updateTelemetry();
    });

    const onInteractStart = () => {
      isUserInteractingRef.current = true;
    };
    const onInteractEnd = () => {
      isUserInteractingRef.current = false;
    };

    map.on('mousedown', onInteractStart);
    map.on('touchstart', onInteractStart);
    map.on('wheel', onInteractStart);
    map.on('mouseup', onInteractEnd);
    map.on('touchend', onInteractEnd);

    let animId: number;
    const spinGlobe = () => {
      animId = requestAnimationFrame(spinGlobe);
      if (
        autoRotateRef.current &&
        !isUserInteractingRef.current &&
        !map.isMoving() &&
        map.getZoom() < 4.5
      ) {
        const c = map.getCenter();
        map.setCenter([c.lng - 0.045, c.lat]);
      }
    };
    animId = requestAnimationFrame(spinGlobe);

    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        // ignore
      }
      try {
        if (cesiumViewerRef.current && !cesiumViewerRef.current.isDestroyed()) {
          cesiumViewerRef.current.resize();
        }
      } catch {
        // ignore
      }
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 3. Populate Clean Event Pins on MapLibre layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // If an event is selected, only show the selected event; otherwise show all events
    const displayEvents = selectedEvent
      ? events.filter((ev) => ev.id === selectedEvent.id)
      : events;

    displayEvents.forEach((ev) => {
      const isSelected = selectedEvent?.id === ev.id;
      const accent = isSelected ? '#38bdf8' : activeMood.color || '#22d3ee';

      const wrapper = document.createElement('div');
      wrapper.className = 'freshaddy-event-pin group';
      wrapper.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        user-select: none;
        z-index: ${isSelected ? 45 : 20};
      `;

      const displayTitle =
        ev.title.length > 22 ? ev.title.slice(0, 21) + '…' : ev.title;
      const tag = document.createElement('div');
      tag.style.cssText = `
        margin-bottom: 4px;
        padding: 3px 8px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid ${isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.35)'};
        border-radius: 9999px;
        color: ${isSelected ? '#38bdf8' : '#f8fafc'};
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(6px);
        transition: all 0.2s ease;
      `;
      tag.textContent = displayTitle;

      const pinDot = document.createElement('div');
      const dotSize = isSelected ? 16 : 12;
      pinDot.style.cssText = `
        width: ${dotSize}px;
        height: ${dotSize}px;
        border-radius: 9999px;
        background: ${accent};
        border: 2px solid #ffffff;
        box-shadow: 0 0 10px ${accent}, 0 2px 6px rgba(0, 0, 0, 0.6);
        transition: transform 0.2s ease;
      `;

      wrapper.appendChild(tag);
      wrapper.appendChild(pinDot);

      wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        haptic.globePin();
        isUserInteractingRef.current = false;
        onSelectEvent(ev);
        const currentZoom = map.getZoom();
        const targetZoom = currentZoom < 12 ? 16.5 : Math.min(18.5, currentZoom + 1.5);
        map.flyTo({
          center: [ev.lng, ev.lat],
          zoom: targetZoom,
          pitch: 62,
          bearing: -18,
          duration: 2200,
          essential: true,
        });
      });

      const marker = new maplibregl.Marker({
        element: wrapper,
        anchor: 'bottom',
      })
        .setLngLat([ev.lng, ev.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [events, selectedEvent, activeMood, onSelectEvent]);

  // 4. Fly to selectedEvent when changed from feed/cards (both Cesium 3D and MapLibre)
  useEffect(() => {
    if (!selectedEvent) return;

    const viewer = cesiumViewerRef.current;
    const Cesium = (window as any).Cesium;
    if (viewer && !viewer.isDestroyed() && Cesium) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          selectedEvent.lng,
          selectedEvent.lat - 0.0045,
          650
        ),
        orientation: {
          heading: Cesium.Math.toRadians(-15),
          pitch: Cesium.Math.toRadians(-32),
          roll: 0,
        },
        duration: 2.0,
      });
    }

    const map = mapRef.current;
    if (map) {
      const currentZoom = map.getZoom();
      map.flyTo({
        center: [selectedEvent.lng, selectedEvent.lat],
        zoom: Math.max(currentZoom, 15.8),
        pitch: 60,
        bearing: -15,
        duration: 2000,
        essential: true,
      });
    }
  }, [selectedEvent]);

  // 5. Listen to programmatic `freshaddy:fly-camera` events (from cameraFlyer.js / Chat / Search)
  useEffect(() => {
    const handleFly = (e: Event) => {
      const custom = e as CustomEvent<{
        lat: number;
        lng: number;
        tilt?: number;
        heading?: number;
        range?: number;
        duration?: number;
      }>;
      if (
        custom.detail &&
        typeof custom.detail.lat === 'number' &&
        typeof custom.detail.lng === 'number'
      ) {
        const { lat, lng, tilt = 62, heading = -15, range = 800, duration = 2000 } = custom.detail;

        const viewer = cesiumViewerRef.current;
        const Cesium = (window as any).Cesium;
        if (viewer && !viewer.isDestroyed() && Cesium) {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              lng,
              lat - (range <= 2000 ? 0.004 : 0),
              Math.max(250, range)
            ),
            orientation: {
              heading: Cesium.Math.toRadians(heading),
              pitch: Cesium.Math.toRadians(range <= 2000 ? -32 : -85),
              roll: 0,
            },
            duration: duration / 1000,
          });
        }

        const map = mapRef.current;
        if (map) {
          const targetZoom = range <= 1500 ? 16.8 : range <= 10000 ? 13.5 : 5.5;
          map.flyTo({
            center: [lng, lat],
            zoom: targetZoom,
            pitch: Math.min(70, tilt),
            bearing: heading,
            duration,
            essential: true,
          });
        }
      }
    };

    window.addEventListener('freshaddy:fly-camera', handleFly);
    return () => window.removeEventListener('freshaddy:fly-camera', handleFly);
  }, []);

  // Dive to 3D Street Level or return to Orbit
  const handleToggleStreetDive = useCallback(() => {
    haptic.globePinLight();
    const targetEv = selectedEvent || events[0];
    const targetLng = targetEv ? targetEv.lng : -97.7431;
    const targetLat = targetEv ? targetEv.lat : 30.2672;

    const viewer = cesiumViewerRef.current;
    const Cesium = (window as any).Cesium;
    if (engineMode === 'cesium' && viewer && !viewer.isDestroyed() && Cesium) {
      const h = viewer.camera.positionCartographic?.height || 16000000;
      if (h > 5000) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(targetLng, targetLat - 0.0045, 580),
          orientation: {
            heading: Cesium.Math.toRadians(-18),
            pitch: Cesium.Math.toRadians(-32),
            roll: 0,
          },
          duration: 2.2,
        });
      } else {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(targetLng, targetLat, 16143645),
          orientation: {
            heading: 0,
            pitch: -Cesium.Math.PI_OVER_TWO,
            roll: 0,
          },
          duration: 2.2,
        });
      }
      return;
    }

    const map = mapRef.current;
    if (!map) return;
    const z = map.getZoom();
    if (z < 12) {
      map.flyTo({
        center: [targetLng, targetLat],
        zoom: 17.4,
        pitch: 62,
        bearing: -20,
        duration: 2400,
        essential: true,
      });
    } else {
      map.flyTo({
        center: [targetLng, targetLat],
        zoom: 1.75,
        pitch: 0,
        bearing: 0,
        duration: 2200,
        essential: true,
      });
    }
  }, [selectedEvent, events, engineMode]);

  // TV 10' D-Pad & Virtual Mouse Mode State
  const [tvMouseMode, setTvMouseMode] = useState<boolean>(true);
  const [tvCursorPos, setTvCursorPos] = useState<{ x: number; y: number } | null>(null);

  const handleTvDpadPan = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      haptic.globePinLight();
      isUserInteractingRef.current = true;
      setAutoRotate(false);

      const viewer = cesiumViewerRef.current;
      const Cesium = (window as any).Cesium;
      if (engineMode === 'cesium' && viewer && !viewer.isDestroyed() && Cesium) {
        const carto = viewer.camera.positionCartographic;
        if (carto) {
          const h = Math.max(250, carto.height);
          // Scale step degrees smoothly from orbital altitude down to street level
          const stepDeg = Math.max(0.0012, Math.min(12, h / 1100000));
          const curLat = Cesium.Math.toDegrees(carto.latitude);
          const curLng = Cesium.Math.toDegrees(carto.longitude);
          const nextLat = Math.max(
            -82,
            Math.min(82, curLat + (dir === 'up' ? stepDeg : dir === 'down' ? -stepDeg : 0))
          );
          const nextLng = curLng + (dir === 'right' ? stepDeg : dir === 'left' ? -stepDeg : 0);
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(nextLng, nextLat, h),
            orientation: {
              heading: viewer.camera.heading,
              pitch: viewer.camera.pitch,
              roll: 0,
            },
            duration: 0.45,
          });
        }
        return;
      }

      const map = mapRef.current;
      if (!map) return;
      const z = map.getZoom();
      const step = Math.max(0.0015, 18 / Math.pow(2, Math.max(0, z - 1)));
      const c = map.getCenter();
      map.easeTo({
        center: [
          c.lng + (dir === 'right' ? step : dir === 'left' ? -step : 0),
          Math.max(-82, Math.min(82, c.lat + (dir === 'up' ? step : dir === 'down' ? -step : 0))),
        ],
        duration: 380,
      });
    },
    [engineMode]
  );

  const handleTvDpadZoom = useCallback(
    (delta: 'in' | 'out') => {
      haptic.globePinLight();
      isUserInteractingRef.current = true;
      const viewer = cesiumViewerRef.current;
      if (engineMode === 'cesium' && viewer && !viewer.isDestroyed()) {
        const h = viewer.camera.positionCartographic?.height || 10000000;
        if (delta === 'in') {
          viewer.camera.zoomIn(Math.max(120, h * 0.48));
        } else {
          viewer.camera.zoomOut(Math.min(12000000, Math.max(200, h * 0.85)));
        }
        return;
      }
      const map = mapRef.current;
      if (!map) return;
      const curZ = map.getZoom();
      const nextZoom =
        delta === 'in'
          ? Math.min(19.2, curZ + (curZ < 6 ? 1.4 : 1.1))
          : Math.max(1.1, curZ - (curZ > 10 ? 1.4 : 1.1));
      const nextPitch =
        delta === 'in' && nextZoom >= 12.5
          ? 62
          : delta === 'out' && nextZoom < 6
          ? 0
          : map.getPitch();
      map.easeTo({ zoom: nextZoom, pitch: nextPitch, duration: 420 });
    },
    [engineMode]
  );

  // Support physical TV remote / keyboard arrow & +/- keys when in TV D-Pad mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const shell = document.querySelector('.app-shell');
      if (!shell || shell.getAttribute('data-device') !== 'tv') return;
      if (tvMouseMode) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleTvDpadPan('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleTvDpadPan('down');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleTvDpadPan('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleTvDpadPan('right');
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleTvDpadZoom('in');
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleTvDpadZoom('out');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tvMouseMode, handleTvDpadPan, handleTvDpadZoom]);

  // Listen for voice / external events to toggle Rain Radar or Emergency Alerts
  useEffect(() => {
    const onSetRadar = (e: Event) => {
      const custom = e as CustomEvent<{ enabled?: boolean; opacity?: number }>;
      if (typeof custom.detail?.enabled === 'boolean') {
        setRadarOn(custom.detail.enabled);
      }
      if (typeof custom.detail?.opacity === 'number') {
        setRadarOpacity(Math.min(90, Math.max(10, custom.detail.opacity)));
      }
    };
    const onSetAlerts = (e: Event) => {
      const custom = e as CustomEvent<{ enabled?: boolean }>;
      if (typeof custom.detail?.enabled === 'boolean') {
        setAlertsOn(custom.detail.enabled);
        try {
          localStorage.setItem('alerts-on', custom.detail.enabled ? '1' : '0');
        } catch {}
      }
    };
    window.addEventListener('freshaddy:set-radar', onSetRadar);
    window.addEventListener('freshaddy:set-alerts', onSetAlerts);
    return () => {
      window.removeEventListener('freshaddy:set-radar', onSetRadar);
      window.removeEventListener('freshaddy:set-alerts', onSetAlerts);
    };
  }, []);

  // Spoken globe commands: "zoom in" / "left" arrive as window events from the voice
  // layer and reuse the exact handlers the on-screen controls call, so camera behaviour
  // stays identical whether it was a tap, a remote, or a voice command.
  useEffect(() => {
    const onVoiceZoom = (e: Event) => {
      const dir = (e as CustomEvent<{ dir?: 'in' | 'out' }>).detail?.dir;
      if (dir === 'in' || dir === 'out') handleTvDpadZoom(dir);
    };
    const onVoicePan = (e: Event) => {
      const dir = (e as CustomEvent<{ dir?: 'left' | 'right' }>).detail?.dir;
      if (dir === 'left' || dir === 'right') handleTvDpadPan(dir);
    };
    window.addEventListener('freshaddy:voice-zoom', onVoiceZoom);
    window.addEventListener('freshaddy:voice-pan', onVoicePan);
    return () => {
      window.removeEventListener('freshaddy:voice-zoom', onVoiceZoom);
      window.removeEventListener('freshaddy:voice-pan', onVoicePan);
    };
  }, [handleTvDpadZoom, handleTvDpadPan]);

  // Rain Radar layer sync: RainViewer live radar tiles for both MapLibre and Cesium
  useEffect(() => {
    const op = Math.min(0.9, Math.max(0.15, radarOpacity / 100));
    const map = mapRef.current;
    const viewer = cesiumViewerRef.current;
    const Cesium = (window as any).Cesium;

    if (!radarOn) {
      if (map && map.getStyle() && map.getLayer('radar-layer')) {
        map.setLayoutProperty('radar-layer', 'visibility', 'none');
      }
      if (viewer && !viewer.isDestroyed() && radarLayerCesiumRef.current) {
        try {
          radarLayerCesiumRef.current.show = false;
        } catch {}
      }
      return;
    }

    let cancelled = false;
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const past = data?.radar?.past;
        if (!past?.length) return;
        const latestPath = past[past.length - 1].path;
        const host = data.host || 'https://tilecache.rainviewer.com';
        const tileUrl = `${host}${latestPath}/256/{z}/{x}/{y}/2/1_1.png`;

        if (map && map.getStyle()) {
          try {
            if (map.getLayer('radar-layer')) map.removeLayer('radar-layer');
            if (map.getSource('radar')) map.removeSource('radar');
            map.addSource('radar', {
              type: 'raster',
              tiles: [tileUrl],
              tileSize: 256,
              maxzoom: 7,
            });
            map.addLayer({
              id: 'radar-layer',
              type: 'raster',
              source: 'radar',
              paint: { 'raster-opacity': op },
              layout: { visibility: 'visible' },
            });
          } catch {}
        }

        if (viewer && !viewer.isDestroyed() && Cesium) {
          try {
            if (radarLayerCesiumRef.current) {
              viewer.imageryLayers.remove(radarLayerCesiumRef.current, true);
              radarLayerCesiumRef.current = null;
            }
            const provider = new Cesium.UrlTemplateImageryProvider({
              url: tileUrl,
              maximumLevel: 7,
              tileWidth: 256,
              tileHeight: 256,
            });
            const layer = viewer.imageryLayers.addImageryProvider(provider);
            layer.alpha = op;
            layer.show = true;
            radarLayerCesiumRef.current = layer;
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [radarOn, radarOpacity, cesiumReady]);

  // GDACS / JTWC / USGS Emergency Hazard Alerts + 20-Day Post-Expiry Awareness Window
  useEffect(() => {
    const map = mapRef.current;
    const viewer = cesiumViewerRef.current;
    const Cesium = (window as any).Cesium;
    const ALERT_LAYERS = ['hazard-alert-hit', 'hazard-alert-halo', 'hazard-alert-dot'];

    if (!alertsOn) {
      setActiveAlertCard(null);
      if (map && map.getStyle()) {
        for (const id of ALERT_LAYERS) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
        }
      }
      if (viewer && !viewer.isDestroyed()) {
        const toRem: any[] = [];
        viewer.entities.values.forEach((ent: any) => {
          if (ent._isHazardAlert) toRem.push(ent);
        });
        toRem.forEach((ent) => viewer.entities.remove(ent));
      }
      return;
    }

    let cancelled = false;
    loadHazardAlerts((fc: HazardFeatureCollection) => {
      if (cancelled) return;
      setHazardFeatures(fc.features);
      (window as any).__freshaddy_hazard_alerts = fc.features;

      // 1. Paint on MapLibre 3D Globe
      if (map && map.getStyle()) {
        try {
          const src = map.getSource('hazard-alerts') as maplibregl.GeoJSONSource | undefined;
          if (src) src.setData(fc as any);
          else map.addSource('hazard-alerts', { type: 'geojson', data: fc as any });

          const color: any = [
            'match',
            ['get', 'severity'],
            'EXTREME',
            '#ef4444',
            'SEVERE',
            '#f97316',
            'MODERATE',
            '#facc15',
            '#a3e635',
          ];

          if (!map.getLayer('hazard-alert-hit')) {
            map.addLayer({
              id: 'hazard-alert-hit',
              type: 'circle',
              source: 'hazard-alerts',
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 18, 4, 26, 8, 34],
                'circle-color': '#000000',
                'circle-opacity': 0.01,
              },
            });
          }
          if (!map.getLayer('hazard-alert-halo')) {
            map.addLayer({
              id: 'hazard-alert-halo',
              type: 'circle',
              source: 'hazard-alerts',
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 9, 6, 22],
                'circle-color': color,
                'circle-opacity': 0.22,
                'circle-stroke-color': color,
                'circle-stroke-width': 1.4,
                'circle-stroke-opacity': 0.85,
              },
            });
          }
          if (!map.getLayer('hazard-alert-dot')) {
            map.addLayer({
              id: 'hazard-alert-dot',
              type: 'circle',
              source: 'hazard-alerts',
              paint: {
                'circle-radius': 4.5,
                'circle-color': color,
                'circle-stroke-color': '#1a0000',
                'circle-stroke-width': 1.2,
              },
            });
          }
          for (const id of ALERT_LAYERS) {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
          }
          if (!(map as any).__alertsClickBound) {
            (map as any).__alertsClickBound = true;
            const openAlert = (e: maplibregl.MapLayerMouseEvent) => {
              const orig = e.originalEvent as MouseEvent & { __alertOpened?: boolean };
              if (orig.__alertOpened) return;
              orig.__alertOpened = true;
              const f = e.features?.[0];
              if (!f) return;
              const coords = (f.geometry as any).coordinates as [number, number];
              const props = (f.properties ?? {}) as any;
              setActiveAlertCard({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: coords },
                properties: props,
              });
            };
            for (const id of ALERT_LAYERS) {
              map.on('mouseenter', id, () => {
                map.getCanvas().style.cursor = 'pointer';
              });
              map.on('mouseleave', id, () => {
                map.getCanvas().style.cursor = '';
              });
              map.on('click', id, openAlert);
            }
          }
        } catch {}
      }

      // 2. Paint on Cesium Ion 3D Globe
      if (viewer && !viewer.isDestroyed() && Cesium) {
        try {
          const toRem: any[] = [];
          viewer.entities.values.forEach((ent: any) => {
            if (ent._isHazardAlert) toRem.push(ent);
          });
          toRem.forEach((ent) => viewer.entities.remove(ent));

          fc.features.forEach((hf) => {
            const [lng, lat] = hf.geometry.coordinates;
            const sev = hf.properties.severity;
            const hex =
              sev === 'EXTREME'
                ? '#ef4444'
                : sev === 'SEVERE'
                ? '#f97316'
                : sev === 'MODERATE'
                ? '#facc15'
                : '#a3e635';
            const ent = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(lng, lat, 55),
              point: {
                pixelSize: 11,
                color: Cesium.Color.fromCssColorString(hex),
                outlineColor: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.85),
                outlineWidth: 2.5,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              label: {
                text: `⚠️ ${hf.properties.hazard.toUpperCase()}`,
                font: 'bold 9.5px system-ui, -apple-system, sans-serif',
                fillColor: Cesium.Color.fromCssColorString('#fef08a'),
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString('#0d1117').withAlpha(0.88),
                backgroundPadding: new Cesium.Cartesian2(5, 3),
                pixelOffset: new Cesium.Cartesian2(0, -16),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
            ent._isHazardAlert = true;
            ent._hazardFeature = hf;
          });
        } catch {}
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [alertsOn, cesiumReady]);

  const altMeters = telemetry.altMeters || zoomToAltitudeMeters(telemetry.zoom);
  const isStreetLevel = altMeters < 8500 || telemetry.zoom >= 12;

  return (
    <div
      onMouseMove={(e) => {
        if (!tvMouseMode) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setTvCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseLeave={() => setTvCursorPos(null)}
      className="relative w-full h-full overflow-hidden bg-[#02050d] select-none touch-none"
    >
      {/* Hide default Cesium credit clutter so tactical HUD remains clean */}
      <style>{`
        .cesium-viewer-bottom, .cesium-viewer-toolbar, .cesium-viewer-animationContainer, .cesium-viewer-timelineContainer {
          display: none !important;
        }
        .cesium-widget, .cesium-widget canvas {
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>

      {/* Deep-Space Starfield Canvas Behind 3D Globe */}
      <canvas
        ref={starCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* Cesium Ion + Google Photorealistic 3D Tiles Canvas */}
      <div
        ref={cesiumContainerRef}
        className={`absolute inset-0 w-full h-full z-10 transition-opacity duration-300 ${
          engineMode === 'cesium' && cesiumReady
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* MapLibre GL 3D Satellite Globe & Street-Level Canvas */}
      <div
        ref={mapContainerRef}
        className={`absolute inset-0 w-full h-full z-10 transition-opacity duration-300 ${
          engineMode === 'maplibre' || !cesiumReady
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Subtle Tactical Vignette Overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-15"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(2,5,13,0) 62%, rgba(2,5,13,0.55) 100%)',
        }}
      />

      {/* TOP-LEFT: AddyFresh Header */}
      <div className="absolute top-2.5 left-3 z-20 pointer-events-none flex flex-col gap-0.5 max-w-[56%]">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-400/70 flex items-center justify-center text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.45)]">
            <Eye size={10} />
          </span>
          <span className="font-mono text-[11px] font-bold tracking-[0.18em] text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
            AddyFresh
          </span>
        </div>
        {selectedEvent && (
          <div className="text-[10px] font-medium text-slate-300 truncate">
            📍 {selectedEvent.title} · {selectedEvent.city}
          </div>
        )}
      </div>

      {/* Compact Emergency Alert ID Card Popup (with 20-Day Post-Expiry Awareness) */}
      {activeAlertCard && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          data-testid="hazard-alert-id-card"
          className="absolute top-12 right-3.5 z-30 pointer-events-auto animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setActiveAlertCard(null)}
              aria-label="Close alert card"
              title="Close alert card"
              className="absolute top-2 right-2.5 z-10 text-slate-400 hover:text-white text-sm leading-none px-1 py-0.5 cursor-pointer"
            >
              ×
            </button>
            <div
              dangerouslySetInnerHTML={{
                __html: buildAlertPopupHtml(activeAlertCard.properties),
              }}
            />
          </div>
        </div>
      )}

      {/* BOTTOM-RIGHT: Circular Tactical Control Dock + Rain Radar Pill & Alerts Toggle */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-2.5 right-3 z-20 flex flex-wrap items-center justify-end gap-1.5 pointer-events-auto"
      >
        {/* Voice: starts or ends the Pagos conversation session */}
        {onToggleVoice && (
          <VoiceButton
            variant="globe"
            state={voiceState}
            secondsLeft={voiceSecondsLeft}
            onToggle={onToggleVoice}
          />
        )}

        {/* Rain Radar Pill: CloudRain toggle + opacity slider (10..90%) + '+' */}
        <div
          className={`flex items-center gap-1 rounded-full py-0.5 pl-1 pr-2 border backdrop-blur-md transition-all ${
            radarOn
              ? 'bg-cyan-950/85 border-cyan-400/80 shadow-[0_0_12px_rgba(34,211,238,0.3)]'
              : 'bg-slate-950/80 border-slate-700/80'
          }`}
        >
          <button
            type="button"
            aria-pressed={radarOn}
            onClick={() => {
              haptic.globePinLight();
              setRadarOn((prev) => !prev);
            }}
            title={radarOn ? 'Turn off Rain Radar' : 'Turn on Rain Radar'}
            aria-label={radarOn ? 'Turn off Rain Radar' : 'Turn on Rain Radar'}
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              radarOn ? 'bg-cyan-500/30 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CloudRain size={12} />
          </button>
          <input
            type="range"
            min={10}
            max={90}
            value={radarOpacity}
            disabled={!radarOn}
            onChange={(e) => {
              const val = Number(e.target.value);
              setRadarOpacity(val);
              try {
                localStorage.setItem('radar-opacity', String(val));
              } catch {}
            }}
            title={`Rain Radar opacity: ${radarOpacity}%`}
            aria-label="Rain Radar opacity"
            className="w-11 sm:w-12 h-1 accent-cyan-400 cursor-pointer disabled:opacity-40"
          />
          <span
            className={`text-[10px] font-mono font-bold select-none ${
              radarOn ? 'text-cyan-300' : 'text-slate-500'
            }`}
          >
            +
          </span>
        </div>

        {/* Emergency Alerts Toggle (GDACS / JTWC / USGS + 20-Day Post-Expiry Awareness) */}
        <button
          type="button"
          aria-pressed={alertsOn}
          onClick={() => {
            haptic.globePinLight();
            const next = !alertsOn;
            setAlertsOn(next);
            try {
              localStorage.setItem('alerts-on', next ? '1' : '0');
            } catch {}
            if (next && hazardFeatures.length > 0 && !activeAlertCard) {
              setActiveAlertCard(hazardFeatures[0]);
            }
          }}
          title={
            alertsOn
              ? 'Emergency Alerts ON (GDACS/JTWC · 20-Day Post-Expiry Awareness)'
              : 'Show Emergency Alerts (GDACS/JTWC · 20-Day Post-Expiry Awareness)'
          }
          aria-label="Toggle Emergency Alerts (20-day awareness)"
          className={`h-7 px-2 rounded-full flex items-center gap-1 border backdrop-blur-md transition-all cursor-pointer ${
            alertsOn
              ? 'bg-amber-500/25 border-amber-400/85 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
              : 'bg-slate-950/80 border-slate-700/80 text-slate-400 hover:text-amber-300'
          }`}
        >
          <TriangleAlert size={12} />
          <span className="font-mono text-[9px] font-bold tracking-wider">20D</span>
        </button>

        {/* Inspect Cyclone / GDACS Alert Card shortcut when alerts are on */}
        {alertsOn && hazardFeatures.length > 0 && !activeAlertCard && (
          <button
            type="button"
            onClick={() => {
              const target = hazardFeatures[0];
              setActiveAlertCard(target);
              const [lng, lat] = target.geometry.coordinates;
              const viewer = cesiumViewerRef.current;
              const Cesium = (window as any).Cesium;
              if (engineMode === 'cesium' && viewer && !viewer.isDestroyed() && Cesium) {
                viewer.camera.flyTo({
                  destination: Cesium.Cartesian3.fromDegrees(lng, lat, 4800000),
                  duration: 1.4,
                });
              } else if (mapRef.current) {
                mapRef.current.flyTo({ center: [lng, lat], zoom: 3.8, duration: 1400 });
              }
            }}
            title="View active GDACS / JTWC Cyclone Alert Card"
            className="h-7 px-2 rounded-full bg-red-950/80 border border-red-500/70 text-red-200 hover:bg-red-900/80 font-mono text-[9px] font-semibold flex items-center gap-1 backdrop-blur-md transition-all cursor-pointer"
          >
            <span>⚠️ {hazardFeatures[0].properties.hazard}</span>
          </button>
        )}
      </div>

      {/* BOTTOM-RIGHT: Horizontal Zoom In (+) / Zoom Out (-) Controls */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-3 bottom-2.5 flex items-center gap-1.5 z-20 pointer-events-auto"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const viewer = cesiumViewerRef.current;
            if (engineMode === 'cesium' && viewer && !viewer.isDestroyed()) {
              const h = viewer.camera.positionCartographic?.height || 1000;
              viewer.camera.zoomOut(Math.min(12000000, Math.max(200, h * 0.85)));
              return;
            }
            const map = mapRef.current;
            if (!map) return;
            const nextZoom = Math.max(1.1, map.getZoom() - (map.getZoom() > 10 ? 1.4 : 1.1));
            const nextPitch = nextZoom < 6 ? 0 : map.getPitch();
            map.easeTo({ zoom: nextZoom, pitch: nextPitch, duration: 450 });
          }}
          className="w-7 h-7 rounded-full bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-cyan-300 flex items-center justify-center text-xs font-bold transition-all shadow-md active:scale-90 cursor-pointer"
          title="Zoom Out (-)"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const viewer = cesiumViewerRef.current;
            if (engineMode === 'cesium' && viewer && !viewer.isDestroyed()) {
              const h = viewer.camera.positionCartographic?.height || 10000000;
              viewer.camera.zoomIn(Math.max(120, h * 0.48));
              return;
            }
            const map = mapRef.current;
            if (!map) return;
            const nextZoom = Math.min(19.2, map.getZoom() + (map.getZoom() < 6 ? 1.4 : 1.1));
            const nextPitch = nextZoom >= 12.5 ? 62 : map.getPitch();
            map.easeTo({ zoom: nextZoom, pitch: nextPitch, duration: 450 });
          }}
          className="w-7 h-7 rounded-full bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-cyan-300 flex items-center justify-center text-xs font-bold transition-all shadow-md active:scale-90 cursor-pointer"
          title="Zoom In (+)"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* BOTTOM-LEFT: Cesium Ion & Google Maps small attribution badge */}
      <div className="absolute bottom-2 left-3 z-20 pointer-events-none font-mono text-[9px] tracking-wider text-slate-400/80 bg-slate-950/60 px-2 py-0.5 rounded border border-cyan-500/20 backdrop-blur-sm flex items-center gap-1.5">
        <span className="text-cyan-400 font-semibold">CESIUM ion</span>
        <span>·</span>
        <span className="text-slate-300">Google Maps 3D</span>
      </div>

      {/* TV 10' BOTTOM D-PAD & MOUSE NAVIGATION BAR */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="app-tv-dpad-bar hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-30 items-center gap-3 pointer-events-auto"
        role="toolbar"
        aria-label="Android TV 10-Foot Globe Navigation Bar"
      >
        <button
          type="button"
          onClick={() => handleTvDpadPan('up')}
          className="w-12 h-12 rounded-full bg-slate-900/90 hover:bg-slate-800 border-2 border-cyan-400/60 hover:border-cyan-300 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-[0_0_16px_rgba(15,23,42,0.85)] active:scale-95 transition-all cursor-pointer"
          title="D-Pad Pan Up"
        >
          <ArrowUp size={20} />
        </button>
        <button
          type="button"
          onClick={() => handleTvDpadPan('down')}
          className="w-12 h-12 rounded-full bg-slate-900/90 hover:bg-slate-800 border-2 border-cyan-400/60 hover:border-cyan-300 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-[0_0_16px_rgba(15,23,42,0.85)] active:scale-95 transition-all cursor-pointer"
          title="D-Pad Pan Down"
        >
          <ArrowDown size={20} />
        </button>
        <button
          type="button"
          onClick={() => handleTvDpadPan('left')}
          className="w-12 h-12 rounded-full bg-slate-900/90 hover:bg-slate-800 border-2 border-cyan-400/60 hover:border-cyan-300 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-[0_0_16px_rgba(15,23,42,0.85)] active:scale-95 transition-all cursor-pointer"
          title="D-Pad Pan Left"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => handleTvDpadPan('right')}
          className="w-12 h-12 rounded-full bg-slate-900/90 hover:bg-slate-800 border-2 border-cyan-400/60 hover:border-cyan-300 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-[0_0_16px_rgba(15,23,42,0.85)] active:scale-95 transition-all cursor-pointer"
          title="D-Pad Pan Right"
        >
          <ArrowRight size={20} />
        </button>
        <button
          type="button"
          onClick={() => handleTvDpadZoom('out')}
          className="w-12 h-12 rounded-full bg-slate-900/90 hover:bg-slate-800 border-2 border-cyan-400/60 hover:border-cyan-300 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-[0_0_16px_rgba(15,23,42,0.85)] active:scale-95 transition-all cursor-pointer"
          title="Zoom Out (-)"
        >
          <Minus size={20} />
        </button>
        <button
          type="button"
          onClick={() => handleTvDpadZoom('in')}
          className="w-12 h-12 rounded-full bg-slate-900/90 hover:bg-slate-800 border-2 border-cyan-400/60 hover:border-cyan-300 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-[0_0_16px_rgba(15,23,42,0.85)] active:scale-95 transition-all cursor-pointer"
          title="Zoom In (+)"
        >
          <Plus size={20} />
        </button>

        {/* Mouse Toggle Button with Floating "Mouse" / "D-Pad" Pill Badge */}
        <div className="relative flex flex-col items-center">
          <span
            className={`absolute -top-7 px-3 py-0.5 rounded-full text-[11px] font-bold tracking-wide border backdrop-blur-md whitespace-nowrap transition-all ${
              tvMouseMode
                ? 'bg-slate-950/90 border-cyan-400 text-white shadow-[0_0_12px_rgba(34,211,238,0.45)]'
                : 'bg-slate-950/85 border-slate-600 text-slate-300'
            }`}
          >
            {tvMouseMode ? 'Mouse' : 'D-Pad'}
          </span>
          <button
            type="button"
            onClick={() => {
              haptic.globePinLight();
              setTvMouseMode((prev) => !prev);
            }}
            className={`w-13 h-13 rounded-full flex items-center justify-center border-2 transition-all active:scale-95 cursor-pointer ${
              tvMouseMode
                ? 'bg-cyan-400 border-cyan-200 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.8)]'
                : 'bg-slate-900/90 border-slate-600 text-slate-300 hover:border-cyan-400/60'
            }`}
            title="Toggle TV D-Pad / Virtual Mouse Mode"
          >
            <MousePointer2 size={22} className="fill-current" />
          </button>
        </div>
      </div>

      {/* TV 10' High-Visibility Virtual Mouse Reticle Ring */}
      {tvMouseMode && tvCursorPos && (
        <div
          style={{
            left: `${tvCursorPos.x}px`,
            top: `${tvCursorPos.y}px`,
          }}
          className="app-tv-cursor-ring hidden pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-40 w-8 h-8 rounded-full border-2 border-cyan-300 bg-cyan-400/15 shadow-[0_0_18px_rgba(34,211,238,0.75)] items-center justify-center"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#fff]" />
        </div>
      )}
    </div>
  );
};
