/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Header } from './components/Header';
import { ParticleGlobe } from './components/ParticleGlobe';
import { RightPanel } from './components/RightPanel';
import { INITIAL_GLOBE_NODES, INITIAL_MOCK_EVENTS, INITIAL_TELEMETRY } from './data/mockEvents';
import { GlobeNode, TerrariumEvent, EcosystemTelemetry } from './types/terrarium';

export default function App() {
  const [telemetry, setTelemetry] = useState<EcosystemTelemetry>(INITIAL_TELEMETRY);
  const [events, setEvents] = useState<TerrariumEvent[]>(INITIAL_MOCK_EVENTS);
  const [nodes, setNodes] = useState<GlobeNode[]>(INITIAL_GLOBE_NODES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [isBezelMode, setIsBezelMode] = useState(false);

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

  return (
    <div className="min-h-screen w-full bg-[#050714] text-slate-100 flex flex-col items-center justify-between overflow-x-hidden relative">
      {/* Ambient background glows */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-600/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-fuchsia-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Header matching mockup */}
      <div className="w-full max-w-7xl">
        <Header
          bcpRate={telemetry.bcpRate}
          isBezelMode={isBezelMode}
          onToggleBezelMode={handleToggleBezelMode}
          title="FreshAddy 3D"
          subTitle="Particle Vector Sphere"
        />
      </div>

      {/* Main Viewport Shell: Supports 16:9 widescreen or Phone Bezel frame */}
      <main className="flex-1 w-full flex items-center justify-center p-2 sm:p-4 md:p-6 z-10">
        {isBezelMode ? (
          /* Phone Bezel Preview Frame */
          <div className="relative w-full max-w-[390px] h-[780px] bg-[#03050c] rounded-[48px] p-3 border-4 border-slate-700/80 shadow-[0_0_35px_rgba(0,243,255,0.25),0_0_80px_rgba(217,70,239,0.15)] flex flex-col overflow-hidden">
            {/* Top phone notch / dynamic island */}
            <div className="w-28 h-4 bg-slate-900 rounded-full mx-auto mb-2 flex items-center justify-end px-3">
              <div className="w-2 h-2 rounded-full bg-cyan-400/40" />
            </div>

            {/* Inner display screen */}
            <div className="flex-1 w-full rounded-[36px] overflow-hidden flex flex-col bg-[#050714] border border-cyan-500/30">
              {/* Globe taking top viewport on mobile phone */}
              <div className="h-[46%] w-full relative bg-[#050714]">
                <ParticleGlobe
                  nodes={nodes}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={handleSelectNode}
                  isAutoRotating={isAutoRotating}
                  onToggleAutoRotate={handleToggleAutoRotate}
                />
              </div>

              {/* Glowing Magenta Horizontal Divider on Mobile */}
              <div className="w-full h-[2px] glow-magenta-horizontal relative z-20" />

              {/* Bottom half: RightPanel */}
              <div className="flex-1 w-full overflow-hidden">
                <RightPanel
                  telemetry={telemetry}
                  events={events}
                  selectedNode={selectedNode}
                  onClearSelectedNode={handleClearSelectedNode}
                  onSelectNode={handleSelectNode}
                  allNodes={nodes}
                />
              </div>
            </div>

            {/* Phone bottom bar */}
            <div className="w-32 h-1 bg-slate-600 rounded-full mx-auto mt-2.5 opacity-60" />
          </div>
        ) : (
          /* 16:9 Centered Widescreen Shell matching the user mockup screenshot */
          <div className="w-full max-w-6xl aspect-[16/10] sm:aspect-[16/9] min-h-[520px] max-h-[86vh] rounded-2xl sm:rounded-3xl bg-[#050714]/90 border border-cyan-500/40 shadow-[0_0_25px_rgba(0,243,255,0.2),inset_0_0_20px_rgba(0,243,255,0.06)] flex flex-col md:flex-row overflow-hidden relative backdrop-blur-xl">
            {/* Left Pane: 3D Particle Vector Sphere (top on mobile, left on desktop) */}
            <div className="w-full md:w-1/2 h-[45%] md:h-full relative flex items-center justify-center bg-[#050714]">
              <ParticleGlobe
                nodes={nodes}
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
                isAutoRotating={isAutoRotating}
                onToggleAutoRotate={handleToggleAutoRotate}
              />
            </div>

            {/* Glowing Neon Magenta Vertical Divider matching user screenshot */}
            <div className="hidden md:block w-[2px] h-full glow-magenta-divider relative z-20 flex-shrink-0" />
            <div className="block md:hidden w-full h-[2px] glow-magenta-horizontal relative z-20 flex-shrink-0" />

            {/* Right Pane: Panel with checkmark, D'verse, radar, events stream and telemetry */}
            <div className="w-full md:w-1/2 h-[55%] md:h-full relative bg-[#050714] overflow-hidden">
              <RightPanel
                telemetry={telemetry}
                events={events}
                selectedNode={selectedNode}
                onClearSelectedNode={handleClearSelectedNode}
                onSelectNode={handleSelectNode}
                allNodes={nodes}
              />
            </div>
          </div>
        )}
      </main>

      {/* Subtle bottom note for step 1 scaffold */}
      <footer className="w-full text-center py-2 text-[10px] font-mono text-slate-500">
        FreshAddy • Step 1: Initial Scaffold, Theme Tokens & 3D Particle Sphere
      </footer>
    </div>
  );
}
