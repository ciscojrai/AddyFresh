import { ActiveNav } from '../types';
import {
  Check,
  Play,
  Search,
  MessageSquare,
  Heart,
} from 'lucide-react';

interface BottomControlsProps {
  activeNav: ActiveNav;
  onNavChange: (nav: ActiveNav) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSubmitSearch: (q: string) => void;
  likedCount: number;
}

export const BottomControls: React.FC<BottomControlsProps> = ({
  activeNav,
  onNavChange,
  searchQuery,
  onSearchChange,
  onSubmitSearch,
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
    </footer>
  );
};
