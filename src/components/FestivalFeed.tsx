import React, { useState } from 'react';
import { FestivalVideo, StreetViewTarget } from '../types';
import { Play, Menu, Share2, Heart, Compass, X } from 'lucide-react';
import { safeShare } from '../utils/share';

interface FestivalFeedProps {
  videos: FestivalVideo[];
  onOpenStreetView: (target: StreetViewTarget) => void;
}

export const FestivalFeed: React.FC<FestivalFeedProps> = ({ videos, onOpenStreetView }) => {
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [likedVideoIds, setLikedVideoIds] = useState<Set<string>>(new Set(['vid-1']));

  const handleToggleLike = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setLikedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto px-4 py-3 space-y-4 scrollbar-none">
      {videos.map((vid) => {
        const isLiked = likedVideoIds.has(vid.id);
        const isPlaying = playingVideoId === vid.id;

        return (
          <div
            key={vid.id}
            className="group relative rounded-2xl bg-[#0c1222] border border-slate-800/80 hover:border-yellow-400/50 transition-all duration-200 overflow-hidden shadow-lg"
          >
            {/* Video Player / Thumbnail with YouTube style Play button */}
            <div className="relative w-full h-48 bg-slate-900 overflow-hidden">
              {isPlaying ? (
                <div className="relative w-full h-full bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${vid.youtubeId}?autoplay=1`}
                    title={vid.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                  <button
                    onClick={() => setPlayingVideoId(null)}
                    className="absolute top-2 right-2 p-1 rounded-full bg-black/70 text-white hover:bg-black transition-colors z-20 cursor-pointer"
                    title="Close video"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => setPlayingVideoId(vid.id)}
                  className="relative w-full h-full cursor-pointer group"
                >
                  <img
                    src={vid.thumbnail}
                    alt={vid.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80';
                    }}
                  />
                  {/* Subtle dark overlay */}
                  <div className="absolute inset-0 bg-black/35 group-hover:bg-black/25 transition-colors" />

                  {/* YouTube style Play Button (Yellow Accent matching screenshot 3) */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-11 bg-yellow-400 rounded-2xl flex items-center justify-center shadow-[0_0_24px_rgba(250,204,21,0.6)] group-hover:scale-110 transition-transform">
                      <Play size={20} className="fill-slate-950 text-slate-950 ml-0.5" />
                    </div>
                  </div>

                  {/* Duration badge */}
                  {vid.duration && (
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 text-[11px] font-mono font-semibold text-slate-200">
                      {vid.duration}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Video Content Details */}
            <div className="p-3.5 space-y-2">
              <h2 className="text-[15px] font-bold text-slate-100 tracking-tight leading-snug group-hover:text-yellow-300 transition-colors">
                {vid.title}
              </h2>

              {/* Row 2: Location & Date + Action Icons */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span>{vid.location}</span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span>{vid.date}</span>
                </div>

                {/* Action Icons */}
                <div className="flex items-center gap-2.5">
                  <button
                    className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-1"
                    title="Menu details"
                  >
                    <Menu size={16} />
                  </button>
                  <button
                    onClick={() => {
                      safeShare({ title: vid.title, url: window.location.href });
                    }}
                    className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-1"
                    title="Share video"
                  >
                    <Share2 size={16} />
                  </button>
                  <button
                    onClick={(e) => handleToggleLike(e, vid.id)}
                    className="transition-transform active:scale-125 cursor-pointer p-1"
                    title={isLiked ? 'Unlike' : 'Like'}
                  >
                    <Heart
                      size={17}
                      className={
                        isLiked
                          ? 'fill-rose-500 text-rose-500 stroke-rose-500'
                          : 'text-slate-400 hover:text-rose-400'
                      }
                    />
                  </button>
                </div>
              </div>

              {/* Row 3: Tags + Street View Action Button */}
              <div className="flex items-center justify-between pt-1">
                {/* Tags */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-400">
                  {vid.tags.map((t: string) => (
                    <span key={t} className="hover:text-slate-200 transition-colors">
                      {t}
                    </span>
                  ))}
                </div>

                {/* Street View Action Button */}
                <button
                  onClick={() => {
                    onOpenStreetView({
                      title: vid.title,
                      location: vid.location,
                      lat: vid.lat ?? 51.0914,
                      lng: vid.lng ?? 4.3686,
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-950/60 hover:bg-yellow-900/70 border border-yellow-500/50 text-yellow-300 text-xs font-medium transition-all shadow-sm hover:shadow-yellow-950/50 cursor-pointer"
                >
                  <Compass size={13} className="text-yellow-400" />
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
