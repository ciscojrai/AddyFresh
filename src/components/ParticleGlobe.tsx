import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GlobeNode } from '../types/terrarium';
import { Cloud, Sparkles, Sprout, Radio, Plus, Minus, RotateCw, Pause, Play } from 'lucide-react';

interface ParticleGlobeProps {
  nodes: GlobeNode[];
  selectedNodeId: string | null;
  onSelectNode: (node: GlobeNode) => void;
  isAutoRotating?: boolean;
  onToggleAutoRotate?: () => void;
}

// Scratch reusable variables to satisfy zero-GC discipline in render loop
const _vec3 = new THREE.Vector3();
const _screenCoord = new THREE.Vector3();

export const ParticleGlobe: React.FC<ParticleGlobeProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  isAutoRotating = true,
  onToggleAutoRotate,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [projectedNodes, setProjectedNodes] = useState<
    Array<{ node: GlobeNode; x: number; y: number; visible: boolean; isFront: boolean }>
  >([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // References for animation & interaction loop
  const stateRef = useRef({
    targetRotY: 0.15,
    targetRotX: 0.12,
    rotY: 0.15,
    rotX: 0.12,
    cameraDistance: 3.35,
    targetCameraDistance: 3.35,
    isPointerDown: false,
    pointerStartX: 0,
    pointerStartY: 0,
    rotStartX: 0,
    rotStartY: 0,
    autoRotate: isAutoRotating,
    velocityRotY: 0.002,
    lastFrameTime: performance.now(),
  });

  // Sync autoRotate prop
  useEffect(() => {
    stateRef.current.autoRotate = isAutoRotating;
  }, [isAutoRotating]);

  // Zoom handlers
  const handleZoom = useCallback((direction: 'in' | 'out') => {
    const s = stateRef.current;
    if (direction === 'in') {
      s.targetCameraDistance = Math.max(2.0, s.targetCameraDistance - 0.45);
    } else {
      s.targetCameraDistance = Math.min(4.8, s.targetCameraDistance + 0.45);
    }
    setZoomLevel(Number(((3.35 / s.targetCameraDistance)).toFixed(2)));
  }, []);

  const handleResetOrientation = useCallback(() => {
    const s = stateRef.current;
    s.targetRotX = 0.12;
    s.targetRotY = 0.15;
    s.targetCameraDistance = 3.35;
    setZoomLevel(1);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL to conform with threejs guidelines
    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050714, 0.18);

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 600;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, stateRef.current.cameraDistance);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Root group for rotating particle sphere
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // 1. Generate procedural circular glow dot texture
    const dotCanvas = document.createElement('canvas');
    dotCanvas.width = 64;
    dotCanvas.height = 64;
    const ctx = dotCanvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.25, '#00f3ff');
    gradient.addColorStop(0.65, 'rgba(0, 243, 255, 0.55)');
    gradient.addColorStop(1, 'rgba(0, 243, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    const dotTexture = new THREE.CanvasTexture(dotCanvas);
    dotTexture.colorSpace = THREE.SRGBColorSpace;

    // 2. Generate Point Cloud Dotted Sphere (matching vector wireframe screenshot)
    const SPHERE_RADIUS = 1.0;
    const pointsList: number[] = [];
    const sizesList: number[] = [];
    const alphasList: number[] = [];

    // Parallel rings of latitude
    const LAT_RINGS = 36;
    for (let i = 1; i < LAT_RINGS; i++) {
      const phi = (i / LAT_RINGS) * Math.PI; // 0 to PI
      const ringRadius = SPHERE_RADIUS * Math.sin(phi);
      const y = SPHERE_RADIUS * Math.cos(phi);

      // Points on this ring proportional to perimeter
      const ringPerimeter = 2 * Math.PI * ringRadius;
      const numPoints = Math.max(12, Math.round(ringPerimeter * 28));

      for (let j = 0; j < numPoints; j++) {
        const theta = (j / numPoints) * Math.PI * 2;
        const x = ringRadius * Math.cos(theta);
        const z = ringRadius * Math.sin(theta);

        pointsList.push(x, y, z);
        // Vary sizes subtly: equator and key rings slightly more prominent
        const isMajorRing = i % 4 === 0;
        sizesList.push(isMajorRing ? 0.045 : 0.032);
        alphasList.push(isMajorRing ? 0.95 : 0.7);
      }
    }

    // Longitude meridian lines (dotted arcs from pole to pole)
    const MERIDIANS = 24;
    for (let m = 0; m < MERIDIANS; m++) {
      const theta = (m / MERIDIANS) * Math.PI * 2;
      const PTS_PER_MERIDIAN = 48;
      for (let p = 0; p < PTS_PER_MERIDIAN; p++) {
        const phi = (p / PTS_PER_MERIDIAN) * Math.PI;
        const x = SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta);
        const y = SPHERE_RADIUS * Math.cos(phi);
        const z = SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta);

        pointsList.push(x, y, z);
        sizesList.push(0.026);
        alphasList.push(0.5);
      }
    }

    // Subtle inner glowing core particles for depth
    for (let k = 0; k < 60; k++) {
      const r = SPHERE_RADIUS * (0.3 + Math.random() * 0.5);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);
      pointsList.push(x, y, z);
      sizesList.push(0.02);
      alphasList.push(0.3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pointsList, 3));

    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.038,
      map: dotTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color('#00f3ff'),
    });

    const pointCloud = new THREE.Points(geometry, pointsMaterial);
    globeGroup.add(pointCloud);

    // 3. Subtle inner atmospheric aura sphere
    const auraGeo = new THREE.SphereGeometry(SPHERE_RADIUS * 0.98, 32, 32);
    const auraMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#00f3ff'),
      transparent: true,
      opacity: 0.04,
      wireframe: true,
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    globeGroup.add(auraMesh);

    // 4. Stems / Lines for Node Pins on the Globe
    // Stems reach from the sphere surface to elevated tip
    const stemPositions: number[] = [];
    const stemColors: number[] = [];

    const node3DPositions = nodes.map((node) => {
      const latRad = (node.lat * Math.PI) / 180;
      const lonRad = (node.lon * Math.PI) / 180;

      // Surface point
      const x0 = SPHERE_RADIUS * Math.cos(latRad) * Math.cos(lonRad);
      const y0 = SPHERE_RADIUS * Math.sin(latRad);
      const z0 = SPHERE_RADIUS * Math.cos(latRad) * Math.sin(lonRad);

      // Elevated tip (1.2x radius)
      const elev = 1.22;
      const x1 = x0 * elev;
      const y1 = y0 * elev;
      const z1 = z0 * elev;

      // Primary stem
      stemPositions.push(x0, y0, z0, x1, y1, z1);
      stemColors.push(0, 0.95, 1, 0.4, 0, 0.95, 1, 0.95);

      // For weather/cloud nodes, add tiny multi-tines like the screenshot
      if (node.iconType === 'cloud') {
        const offset = 0.04;
        stemPositions.push(x0 - offset, y0, z0, x1 - offset * 0.7, y1, z1);
        stemPositions.push(x0 + offset, y0, z0, x1 + offset * 0.7, y1, z1);
        stemColors.push(0, 0.95, 1, 0.3, 0, 0.95, 1, 0.7);
        stemColors.push(0, 0.95, 1, 0.3, 0, 0.95, 1, 0.7);
      }

      return {
        node,
        tipLocal: new THREE.Vector3(x1, y1, z1),
        surfaceLocal: new THREE.Vector3(x0, y0, z0),
      };
    });

    const stemGeo = new THREE.BufferGeometry();
    stemGeo.setAttribute('position', new THREE.Float32BufferAttribute(stemPositions, 3));
    const stemMat = new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    const stemLines = new THREE.LineSegments(stemGeo, stemMat);
    globeGroup.add(stemLines);

    // Ambient light and key rim light
    const ambientLight = new THREE.AmbientLight(0x0a1026, 1.5);
    scene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(0x00f3ff, 1.8);
    rimLight.position.set(5, 3, 5);
    scene.add(rimLight);

    // Animation & Render Loop
    let animationFrameId: number;
    let isMounted = true;

    const render = () => {
      if (!isMounted) return;

      const s = stateRef.current;
      const now = performance.now();
      const dt = Math.min((now - s.lastFrameTime) / 1000, 0.1);
      s.lastFrameTime = now;

      // Auto rotation when not dragging
      if (s.autoRotate && !s.isPointerDown) {
        s.targetRotY += s.velocityRotY;
      }

      // Smooth exponential damping on rotation
      const dampFactor = Math.min(1, 1 - Math.exp(-12 * dt));
      s.rotY += (s.targetRotY - s.rotY) * dampFactor;
      s.rotX += (s.targetRotX - s.rotX) * dampFactor;

      // Damp camera zoom
      s.cameraDistance += (s.targetCameraDistance - s.cameraDistance) * dampFactor;
      camera.position.z = s.cameraDistance;

      // Apply rotations to globe
      globeGroup.rotation.y = s.rotY;
      globeGroup.rotation.x = s.rotX;

      // Render Three.js scene
      renderer.render(scene, camera);

      // Project 3D node positions to screen coordinates for crisp HTML/SVG pins
      const projected = node3DPositions.map(({ node, tipLocal }) => {
        _vec3.copy(tipLocal);
        _vec3.applyMatrix4(globeGroup.matrixWorld);

        // Vector to camera to check if on front hemisphere
        const cameraDir = _vec3.clone().sub(camera.position).normalize();
        const normal = _vec3.clone().normalize();
        const dot = normal.dot(cameraDir);
        const isFront = dot < 0.2; // Front-facing check

        _screenCoord.copy(_vec3);
        _screenCoord.project(camera);

        const x = ((_screenCoord.x + 1) * width) / 2;
        const y = ((-_screenCoord.y + 1) * height) / 2;

        return {
          node,
          x,
          y,
          visible: _screenCoord.z < 1,
          isFront,
        };
      });

      setProjectedNodes(projected);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // Pointer Drag Handlers
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const s = stateRef.current;
      s.isPointerDown = true;
      setIsDragging(true);
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      s.pointerStartX = clientX;
      s.pointerStartY = clientY;
      s.rotStartX = s.targetRotY;
      s.rotStartY = s.targetRotX;
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      const s = stateRef.current;
      if (!s.isPointerDown) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - s.pointerStartX;
      const deltaY = clientY - s.pointerStartY;

      s.targetRotY = s.rotStartX + deltaX * 0.006;
      // Clamp polar pitch to prevent gimbal flip
      s.targetRotX = Math.max(-0.85, Math.min(0.85, s.rotStartY + deltaY * 0.006));
    };

    const onPointerUp = () => {
      stateRef.current.isPointerDown = false;
      setIsDragging(false);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      s.targetCameraDistance = Math.max(2.0, Math.min(4.8, s.targetCameraDistance + e.deltaY * 0.002));
      setZoomLevel(Number(((3.35 / s.targetCameraDistance)).toFixed(2)));
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    dom.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    dom.addEventListener('wheel', onWheel, { passive: false });

    // Cleanup
    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();

      dom.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);

      dom.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);

      dom.removeEventListener('wheel', onWheel);

      geometry.dispose();
      pointsMaterial.dispose();
      dotTexture.dispose();
      auraGeo.dispose();
      auraMat.dispose();
      stemGeo.dispose();
      stemMat.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [nodes]);

  const renderNodeIcon = (type: GlobeNode['iconType']) => {
    switch (type) {
      case 'cloud':
        return <Cloud className="w-4 h-4 text-cyan-300" />;
      case 'sprout':
        return <Sprout className="w-4 h-4 text-emerald-300" />;
      case 'crystal':
        return <Sparkles className="w-4 h-4 text-cyan-200" />;
      case 'radar':
        return <Radio className="w-4 h-4 text-purple-300" />;
      default:
        return <Sparkles className="w-4 h-4 text-cyan-300" />;
    }
  };

  return (
    <div className="relative w-full h-full min-h-[380px] flex items-center justify-center overflow-hidden select-none">
      {/* Three.js Canvas Container */}
      <div
        ref={mountRef}
        className={`w-full h-full cursor-grab ${isDragging ? 'cursor-grabbing' : ''}`}
      />

      {/* 3D Projected Node Markers with interactive tooltips */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {projectedNodes.map(({ node, x, y, visible, isFront }) => {
          if (!visible) return null;
          const isSelected = selectedNodeId === node.id;
          const isHovered = hoveredNodeId === node.id;
          const opacity = isFront ? 1 : 0.22;
          const scale = isFront ? (isSelected ? 1.25 : 1) : 0.75;

          return (
            <div
              key={node.id}
              style={{
                transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`,
                opacity,
                transition: 'opacity 0.2s ease, transform 0.2s ease',
              }}
              className="absolute pointer-events-auto cursor-pointer group"
              onClick={() => onSelectNode(node)}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
            >
              {/* Node Icon Box styled like the screenshot pins */}
              <div
                className={`flex items-center justify-center p-1.5 rounded-lg border transition-all duration-300 ${
                  isSelected
                    ? 'bg-cyan-950/90 border-cyan-300 shadow-[0_0_16px_rgba(0,243,255,0.7)] ring-1 ring-cyan-300'
                    : isHovered
                    ? 'bg-slate-900/90 border-cyan-400 shadow-[0_0_12px_rgba(0,243,255,0.5)]'
                    : 'bg-slate-950/80 border-cyan-500/50 shadow-[0_0_8px_rgba(0,243,255,0.25)]'
                }`}
              >
                {renderNodeIcon(node.iconType)}
              </div>

              {/* Pin Hover / Selected Tooltip card */}
              {(isHovered || isSelected) && isFront && (
                <div className="absolute left-1/2 -top-2 -translate-x-1/2 -translate-y-full mb-2 w-48 p-2.5 rounded-lg bg-slate-950/95 border border-cyan-400/50 shadow-[0_0_20px_rgba(0,243,255,0.3)] backdrop-blur-md pointer-events-none z-30">
                  <div className="flex items-center justify-between text-[10px] text-cyan-400/80 font-mono uppercase tracking-wider mb-1">
                    <span>{node.type}</span>
                    <span className="text-emerald-400">● {node.status}</span>
                  </div>
                  <div className="text-xs font-semibold text-white tracking-wide">{node.name}</div>
                  <div className="text-[11px] text-cyan-200/90 font-mono mt-0.5">{node.value}</div>
                  <div className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {node.detail}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Zoom & Orientation Controls - positioned near divider matching screenshot */}
      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 bg-slate-950/80 p-1 rounded-full border border-cyan-500/30 shadow-[0_0_12px_rgba(0,243,255,0.15)] backdrop-blur-md z-20">
        <button
          onClick={() => handleZoom('in')}
          title="Zoom In"
          aria-label="Zoom In"
          className="w-7 h-7 flex items-center justify-center rounded-full text-cyan-300 hover:text-white hover:bg-cyan-500/20 active:scale-95 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <div className="w-4 h-[1px] bg-cyan-500/20 self-center" />
        <button
          onClick={() => handleZoom('out')}
          title="Zoom Out"
          aria-label="Zoom Out"
          className="w-7 h-7 flex items-center justify-center rounded-full text-cyan-300 hover:text-white hover:bg-cyan-500/20 active:scale-95 transition-all"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mini bottom status & rotation toggle bar */}
      <div className="absolute bottom-2 left-3 flex items-center gap-1.5 text-[10px] font-mono text-cyan-400/70 z-10 pointer-events-auto">
        <button
          onClick={onToggleAutoRotate}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/80 border border-cyan-500/30 hover:border-cyan-400 hover:text-cyan-200 transition-colors"
          title={isAutoRotating ? 'Pause auto-rotation' : 'Resume auto-rotation'}
        >
          {isAutoRotating ? <Pause className="w-2.5 h-2.5 text-cyan-400" /> : <Play className="w-2.5 h-2.5 text-cyan-400" />}
          <span>{isAutoRotating ? 'ORBIT' : 'HALT'}</span>
        </button>
        <button
          onClick={handleResetOrientation}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-950/80 border border-cyan-500/30 hover:border-cyan-400 hover:text-cyan-200 transition-colors"
          title="Reset View"
        >
          <RotateCw className="w-2.5 h-2.5" />
        </button>
        <span className="hidden lg:inline-block text-[10px] text-slate-500">
          {(zoomLevel * 100).toFixed(0)}% • Drag to rotate
        </span>
      </div>
    </div>
  );
};
