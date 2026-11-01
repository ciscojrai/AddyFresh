import React from 'react';
import { ActiveNav, CameraPerspective, ThemeMode } from '../types';
import {
  Check,
  Play,
  Search,
  MessageSquare,
  Heart,
  Sun,
  CloudRain,
  AlertTriangle,
} from 'lucide-react';

interface BottomControlsProps {
  activeNav: ActiveNav;
  onNavChange: (nav: ActiveNav) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSubmitSearch: (q: string) => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  radarActive: boolean;
  onToggleRadar: () => void;
  alertsActive: boolean;
  onToggleAlerts: () => void;
  perspective: CameraPerspective;
  onChangePerspective: (p: CameraPerspective) => void;
  likedCount: number;
}

export const BottomControls: React.FC<BottomControlsProps> = ({
  activeNav,
  onNavChange,
  themeMode,
  onToggleTheme,
  radarActive,
  onToggleRadar,
  alertsActive,
  onToggleAlerts,
  perspective,
  onChangePerspective,
  likedCount,
}) => {
  return (
    <footer aria-label="Application Controls" className="w-full bg-[#05070e] border-t border-slate-900 px-4 py-2 flex flex-col gap-2 shrink-0 select-none z-30">
      {/* Row 1: Primary Navigation Icons (Check, Play, Search, Chat, Heart) */}
      <nav aria-label="Main Navigation" className="flex items-center justify-between px-2">
        {/* Check Mark (Home / Discovery Feed) */}
        <button
          onClick={() => onNavChange('home')}
          className={`relative p-2.5 rounded-full transition-all duration-200 cursor-pointer ${
            activeNav === 'home'
              ? 'ring-2 ring-purple-500 bg-purple-950/40 text-purple-400 shadow-[0_0_16px_rgba(168,85,247,0.5)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
          title="Discover Feed"
        >
          <Check size={20} className="stroke-[2.5]" />
        </button>

        {/* Play (Festivals) */}
        <button
          onClick={() => onNavChange('play')}
          className={`relative p-2.5 rounded-full transition-all duration-200 cursor-pointer ${
            activeNav === 'play'
              ? 'ring-2 ring-yellow-400 bg-yellow-950/40 text-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.5)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
          title="Festival Video Clips"
        >
          <Play size={20} className="fill-current stroke-[2.2]" />
        </button>

        {/* Search */}
        <button
          onClick={() => onNavChange('search')}
          className={`relative p-2.5 rounded-full transition-all duration-200 cursor-pointer ${
            activeNav === 'search'
              ? 'ring-2 ring-emerald-400 bg-emerald-950/40 text-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.5)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
          title="Search Experiences"
        >
          <Search size={20} className="stroke-[2.2]" />
        </button>

        {/* Chat */}
        <button
          onClick={() => onNavChange('chat')}
          className={`relative p-2.5 rounded-full transition-all duration-200 cursor-pointer ${
            activeNav === 'chat'
              ? 'ring-2 ring-cyan-400 bg-cyan-950/40 text-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.5)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
          title="AI Assistant Chat"
        >
          <MessageSquare size={20} className="stroke-[2.2]" />
        </button>

        {/* Heart / Liked */}
        <button
          onClick={() => onNavChange('likes')}
          className={`relative p-2.5 rounded-full transition-all duration-200 cursor-pointer ${
            activeNav === 'likes'
              ? 'ring-2 ring-rose-500 bg-rose-950/40 text-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.5)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
          title="Saved Experiences"
        >
          <Heart size={20} className="fill-current stroke-[2.2]" />
          {likedCount > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full shadow-sm">
              {likedCount}
            </span>
          )}
        </button>
      </nav>

      {/* Row 2: Secondary Filter Pills & Camera Segmented Switcher */}
      <aside aria-label="Experience Filters and Camera Mode" className="flex items-center justify-between gap-1 text-[11px] font-medium pt-0.5">
        {/* Theme pill */}
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0d1424] hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer shrink-0"
          title={`Active Theme: ${themeMode}`}
        >
          <Sun size={12} className="text-slate-400" />
          <span>theme</span>
        </button>

        {/* Radar pill */}
        <button
          onClick={onToggleRadar}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all cursor-pointer shrink-0 ${
            radarActive
              ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
              : 'bg-[#0d1424] hover:bg-slate-800 border-slate-800 text-slate-300'
          }`}
          title="Toggle Weather Radar Overlay"
        >
          <CloudRain size={12} className={radarActive ? 'text-cyan-400' : 'text-slate-400'} />
          <span>radar</span>
        </button>

        {/* Alerts pill */}
        <button
          onClick={onToggleAlerts}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all cursor-pointer shrink-0 ${
            alertsActive
              ? 'bg-[#2a1d0c] border-amber-500/70 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
              : 'bg-[#0d1424] hover:bg-slate-800 border-slate-800 text-slate-300'
          }`}
          title="Toggle Alerts"
        >
          <AlertTriangle size={12} className={alertsActive ? 'text-amber-400' : 'text-slate-400'} />
          <span>alerts</span>
          {alertsActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>

        {/* 3D / Sky either-or segmented toggle pill */}
        <div className="flex items-center bg-[#090e1a] border border-slate-800 rounded-full p-0.5 shrink-0">
          <button
            onClick={() => onChangePerspective('3D')}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
              perspective === '3D'
                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3D
          </button>
          <button
            onClick={() => onChangePerspective('Sky')}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
              perspective === 'Sky'
                ? 'bg-cyan-400 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sky
          </button>
        </div>
      </aside>
    </footer>
  );
};
