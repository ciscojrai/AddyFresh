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
  Volume2,
  VolumeX,
  Camera,
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
import {
  loadPublicCameras,
  buildCameraGeoJSON,
  PublicCamera,
} from '../utils/publicCameras';

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
  /** Globe speaker, separate from the panel speaker. Audio on/off only. */
  audioOn?: boolean;
  onToggleAudio?: () => void;
  /** Optional inline conversational AI integration for God's Eye View */
  conversations?: any[];
  activeConversationId?: string | null;
  onSendMessage?: (conversationId: string, text: string) => Promise<any> | void;
  onNewChat?: () => void;
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
  audioOn = true,
  onToggleAudio,
  conversations = [],
  activeConversationId,
  onSendMessage,
  onNewChat,
}) => {
  const starCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const cesiumViewerRef = useRef<any>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const autoRotateRef = useRef<boolean>(false);
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

  const [autoRotate, setAutoRotate] = useState(false);
  const [radarState, setRadarState] = useState<0 | 1 | 2>(() => {
    try {
      const saved = localStorage.getItem('radar-state');
      if (saved === '1' || saved === '2') return Number(saved) as 1 | 2;
      return radarActive ? 2 : 0;
    } catch {
      return radarActive ? 2 : 0;
    }
  });
  const radarOn = radarState > 0;
  const radarOpacity = radarState === 2 ? 90 : radarState === 1 ? 25 : 0;

  // 3-State Cameras Pill: 0 = Off, 1 = California + London pins, 2 = Pins + Labels
  const [camerasState, setCamerasState] = useState<0 | 1 | 2>(() => {
    try {
      const saved = localStorage.getItem('cameras-state');
      if (saved === '1' || saved === '2') return Number(saved) as 1 | 2;
      return 1; // Default ON so public cameras in California and London are immediately visible!
    } catch {
      return 1;
    }
  });
  const camerasOn = camerasState > 0;
  const [activeCamera, setActiveCamera] = useState<PublicCamera | null>(null);

  // Alerts 3-State: 0 = Off, 1 = Pins Only (Halfway), 2 = Pins + Labels (Full)
  const [alertsState, setAlertsState] = useState<0 | 1 | 2>(() => {
    try {
      const saved = localStorage.getItem('alerts-state');
      if (saved === '1' || saved === '2') return Number(saved) as 1 | 2;
      return localStorage.getItem('alerts-on') === '0' ? 0 : 1;
    } catch {
      return 1;
    }
  });
  const alertsOn = alertsState > 0;
  const [hazardFeatures, setHazardFeatures] = useState<HazardFeature[]>([]);
  const [activeAlertCard, setActiveAlertCard] = useState<HazardFeature | null>(null);
  const [alertOverlayPos, setAlertOverlayPos] = useState<{ x: number; y: number } | null>(null);
  const [isChatOverlayOpen, setIsChatOverlayOpen] = useState(false);
  const [chatOverlayInput, setChatOverlayInput] = useState('');
  const [isChatOverlayCollapsed, setIsChatOverlayCollapsed] = useState(false);
  const [chatDragOffset, setChatDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingChatRef = useRef(false);
  const chatDragStartRef = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });
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

  // 2A. Initialize Cesium Ion + Google Photorealistic 3D Tiles Viewer (Primary God's Eye Engine)
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
        // Render on demand only (camera moves / data changes) instead of every frame:
        // continuous rendering of Cesium + MapLibre together was hanging the browser on load.
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
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
            // Lighter on first load: fewer, coarser tiles instead of max detail immediately.
            maximumScreenSpaceError: 32,
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
        if (Cesium.defined(picked) && picked.id && picked.id._cameraData) {
          const cam = picked.id._cameraData as PublicCamera;
          haptic.globePin();
          setActiveCamera(cam);
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(cam.lng, cam.lat - 0.0025, 600),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-45),
              roll: 0,
            },
            duration: 1.8,
          });
          return;
        }
        if (Cesium.defined(picked) && picked.id && picked.id._hazardFeature) {
          const hf = picked.id._hazardFeature as HazardFeature;
          haptic.globePin();
          setActiveAlertCard(hf);
          const [lng, lat] = hf.geometry.type === 'Polygon' ? hf.geometry.coordinates[0][0] : hf.geometry.coordinates;
          // Dive to aerial inspection height (650m - 1200m) to inspect the affected area (Image 3)
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lng, lat - 0.003, 850),
            orientation: {
              heading: Cesium.Math.toRadians(0),
              pitch: Cesium.Math.toRadians(-55),
              roll: 0,
            },
            duration: 1.8,
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

  // Populate Cesium Entities for Events + God's Eye Street Telemetry (`VEH-xxxxxx`, Camera Nodes)
  useEffect(() => {
    const viewer = cesiumViewerRef.current;
    const Cesium = (window as any).Cesium;
    if (!viewer || viewer.isDestroyed() || !Cesium || !cesiumReady) return;

    // Remove previous dynamic event entities
    const toRemove: any[] = [];
    viewer.entities.values.forEach((ent: any) => {
      if (ent._isDynamicGodsEye) {
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

      // Event Pin Billboard (Labels removed per user instruction)
      const pinEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ev.lng, ev.lat, 35),
        billboard: {
          image: createCesiumPinDataUrl(accent, isSelected),
          width: isSelected ? 48 : 24,
          height: isSelected ? 48 : 24,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      pinEntity._isDynamicGodsEye = true;
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
              id: 'godseye-3d-buildings',
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
        if (custom.detail.enabled) setEngineMode('maplibre');
        setRadarState(custom.detail.enabled ? 2 : 0);
        try {
          localStorage.setItem('radar-state', custom.detail.enabled ? '2' : '0');
        } catch {}
      }
    };
    const onSetAlerts = (e: Event) => {
      const custom = e as CustomEvent<{ enabled?: boolean }>;
      if (typeof custom.detail?.enabled === 'boolean') {
        setAlertsState(custom.detail.enabled ? 1 : 0);
        try {
          localStorage.setItem('alerts-state', custom.detail.enabled ? '1' : '0');
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
              // RainViewer tiles are Web Mercator, like newaddy/addylife's MapLibre
              // layer. Cesium defaults to Geographic, which misplaces them.
              tilingScheme: new Cesium.WebMercatorTilingScheme(),
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
    const ALERT_LAYERS = [
      'hazard-area-fill',
      'hazard-area-stroke',
      'hazard-alert-hit',
      'hazard-alert-halo',
      'hazard-alert-dot',
      'hazard-alert-text',
    ];

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

      // 1. Paint on MapLibre 3D Globe (Points + Affected Zone Polygons)
      if (map && map.getStyle()) {
        try {
          // Build polygon FeatureCollection for affected zones
          const polyFeatures: any[] = [];
          fc.features.forEach((hf) => {
            if (hf.geometry.type === 'Polygon' || hf.geometry.type === 'MultiPolygon') {
              polyFeatures.push(hf);
            } else if (hf.properties.radiusKm && hf.properties.radiusKm > 0) {
              const [lon, lat] = hf.geometry.coordinates;
              const coords: number[][] = [];
              const km = hf.properties.radiusKm;
              const points = 36;
              for (let i = 0; i <= points; i++) {
                const angle = (i * 360) / points;
                const rad = (angle * Math.PI) / 180;
                const dx = km * Math.sin(rad);
                const dy = km * Math.cos(rad);
                const dLat = dy / 110.574;
                const dLon = dx / (111.32 * Math.cos((lat * Math.PI) / 180));
                coords.push([lon + dLon, lat + dLat]);
              }
              polyFeatures.push({
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [coords] },
                properties: hf.properties,
              });
            }
          });

          const polyFc = { type: 'FeatureCollection', features: polyFeatures };
          const polySrc = map.getSource('hazard-areas') as maplibregl.GeoJSONSource | undefined;
          if (polySrc) polySrc.setData(polyFc as any);
          else map.addSource('hazard-areas', { type: 'geojson', data: polyFc as any });

          if (!map.getLayer('hazard-area-fill')) {
            map.addLayer({
              id: 'hazard-area-fill',
              type: 'fill',
              source: 'hazard-areas',
              paint: {
                'fill-color': [
                  'match',
                  ['get', 'hazard'],
                  'Wildfire',
                  '#ef4444',
                  'Cyclone',
                  '#06b6d4',
                  'Drought',
                  '#f59e0b',
                  '#ef4444',
                ],
                'fill-opacity': 0.35,
              },
            });
          }

          if (!map.getLayer('hazard-area-stroke')) {
            map.addLayer({
              id: 'hazard-area-stroke',
              type: 'line',
              source: 'hazard-areas',
              paint: {
                'line-color': [
                  'match',
                  ['get', 'hazard'],
                  'Wildfire',
                  '#f87171',
                  'Cyclone',
                  '#22d3ee',
                  'Drought',
                  '#fbbf24',
                  '#f87171',
                ],
                'line-width': 1.8,
                'line-dasharray': [3, 2],
              },
            });
          }

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
          if (!map.getLayer('hazard-alert-text')) {
            map.addLayer({
              id: 'hazard-alert-text',
              type: 'symbol',
              source: 'hazard-alerts',
              layout: {
                'text-field': ['concat', '⚠️ ', ['upcase', ['get', 'hazard']]],
                'text-size': 9.5,
                'text-offset': [0, -1.2],
                'text-anchor': 'bottom',
                'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                'text-allow-overlap': false,
              },
              paint: {
                'text-color': '#fef08a',
                'text-halo-color': '#0d1117',
                'text-halo-width': 1.8,
              },
            });
          }
          for (const id of ALERT_LAYERS) {
            if (map.getLayer(id)) {
              if (id === 'hazard-alert-text') {
                map.setLayoutProperty(id, 'visibility', alertsState === 2 ? 'visible' : 'none');
              } else {
                map.setLayoutProperty(id, 'visibility', 'visible');
              }
            }
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
              // Dive to aerial view of affected zone in MapLibre
              if (map) {
                map.flyTo({ center: coords, zoom: 14.8, pitch: 45, duration: 1800 });
              }
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
            let lng = 0;
            let lat = 0;
            if (hf.geometry.type === 'Point') {
              [lng, lat] = hf.geometry.coordinates;
            } else if (hf.geometry.type === 'Polygon') {
              [lng, lat] = hf.geometry.coordinates[0][0];
            } else {
              return;
            }

            const sev = hf.properties.severity;
            const hex =
              sev === 'EXTREME'
                ? '#ef4444'
                : sev === 'SEVERE'
                ? '#f97316'
                : sev === 'MODERATE'
                ? '#facc15'
                : '#a3e635';

            // Add affected zone polygon or ellipse
            if (hf.geometry.type === 'Polygon') {
              const flatCoords: number[] = [];
              hf.geometry.coordinates[0].forEach(([pLon, pLat]: [number, number]) => {
                flatCoords.push(pLon, pLat);
              });
              const polyEnt = viewer.entities.add({
                polygon: {
                  hierarchy: Cesium.Cartesian3.fromDegreesArray(flatCoords),
                  material: Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.35),
                  outline: true,
                  outlineColor: Cesium.Color.fromCssColorString('#f87171'),
                  outlineWidth: 2,
                },
              });
              polyEnt._isHazardAlert = true;
            } else if (hf.properties.radiusKm && hf.properties.radiusKm > 0) {
              const ellipseEnt = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(lng, lat),
                ellipse: {
                  semiMinorAxis: hf.properties.radiusKm * 1000,
                  semiMajorAxis: hf.properties.radiusKm * 1000,
                  material: Cesium.Color.fromCssColorString(
                    hf.properties.hazard === 'Cyclone'
                      ? '#06b6d4'
                      : hf.properties.hazard === 'Drought'
                      ? '#f59e0b'
                      : '#ef4444'
                  ).withAlpha(0.3),
                  outline: true,
                  outlineColor: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.6),
                  outlineWidth: 1.5,
                },
              });
              ellipseEnt._isHazardAlert = true;
            }

            const ent = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(lng, lat, 55),
              point: {
                pixelSize: 11,
                color: Cesium.Color.fromCssColorString(hex),
                outlineColor: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.85),
                outlineWidth: 2.5,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              ...(alertsState === 2
                ? {
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
                  }
                : {}),
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
  }, [alertsOn, alertsState, cesiumReady]);

  // Load and render public traffic cameras (California Caltrans + London TfL)
  useEffect(() => {
    const map = mapRef.current;
    const viewer = cesiumViewerRef.current;
    const Cesium = (window as any).Cesium;
    const CAM_LAYERS = [
      'public-cam-clusters',
      'public-cam-cluster-count',
      'public-cam-hit',
      'public-cam-glow',
      'public-cam-circle',
      'public-cam-label',
    ];

    if (!camerasOn) {
      setActiveCamera(null);
      if (map && map.getStyle()) {
        for (const id of CAM_LAYERS) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
        }
      }
      if (viewer && !viewer.isDestroyed()) {
        const toRem: any[] = [];
        viewer.entities.values.forEach((ent: any) => {
          if (ent._isPublicCamera) toRem.push(ent);
        });
        toRem.forEach((ent) => viewer.entities.remove(ent));
      }
      return;
    }

    let cancelled = false;
    loadPublicCameras().then((cams) => {
      if (cancelled || !cams.length) return;
      const geojson = buildCameraGeoJSON(cams);

      // 1. Paint on MapLibre 3D Globe with Clustered GeoJSON Source
      if (map && map.getStyle()) {
        try {
          const src = map.getSource('public-cameras') as maplibregl.GeoJSONSource | undefined;
          if (src) {
            src.setData(geojson as any);
          } else {
            map.addSource('public-cameras', {
              type: 'geojson',
              data: geojson as any,
              cluster: true,
              clusterMaxZoom: 11,
              clusterRadius: 50,
            });
          }

          // Cluster Bubbles (Density Step Colors)
          if (!map.getLayer('public-cam-clusters')) {
            map.addLayer({
              id: 'public-cam-clusters',
              type: 'circle',
              source: 'public-cameras',
              filter: ['has', 'point_count'],
              paint: {
                'circle-color': [
                  'step',
                  ['get', 'point_count'],
                  '#10b981', // emerald green (< 20 cams)
                  20,
                  '#059669', // deep emerald (20-100 cams)
                  100,
                  '#047857', // dense cluster
                ],
                'circle-radius': [
                  'step',
                  ['get', 'point_count'],
                  16,
                  20,
                  20,
                  100,
                  26,
                ],
                'circle-stroke-width': 2.5,
                'circle-stroke-color': '#ffffff',
                'circle-opacity': 0.92,
              },
            });
          }

          // Cluster Number Count
          if (!map.getLayer('public-cam-cluster-count')) {
            map.addLayer({
              id: 'public-cam-cluster-count',
              type: 'symbol',
              source: 'public-cameras',
              filter: ['has', 'point_count'],
              layout: {
                'text-field': '{point_count_abbreviated}',
                'text-size': 11,
                'text-font': ['Open Sans Bold'],
              },
              paint: {
                'text-color': '#ffffff',
              },
            });
          }

          // Unclustered Individual Points
          if (!map.getLayer('public-cam-hit')) {
            map.addLayer({
              id: 'public-cam-hit',
              type: 'circle',
              source: 'public-cameras',
              filter: ['!', ['has', 'point_count']],
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 14, 10, 22, 16, 30],
                'circle-color': '#000000',
                'circle-opacity': 0.01,
              },
            });
          }

          if (!map.getLayer('public-cam-glow')) {
            map.addLayer({
              id: 'public-cam-glow',
              type: 'circle',
              source: 'public-cameras',
              filter: ['!', ['has', 'point_count']],
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 16, 16, 22],
                'circle-color': '#10b981',
                'circle-opacity': 0.35,
                'circle-blur': 0.7,
              },
            });
          }

          if (!map.getLayer('public-cam-circle')) {
            map.addLayer({
              id: 'public-cam-circle',
              type: 'circle',
              source: 'public-cameras',
              filter: ['!', ['has', 'point_count']],
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4.5, 10, 6.5, 16, 8.5],
                'circle-color': '#059669',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              },
            });
          }

          if (!map.getLayer('public-cam-label')) {
            map.addLayer({
              id: 'public-cam-label',
              type: 'symbol',
              source: 'public-cameras',
              filter: ['!', ['has', 'point_count']],
              minzoom: 11,
              layout: {
                'text-field': ['get', 'name'],
                'text-size': 10,
                'text-offset': [0, 1.4],
                'text-anchor': 'top',
                'text-optional': true,
              },
              paint: {
                'text-color': '#ecfdf5',
                'text-halo-color': '#064e3b',
                'text-halo-width': 2,
              },
            });
          }

          for (const id of CAM_LAYERS) {
            if (map.getLayer(id)) {
              if (id === 'public-cam-label') {
                map.setLayoutProperty(id, 'visibility', camerasState === 2 ? 'visible' : 'none');
              } else {
                map.setLayoutProperty(id, 'visibility', 'visible');
              }
            }
          }

          // Click Cluster to zoom in & expand
          if (!(map as any).__cameraClusterClickBound) {
            (map as any).__cameraClusterClickBound = true;
            map.on('click', 'public-cam-clusters', (e) => {
              const features = map.queryRenderedFeatures(e.point, { layers: ['public-cam-clusters'] });
              const clusterId = features[0]?.properties?.cluster_id;
              const source = map.getSource('public-cameras') as any;
              if (source && typeof source.getClusterExpansionZoom === 'function') {
                source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
                  if (err) return;
                  const coords = (features[0].geometry as any).coordinates;
                  map.easeTo({ center: coords, zoom: Math.min(15, zoom + 0.8), duration: 700 });
                });
              }
            });
            map.on('mouseenter', 'public-cam-clusters', () => {
              map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'public-cam-clusters', () => {
              map.getCanvas().style.cursor = '';
            });
          }

          // Click on Individual Camera: Open Live Feed Card
          if (!(map as any).__cameraClickBound) {
            (map as any).__cameraClickBound = true;
            const openCam = (e: maplibregl.MapLayerMouseEvent) => {
              const orig = e.originalEvent as MouseEvent & { __camOpened?: boolean };
              if (orig.__camOpened) return;
              orig.__camOpened = true;
              const f = e.features?.[0];
              if (!f || f.properties?.point_count) return;
              const coords = (f.geometry as any).coordinates as [number, number];
              const p = (f.properties ?? {}) as any;
              setActiveCamera({
                id: p.id,
                source: p.source,
                region: p.region,
                name: p.name,
                city: p.city,
                lat: coords[1],
                lng: coords[0],
                imageUrl: p.imageUrl,
                videoUrl: p.videoUrl,
                viewDirection: p.viewDirection,
              });
              map.flyTo({ center: coords, zoom: 15.5, pitch: 45, duration: 1600 });
            };

            for (const id of ['public-cam-hit', 'public-cam-glow', 'public-cam-circle']) {
              map.on('mouseenter', id, () => {
                map.getCanvas().style.cursor = 'pointer';
              });
              map.on('mouseleave', id, () => {
                map.getCanvas().style.cursor = '';
              });
              map.on('click', id, openCam);
            }
          }
        } catch {}
      }

      // 2. Paint on Cesium 3D Globe with Adaptive Distance Clustering
      if (viewer && !viewer.isDestroyed() && Cesium) {
        try {
          const toRem: any[] = [];
          viewer.entities.values.forEach((ent: any) => {
            if (ent._isPublicCamera) toRem.push(ent);
          });
          toRem.forEach((ent) => viewer.entities.remove(ent));

          // When far in orbit (> 1,200 km), show spaced representative pins so dots do not overlap into solid blobs
          const currentHeight = viewer.camera.positionCartographic?.height || 16000000;
          const isFarOrbit = currentHeight > 2500000;
          const isMidOrbit = currentHeight > 600000;
          const displayCams = isFarOrbit
            ? cams.filter((_, idx) => idx % 15 === 0)
            : isMidOrbit
            ? cams.filter((_, idx) => idx % 5 === 0)
            : cams;

          displayCams.forEach((cam) => {
            const ent = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(cam.lng, cam.lat, 40),
              point: {
                pixelSize: isFarOrbit ? 6 : isMidOrbit ? 8 : 10,
                color: Cesium.Color.fromCssColorString('#10b981'),
                outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
                outlineWidth: 2,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              ...(camerasState === 2 && !isFarOrbit
                ? {
                    label: {
                      text: `📹 ${cam.name.slice(0, 22)}`,
                      font: 'bold 9px system-ui, -apple-system, sans-serif',
                      fillColor: Cesium.Color.fromCssColorString('#a7f3d0'),
                      showBackground: true,
                      backgroundColor: Cesium.Color.fromCssColorString('#022c22').withAlpha(0.85),
                      backgroundPadding: new Cesium.Cartesian2(4, 2),
                      pixelOffset: new Cesium.Cartesian2(0, -14),
                      disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    },
                  }
                : {}),
            });
            ent._isPublicCamera = true;
            ent._cameraData = cam;
          });
        } catch {}
      }
    });

    return () => {
      cancelled = true;
    };
  }, [camerasOn, camerasState, cesiumReady]);

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

      {/* Compact Alert ID Card anchored directly inside the Globe Container (follows globe translation & resize) */}
      {activeAlertCard && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            isDraggingChatRef.current = true;
            chatDragStartRef.current = {
              mouseX: e.clientX,
              mouseY: e.clientY,
              startX: chatDragOffset.x,
              startY: chatDragOffset.y,
            };
            const onMove = (mv: PointerEvent) => {
              if (!isDraggingChatRef.current) return;
              setChatDragOffset({
                x: chatDragStartRef.current.startX + (mv.clientX - chatDragStartRef.current.mouseX),
                y: chatDragStartRef.current.startY + (mv.clientY - chatDragStartRef.current.mouseY),
              });
            };
            const onUp = () => {
              isDraggingChatRef.current = false;
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
          onClick={(e) => e.stopPropagation()}
          data-testid="hazard-alert-id-card"
          style={{
            transform: `translate(${chatDragOffset.x}px, ${chatDragOffset.y}px)`,
          }}
          className="absolute top-12 right-3.5 z-30 pointer-events-auto flex flex-col items-end gap-1.5 animate-in fade-in zoom-in-95 duration-150 cursor-grab active:cursor-grabbing"
        >
          {/* Main ID Card Box */}
          <div className="relative shadow-2xl">
            {/* Drag Handle & Close Button Row */}
            <div className="absolute top-1.5 right-2 z-10 flex items-center gap-1">
              <span
                title="Drag to reposition card"
                className="w-3.5 h-1.5 rounded-full bg-slate-600/70 block cursor-grab active:cursor-grabbing"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveAlertCard(null);
                }}
                aria-label="Close alert card"
                title="Close alert card"
                className="text-slate-400 hover:text-white text-xs leading-none p-0.5 cursor-pointer ml-1"
              >
                ✕
              </button>
            </div>

            <div
              dangerouslySetInnerHTML={{
                __html: buildAlertPopupHtml(activeAlertCard.properties),
              }}
            />
          </div>

          {/* Quick Chat / Ask Muse Input Bar: positioned below the alert card to keep upper space visible */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[300px] flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-950/90 border border-slate-700/80 backdrop-blur-md shadow-xl"
          >
            <input
              type="text"
              value={chatOverlayInput}
              onChange={(e) => setChatOverlayInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && chatOverlayInput.trim() && onSendMessage) {
                  e.preventDefault();
                  const prompt = `[${activeAlertCard.properties.hazard || 'Alert'} at ${activeAlertCard.properties.place || activeAlertCard.properties.countryFallback}]: ${chatOverlayInput.trim()}`;
                  onSendMessage(activeConversationId || 'conv-muse', prompt);
                  setChatOverlayInput('');
                }
              }}
              placeholder={`Ask Muse about this ${activeAlertCard.properties.hazard || 'incident'}...`}
              className="flex-1 bg-transparent text-[10.5px] text-slate-100 placeholder-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (chatOverlayInput.trim() && onSendMessage) {
                  const prompt = `[${activeAlertCard.properties.hazard || 'Alert'} at ${activeAlertCard.properties.place || activeAlertCard.properties.countryFallback}]: ${chatOverlayInput.trim()}`;
                  onSendMessage(activeConversationId || 'conv-muse', prompt);
                  setChatOverlayInput('');
                }
              }}
              className="text-cyan-400 hover:text-cyan-300 p-1 rounded-full text-xs font-semibold cursor-pointer"
              title="Send to Muse"
            >
              ➔
            </button>
          </div>
        </div>
      )}

      {/* Live Public Traffic Camera ID Card (California & London) */}
      {activeCamera && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-14 left-4 z-40 flex flex-col gap-1.5 pointer-events-auto"
        >
          <div className="w-[320px] p-3 rounded-2xl bg-slate-950/95 border border-emerald-500/40 backdrop-blur-xl shadow-2xl flex flex-col gap-2">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                  {activeCamera.source === 'caltrans' ? 'Caltrans Live CCTV' : 'TfL London JamCam'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveCamera(null)}
                aria-label="Close camera feed"
                title="Close camera feed"
                className="text-slate-400 hover:text-white text-xs leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Location & Title */}
            <div>
              <div className="text-[12px] font-bold text-slate-100 leading-snug">
                {activeCamera.name}
              </div>
              <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span>📍 {activeCamera.city || activeCamera.region}</span>
                {activeCamera.viewDirection && (
                  <span>· Facing {activeCamera.viewDirection}</span>
                )}
              </div>
            </div>

            {/* Live Camera Feed Image / Video Player */}
            <div className="relative w-full h-[180px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
              {activeCamera.videoUrl && activeCamera.videoUrl.endsWith('.mp4') ? (
                <video
                  src={activeCamera.videoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={activeCamera.imageUrl}
                  alt={activeCamera.name}
                  className="w-full h-full object-cover"
                  loading="eager"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.retried) {
                      target.dataset.retried = 'true';
                      target.src = `${activeCamera.imageUrl}?t=${Date.now()}`;
                    }
                  }}
                />
              )}
              {/* Live Badge */}
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md border border-white/10 flex items-center gap-1 text-[9px] font-mono text-emerald-300 font-semibold uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                LIVE
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] font-mono text-slate-500">
                {activeCamera.lat.toFixed(4)}, {activeCamera.lng.toFixed(4)}
              </span>
              <a
                href={activeCamera.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                Open Full Res ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM-LEFT: Alerts on top, Radar immediately below */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-2.5 left-3 z-20 flex flex-col items-start gap-1.5 pointer-events-auto"
      >
        {/* 3-State Interactive Alerts Pill (Top) */}
        <button
          type="button"
          onClick={() => {
            haptic.globePinLight();
            const next = ((alertsState + 1) % 3) as 0 | 1 | 2;
            setAlertsState(next);
            try {
              localStorage.setItem('alerts-state', String(next));
              localStorage.setItem('alerts-on', next > 0 ? '1' : '0');
            } catch {}
          }}
          title={
            alertsState === 0
              ? 'Alerts: Off (Tap for Incident Pins Only)'
              : alertsState === 1
              ? 'Alerts: Pins Only (Tap for Pins + Labels)'
              : 'Alerts: Pins + Labels (Tap to Turn Off)'
          }
          aria-label={`Emergency Alerts status: ${
            alertsState === 0 ? 'Off' : alertsState === 1 ? 'Pins Only' : 'Pins and Labels'
          }`}
          className="app-globe-tactical-pill relative h-7 px-2.5 rounded-full bg-slate-950/85 border border-slate-700/80 flex items-center justify-start overflow-hidden shadow-md backdrop-blur-md active:scale-95 transition-all cursor-pointer group select-none"
        >
          {/* Animated Left-to-Right Highlight Background */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-amber-500/25 border-r border-amber-400/50 transition-all duration-300 pointer-events-none"
            style={{
              width: alertsState === 1 ? '50%' : alertsState === 2 ? '100%' : '0%',
            }}
          />

          {/* Foreground Icon & Label */}
          <div className="relative z-10 flex items-center gap-1.5 pointer-events-none">
            <TriangleAlert
              size={12}
              className={`app-globe-pill-icon transition-colors duration-300 ${
                alertsState > 0
                  ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]'
                  : 'text-slate-400'
              }`}
            />
            <span
              className={`app-globe-pill-text font-mono text-[9px] font-bold tracking-wider transition-colors duration-300 ${
                alertsState > 0 ? 'text-amber-100' : 'text-slate-400'
              }`}
            >
              Alerts
            </span>
          </div>

          {/* Tactical 2-Dot Meter Indicator on Right */}
          <div className="relative z-10 ml-2 flex items-center gap-1 pointer-events-none">
            <div
              className={`w-1 h-1 rounded-full transition-all duration-300 ${
                alertsState >= 1 ? 'bg-amber-400 shadow-[0_0_4px_#f59e0b]' : 'bg-slate-700'
              }`}
            />
            <div
              className={`w-1 h-1 rounded-full transition-all duration-300 ${
                alertsState === 2 ? 'bg-amber-400 shadow-[0_0_4px_#f59e0b]' : 'bg-slate-700'
              }`}
            />
          </div>
        </button>

        {/* 3-State Interactive Radar Pill (Bottom, word 'Rain' removed) */}
        <button
          type="button"
          onClick={() => {
            haptic.globePinLight();
            const next = ((radarState + 1) % 3) as 0 | 1 | 2;
            if (next > 0) setEngineMode('maplibre');
            setRadarState(next);
            try {
              localStorage.setItem('radar-state', String(next));
            } catch {}
          }}
          title={
            radarState === 0
              ? 'Radar: Off (Tap for Dim 25% Overlay)'
              : radarState === 1
              ? 'Radar: Dim 25% (Tap for Bright 90% Overlay)'
              : 'Radar: Bright 90% (Tap to Turn Off)'
          }
          aria-label={`Radar status: ${
            radarState === 0 ? 'Off' : radarState === 1 ? '25% Dim' : '90% Bright'
          }`}
          className="app-globe-tactical-pill relative h-7 px-2.5 rounded-full bg-slate-950/85 border border-slate-700/80 flex items-center justify-start overflow-hidden shadow-md backdrop-blur-md active:scale-95 transition-all cursor-pointer group select-none"
        >
          {/* Animated Left-to-Right Highlight Background */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-cyan-500/25 border-r border-cyan-400/50 transition-all duration-300 pointer-events-none"
            style={{
              width: radarState === 1 ? '50%' : radarState === 2 ? '100%' : '0%',
            }}
          />

          {/* Foreground Icon & Label */}
          <div className="relative z-10 flex items-center gap-1.5 pointer-events-none">
            <CloudRain
              size={12}
              className={`app-globe-pill-icon transition-colors duration-300 ${
                radarState > 0
                  ? 'text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]'
                  : 'text-slate-400'
              }`}
            />
            <span
              className={`app-globe-pill-text font-mono text-[9px] font-bold tracking-wider transition-colors duration-300 ${
                radarState > 0 ? 'text-cyan-200' : 'text-slate-400'
              }`}
            >
              Radar
            </span>
          </div>

          {/* Tactical 2-Dot Meter Indicator on Right */}
          <div className="relative z-10 ml-2 flex items-center gap-1 pointer-events-none">
            <div
              className={`w-1 h-1 rounded-full transition-all duration-300 ${
                radarState >= 1 ? 'bg-cyan-400 shadow-[0_0_4px_#22d3ee]' : 'bg-slate-700'
              }`}
            />
            <div
              className={`w-1 h-1 rounded-full transition-all duration-300 ${
                radarState === 2 ? 'bg-cyan-400 shadow-[0_0_4px_#22d3ee]' : 'bg-slate-700'
              }`}
            />
          </div>
        </button>

        {/* 3-State Interactive Live Cameras Pill (California + London) */}
        <button
          type="button"
          onClick={() => {
            haptic.globePinLight();
            const next = ((camerasState + 1) % 3) as 0 | 1 | 2;
            setCamerasState(next);
            try {
              localStorage.setItem('cameras-state', String(next));
            } catch {}
          }}
          title={
            camerasState === 0
              ? 'Cameras: Off (Tap to show California & London live traffic cameras)'
              : camerasState === 1
              ? 'Cameras: Active (Tap to show Camera Names & Highways)'
              : 'Cameras: Full (Tap to Turn Off)'
          }
          aria-label={`Live Cameras status: ${
            camerasState === 0 ? 'Off' : camerasState === 1 ? 'Pins Active' : 'Full Labels'
          }`}
          className="app-globe-tactical-pill relative h-7 px-2.5 rounded-full bg-slate-950/85 border border-slate-700/80 flex items-center justify-start overflow-hidden shadow-md backdrop-blur-md active:scale-95 transition-all cursor-pointer group select-none"
        >
          {/* Animated Left-to-Right Highlight Background */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-emerald-500/25 border-r border-emerald-400/50 transition-all duration-300 pointer-events-none"
            style={{
              width: camerasState === 1 ? '50%' : camerasState === 2 ? '100%' : '0%',
            }}
          />

          {/* Foreground Icon & Label */}
          <div className="relative z-10 flex items-center gap-1.5 pointer-events-none">
            <Camera
              size={12}
              className={`app-globe-pill-icon transition-colors duration-300 ${
                camerasState > 0
                  ? 'text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                  : 'text-slate-400'
              }`}
            />
            <span
              className={`app-globe-pill-text font-mono text-[9px] font-bold tracking-wider transition-colors duration-300 ${
                camerasState > 0 ? 'text-emerald-200' : 'text-slate-400'
              }`}
            >
              Cams
            </span>
          </div>

          {/* Tactical 2-Dot Meter Indicator on Right */}
          <div className="relative z-10 ml-2 flex items-center gap-1 pointer-events-none">
            <div
              className={`w-1 h-1 rounded-full transition-all duration-300 ${
                camerasState >= 1 ? 'bg-emerald-400 shadow-[0_0_4px_#34d399]' : 'bg-slate-700'
              }`}
            />
            <div
              className={`w-1 h-1 rounded-full transition-all duration-300 ${
                camerasState === 2 ? 'bg-emerald-400 shadow-[0_0_4px_#34d399]' : 'bg-slate-700'
              }`}
            />
          </div>
        </button>
      </div>

      {/* BOTTOM-RIGHT: Circular Tactical Control Dock (Conversation/Voice Icon & Speaker) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="app-globe-voice-dock absolute bottom-2.5 right-3 z-20 flex items-center justify-end gap-1.5 pointer-events-auto"
      >
        {/* Voice / Conversation icon: starts or ends the Pagos conversation session */}
        {onToggleVoice && (
          <VoiceButton
            variant="globe"
            state={voiceState}
            secondsLeft={voiceSecondsLeft}
            onToggle={onToggleVoice}
          />
        )}

        {/* Globe speaker: audio on/off for the globe voice chat only */}
        {onToggleAudio && (
          <button
            type="button"
            onClick={onToggleAudio}
            title={audioOn ? 'Globe audio: On (tap to mute)' : 'Globe audio: Off (tap to unmute)'}
            aria-label={audioOn ? 'Turn globe audio off' : 'Turn globe audio on'}
            className={`app-globe-speaker-btn w-9 h-9 rounded-full flex items-center justify-center border shadow-md transition-all cursor-pointer ${
              audioOn ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {audioOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        )}
      </div>

      {/* TOP-RIGHT: Cesium Ion & Google Maps small attribution badge */}
      <div className="absolute top-2.5 right-3 z-20 pointer-events-none font-mono text-[9px] tracking-wider text-slate-400/80 bg-slate-950/60 px-2 py-0.5 rounded border border-cyan-500/20 backdrop-blur-sm flex items-center gap-1.5 shadow-md">
        <span className="text-cyan-400 font-semibold">CESIUM ion</span>
        <span>·</span>
        <span className="text-slate-300">Google Maps 3D</span>
      </div>

      {/* GLOBE D-PAD NAVIGATION BAR (Available throughout Tall, Wide, and TV) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="app-globe-dpad-bar absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 sm:gap-1.5 pointer-events-auto"
        role="toolbar"
        aria-label="Globe Navigation Bar"
      >
        <button
          type="button"
          onClick={() => handleTvDpadPan('up')}
          className="app-globe-nav-btn w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
          title="Pan Up"
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          onClick={() => handleTvDpadPan('down')}
          className="app-globe-nav-btn w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
          title="Pan Down"
        >
          <ArrowDown size={12} />
        </button>
        <button
          type="button"
          onClick={() => handleTvDpadPan('left')}
          className="app-globe-nav-btn w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
          title="Pan Left"
        >
          <ArrowLeft size={12} />
        </button>
        <button
          type="button"
          onClick={() => handleTvDpadPan('right')}
          className="app-globe-nav-btn w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
          title="Pan Right"
        >
          <ArrowRight size={12} />
        </button>
        <button
          type="button"
          onClick={() => handleTvDpadZoom('out')}
          className="app-globe-nav-btn w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
          title="Zoom Out (-)"
        >
          <Minus size={12} />
        </button>
        <button
          type="button"
          onClick={() => handleTvDpadZoom('in')}
          className="app-globe-nav-btn w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 hover:text-cyan-300 flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer"
          title="Zoom In (+)"
        >
          <Plus size={12} />
        </button>

        {/* Mouse Pointer Button (ONLY added in TV UI 10' mode) */}
        <div className="app-tv-only-mouse hidden relative flex-col items-center">
          <button
            type="button"
            onClick={() => {
              haptic.globePinLight();
              setTvMouseMode((prev) => !prev);
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all active:scale-95 cursor-pointer ${
              tvMouseMode
                ? 'bg-cyan-400 border-cyan-200 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.8)]'
                : 'bg-slate-900/90 border-slate-600 text-slate-300 hover:border-cyan-400/60'
            }`}
            title="Toggle TV Virtual Mouse Mode"
          >
            <MousePointer2 size={20} className="fill-current" />
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
