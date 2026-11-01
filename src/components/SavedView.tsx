import React from 'react';
import { EventItem, StreetViewTarget } from '../types';
import { Share2, Heart, Menu, Compass } from 'lucide-react';
import { safeShare } from '../utils/share';

interface SavedViewProps {
  events: EventItem[];
  likedEventIds: Set<string>;
  selectedEvent: EventItem | null;
  onSelectEvent: (event: EventItem) => void;
  onToggleLike: (e: React.MouseEvent, event: EventItem) => void;
  onOpenStreetView: (target: StreetViewTarget) => void;
}

export const SavedView: React.FC<SavedViewProps> = ({
  events,
  likedEventIds,
  selectedEvent,
  onSelectEvent,
  onToggleLike,
  onOpenStreetView,
}) => {
  const savedEvents = events.filter((e) => likedEventIds.has(e.id));

  if (savedEvents.length === 0) {
    return (
      <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-950/40 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-3 shadow-[0_0_20px_rgba(244,63,94,0.3)]">
          <Heart size={28} className="stroke-[1.5]" />
        </div>
        <h3 className="text-sm font-semibold text-slate-100">No saved events yet</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
          Tap the heart on any experience across the globe or home feed to curate your private list.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-full overflow-y-auto px-4 py-3 space-y-4 scrollbar-none">
      {savedEvents.map((ev) => {
        const isSelected = selectedEvent?.id === ev.id;

        return (
          <div
            key={ev.id}
            onClick={() => onSelectEvent(ev)}
            className={`group relative rounded-2xl bg-[#0c1222] border transition-all duration-200 overflow-hidden cursor-pointer shadow-lg ${
              isSelected
                ? 'border-rose-400 ring-1 ring-rose-400/50 shadow-rose-950/40'
                : 'border-slate-800/80 hover:border-rose-500/50'
            }`}
          >
            {/* Visual Canvas */}
            <div className="relative w-full h-48 bg-slate-900 overflow-hidden">
              <img
                src={ev.image}
                alt={ev.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c1222] via-transparent to-black/20" />
            </div>

            {/* Content Details */}
            <div className="p-3.5 space-y-2">
              <h2 className="text-[15px] font-bold text-slate-100 tracking-tight leading-snug group-hover:text-rose-300 transition-colors">
                {ev.title}
              </h2>

              {/* Row 2: Location & Date + Action Icons */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span>
                    {ev.city}, {ev.country}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span>{ev.date}</span>
                </div>

                {/* Action Icons */}
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(ev);
                    }}
                    className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-1"
                    title="Menu details"
                  >
                    <Menu size={16} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      safeShare({ title: ev.title, url: window.location.href });
                    }}
                    className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-1"
                    title="Share event"
                  >
                    <Share2 size={16} />
                  </button>

                  <button
                    onClick={(e) => onToggleLike(e, ev)}
                    className="transition-transform active:scale-125 cursor-pointer p-1"
                    title="Remove from saved"
                  >
                    <Heart
                      size={17}
                      className="fill-rose-500 text-rose-500 stroke-rose-500"
                    />
                  </button>
                </div>
              </div>

              {/* Row 3: Tags + Street View Action Button */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  {ev.tags?.map((tag) => (
                    <span key={tag} className="hover:text-slate-200 transition-colors">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Street View Action Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenStreetView({
                      title: ev.title,
                      location: `${ev.venue ? `${ev.venue}, ` : ''}${ev.city}, ${ev.country}`,
                      lat: ev.lat,
                      lng: ev.lng,
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/50 text-rose-300 text-xs font-medium transition-all shadow-sm hover:shadow-rose-950/50 cursor-pointer"
                >
                  <Compass size={13} className="text-rose-400" />
                  <span>Street View</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
