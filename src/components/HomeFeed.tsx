import React, { useState, useRef, useCallback, useEffect } from 'react';
import { EventItem, StreetViewTarget } from '../types';
import { Share2, Heart, Menu, Compass, RefreshCw, Radio, CheckCircle2, Sparkles, Play } from 'lucide-react';
import { YOUTUBE_VIDEOS } from '../data/youtubeVideos';
import { safeShare } from '../utils/share';
import { useHaptic } from '../hooks/useHaptic';

interface HomeFeedProps {
  events: EventItem[];
  selectedEvent: EventItem | null;
  likedEventIds: Set<string>;
  onSelectEvent: (event: EventItem) => void;
  onToggleLike: (e: React.MouseEvent, event: EventItem) => void;
  onOpenStreetView: (target: StreetViewTarget) => void;
  onRefresh?: () => Promise<{ count: number; events: EventItem[] } | void>;
}

const PULL_THRESHOLD = 52;
const MAX_PULL = 82;

export const HomeFeed: React.FC<HomeFeedProps> = ({
  events,
  selectedEvent,
  likedEventIds,
  onSelectEvent,
  onToggleLike,
  onOpenStreetView,
  onRefresh,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    checkPullThresholdHaptic,
    resetPullHaptic,
    triggerPullRefresh,
    triggerPullSuccess,
  } = useHaptic();

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);

  // Tracking refs
  const startYRef = useRef<number | null>(null);
  const canPullRef = useRef(false);
  const isPointerDownRef = useRef(false);

  // Trigger server fetch and update state
  const executeRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setPullDistance(52); // Keep loading height open
    triggerPullRefresh();

    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        // Fallback simulate slight latency if handler wasn't passed
        await new Promise((r) => setTimeout(r, 800));
      }

      setRefreshSuccess(true);
      triggerPullSuccess();
      setTimeout(() => {
        setRefreshSuccess(false);
        setIsRefreshing(false);
        setPullDistance(0);
      }, 1000);
    } catch (err) {
      console.warn('Pull-to-refresh execution error:', err);
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [isRefreshing, onRefresh, triggerPullRefresh, triggerPullSuccess]);

  // Handle Touch Start
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isRefreshing) return;
    const scrollPos = containerRef.current?.scrollTop ?? 0;
    if (scrollPos <= 2) {
      canPullRef.current = true;
      startYRef.current = e.touches[0].clientY;
    } else {
      canPullRef.current = false;
      startYRef.current = null;
    }
  };

  // Handle Touch Move
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!canPullRef.current || startYRef.current === null || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startYRef.current;

    if (deltaY > 0) {
      // Damped spring curve
      const distance = Math.min(deltaY * 0.44, MAX_PULL);
      setPullDistance(distance);
      setIsPulling(true);
      checkPullThresholdHaptic(distance, PULL_THRESHOLD);
    } else {
      setPullDistance(0);
      setIsPulling(false);
      resetPullHaptic();
    }
  };

  // Handle Touch End
  const handleTouchEnd = () => {
    if (!canPullRef.current) return;
    canPullRef.current = false;
    startYRef.current = null;
    setIsPulling(false);
    resetPullHaptic();

    if (pullDistance >= PULL_THRESHOLD) {
      executeRefresh();
    } else {
      setPullDistance(0);
    }
  };

  // Also support pointer/mouse drag for seamless desktop testing
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isRefreshing || e.button !== 0) return;
    const scrollPos = containerRef.current?.scrollTop ?? 0;
    if (scrollPos <= 2) {
      isPointerDownRef.current = true;
      canPullRef.current = true;
      startYRef.current = e.clientY;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current || !canPullRef.current || startYRef.current === null || isRefreshing) return;
    const currentY = e.clientY;
    const deltaY = currentY - startYRef.current;

    if (deltaY > 6) {
      const distance = Math.min((deltaY - 6) * 0.44, MAX_PULL);
      setPullDistance(distance);
      setIsPulling(true);
      checkPullThresholdHaptic(distance, PULL_THRESHOLD);
    }
  };

  const handlePointerUp = () => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    canPullRef.current = false;
    startYRef.current = null;
    setIsPulling(false);
    resetPullHaptic();

    if (pullDistance >= PULL_THRESHOLD) {
      executeRefresh();
    } else {
      setPullDistance(0);
    }
  };

  // Calculate pull progress (0.0 to 1.0)
  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const isReady = pullDistance >= PULL_THRESHOLD;

  // Header dynamic height
  const currentHeaderHeight = isRefreshing || refreshSuccess ? 52 : pullDistance;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="flex-1 w-full h-full overflow-y-auto px-4 py-2 space-y-3.5 scrollbar-none overscroll-contain select-none"
    >
      {/* Pull-to-refresh Indicator: completely invisible when idle, expands dynamically during pull */}
      {currentHeaderHeight > 0 && (
        <div
          style={{
            height: `${currentHeaderHeight}px`,
            opacity: Math.min(currentHeaderHeight / 24, 1),
          }}
          className={`overflow-hidden transition-all duration-200 ease-out flex flex-col items-center justify-center rounded-xl mb-3 ${
            isRefreshing
              ? 'bg-cyan-950/50 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
              : refreshSuccess
              ? 'bg-emerald-950/50 border border-emerald-500/40'
              : isReady
              ? 'bg-cyan-950/30 border border-cyan-400/40'
              : 'bg-slate-900/40'
          }`}
        >
          <div className="flex items-center gap-2 px-3 py-1 text-xs">
            {refreshSuccess ? (
              <>
                <CheckCircle2 size={16} className="text-emerald-400 animate-scale-in" />
                <span className="font-semibold text-emerald-300">Live feed updated</span>
              </>
            ) : isRefreshing ? (
              <>
                <div className="relative flex items-center justify-center">
                  <RefreshCw size={15} className="text-cyan-400 animate-spin" />
                  <span className="absolute -inset-1 rounded-full bg-cyan-400/20 animate-ping" />
                </div>
                <span className="font-semibold text-cyan-200">Updating live events...</span>
              </>
            ) : (
              <>
                <div
                  style={{
                    transform: `rotate(${pullProgress * 360}deg) scale(${0.75 + pullProgress * 0.25})`,
                  }}
                  className="transition-transform duration-75"
                >
                  <RefreshCw
                    size={15}
                    className={isReady ? 'text-cyan-300 shadow-cyan-400' : 'text-slate-400'}
                  />
                </div>
                <span className={`text-xs ${isReady ? 'text-cyan-300 font-semibold' : 'text-slate-400'}`}>
                  {isReady ? 'Release to refresh' : 'Pull down to refresh'}
                </span>
              </>
            )}
          </div>

          {/* Micro Progress Track */}
          {isRefreshing && (
            <div className="w-36 h-0.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-400 animate-[shimmer_1.5s_infinite]" />
            </div>
          )}
        </div>
      )}

      {/* 2. EVENT CARDS LIST */}
      {events.map((ev) => {
        const isLiked = likedEventIds.has(ev.id);
        const isSelected = selectedEvent?.id === ev.id;
        const isLiveItem = ev.tags?.includes('#LiveNow') || ev.date.toLowerCase().includes('live');

        return (
          <div
            key={ev.id}
            onClick={() => onSelectEvent(ev)}
            className={`group relative rounded-2xl bg-[#0c1222] border transition-all duration-200 overflow-hidden cursor-pointer shadow-lg ${
              isSelected
                ? 'border-cyan-400 ring-1 ring-cyan-400/50 shadow-cyan-950/40'
                : 'border-slate-800/80 hover:border-slate-700 hover:shadow-xl'
            }`}
          >
            {/* Event Photo / Visual Canvas */}
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

              {/* LIVE BROADCAST BADGE FOR FRESHLY SYNCED LIVE EVENTS */}
              {isLiveItem && (
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/85 border border-cyan-400 text-cyan-300 text-[10px] font-bold tracking-wider uppercase shadow-lg backdrop-blur-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                  <Radio size={11} className="text-cyan-400" />
                  <span>Live Stream</span>
                </div>
              )}
            </div>

            {/* Event Content Details */}
            <div className="p-3.5 space-y-2">
              <h2 className="text-[15px] font-bold text-slate-100 tracking-tight leading-snug group-hover:text-cyan-300 transition-colors">
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
                  <span className={isLiveItem ? 'text-cyan-400 font-semibold' : ''}>{ev.date}</span>
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
                      safeShare({ title: ev.title, text: ev.description, url: window.location.href });
                    }}
                    className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-1"
                    title="Share event"
                  >
                    <Share2 size={16} />
                  </button>

                  <button
                    onClick={(e) => onToggleLike(e, ev)}
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
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-500/50 text-cyan-300 text-xs font-medium transition-all shadow-sm hover:shadow-cyan-950/50 cursor-pointer"
                >
                  <Compass size={13} className="text-cyan-400" />
                  <span>Street View</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* VIDEOS — real YouTube videos, tap to watch on YouTube (new tab, no in-app autoplay) */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center gap-2 px-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-red-600">
            <Play size={13} className="fill-white text-white ml-0.5" />
          </span>
          <h2 className="text-[15px] font-bold text-slate-100 tracking-tight">Videos</h2>
          <span className="text-xs text-slate-400">Watch on YouTube</span>
        </div>
        {YOUTUBE_VIDEOS.map((vid) => (
          <a
            key={vid.id}
            href={vid.url}
            target="_blank"
            rel="noreferrer"
            className="group relative block rounded-2xl bg-[#0c1222] border border-slate-800/80 hover:border-red-500/50 transition-all duration-200 overflow-hidden shadow-lg"
            title={`Watch on YouTube: ${vid.title}`}
          >
            <div className="relative w-full h-48 bg-slate-900 overflow-hidden">
              <img
                src={vid.thumbnail}
                alt={vid.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-11 bg-red-600 rounded-2xl flex items-center justify-center shadow-[0_0_24px_rgba(220,38,38,0.6)] group-hover:scale-110 transition-transform">
                  <Play size={20} className="fill-white text-white ml-0.5" />
                </div>
              </div>
            </div>
            <div className="p-3.5 space-y-1">
              <h3 className="text-[15px] font-bold text-slate-100 tracking-tight leading-snug group-hover:text-red-400 transition-colors">
                {vid.title}
              </h3>
              <p className="text-xs text-slate-400">{vid.channel} · YouTube</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
