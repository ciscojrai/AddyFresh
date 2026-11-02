import React, { useState, useEffect } from 'react';
import { StreetViewTarget } from '../types';
import { MapPin, X, ExternalLink, Compass } from 'lucide-react';
import { useHaptic } from '../hooks/useHaptic';

interface StreetViewPanelProps {
  target: StreetViewTarget | null;
  onClose: () => void;
}

export const StreetViewPanel: React.FC<StreetViewPanelProps> = ({ target, onClose }) => {
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const { triggerPanelOpen, triggerPanelClose } = useHaptic();

  // Tactile haptic pulse on slide-up open
  useEffect(() => {
    if (target) {
      triggerPanelOpen();
    }
  }, [target?.lat, target?.lng, triggerPanelOpen]);

  if (!target) return null;

  const handleClose = () => {
    triggerPanelClose();
    onClose();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY !== null) {
      const diff = e.touches[0].clientY - touchStartY;
      if (diff > 50) {
        handleClose();
        setTouchStartY(null);
      }
    }
  };

  const handleTouchEnd = () => {
    setTouchStartY(null);
  };

  // Google Maps Street View embedded panoramic viewer
  const streetViewUrl = `https://maps.google.com/maps?q=${target.lat},${target.lng}&layer=c&cbll=${target.lat},${target.lng}&output=svembed`;

  return (
    <div
      role="dialog"
      aria-label="Street View Panel"
      className="app-streetview absolute bottom-0 left-0 right-0 z-50 h-[36%] min-h-[290px] max-h-[380px] bg-[#070c18] border-t-2 border-cyan-400/90 rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.9),0_0_25px_rgba(34,211,238,0.25)] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
    >
      {/* 1. Horizontal Handle in Center Top to Close (Direct requirement) */}
      <div
        onClick={handleClose}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full flex flex-col items-center justify-center pt-2.5 pb-1 cursor-pointer group select-none hover:bg-slate-900/40 transition-colors shrink-0"
        title="Tap handle to close Street View"
      >
        <div className="w-14 h-1.5 rounded-full bg-slate-500 group-hover:bg-cyan-400 group-hover:w-16 transition-all duration-200 shadow-sm" />
        <span className="text-[9px] text-slate-500 group-hover:text-cyan-300 tracking-wider uppercase mt-1 font-medium transition-colors">
          Slide down to close
        </span>
      </div>

      {/* 2. Location Header Bar in direct center bottom panel */}
      <div className="px-3.5 py-1.5 flex items-center justify-between border-b border-slate-800/80 bg-[#090e1c] shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
            <Compass size={13} className="animate-spin duration-1000" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-slate-100 truncate leading-snug">
              {target.title}
            </h4>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate">
              <MapPin size={10} className="text-cyan-400 shrink-0" />
              <span className="truncate">{target.location}</span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-cyan-300 shrink-0">
                {target.lat.toFixed(4)}, {target.lng.toFixed(4)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => {
              window.open(
                `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${target.lat},${target.lng}`,
                '_blank'
              );
            }}
            className="p-1 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Open in Google Maps"
          >
            <ExternalLink size={13} />
          </button>
          <button
            onClick={handleClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 3. Embedded Street View Panoramics */}
      <div className="relative flex-1 w-full bg-slate-950 overflow-hidden">
        <iframe
          src={streetViewUrl}
          title={`Street View for ${target.title}`}
          className="w-full h-full border-0 select-none"
          loading="lazy"
          allowFullScreen
        />

        {/* Floating Street View Active Pill */}
        <div className="absolute top-2 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900/80 border border-cyan-500/40 text-[9px] font-mono text-cyan-300 backdrop-blur-md pointer-events-none shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>STREET VIEW 360°</span>
        </div>
      </div>
    </div>
  );
};
