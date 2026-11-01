import React, { useState } from 'react';
import { Sun, Moon, Sparkles, Sliders, Play, Pause, ChevronDown, ChevronUp } from 'lucide-react';
import { LightingMode, GlobalLightingState } from '../types/terrarium';

interface LightingControllerProps {
  lightingState: GlobalLightingState;
  onToggleMode: () => void;
  onSetProgress: (progress: number) => void;
  onToggleAutoCycle: () => void;
  compact?: boolean;
}

export const LightingController: React.FC<LightingControllerProps> = ({
  lightingState,
  onToggleMode,
  onSetProgress,
  onToggleAutoCycle,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isDay = lightingState.mode === 'day';
  const progressPercent = Math.round(lightingState.progress * 100);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 relative">
        {/* Compact Quick Switcher Pill */}
        <button
          onClick={onToggleMode}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono font-medium transition-all duration-500 border ${
            isDay
              ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400 shadow-[0_0_15px_rgba(0,243,255,0.45)] ring-1 ring-white/30'
              : 'bg-fuchsia-950/40 text-fuchsia-200 border-fuchsia-500/60 shadow-[0_0_15px_rgba(217,70,239,0.4)] ring-1 ring-fuchsia-400/20'
          }`}
          title={`Click to switch to ${isDay ? 'Night' : 'Day'} mode`}
        >
          {isDay ? (
            <Sun className="w-3.5 h-3.5 text-white animate-spin-slow" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-fuchsia-400" />
          )}
          <span className="tracking-wider">{isDay ? 'DAY' : 'NIGHT'}</span>
          <span className="text-[10px] opacity-75 hidden md:inline">
            {isDay ? 'Cyan/White' : 'Indigo/Magenta'}
          </span>
        </button>

        {/* Small expand button for fine controls */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`p-1.5 rounded-full border transition-colors ${
            expanded
              ? 'bg-slate-800 text-cyan-300 border-cyan-400'
              : 'bg-slate-950/60 text-slate-400 border-slate-700/60 hover:text-white'
          }`}
          title="Lighting transition controls"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>

        {/* Floating popover for granular lighting control */}
        {expanded && (
          <div className="absolute right-0 top-full mt-2 w-72 p-3.5 rounded-2xl bg-slate-950/95 border border-cyan-400/40 shadow-[0_0_25px_rgba(0,243,255,0.25)] backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-mono font-semibold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Global Lighting Controller
              </span>
              <button
                onClick={() => setExpanded(false)}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            </div>

            {/* Current Phase Bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
                <span className="flex items-center gap-1 text-fuchsia-400">
                  <Moon className="w-3 h-3" /> Night (0%)
                </span>
                <span className="font-bold text-white">{progressPercent}%</span>
                <span className="flex items-center gap-1 text-cyan-300">
                  <Sun className="w-3 h-3" /> Day (100%)
                </span>
              </div>

              {/* Interactive Smooth Slider */}
              <input
                type="range"
                min="0"
                max="100"
                value={progressPercent}
                onChange={(e) => onSetProgress(Number(e.target.value) / 100)}
                className="w-full h-1.5 bg-gradient-to-r from-fuchsia-600 via-indigo-500 to-cyan-400 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={() => onSetProgress(1)}
                className={`py-1.5 px-2 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 border transition-all ${
                  isDay && progressPercent > 60
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400 shadow-[0_0_10px_rgba(0,243,255,0.3)]'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Sun className="w-3 h-3 text-cyan-300" />
                Bright Cyan
              </button>

              <button
                onClick={() => onSetProgress(0)}
                className={`py-1.5 px-2 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 border transition-all ${
                  !isDay || progressPercent < 40
                    ? 'bg-fuchsia-950/40 text-fuchsia-200 border-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.3)]'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Moon className="w-3 h-3 text-fuchsia-400" />
                Indigo Magenta
              </button>
            </div>

            {/* Auto Cycle Diurnal Loop */}
            <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                {lightingState.autoCycle ? (
                  <Play className="w-3 h-3 text-emerald-400 fill-current" />
                ) : (
                  <Pause className="w-3 h-3 text-slate-500" />
                )}
                Diurnal Auto-Cycle
              </span>

              <button
                onClick={onToggleAutoCycle}
                className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase font-semibold border transition-all ${
                  lightingState.autoCycle
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                {lightingState.autoCycle ? 'Running' : 'Paused'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full expanded component (for tabs or panels)
  return (
    <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-semibold text-slate-300 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          Lighting Environment Controller
        </span>
        <button
          onClick={onToggleMode}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium transition-all ${
            isDay
              ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400 shadow-[0_0_12px_rgba(0,243,255,0.4)]'
              : 'bg-fuchsia-950/50 text-fuchsia-200 border border-fuchsia-500/60 shadow-[0_0_12px_rgba(217,70,239,0.3)]'
          }`}
        >
          {isDay ? <Sun className="w-3.5 h-3.5 text-white" /> : <Moon className="w-3.5 h-3.5 text-fuchsia-400" />}
          <span>{isDay ? 'DAY THEME' : 'NIGHT THEME'}</span>
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="text-fuchsia-400">Cosmic Indigo (#040614)</span>
          <span className="font-bold text-white">{progressPercent}%</span>
          <span className="text-cyan-300">Bright Cyan (#07192f)</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={progressPercent}
          onChange={(e) => onSetProgress(Number(e.target.value) / 100)}
          className="w-full h-2 bg-gradient-to-r from-fuchsia-600 via-indigo-500 to-cyan-400 rounded-lg appearance-none cursor-pointer accent-white"
        />
      </div>

      <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-slate-500">
        <span>Diurnal Period: {isDay ? 'Solar Photoflux 840 µmol' : 'Cosmic Luminescence Active'}</span>
        <button
          onClick={onToggleAutoCycle}
          className="text-cyan-400 hover:underline"
        >
          {lightingState.autoCycle ? 'Auto-Cycle ON' : 'Enable Auto-Cycle'}
        </button>
      </div>
    </div>
  );
};
