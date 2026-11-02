import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { EventItem, Mood, CameraPerspective, ThemeMode } from '../types';
import { Plus, Minus } from 'lucide-react';
import { haptic } from '../utils/haptics';

const DAY_TEXTURE = '/textures/earth_day_4k.jpg';
const NIGHT_TEXTURE = '/textures/earth_night_4k.jpg';
const TOPO_TEXTURE = '/textures/earth_topology.png';
const WATER_TEXTURE = '/textures/earth_water.png';
const ATMOSPHERE_BLUE = 0x5aa9ff;
const SUN_DIRECTION = new THREE.Vector3(1.0, 0.38, 0.95).normalize();

interface GlobeViewProps {
  events: EventItem[];
  selectedEvent: EventItem | null;
  onSelectEvent: (event: EventItem) => void;
  activeMood: Mood;
  radarActive?: boolean;
  perspective?: CameraPerspective;
  themeMode?: ThemeMode;
}

export const GlobeView: React.FC<GlobeViewProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  activeMood,
  perspective = '3D',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const atmosphereRef = useRef<THREE.Mesh | null>(null);
  const pinsGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // User-controlled zoom factor (default 1.0, expandable & minimizable)
  const [userZoomFactor, setUserZoomFactor] = useState(1.0);

  // Rotation and interaction physics
  const isDraggingRef = useRef(false);
  const prevMousePosRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0.0014, y: 0 });
  const targetRotationRef = useRef<{ x: number; y: number } | null>(null);
  const savedRotationRef = useRef<{ x: number; y: number }>({ x: 0.36, y: -1.15 });

  // Convert lat/lng to 3D vector on sphere of given radius
  const latLngToVector = (lat: number, lng: number, radius: number): THREE.Vector3 => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    return new THREE.Vector3(x, y, z);
  };

  // Adjust camera position so globe sphere maintains exact same pixel size across any container height
  const applyCameraPosition = useCallback(
    (cam: THREE.PerspectiveCamera, h: number, w: number) => {
      const baseHeight = 340;
      // Distance scales proportionally to container height so rendered sphere diameter stays constant
      const distanceScale = (h / baseHeight) / userZoomFactor;

      if (perspective === '3D') {
        cam.position.set(0, 0, 190 * distanceScale);
        cam.lookAt(0, 0, 0);
      } else {
        // Sky perspective
        cam.position.set(0, 60 * distanceScale, 180 * distanceScale);
        cam.lookAt(0, 0, 0);
      }

      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    },
    [perspective, userZoomFactor]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 390;
    const height = container.clientHeight || 340;

    THREE.Cache.enabled = true;

    // Scene & Camera
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    cameraRef.current = camera;
    applyCameraPosition(camera, height, width);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    const maxAnisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    const loader = new THREE.TextureLoader();
    const loadTexture = (url: string, srgb: boolean) => {
      const tex = loader.load(
        url,
        undefined,
        undefined,
        () => console.warn('[GlobeView] texture fallback for:', url)
      );
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    };

    const dayTexture = loadTexture(DAY_TEXTURE, true);
    const nightTexture = loadTexture(NIGHT_TEXTURE, true);
    const topoTexture = loadTexture(TOPO_TEXTURE, false);
    const waterTexture = loadTexture(WATER_TEXTURE, false);

    // Fixed scene lighting: primary sunlight + soft twilight/moonlight rim fill + hemisphere ambient
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.35);
    sunLight.position.copy(SUN_DIRECTION).multiplyScalar(220);
    scene.add(sunLight);

    const moonFillLight = new THREE.DirectionalLight(0x60a5fa, 0.55);
    moonFillLight.position.copy(SUN_DIRECTION).multiplyScalar(-180);
    scene.add(moonFillLight);

    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.55);
    scene.add(hemiLight);

    // Root Globe Group
    const globeGroup = new THREE.Group();
    globeGroup.rotation.x = savedRotationRef.current.x;
    globeGroup.rotation.y = savedRotationRef.current.y;
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    // Inner Fallback Dark Core Sphere (radius 68)
    const coreGeo = new THREE.SphereGeometry(68, 64, 64);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x050a14,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    globeGroup.add(coreMesh);

    // Real 3D Earth Sphere (radius 70, 96x96 segments for ultra-crisp silhouette)
    const earthGeo = new THREE.SphereGeometry(70, 96, 96);
    const earthMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: dayTexture,
      bumpMap: topoTexture,
      bumpScale: 1.25,
      roughness: 0.78,
      metalness: 0.06,
    });

    earthMat.onBeforeCompile = (shader) => {
      shader.uniforms.uNightMap = { value: nightTexture };
      shader.uniforms.uWaterMap = { value: waterTexture };
      shader.uniforms.uSunDirection = { value: SUN_DIRECTION };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldNormal;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWorldNormal = normalize(mat3(modelMatrix) * normal);'
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uNightMap;
          uniform sampler2D uWaterMap;
          uniform vec3 uSunDirection;
          varying vec3 vWorldNormal;`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          float waterMask = texture2D(uWaterMap, vMapUv).r;
          roughnessFactor = mix(0.84, 0.30, waterMask);`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float sunDot = dot(normalize(vWorldNormal), normalize(uSunDirection));
          float nightFactor = smoothstep(0.22, -0.22, sunDot);
          vec3 nightLights = texture2D(uNightMap, vMapUv).rgb * vec3(1.0, 0.86, 0.58) * 1.65;
          totalEmissiveRadiance += nightLights * nightFactor;`
        );
    };

    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    globeGroup.add(earthMesh);

    // Inner Fresnel Atmospheric Limb Rim (radius 70.7, FrontSide)
    const rimGeo = new THREE.SphereGeometry(70.7, 64, 64);
    const rimMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 glowColor;
        void main() {
          float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 3.1);
          gl_FragColor = vec4(glowColor, 1.0) * fresnel * 0.55;
        }
      `,
      uniforms: {
        glowColor: { value: new THREE.Color(ATMOSPHERE_BLUE) },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    scene.add(rimMesh);

    // Outer Atmospheric Glow Halo (radius 76, BackSide)
    const atmosGeo = new THREE.SphereGeometry(76, 48, 48);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 glowColor;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
          gl_FragColor = vec4(glowColor, 1.0) * intensity * 0.42;
        }
      `,
      uniforms: {
        glowColor: { value: new THREE.Color(ATMOSPHERE_BLUE) },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosphere);
    atmosphereRef.current = atmosphere;

    // Deep-Space Starfield (in scene space so stars stay fixed while rotating the Earth)
    const starCount = 1400;
    const starCoords: number[] = [];
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(600 + Math.random() * 300);
      starCoords.push(v.x, v.y, v.z);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starCoords, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Pins Group
    const pinsGroup = new THREE.Group();
    globeGroup.add(pinsGroup);
    pinsGroupRef.current = pinsGroup;

    // Dragging physics
    const handlePointerDown = (e: PointerEvent) => {
      isDraggingRef.current = true;
      prevMousePosRef.current = { x: e.clientX, y: e.clientY };
      velocityRef.current = { x: 0, y: 0 };
      targetRotationRef.current = null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !globeGroupRef.current) return;
      const dx = e.clientX - prevMousePosRef.current.x;
      const dy = e.clientY - prevMousePosRef.current.y;
      prevMousePosRef.current = { x: e.clientX, y: e.clientY };

      globeGroupRef.current.rotation.y += dx * 0.006;
      globeGroupRef.current.rotation.x += dy * 0.006;
      savedRotationRef.current = {
        x: globeGroupRef.current.rotation.x,
        y: globeGroupRef.current.rotation.y,
      };
      velocityRef.current = { x: dx * 0.004, y: dy * 0.004 };
    };

    const handlePointerUp = (e: PointerEvent) => {
      isDraggingRef.current = false;

      // Click pin detection
      if (
        Math.abs(e.clientX - prevMousePosRef.current.x) < 5 &&
        Math.abs(e.clientY - prevMousePosRef.current.y) < 5 &&
        cameraRef.current &&
        pinsGroupRef.current
      ) {
        const rect = container.getBoundingClientRect();
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
        const pinMeshes: THREE.Object3D[] = [];
        pinsGroupRef.current.children.forEach((c) => {
          c.traverse((child) => {
            if ((child as any).userData?.event) {
              pinMeshes.push(child);
            }
          });
        });

        const intersects = raycasterRef.current.intersectObjects(pinMeshes);
        if (intersects.length > 0) {
          const hit = (intersects[0].object as any).userData?.event as EventItem;
          if (hit) {
            haptic.globePin();
            onSelectEvent(hit);
          }
        }
      }
    };

    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (globeGroupRef.current) {
        if (!isDraggingRef.current) {
          if (targetRotationRef.current) {
            globeGroupRef.current.rotation.x +=
              (targetRotationRef.current.x - globeGroupRef.current.rotation.x) * 0.08;
            globeGroupRef.current.rotation.y +=
              (targetRotationRef.current.y - globeGroupRef.current.rotation.y) * 0.08;

            if (
              Math.abs(targetRotationRef.current.x - globeGroupRef.current.rotation.x) < 0.001 &&
              Math.abs(targetRotationRef.current.y - globeGroupRef.current.rotation.y) < 0.001
            ) {
              targetRotationRef.current = null;
            }
          } else {
            globeGroupRef.current.rotation.y += velocityRef.current.x;
            globeGroupRef.current.rotation.x += velocityRef.current.y;
            velocityRef.current.x *= 0.96;
            velocityRef.current.y *= 0.96;

            if (Math.abs(velocityRef.current.x) < 0.0008) {
              velocityRef.current.x = 0.0012;
            }
          }
          savedRotationRef.current = {
            x: globeGroupRef.current.rotation.x,
            y: globeGroupRef.current.rotation.y,
          };
        }

        // Pulse pin heads
        if (pinsGroupRef.current) {
          const time = Date.now() * 0.003;
          pinsGroupRef.current.children.forEach((pin, idx) => {
            const head = pin.children[1];
            if (head) {
              const scale = 1 + Math.sin(time + idx) * 0.15;
              head.scale.set(scale, scale, scale);
            }
          });
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize observer (keeps globe pixel scale identical regardless of container height)
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth || 390;
      const h = container.clientHeight || 340;
      applyCameraPosition(camera, h, w);
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      renderer.dispose();
    };
  }, [applyCameraPosition]);

  // Sync camera when perspective or user zoom changes
  useEffect(() => {
    if (!cameraRef.current || !containerRef.current || !rendererRef.current) return;
    const w = containerRef.current.clientWidth || 390;
    const h = containerRef.current.clientHeight || 340;
    applyCameraPosition(cameraRef.current, h, w);
    rendererRef.current.setSize(w, h);
  }, [applyCameraPosition]);

  // Wheel zoom listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setUserZoomFactor((prev) => Math.min(2.2, Math.max(0.6, prev - e.deltaY * 0.0015)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Touch pinch to zoom listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let initialDist: number | null = null;
    let initialZoom = userZoomFactor;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoom = userZoomFactor;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDist !== null) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currentDist / initialDist;
        setUserZoomFactor(Math.min(2.2, Math.max(0.6, initialZoom * factor)));
      }
    };

    const handleTouchEnd = () => {
      initialDist = null;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [userZoomFactor]);

  // Re-populate Pins on Globe
  useEffect(() => {
    if (!pinsGroupRef.current) return;
    const pinsGroup = pinsGroupRef.current;
    while (pinsGroup.children.length > 0) {
      pinsGroup.remove(pinsGroup.children[0]);
    }

    const pinColor = new THREE.Color(activeMood.color || '#22d3ee');
    const stalkMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
    });

    events.forEach((ev) => {
      const pinObj = new THREE.Group();

      const surfacePos = latLngToVector(ev.lat, ev.lng, 70);
      const tipPos = latLngToVector(ev.lat, ev.lng, 79);

      const stalkGeo = new THREE.BufferGeometry().setFromPoints([surfacePos, tipPos]);
      const stalk = new THREE.Line(stalkGeo, stalkMat);
      pinObj.add(stalk);

      const headGeo = new THREE.SphereGeometry(2.4, 16, 16);
      const isSelected = selectedEvent?.id === ev.id;
      const headMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0xffffff : pinColor,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.copy(tipPos);
      (headMesh as any).userData = { event: ev };
      pinObj.add(headMesh);

      const ringGeo = new THREE.RingGeometry(3.2, 4.2, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: pinColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isSelected ? 0.9 : 0.5,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(tipPos);
      ringMesh.lookAt(surfacePos);
      pinObj.add(ringMesh);

      pinsGroup.add(pinObj);
    });
  }, [events, selectedEvent, activeMood]);

  // Fly to selected event location
  useEffect(() => {
    if (!selectedEvent || !globeGroupRef.current) return;
    const phi = (selectedEvent.lat * Math.PI) / 180;
    const theta = (-selectedEvent.lng * Math.PI) / 180 - Math.PI / 2;

    targetRotationRef.current = {
      x: phi,
      y: theta,
    };
  }, [selectedEvent]);

  // Listen to programmatic camera flyer events
  useEffect(() => {
    const handleFly = (e: Event) => {
      const custom = e as CustomEvent<{ lat: number; lng: number }>;
      if (custom.detail && typeof custom.detail.lat === 'number') {
        const phi = (custom.detail.lat * Math.PI) / 180;
        const theta = (-custom.detail.lng * Math.PI) / 180 - Math.PI / 2;
        targetRotationRef.current = { x: phi, y: theta };
      }
    };

    window.addEventListener('freshaddy:fly-camera', handleFly);
    return () => {
      window.removeEventListener('freshaddy:fly-camera', handleFly);
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing">
      {/* Three.js canvas container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Expand & Minimize Zoom Controls (option for user to zoom in/out as desired) */}
      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20 pointer-events-auto">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setUserZoomFactor((prev) => Math.min(2.2, prev + 0.15));
          }}
          className="w-7 h-7 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition-all shadow-md active:scale-90 cursor-pointer"
          title="Expand Globe"
        >
          <Plus size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setUserZoomFactor((prev) => Math.max(0.6, prev - 0.15));
          }}
          className="w-7 h-7 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold transition-all shadow-md active:scale-90 cursor-pointer"
          title="Minimize Globe"
        >
          <Minus size={13} />
        </button>
      </div>
    </div>
  );
};
