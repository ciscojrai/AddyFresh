import React, { useState, useEffect } from 'react';
import { EventItem, StreetViewTarget } from '../types';
import { Heart, Compass, MapPin, Users, Cloud, Play } from 'lucide-react';
import { useHaptic } from '../hooks/useHaptic';

interface EventModalProps {
  event: EventItem | null;
  isLiked: boolean;
  onToggleLike: (e: React.MouseEvent, event: EventItem) => void;
  onClose: () => void;
  onCenterOnGlobe: (event: EventItem) => void;
  onOpenStreetView?: (target: StreetViewTarget) => void;
}

export const EventModal: React.FC<EventModalProps> = ({
  event,
  isLiked,
  onToggleLike,
  onClose,
  onCenterOnGlobe,
  onOpenStreetView,
}) => {
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const { triggerPanelOpen, triggerPanelClose } = useHaptic();

  // Tactile haptic pulse on slide-up open
  useEffect(() => {
    if (event) {
      triggerPanelOpen();
    }
  }, [event?.id, triggerPanelOpen]);

  if (!event) return null;

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

  return (
    <div
      role="dialog"
      aria-label="Event Detail Panel"
      className="app-eventsheet absolute bottom-0 left-0 right-0 z-40 h-[58%] min-h-[270px] max-h-[380px] bg-[#070c18] border-t-2 border-cyan-400/90 rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.9),0_0_25px_rgba(34,211,238,0.25)] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
    >
      {/* 1. Horizontal Handle in Center Top to Close (matching Street View slide-up) */}
      <div
        onClick={handleClose}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full flex flex-col items-center justify-center pt-2.5 pb-1 cursor-pointer group select-none hover:bg-slate-900/40 transition-colors shrink-0"
        title="Tap handle to close"
      >
        <div className="w-14 h-1.5 rounded-full bg-slate-500 group-hover:bg-cyan-400 group-hover:w-16 transition-all duration-200 shadow-sm" />
        <span className="text-[9px] text-slate-500 group-hover:text-cyan-300 tracking-wider uppercase mt-1 font-medium transition-colors">
          Slide down to close
        </span>
      </div>

      {/* 2. ID Card Details (no picture, compact layout matching Street View slide-up) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-2.5 scrollbar-none">
        {/* Title, Category Kicker & Coordinates */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-[10px] font-medium text-cyan-300">
              {event.category}
            </span>
            <div className="flex items-center gap-1 font-mono text-[10px] text-cyan-400/90">
              <span>{event.lat.toFixed(4)}, {event.lng.toFixed(4)}</span>
            </div>
          </div>
          <h2 className="text-[15px] font-bold text-slate-100 leading-snug">
            {event.title}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-cyan-400 mt-0.5">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">
              {event.venue ? `${event.venue}, ` : ''}
              {event.city}, {event.country}
            </span>
          </div>
        </div>

        {/* Metadata Badges: Attendance & Weather */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
            <Users size={14} className="text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">Attendance</p>
              <p className="font-semibold text-slate-200 text-xs truncate">
                {event.attendees ? `${event.attendees.toLocaleString()}+` : 'Curated'}
              </p>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
            <Cloud size={14} className="text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">Weather Status</p>
              <p className="font-semibold text-slate-200 text-xs truncate">
                {event.weather || 'Clear skies'}
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        {event.description && (
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60">
            {event.description}
          </p>
        )}

        {/* Tags */}
        {event.tags && event.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {event.tags.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-md bg-slate-800/80 text-[10px] text-slate-300 font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 3. Action Footer Buttons (Watch now / Center on Globe | Street View | Save — no hotel modals) */}
      <div className="app-eventsheet-actions p-2.5 bg-[#070b16] border-t border-slate-800 flex items-center gap-2 shrink-0">
        <button
          onClick={() => {
            onCenterOnGlobe(event);
            onClose();
          }}
          className="app-event-btn-primary flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-950/40 transition-all cursor-pointer"
        >
          <Play size={14} className="fill-current shrink-0" />
          <span className="app-tv-only-label hidden">Watch now</span>
          <span className="app-default-label">Center on Globe</span>
        </button>

        <button
          onClick={() => {
            if (onOpenStreetView) {
              onOpenStreetView({
                title: event.title,
                location: `${event.venue ? `${event.venue}, ` : ''}${event.city}, ${event.country}`,
                lat: event.lat,
                lng: event.lng,
              });
              // Keep ID card open in background; Street View opens as an overlay on top
            } else {
              window.open(
                `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${event.lat},${event.lng}`,
                '_blank'
              );
            }
          }}
          className="app-event-btn-street flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
          title="Google Street View"
        >
          <Compass size={15} className="text-cyan-400 shrink-0" />
          <span>Street View</span>
        </button>

        <button
          onClick={(e) => onToggleLike(e, event)}
          className="app-event-btn-save flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
          title="Save event"
        >
          <Heart
            size={15}
            className={
              isLiked
                ? 'fill-rose-500 text-rose-500 stroke-rose-500 shrink-0'
                : 'text-slate-400 hover:text-rose-400 shrink-0'
            }
          />
          <span className="app-tv-only-label hidden">Save</span>
        </button>
      </div>
    </div>
  );
};
