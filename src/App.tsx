/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ParticleGlobe } from './components/ParticleGlobe';
import { RightPanel } from './components/RightPanel';
import { INITIAL_GLOBE_NODES, INITIAL_MOCK_EVENTS, INITIAL_TELEMETRY } from './data/mockEvents';
import { GlobeNode, TerrariumEvent, EcosystemTelemetry, GlobalLightingState, LightingMode, GlobeLayoutPosition } from './types/terrarium';

export default function App() {
  const [telemetry, setTelemetry] = useState<EcosystemTelemetry>(INITIAL_TELEMETRY);
  const [events, setEvents] = useState<TerrariumEvent[]>(INITIAL_MOCK_EVENTS);
  const [nodes, setNodes] = useState<GlobeNode[]>(INITIAL_GLOBE_NODES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [isBezelMode, setIsBezelMode] = useState(false);
  const [globePosition, setGlobePosition] = useState<GlobeLayoutPosition>('Top');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(orientation: portrait)');
    const handleOrientationChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const newOrientation = e.matches ? 'portrait' : 'landscape';
      setOrientation(newOrientation);

      setGlobePosition((prev) => {
        if (newOrientation === 'portrait' && (prev === 'Left' || prev === 'Right')) {
          return 'Top';
        }
        if (newOrientation === 'landscape' && (prev === 'Top' || prev === 'Low')) {
          return 'Left';
        }
        return prev;
      });
    };

    handleOrientationChange(mediaQuery);
    mediaQuery.addEventListener('change', handleOrientationChange);
    return () => mediaQuery.removeEventListener('change', handleOrientationChange);
  }, []);

  // Global Lighting State Controller
  const [lightingState, setLightingState] = useState<GlobalLightingState>({
    mode: 'night',
    progress: 0,
    autoCycle: false,
    cycleDurationSec: 28,
  });

  const isDay = lightingState.mode === 'day';

  // Sync data-theme attribute on root element for CSS variables & transitions
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', lightingState.mode);
  }, [lightingState.mode]);

  // Diurnal Auto-Cycle Loop
  useEffect(() => {
    if (!lightingState.autoCycle) return;
    let animId: number;
    const startTime = performance.now();
    const durationMs = lightingState.cycleDurationSec * 1000;

    const tick = (now: number) => {
      const elapsed = (now - startTime) % durationMs;
      // Smooth sinusoidal oscillation between 0 and 1
      const normalized = (1 - Math.cos((elapsed / durationMs) * Math.PI * 2)) / 2;
      const currentMode: LightingMode = normalized >= 0.5 ? 'day' : 'night';

      setLightingState((prev) => ({
        ...prev,
        progress: normalized,
        mode: currentMode,
      }));

      // Dynamically interpolate telemetry numbers
      setTelemetry((prev) => ({
        ...prev,
        photoperiod: currentMode,
        temperature: Number((19.8 + normalized * 4.8).toFixed(1)),
        humidity: Math.round(82 - normalized * 14),
      }));

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [lightingState.autoCycle, lightingState.cycleDurationSec]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const handleSelectNode = (node: GlobeNode) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  };

  const handleClearSelectedNode = () => {
    setSelectedNodeId(null);
  };

  const handleToggleAutoRotate = () => {
    setIsAutoRotating((prev) => !prev);
  };

  const handleToggleBezelMode = () => {
    setIsBezelMode((prev) => !prev);
  };

  // Global lighting toggle handler
  const handleToggleLightingMode = () => {
    const nextMode: LightingMode = lightingState.mode === 'night' ? 'day' : 'night';
    const nextProg = nextMode === 'day' ? 1 : 0;

    setLightingState((prev) => ({
      ...prev,
      mode: nextMode,
      progress: nextProg,
    }));

    // Update telemetry state
    setTelemetry((prev) => ({
      ...prev,
      photoperiod: nextMode,
      temperature: nextMode === 'day' ? 24.6 : 19.8,
      humidity: nextMode === 'day' ? 68 : 82,
      climateState: nextMode === 'day' ? 'sunny' : 'mist',
      bcpRate: nextMode === 'day' ? 'BCP 340k • Solar 840µmol' : 'BCP 340k',
    }));

    // Append to live substrate events
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const newEvt: TerrariumEvent = {
      id: `evt-light-${Date.now()}`,
      timestamp: timeStr,
      source: 'Global Lighting Controller',
      category: 'weather',
      message:
        nextMode === 'day'
          ? 'Photoperiod transitioned to DAY: Solar photon flux active with bright cyan & white accents.'
          : 'Photoperiod transitioned to NIGHT: Deep cosmic indigo with electric magenta accents.',
      level: 'success',
    };
    setEvents((prev) => [newEvt, ...prev]);
  };

  // Granular slider progress handler
  const handleSetLightingProgress = (progress: number) => {
    const clamped = Math.max(0, Math.min(1, progress));
    const nextMode: LightingMode = clamped >= 0.5 ? 'day' : 'night';

    setLightingState((prev) => ({
      ...prev,
      progress: clamped,
      mode: nextMode,
    }));

    setTelemetry((prev) => ({
      ...prev,
      photoperiod: nextMode,
      temperature: Number((19.8 + clamped * 4.8).toFixed(1)),
      humidity: Math.round(82 - clamped * 14),
    }));
  };

  const handleToggleAutoCycle = () => {
    setLightingState((prev) => ({
      ...prev,
      autoCycle: !prev.autoCycle,
    }));
  };

  // Determine layout class for main wrapper based on globePosition
  const getLayoutClasses = (pos: GlobeLayoutPosition) => {
    switch (pos) {
      case 'Top':
        return 'flex-col';
      case 'Low':
        return 'flex-col-reverse';
      case 'Left':
        return 'flex-row';
      case 'Right':
        return 'flex-row-reverse';
    }
  };

  const isVerticalLayout = globePosition === 'Top' || globePosition === 'Low';

  return (
    <div
      className={`min-h-screen w-full text-slate-100 flex flex-col items-center justify-between overflow-x-hidden relative theme-transition ${
        isDay ? 'bg-[#07192f]' : 'bg-[#050714]'
      }`}
    >
      {/* Ambient background glows with smooth crossfade */}
      <div
        className={`absolute top-0 left-1/4 w-[650px] h-[650px] rounded-full blur-[150px] pointer-events-none transition-all duration-1000 ${
          isDay ? 'bg-cyan-400/20 opacity-100' : 'bg-cyan-600/5 opacity-60'
        }`}
      />
      <div
        className={`absolute bottom-0 right-1/4 w-[550px] h-[550px] rounded-full blur-[140px] pointer-events-none transition-all duration-1000 ${
          isDay ? 'bg-white/10 opacity-90' : 'bg-fuchsia-600/12 opacity-80'
        }`}
      />

      {/* Top Header with title capsule, lighting controller, and telemetry */}
      <div className="w-full max-w-7xl">
        <Header
          bcpRate={telemetry.bcpRate}
          isBezelMode={isBezelMode}
          onToggleBezelMode={handleToggleBezelMode}
          title="FreshAddy 3D"
          subTitle="Particle Vector Sphere"
          lightingState={lightingState}
          onToggleLightingMode={handleToggleLightingMode}
          onSetLightingProgress={handleSetLightingProgress}
          onToggleAutoCycle={handleToggleAutoCycle}
        />
      </div>

      {/* Main Viewport Shell: Supports 16:9 widescreen or Phone Bezel frame */}
      <main className="flex-1 w-full flex items-center justify-center p-2 sm:p-4 md:p-6 z-10">
        {isBezelMode ? (
          /* Phone Bezel Preview Frame */
          <div
            className={`relative w-full max-w-[390px] h-[780px] rounded-[48px] p-3 border-4 theme-transition flex flex-col overflow-hidden ${
              isDay
                ? 'bg-[#081e3a] border-cyan-400/70 shadow-[0_0_35px_rgba(0,243,255,0.4),0_0_80px_rgba(255,255,255,0.15)]'
                : 'bg-[#03050c] border-slate-700/80 shadow-[0_0_35px_rgba(217,70,239,0.3),0_0_80px_rgba(0,243,255,0.15)]'
            }`}
          >
            {/* Top phone notch / dynamic island */}
            <div className="w-28 h-4 bg-slate-900 rounded-full mx-auto mb-2 flex items-center justify-end px-3">
              <div
                className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                  isDay ? 'bg-white/80' : 'bg-cyan-400/40'
                }`}
              />
            </div>

            {/* Inner display screen */}
            <div
              className={`flex-1 w-full rounded-[36px] overflow-hidden flex ${getLayoutClasses(
                globePosition
              )} theme-transition ${
                isDay ? 'bg-[#0a223f] border border-cyan-400/50' : 'bg-[#050714] border border-cyan-500/30'
              }`}
            >
              {/* Globe Container */}
              <div className={`${isVerticalLayout ? 'h-[46%] w-full' : 'w-1/2 h-full'} relative`}>
                <ParticleGlobe
                  nodes={nodes}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={handleSelectNode}
                  isAutoRotating={isAutoRotating}
                  onToggleAutoRotate={handleToggleAutoRotate}
                  lightingMode={lightingState.mode}
                  lightingProgress={lightingState.progress}
                  globePosition={globePosition}
                  onSetGlobePosition={setGlobePosition}
                  orientation={orientation}
                />
              </div>

              {/* Glowing Dynamic Divider on Mobile */}
              {isVerticalLayout ? (
                <div className="w-full h-[2px] glow-theme-horizontal relative z-10 pointer-events-none flex-shrink-0" />
              ) : (
                <div className="w-[2px] h-full glow-theme-divider relative z-10 pointer-events-none flex-shrink-0" />
              )}

              {/* Panel Container */}
              <div className="flex-1 overflow-hidden">
                <RightPanel
                  telemetry={telemetry}
                  events={events}
                  selectedNode={selectedNode}
                  onClearSelectedNode={handleClearSelectedNode}
                  onSelectNode={handleSelectNode}
                  allNodes={nodes}
                  lightingState={lightingState}
                  onToggleLightingMode={handleToggleLightingMode}
                  onSetLightingProgress={handleSetLightingProgress}
                  onToggleAutoCycle={handleToggleAutoCycle}
                />
              </div>
            </div>

            {/* Phone bottom bar */}
            <div className="w-32 h-1 bg-slate-600 rounded-full mx-auto mt-2.5 opacity-60" />
          </div>
        ) : (
          /* 16:9 Centered Widescreen Shell matching user mockup */
          <div
            className={`w-full max-w-6xl aspect-[16/10] sm:aspect-[16/9] min-h-[520px] max-h-[86vh] rounded-2xl sm:rounded-3xl theme-transition flex ${getLayoutClasses(
              globePosition
            )} overflow-hidden relative backdrop-blur-xl ${
              isDay
                ? 'bg-[#0a223f]/90 border border-cyan-400/60 shadow-[0_0_35px_rgba(0,243,255,0.35),inset_0_0_25px_rgba(255,255,255,0.12)]'
                : 'bg-[#050714]/90 border border-fuchsia-500/40 shadow-[0_0_30px_rgba(217,70,239,0.25),inset_0_0_20px_rgba(0,243,255,0.06)]'
            }`}
          >
            {/* Globe Container */}
            <div
              className={`${
                isVerticalLayout ? 'w-full h-1/2 min-h-0' : 'w-1/2 h-full'
              } relative flex items-center justify-center theme-transition ${
                isDay ? 'bg-[#0a223f]' : 'bg-[#050714]'
              }`}
            >
              <ParticleGlobe
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
                isAutoRotating={isAutoRotating}
                onToggleAutoRotate={handleToggleAutoRotate}
                lightingMode={lightingState.mode}
                lightingProgress={lightingState.progress}
                globePosition={globePosition}
                onSetGlobePosition={setGlobePosition}
                orientation={orientation}
              />
            </div>

            {/* Glowing Neon Divider with dynamic orientation */}
            {isVerticalLayout ? (
              <div className="w-full h-[2px] glow-theme-horizontal relative z-10 pointer-events-none flex-shrink-0" />
            ) : (
              <div className="w-[2px] h-full glow-theme-divider relative z-10 pointer-events-none flex-shrink-0" />
            )}

            {/* Panel Container */}
            <div
              className={`${
                isVerticalLayout ? 'w-full h-1/2' : 'w-1/2 h-full'
              } relative overflow-hidden flex-1 theme-transition ${
                isDay ? 'bg-[#081b33]' : 'bg-[#050714]'
              }`}
            >
              <RightPanel
                telemetry={telemetry}
                events={events}
                selectedNode={selectedNode}
                onClearSelectedNode={handleClearSelectedNode}
                onSelectNode={handleSelectNode}
                allNodes={nodes}
                lightingState={lightingState}
                onToggleLightingMode={handleToggleLightingMode}
                onSetLightingProgress={handleSetLightingProgress}
                onToggleAutoCycle={handleToggleAutoCycle}
              />
            </div>
          </div>
        )}
      </main>

      {/* Subtle bottom note */}
      <footer className="w-full text-center py-2 text-[10px] font-mono text-slate-500">
        FreshAddy • Global Lighting State Controller Active ({isDay ? 'DAY: Bright Cyan/White' : 'NIGHT: Deep Indigo/Magenta'})
      </footer>
    </div>
  );
}
