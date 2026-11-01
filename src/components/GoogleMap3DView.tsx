import React from 'react';
import { EventItem } from '../types';
import { Compass, ExternalLink } from 'lucide-react';

interface GoogleMap3DViewProps {
  selectedEvent: EventItem | null;
  onSelectEvent: (event: EventItem) => void;
  events: EventItem[];
}

export const GoogleMap3DView: React.FC<GoogleMap3DViewProps> = ({
  selectedEvent,
  onSelectEvent,
  events,
}) => {
  const current = selectedEvent || events[0];

  return (
    <div className="relative w-full h-full bg-[#030712] overflow-hidden flex flex-col items-center justify-center">
      {/* 3D Photorealistic Map Canvas / Fallback representation */}
      <div className="absolute inset-0 bg-radial from-slate-900 to-[#030712] flex items-center justify-center p-6 text-center">
        {/* Radar concentric circular grid */}
        <div className="absolute w-72 h-72 rounded-full border border-cyan-500/20 animate-ping opacity-20 pointer-events-none" />
        <div className="absolute w-56 h-56 rounded-full border border-cyan-500/30 pointer-events-none" />
        <div className="absolute w-36 h-36 rounded-full border border-cyan-500/40 pointer-events-none" />

        <div className="relative z-10 max-w-xs space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center mx-auto text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
            <Compass size={24} className="animate-spin duration-1000" />
          </div>
          <h3 className="text-sm font-bold text-slate-100">
            Google Photorealistic 3D View
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Targeting coordinate{' '}
            <span className="font-mono text-cyan-300">
              [{current?.lat.toFixed(4)}, {current?.lng.toFixed(4)}]
            </span>{' '}
            in {current?.city}, {current?.country}.
          </p>

          <div className="pt-2">
            <button
              onClick={() => {
                if (current) {
                  window.open(
                    `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${current.lat},${current.lng}`,
                    '_blank'
                  );
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold shadow-md transition-colors cursor-pointer"
            >
              <ExternalLink size={14} />
              <span>Launch 3D Photosphere</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Coordinate Pill */}
      <div className="absolute top-3 right-4 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-700/80 text-[10px] font-mono text-cyan-300 backdrop-blur-md">
        3D MESH READY
      </div>
    </div>
  );
};
