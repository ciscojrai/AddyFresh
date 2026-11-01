import React, { useState } from 'react';
import {
  Check,
  Play,
  Pause,
  Radio,
  Layers,
  Sparkles,
  Droplets,
  Sun,
  Moon,
  Wind,
  Activity,
  Terminal,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { GlobeNode, TerrariumEvent, EcosystemTelemetry, GlobalLightingState } from '../types/terrarium';
import { LightingController } from './LightingController';

interface RightPanelProps {
  telemetry: EcosystemTelemetry;
  events: TerrariumEvent[];
  selectedNode: GlobeNode | null;
  onClearSelectedNode: () => void;
  onSelectNode: (node: GlobeNode) => void;
  allNodes: GlobeNode[];
  lightingState: GlobalLightingState;
  onToggleLightingMode: () => void;
  onSetLightingProgress: (prog: number) => void;
  onToggleAutoCycle: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  telemetry,
  events,
  selectedNode,
  onClearSelectedNode,
  onSelectNode,
  allNodes,
  lightingState,
  onToggleLightingMode,
  onSetLightingProgress,
  onToggleAutoCycle,
}) => {
  const [activeTab, setActiveTab] = useState<'stream' | 'telemetry' | 'scaffold'>('stream');
  const [isPlaying, setIsPlaying] = useState(true);
  const [radarActive, setRadarActive] = useState(false);
  const [dverseActive, setDverseActive] = useState(true);

  return (
    <div className="w-full h-full flex flex-col bg-[#050714]/80 text-slate-200 overflow-hidden select-none">
      {/* Top action bar matching screenshot: Checkmark circle, D'verse pill, Play/Pause, radar pill */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800/60 bg-slate-950/40">
        <div className="flex items-center gap-3">
          {/* Checkmark in purple ring from screenshot */}
          <button
            className="w-7 h-7 rounded-full flex items-center justify-center bg-purple-950/60 border border-fuchsia-500 text-fuchsia-300 shadow-[0_0_10px_rgba(217,70,239,0.5)] transition-transform hover:scale-105 active:scale-95"
            title="System Diagnostics: Operational"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
          </button>

          {/* D'verse pill button */}
          <button
            onClick={() => setDverseActive(!dverseActive)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-all ${
              dverseActive
                ? 'bg-fuchsia-950/50 text-fuchsia-200 border border-fuchsia-500/60 shadow-[0_0_8px_rgba(217,70,239,0.3)]'
                : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:border-slate-700'
            }`}
          >
            <Layers className="w-3 h-3 text-fuchsia-400" />
            <span>D'verse</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Play / Pause toggle */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            title={isPlaying ? 'Pause Terrarium Clock' : 'Resume Terrarium Clock'}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
          </button>

          {/* radar pill button */}
          <button
            onClick={() => setRadarActive(!radarActive)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-all ${
              radarActive
                ? 'bg-cyan-950/60 text-cyan-200 border border-cyan-400 shadow-[0_0_8px_rgba(0,243,255,0.4)]'
                : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:border-cyan-500/40'
            }`}
          >
            <Radio className="w-3 h-3 text-cyan-400" />
            <span>radar</span>
          </button>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex items-center gap-1 px-4 sm:px-6 pt-3 border-b border-slate-800/40 text-xs font-mono">
        <button
          onClick={() => setActiveTab('stream')}
          className={`pb-2 px-2 border-b-2 font-medium transition-colors ${
            activeTab === 'stream'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Event Log
        </button>
        <button
          onClick={() => setActiveTab('telemetry')}
          className={`pb-2 px-2 border-b-2 font-medium transition-colors ${
            activeTab === 'telemetry'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Ecosystem
        </button>
        <button
          onClick={() => setActiveTab('scaffold')}
          className={`pb-2 px-2 border-b-2 font-medium transition-colors ${
            activeTab === 'scaffold'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Iterative Roadmap
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Active Node Detail Card (if user clicked a node on the globe) */}
        {selectedNode && (
          <div className="p-3.5 rounded-xl bg-slate-950/90 border border-cyan-400/50 shadow-[0_0_16px_rgba(0,243,255,0.15)] relative animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                Selected Pin: {selectedNode.type}
              </span>
              <button
                onClick={onClearSelectedNode}
                className="text-xs text-slate-400 hover:text-cyan-300 font-mono px-1"
              >
                ✕ Close
              </button>
            </div>
            <h4 className="text-sm font-semibold text-white tracking-wide">{selectedNode.name}</h4>
            <div className="text-xs font-mono text-cyan-300 mt-1">Value: {selectedNode.value}</div>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{selectedNode.detail}</p>
            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>LAT: {selectedNode.lat}°</span>
              <span>LON: {selectedNode.lon}°</span>
              <span className="text-emerald-400">STATUS: {selectedNode.status.toUpperCase()}</span>
            </div>
          </div>
        )}

        {/* Tab 1: Event Log Stream */}
        {activeTab === 'stream' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <Terminal className="w-3.5 h-3.5" />
                Live Substrate Feed
              </span>
              <span className="text-[11px] text-slate-500">{events.length} records</span>
            </div>

            <div className="space-y-2">
              {events.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80 hover:border-cyan-500/40 transition-colors group"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono mb-1 text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          evt.level === 'success'
                            ? 'bg-emerald-400'
                            : evt.level === 'warn'
                            ? 'bg-amber-400'
                            : 'bg-cyan-400'
                        }`}
                      />
                      <span className="text-slate-300 font-semibold">{evt.source}</span>
                      <span className="text-slate-600">/</span>
                      <span className="uppercase text-slate-500">{evt.category}</span>
                    </span>
                    <span className="text-slate-500">{evt.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">{evt.message}</p>
                  {evt.coordinates && (
                    <div className="mt-1.5 text-[10px] font-mono text-cyan-400/70">
                      Coordinates: {evt.coordinates.lat}°N, {evt.coordinates.lon}°E
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Ecosystem Telemetry */}
        {activeTab === 'telemetry' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Health Index
                </div>
                <div className="text-xl font-mono font-bold text-emerald-400">
                  {telemetry.biophilicHealth}%
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full rounded-full"
                    style={{ width: `${telemetry.biophilicHealth}%` }}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                  Vapor Saturation
                </div>
                <div className="text-xl font-mono font-bold text-cyan-300">
                  {telemetry.humidity}%
                </div>
                <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-cyan-400 h-full rounded-full"
                    style={{ width: `${telemetry.humidity}%` }}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800/80">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mb-1">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  Core Temp
                </div>
                <div className="text-xl font-mono font-bold text-amber-300">
                  {telemetry.temperature}°C
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-1">Thermal stability OK</div>
              </div>

              <button
                onClick={onToggleLightingMode}
                className={`p-3 rounded-lg border text-left transition-all duration-300 group ${
                  lightingState.mode === 'day'
                    ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_15px_rgba(0,243,255,0.25)] hover:border-cyan-300'
                    : 'bg-fuchsia-950/30 border-fuchsia-500/70 shadow-[0_0_15px_rgba(217,70,239,0.2)] hover:border-fuchsia-400'
                }`}
                title="Click to toggle Day / Night photoperiod"
              >
                <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                  <span className={`flex items-center gap-1.5 ${
                    lightingState.mode === 'day' ? 'text-cyan-300' : 'text-fuchsia-400'
                  }`}>
                    {lightingState.mode === 'day' ? (
                      <Sun className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Moon className="w-3.5 h-3.5 text-fuchsia-400" />
                    )}
                    Photoperiod
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono group-hover:text-white transition-colors">
                    Toggle ↺
                  </span>
                </div>
                <div className={`text-base font-mono font-semibold capitalize ${
                  lightingState.mode === 'day' ? 'text-cyan-200' : 'text-fuchsia-300'
                }`}>
                  {lightingState.mode === 'day' ? 'Solar Day' : 'Cosmic Night'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1">
                  {lightingState.mode === 'day' ? 'Bright Cyan / White' : 'Deep Indigo / Magenta'}
                </div>
              </button>
            </div>

            {/* Granular Global Lighting State Controller */}
            <div className="pt-1">
              <LightingController
                lightingState={lightingState}
                onToggleMode={onToggleLightingMode}
                onSetProgress={onSetLightingProgress}
                onToggleAutoCycle={onToggleAutoCycle}
              />
            </div>

            {/* Registered Pins list */}
            <div className="pt-2">
              <h5 className="text-xs font-mono text-cyan-400 mb-2 flex items-center justify-between">
                <span>Vector Pins on Sphere</span>
                <span className="text-[10px] text-slate-500">Click to inspect</span>
              </h5>
              <div className="space-y-1.5">
                {allNodes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onSelectNode(n)}
                    className="w-full text-left p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 hover:border-cyan-400/50 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-white">{n.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {n.type.toUpperCase()} • {n.value}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-cyan-400/60" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Iterative Roadmap Scaffold */}
        {activeTab === 'scaffold' && (
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-500/30 text-cyan-200">
              <div className="font-semibold text-cyan-300 mb-1">Step 1 Scaffold Complete:</div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Vector point-cloud sphere, cosmic dark theme (#050714), frosted glass, neon cyan/magenta
                borders, and responsive layout shell.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-2">
              <div className="font-mono text-slate-400 uppercase text-[10px] tracking-wider">
                Upcoming Iterations (FreshAddy Terrarium)
              </div>
              <ul className="space-y-1.5 text-slate-400 text-[11px]">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Step 2: Procedural flora growth & internal terrarium biome substrate
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Step 3: Day/night dynamic lighting cycles & atmospheric shaders
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Step 4: Weather control simulation (rain, mist, aurora, starlight)
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Footer bar */}
      <div className="px-4 py-2 border-t border-slate-800/60 bg-slate-950/60 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>FreshAddy v0.1 Core</span>
        </span>
        <span className="text-slate-400">Node Sync: 100%</span>
      </div>
    </div>
  );
};
