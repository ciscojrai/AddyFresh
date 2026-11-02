import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { EventItem, Mood, CameraPerspective, ThemeMode } from '../types';
import { Plus, Minus, Globe, Compass, Box, Eye, RotateCw, Layers } from 'lucide-react';
import { haptic } from '../utils/haptics';
import { initMapLibreWorker } from '../maplibreWorker';

interface GlobeViewProps {
  events: EventItem[];
  selectedEvent: EventItem | null;
  onSelectEvent: (event: EventItem) => void;
  activeMood: Mood;
  radarActive?: boolean;
  perspective?: CameraPerspective;
  themeMode?: ThemeMode;
}

// Format decimal degrees into tactical DMS (e.g. 30°16'09.51"N 097°45'47.67"W)
function formatDMS(lat: number, lng: number): string {
  const toDMS = (deg: number, posHem: string, negHem: string, padDeg: number) => {
    const hem = deg >= 0 ? posHem : negHem;
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const mFloat = (abs - d) * 60;
    const m = Math.floor(mFloat);
    const s = ((mFloat - m) * 60).toFixed(2);
    return `${String(d).padStart(padDeg, '0')}°${String(m).padStart(2, '0')}'${String(s).padStart(5, '0')}"${hem}`;
  };
  return `${toDMS(lat, 'N', 'S', 2)} ${toDMS(lng, 'E', 'W', 3)}`;
}

// Compute tactical MGRS-style grid identifier from lat/lng
function formatTacticalMGRS(lat: number, lng: number): string {
  const zone = Math.max(1, Math.min(60, Math.floor((lng + 180) / 6) + 1));
  const bands = 'CDEFGHJKLMNPQRSTUVWX';
  const bandIdx = Math.max(0, Math.min(bands.length - 1, Math.floor((lat + 80) / 8)));
  const band = bands[bandIdx] || 'R';
  const eSq = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.abs(Math.floor(lng * 10)) % 24];
  const nSq = 'ABCDEFGHJKLMNPQRSTUV'[Math.abs(Math.floor(lat * 10)) % 20];
  const easting = String(Math.abs(Math.floor((lng % 1) * 10000))).padStart(4, '0');
  const northing = String(Math.abs(Math.floor((lat % 1) * 10000))).padStart(4, '0');
  return `${zone}${band} ${eSq}${nSq} ${easting} ${northing}`;
}

// Approximate camera altitude in meters from MapLibre zoom level
function zoomToAltitudeMeters(zoom: number): number {
  const orbitMeters = 18500000 / Math.pow(2, Math.max(0, zoom - 1.2));
  return Math.max(45, Math.round(orbitMeters));
}

function formatAltitude(meters: number): string {
  if (meters >= 10000) {
    return `${(meters / 1000).toFixed(0)} KM`;
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} KM`;
  }
  return `${meters} M`;
}

// Build great-circle-like orbital trajectory arcs for orbital view
function buildOrbitalArcsGeoJSON() {
  const arcs: Array<Array<[number, number]>> = [];
  const inclinations = [
    { inc: 52, phase: -40 },
    { inc: -48, phase: 65 },
  ];
  inclinations.forEach(({ inc, phase }) => {
    const coords: Array<[number, number]> = [];
    for (let lng = -180; lng <= 180; lng += 4) {
      const rad = ((lng + phase) * Math.PI) / 180;
      const lat = Math.sin(rad) * inc;
      coords.push([lng, lat]);
    }
    arcs.push(coords);
  });
  return {
    type: 'FeatureCollection' as const,
    features: arcs.map((coordinates, i) => ({
      type: 'Feature' as const,
      properties: { id: `orbit-${i}`, color: i === 0 ? '#ef4444' : '#38bdf8' },
      geometry: {
        type: 'LineString' as const,
        coordinates,
      },
    })),
  };
}

// Build synthetic God's Eye street-level telemetry nodes (vehicles & cameras) around events
function buildGodsEyeTelemetryGeoJSON(events: EventItem[]) {
  const vehFeatures: any[] = [];
  const camFeatures: any[] = [];
  const frustumFeatures: any[] = [];
  const flowFeatures: any[] = [];

  events.forEach((ev, evIdx) => {
    const roadCoords: Array<[number, number]> = [
      [ev.lng - 0.008, ev.lat - 0.005],
      [ev.lng - 0.003, ev.lat - 0.0018],
      [ev.lng, ev.lat],
      [ev.lng + 0.0035, ev.lat + 0.0022],
      [ev.lng + 0.0085, ev.lat + 0.0055],
    ];
    flowFeatures.push({
      type: 'Feature',
      properties: { id: `flow-${ev.id}` },
      geometry: { type: 'LineString', coordinates: roadCoords },
    });

    const offsets = [
      [-0.0024, -0.0014, '129543'],
      [-0.0011, -0.0006, '129783'],
      [0.0008, 0.0005, '130625'],
      [0.0021, 0.0013, '130834'],
      [-0.0018, 0.0016, '121462'],
      [0.0016, -0.0015, '121452'],
    ];
    offsets.forEach(([dLng, dLat, code], i) => {
      vehFeatures.push({
        type: 'Feature',
        properties: {
          id: `veh-${evIdx}-${i}`,
          label: `VEH-${code}`,
        },
        geometry: {
          type: 'Point',
          coordinates: [ev.lng + (dLng as number), ev.lat + (dLat as number)],
        },
      });
    });

    const camOffsets = [
      { dLng: -0.0009, dLat: -0.0005, heading: 42, id: `CAM-${evIdx}A` },
      { dLng: 0.0014, dLat: 0.0009, heading: 215, id: `CAM-${evIdx}B` },
    ];
    camOffsets.forEach((cam) => {
      const cLng = ev.lng + cam.dLng;
      const cLat = ev.lat + cam.dLat;
      camFeatures.push({
        type: 'Feature',
        properties: { id: cam.id, title: `${ev.city} Optical Node` },
        geometry: { type: 'Point', coordinates: [cLng, cLat] },
      });

      const rad = (cam.heading * Math.PI) / 180;
      const spread = 0.42;
      const range = 0.0018;
      const p1: [number, number] = [
        cLng + Math.sin(rad - spread) * range,
        cLat + Math.cos(rad - spread) * range,
      ];
      const p2: [number, number] = [
        cLng + Math.sin(rad + spread) * range,
        cLat + Math.cos(rad + spread) * range,
      ];
      frustumFeatures.push({
        type: 'Feature',
        properties: { id: `frustum-${cam.id}` },
        geometry: {
          type: 'Polygon',
          coordinates: [[[cLng, cLat], p1, p2, [cLng, cLat]]],
        },
      });
    });
  });

  return {
    vehicles: { type: 'FeatureCollection' as const, features: vehFeatures },
    cameras: { type: 'FeatureCollection' as const, features: camFeatures },
    frustums: { type: 'FeatureCollection' as const, features: frustumFeatures },
    flows: { type: 'FeatureCollection' as const, features: flowFeatures },
  };
}

// Create a crisp tactical reticle canvas icon for Cesium billboards
function createCesiumReticleDataUrl(color: string, isSelected: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const s = isSelected ? 34 : 26;
  const offset = (48 - s) / 2;
  const corner = 7;

  ctx.strokeStyle = color;
  ctx.lineWidth = isSelected ? 2.5 : 2;

  // Top-left bracket
  ctx.beginPath();
  ctx.moveTo(offset, offset + corner);
  ctx.lineTo(offset, offset);
  ctx.lineTo(offset + corner, offset);
  ctx.stroke();

  // Top-right bracket
  ctx.beginPath();
  ctx.moveTo(offset + s - corner, offset);
  ctx.lineTo(offset + s, offset);
  ctx.lineTo(offset + s, offset + corner);
  ctx.stroke();

  // Bottom-left bracket
  ctx.beginPath();
  ctx.moveTo(offset, offset + s - corner);
  ctx.lineTo(offset, offset + s);
  ctx.lineTo(offset + corner, offset + s);
  ctx.stroke();

  // Bottom-right bracket
  ctx.beginPath();
  ctx.moveTo(offset + s - corner, offset + s);
  ctx.lineTo(offset + s, offset + s);
  ctx.lineTo(offset + s, offset + s - corner);
  ctx.stroke();

  // Center glowing dot
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = isSelected ? '#ffffff' : color;
  ctx.beginPath();
  ctx.arc(24, 24, isSelected ? 5 : 3.8, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL();
}

export const GlobeView: React.FC<GlobeViewProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  activeMood,
}) => {
  const starCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const cesiumViewerRef = useRef<any>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const autoRotateRef = useRef<boolean>(true);
  const isUserInteractingRef = useRef<boolean>(false);

  const cesiumToken = (import.meta as any).env?.VITE_CESIUM_ION_TOKEN || '';
  const [engineMode, setEngineMode] = useState<'cesium' | 'maplibre'>('cesium');
  const [cesiumReady, setCesiumReady] = useState<boolean>(false);

  const [autoRotate, setAutoRotate] = useState(true);
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

      // Add orbital trajectory arcs (like Image 3 of God's Eye View)
      const orbitArcs = buildOrbitalArcsGeoJSON();
      orbitArcs.features.forEach((f) => {
        const flat: number[] = [];
        f.geometry.coordinates.forEach(([lng, lat]) => {
          flat.push(lng, lat, 420000);
        });
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(flat),
            width: 1.6,
            material: Cesium.Color.fromCssColorString(f.properties.color).withAlpha(0.65),
          },
        });
      });

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

    // Remove previous dynamic event/telemetry entities (preserve orbital arcs)
    const toRemove: any[] = [];
    viewer.entities.values.forEach((ent: any) => {
      if (ent._isDynamicGodsEye) {
        toRemove.push(ent);
      }
    });
    toRemove.forEach((ent) => viewer.entities.remove(ent));

    events.forEach((ev) => {
      const isSelected = selectedEvent?.id === ev.id;
      const accent = isSelected ? '#38bdf8' : activeMood.color || '#22d3ee';
      const shortTitle =
        ev.title.length > 18 ? ev.title.slice(0, 17).toUpperCase() + '…' : ev.title.toUpperCase();

      // 1. Tactical Reticle Event Pin
      const pinEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ev.lng, ev.lat, 35),
        billboard: {
          image: createCesiumReticleDataUrl(accent, isSelected),
          width: isSelected ? 34 : 26,
          height: isSelected ? 34 : 26,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${ev.city.toUpperCase()} // ${shortTitle}`,
          font: 'bold 10px ui-monospace, SFMono-Regular, Menlo, monospace',
          fillColor: Cesium.Color.fromCssColorString(isSelected ? '#38bdf8' : '#e2e8f0'),
          outlineColor: Cesium.Color.fromCssColorString('#020617'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#040a16').withAlpha(0.86),
          backgroundPadding: new Cesium.Cartesian2(6, 3),
          pixelOffset: new Cesium.Cartesian2(0, -24),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      pinEntity._isDynamicGodsEye = true;
      pinEntity._freshaddyEvent = ev;

      // 2. Street-level God's Eye Vehicle Reticles [VEH-xxxxxx] (visible when zoomed below 18 km)
      const vehOffsets = [
        [-0.0022, -0.0012, '129543'],
        [-0.0009, -0.0005, '129783'],
        [0.0008, 0.0005, '130625'],
        [0.0019, 0.0012, '130834'],
        [-0.0015, 0.0014, '121462'],
        [0.0014, -0.0013, '121452'],
      ];
      vehOffsets.forEach(([dLng, dLat, code]) => {
        const vehEnt = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            ev.lng + (dLng as number),
            ev.lat + (dLat as number),
            18
          ),
          point: {
            pixelSize: 6,
            color: Cesium.Color.fromCssColorString('#4ade80'),
            outlineColor: Cesium.Color.fromCssColorString('#020617'),
            outlineWidth: 2,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 18000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `VEH-${code}`,
            font: 'bold 9px ui-monospace, SFMono-Regular, Menlo, monospace',
            fillColor: Cesium.Color.fromCssColorString('#a7f3d0'),
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#020617').withAlpha(0.85),
            backgroundPadding: new Cesium.Cartesian2(4, 2),
            pixelOffset: new Cesium.Cartesian2(0, -14),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 14000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        vehEnt._isDynamicGodsEye = true;
      });

      // 3. Street-level Traffic Flow Corridor Polyline (visible below 25 km)
      const flowEnt = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            ev.lng - 0.007,
            ev.lat - 0.0045,
            12,
            ev.lng - 0.0025,
            ev.lat - 0.0015,
            12,
            ev.lng,
            ev.lat,
            12,
            ev.lng + 0.003,
            ev.lat + 0.002,
            12,
            ev.lng + 0.0075,
            ev.lat + 0.0048,
            12,
          ]),
          width: 4,
          material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.75),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25000),
        },
      });
      flowEnt._isDynamicGodsEye = true;
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
        'carto-hybrid-labels': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          maxzoom: 19,
        },
        'orbital-arcs': {
          type: 'geojson',
          data: buildOrbitalArcsGeoJSON() as any,
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
          id: 'orbital-arcs-glow',
          type: 'line',
          source: 'orbital-arcs',
          maxzoom: 6.5,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2.2,
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              1,
              0.55,
              4.5,
              0.35,
              6.2,
              0,
            ],
            'line-blur': 1.5,
          },
        },
        {
          id: 'orbital-arcs-core',
          type: 'line',
          source: 'orbital-arcs',
          maxzoom: 6.5,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 1.1,
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              1,
              0.8,
              4.5,
              0.5,
              6.2,
              0,
            ],
          },
        },
        {
          id: 'hybrid-street-labels',
          type: 'raster',
          source: 'carto-hybrid-labels',
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

      const telemetryData = buildGodsEyeTelemetryGeoJSON(events);

      if (!map.getSource('godseye-flows')) {
        map.addSource('godseye-flows', { type: 'geojson', data: telemetryData.flows as any });
        map.addLayer({
          id: 'godseye-flows-glow',
          type: 'line',
          source: 'godseye-flows',
          minzoom: 11,
          paint: {
            'line-color': '#22d3ee',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 12, 19, 22],
            'line-opacity': 0.35,
            'line-blur': 4,
          },
        });
        map.addLayer({
          id: 'godseye-flows-core',
          type: 'line',
          source: 'godseye-flows',
          minzoom: 11,
          paint: {
            'line-color': '#4ade80',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 3.5, 19, 6],
            'line-dasharray': [2, 2],
            'line-opacity': 0.85,
          },
        });
      }

      if (!map.getSource('godseye-frustums')) {
        map.addSource('godseye-frustums', { type: 'geojson', data: telemetryData.frustums as any });
        map.addLayer({
          id: 'godseye-frustums-fill',
          type: 'fill',
          source: 'godseye-frustums',
          minzoom: 12.5,
          paint: {
            'fill-color': '#38bdf8',
            'fill-opacity': 0.22,
          },
        });
        map.addLayer({
          id: 'godseye-frustums-line',
          type: 'line',
          source: 'godseye-frustums',
          minzoom: 12.5,
          paint: {
            'line-color': '#38bdf8',
            'line-width': 1.5,
            'line-opacity': 0.75,
          },
        });
      }

      if (!map.getSource('godseye-vehicles')) {
        map.addSource('godseye-vehicles', { type: 'geojson', data: telemetryData.vehicles as any });
        map.addLayer({
          id: 'godseye-vehicles-dot',
          type: 'circle',
          source: 'godseye-vehicles',
          minzoom: 13,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 5.5],
            'circle-color': '#4ade80',
            'circle-stroke-color': '#020617',
            'circle-stroke-width': 1.5,
          },
        });
        map.addLayer({
          id: 'godseye-vehicles-label',
          type: 'symbol',
          source: 'godseye-vehicles',
          minzoom: 13.5,
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 10,
            'text-offset': [0, -1.3],
            'text-anchor': 'bottom',
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#e2e8f0',
            'text-halo-color': 'rgba(2, 6, 23, 0.92)',
            'text-halo-width': 2,
          },
        });
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

  // 3. Populate Tactical Reticle Event Pins on MapLibre layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    try {
      const telemetryData = buildGodsEyeTelemetryGeoJSON(events);
      (map.getSource('godseye-flows') as maplibregl.GeoJSONSource | undefined)?.setData(
        telemetryData.flows as any
      );
      (map.getSource('godseye-frustums') as maplibregl.GeoJSONSource | undefined)?.setData(
        telemetryData.frustums as any
      );
      (map.getSource('godseye-vehicles') as maplibregl.GeoJSONSource | undefined)?.setData(
        telemetryData.vehicles as any
      );
    } catch {
      // ignore
    }

    events.forEach((ev) => {
      const isSelected = selectedEvent?.id === ev.id;
      const accent = isSelected ? '#38bdf8' : activeMood.color || '#22d3ee';

      const wrapper = document.createElement('div');
      wrapper.className = 'godseye-reticle-pin group';
      wrapper.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        user-select: none;
        z-index: ${isSelected ? 45 : 20};
      `;

      const shortTitle =
        ev.title.length > 18 ? ev.title.slice(0, 17).toUpperCase() + '…' : ev.title.toUpperCase();
      const tag = document.createElement('div');
      tag.style.cssText = `
        margin-bottom: 4px;
        padding: 2px 6px;
        background: rgba(4, 10, 22, 0.88);
        border: 1px solid ${isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.4)'};
        border-radius: 3px;
        color: ${isSelected ? '#38bdf8' : '#e2e8f0'};
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.05em;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
      `;
      tag.textContent = `${ev.city.toUpperCase()} // ${shortTitle}`;

      const reticle = document.createElement('div');
      const size = isSelected ? 24 : 18;
      reticle.style.cssText = `
        position: relative;
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;
      `;

      const corners = [
        'top:0;left:0;border-top:1.5px solid;border-left:1.5px solid;',
        'top:0;right:0;border-top:1.5px solid;border-right:1.5px solid;',
        'bottom:0;left:0;border-bottom:1.5px solid;border-left:1.5px solid;',
        'bottom:0;right:0;border-bottom:1.5px solid;border-right:1.5px solid;',
      ];
      corners.forEach((pos) => {
        const c = document.createElement('span');
        c.style.cssText = `
          position: absolute;
          width: 5px;
          height: 5px;
          ${pos}
          border-color: ${accent};
        `;
        reticle.appendChild(c);
      });

      const dot = document.createElement('div');
      dot.style.cssText = `
        width: ${isSelected ? 7 : 5}px;
        height: ${isSelected ? 7 : 5}px;
        border-radius: 9999px;
        background: ${isSelected ? '#ffffff' : accent};
        box-shadow: 0 0 10px ${accent}, 0 0 18px ${accent};
      `;
      reticle.appendChild(dot);

      wrapper.appendChild(tag);
      wrapper.appendChild(reticle);

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

  // Dive to God's Eye Street Level or return to Orbit
  const handleToggleGodsEyeDive = useCallback(() => {
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

  const altMeters = telemetry.altMeters || zoomToAltitudeMeters(telemetry.zoom);
  const gsdMeters = (altMeters / 2650).toFixed(2);
  const isStreetLevel = altMeters < 8500 || telemetry.zoom >= 12;
  const activeSectorName = selectedEvent
    ? `${selectedEvent.city.toUpperCase()} // ${(selectedEvent.venue || selectedEvent.title).toUpperCase()}`
    : !isStreetLevel
    ? 'ORBITAL RECON // GLOBAL SECTOR'
    : 'METRO RECON // ACTIVE TARGET';

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#02050d] select-none touch-none">
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

      {/* TOP-LEFT: GOD'S EYE VIEW Tactical Telemetry Header */}
      <div className="absolute top-2.5 left-3 z-20 pointer-events-none flex flex-col gap-0.5 max-w-[56%]">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-400/70 flex items-center justify-center text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.45)]">
            <Eye size={10} />
          </span>
          <span className="font-mono text-[11px] font-bold tracking-[0.18em] text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
            GOD&apos;S EYE VIEW
          </span>
        </div>
        <div className="font-mono text-[8.5px] tracking-[0.12em] text-cyan-400/80 truncate">
          {isStreetLevel
            ? 'LIVE · GOOGLE 3D PHOTOREALISTIC · STREET TELEMETRY'
            : 'CESIUM ION · ORBITAL SATELLITE BATHYMETRY'}
        </div>
        <div className="font-mono text-[8.5px] tracking-[0.08em] text-slate-300/90 truncate">
          {activeSectorName}
        </div>
      </div>

      {/* BOTTOM-CENTER: Circular Tactical Control Dock */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-2.5 right-3 z-20 hidden sm:flex items-center gap-1.5 pointer-events-auto"
      >
        <button
          type="button"
          onClick={() => setAutoRotate((prev) => !prev)}
          className={`w-7 h-7 rounded-full flex items-center justify-center border backdrop-blur-md transition-all cursor-pointer ${
            autoRotate && !isStreetLevel
              ? 'bg-cyan-500/25 border-cyan-400/80 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.35)]'
              : 'bg-slate-950/80 border-slate-700/80 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Orbital Auto-Rotation"
        >
          <RotateCw size={12} />
        </button>
        <button
          type="button"
          onClick={handleToggleGodsEyeDive}
          className={`h-7 px-2.5 rounded-full flex items-center gap-1 border backdrop-blur-md font-mono text-[9.5px] font-bold tracking-wider transition-all cursor-pointer ${
            isStreetLevel
              ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.45)]'
              : 'bg-slate-950/80 border-slate-700/80 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-300'
          }`}
          title={isStreetLevel ? 'Return to 3D Orbit' : "Dive to God's Eye Street Level"}
        >
          <Box size={11} />
          <span>{isStreetLevel ? 'ORBIT' : 'STREET 3D'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (engineMode === 'cesium' && cesiumViewerRef.current) {
              const viewer = cesiumViewerRef.current;
              const Cesium = (window as any).Cesium;
              const carto = viewer.camera.positionCartographic;
              if (carto && Cesium) {
                const lat = Cesium.Math.toDegrees(carto.latitude);
                const lng = Cesium.Math.toDegrees(carto.longitude);
                const isTilted = viewer.camera.pitch > -1.1;
                viewer.camera.flyTo({
                  destination: Cesium.Cartesian3.fromDegrees(lng, lat, Math.max(400, carto.height)),
                  orientation: {
                    heading: viewer.camera.heading,
                    pitch: Cesium.Math.toRadians(isTilted ? -89 : -32),
                    roll: 0,
                  },
                  duration: 0.7,
                });
              }
              return;
            }
            const map = mapRef.current;
            if (!map) return;
            const nextPitch = map.getPitch() > 25 ? 0 : 62;
            map.easeTo({ pitch: nextPitch, duration: 700 });
          }}
          className={`w-7 h-7 rounded-full flex items-center justify-center border backdrop-blur-md transition-all cursor-pointer ${
            telemetry.pitch > 25
              ? 'bg-cyan-500/25 border-cyan-400/80 text-cyan-300'
              : 'bg-slate-950/80 border-slate-700/80 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle 3D Camera Tilt (Pitch)"
        >
          <Compass size={12} />
        </button>
        {cesiumReady && (
          <button
            type="button"
            onClick={() => setEngineMode((m) => (m === 'cesium' ? 'maplibre' : 'cesium'))}
            className={`w-7 h-7 rounded-full flex items-center justify-center border backdrop-blur-md transition-all cursor-pointer ${
              engineMode === 'cesium'
                ? 'bg-cyan-500/25 border-cyan-400/80 text-cyan-300'
                : 'bg-slate-950/80 border-slate-700/80 text-slate-400 hover:text-slate-200'
            }`}
            title={
              engineMode === 'cesium'
                ? 'Active: Cesium Ion + Google 3D Tiles (Click for Hybrid Vector)'
                : 'Switch to Cesium Ion + Google 3D Tiles'
            }
          >
            <Layers size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const viewer = cesiumViewerRef.current;
            const Cesium = (window as any).Cesium;
            if (engineMode === 'cesium' && viewer && !viewer.isDestroyed() && Cesium) {
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 16143645),
                orientation: {
                  heading: 0,
                  pitch: -Cesium.Math.PI_OVER_TWO,
                  roll: 0,
                },
                duration: 1.8,
              });
              return;
            }
            const map = mapRef.current;
            if (!map) return;
            map.flyTo({ center: [-95.5, 30.2], zoom: 1.75, pitch: 0, bearing: 0, duration: 1800 });
          }}
          className="w-7 h-7 rounded-full bg-slate-950/80 border border-slate-700/80 text-slate-400 hover:text-white flex items-center justify-center backdrop-blur-md transition-all cursor-pointer"
          title="Reset to Full 3D Earth Globe"
        >
          <Globe size={12} />
        </button>
      </div>

      {/* RIGHT-CENTER: Zoom In (+ to Street Level) / Zoom Out (- to Space) + Street Dive Button */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20 pointer-events-auto"
      >
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
          title="Zoom In (All the way to Street Level)"
        >
          <Plus size={13} />
        </button>
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
          title="Zoom Out to 3D Globe"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleGodsEyeDive();
          }}
          className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all shadow-md active:scale-90 cursor-pointer ${
            isStreetLevel
              ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.45)]'
              : 'bg-slate-900/85 hover:bg-slate-800 border-slate-700/80 text-cyan-400'
          }`}
          title={isStreetLevel ? 'Zoom Out to 3D Globe' : "God's Eye Dive to Street Level"}
        >
          <Eye size={13} />
        </button>
      </div>

      {/* BOTTOM-LEFT: Tactical MGRS & DMS Coordinate + Altitude Readout + Cesium Ion / Google Maps Badge */}
      <div className="absolute bottom-2.5 left-3 z-20 pointer-events-none font-mono text-[8.5px] leading-tight tracking-wider text-cyan-300/85 bg-slate-950/65 px-2 py-1 rounded border border-cyan-500/25 backdrop-blur-sm">
        <div>
          MGRS: {formatTacticalMGRS(telemetry.lat, telemetry.lng)} · ALT: {formatAltitude(altMeters)} · GSD: {gsdMeters}M
        </div>
        <div className="text-slate-300/90 flex items-center gap-2">
          <span>
            {formatDMS(telemetry.lat, telemetry.lng)} · Z:{telemetry.zoom.toFixed(1)} P:{Math.round(telemetry.pitch)}°
          </span>
          <span className="text-[7.5px] text-cyan-400/75 font-semibold">
            {engineMode === 'cesium' && cesiumReady ? 'CESIUM ion · Google Maps 3D' : 'HYBRID 3D GLOBE'}
          </span>
        </div>
      </div>
    </div>
  );
};
