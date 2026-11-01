import React from 'react';
import { Smartphone, Monitor, Activity, Globe } from 'lucide-react';

interface HeaderProps {
  bcpRate: string;
  isBezelMode: boolean;
  onToggleBezelMode: () => void;
  title?: string;
  subTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  bcpRate,
  isBezelMode,
  onToggleBezelMode,
  title = 'FreshAddy 3D',
  subTitle = 'Particle Vector Sphere',
}) => {
  return (
    <header className="w-full flex items-center justify-between px-3 sm:px-6 py-2.5 z-30 select-none">
      {/* Left Title Capsule matching screenshot */}
      <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-950/80 border border-cyan-400/40 shadow-[0_0_12px_rgba(0,243,255,0.2)]">
        <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f3ff]" />
        <span className="text-xs sm:text-sm font-semibold tracking-wide text-white">
          {title}
        </span>
        <span className="text-slate-500 text-xs">•</span>
        <span className="text-xs text-cyan-300 font-mono">
          {subTitle}
        </span>
      </div>

      {/* Right Controls matching screenshot: BCP badge and Phone Bezel toggle */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* BCP Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-950/80 border border-cyan-500/30 text-cyan-300 font-mono text-xs shadow-[0_0_8px_rgba(0,243,255,0.1)]">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-medium">{bcpRate}</span>
        </div>

        {/* Phone Bezel toggle button */}
        <button
          onClick={onToggleBezelMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
            isBezelMode
              ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400 shadow-[0_0_12px_rgba(0,243,255,0.3)]'
              : 'bg-slate-950/80 text-slate-300 border-slate-700 hover:border-cyan-500/50 hover:text-white'
          }`}
          title={isBezelMode ? 'Switch to Full Screen View' : 'Switch to Phone Bezel Frame Preview'}
        >
          {isBezelMode ? (
            <>
              <Monitor className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Wide View</span>
            </>
          ) : (
            <>
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Phone Bezel</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
