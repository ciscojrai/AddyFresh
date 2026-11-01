/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ParticleGlobe } from './components/ParticleGlobe';
import { RightPanel } from './components/RightPanel';
import { ResponsiveShell } from './layouts/ResponsiveShell';
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
        <ResponsiveShell
          isBezelMode={isBezelMode}
          isDay={isDay}
          globeComponent={
            isBezelMode ? (
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
              />
            ) : (
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
                />
            )
          }
          panelComponent={
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
          }
        />
      </main>

      {/* Subtle bottom note */}
      <footer className="w-full text-center py-2 text-[10px] font-mono text-slate-500">
        FreshAddy • Global Lighting State Controller Active ({isDay ? 'DAY: Bright Cyan/White' : 'NIGHT: Deep Indigo/Magenta'})
      </footer>
    </div>
  );
}
