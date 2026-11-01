import React, { useState } from 'react';
import { EventItem } from '../types';
import { Search, Compass, MapPin, ArrowRight } from 'lucide-react';

interface SearchViewProps {
  events: EventItem[];
  onSelectEvent: (event: EventItem) => void;
  onSubmitSearch: (query: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  events,
  onSelectEvent,
  onSubmitSearch,
}) => {
  const [query, setQuery] = useState('');

  const quickPills = [
    'Tokyo Synthwave',
    'Berlin Techno',
    'Comic-Con 2027',
    'Rio Bossa Sunset',
    'London Drum & Bass',
    'Rain Radar Advisories',
  ];

  const filtered = query.trim()
    ? events.filter(
        (e) =>
          e.title.toLowerCase().includes(query.toLowerCase()) ||
          e.city.toLowerCase().includes(query.toLowerCase()) ||
          e.category.toLowerCase().includes(query.toLowerCase())
      )
    : events;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSubmitSearch(query.trim());
    }
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto px-4 py-3 space-y-4 scrollbar-none">
      {/* Search Input Bar */}
      <form onSubmit={handleSubmit} className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 149k experiences..."
          className="w-full bg-[#0c1222] border border-slate-700/80 rounded-2xl pl-10 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition-colors shadow-inner"
        />
        {query.trim() && (
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer"
            title="Ask AI"
          >
            <ArrowRight size={13} />
          </button>
        )}
      </form>

      {/* Quick Search Suggestions */}
      <div>
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Trending Discoveries
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {quickPills.map((pill) => (
            <button
              key={pill}
              onClick={() => {
                setQuery(pill);
                onSubmitSearch(pill);
              }}
              className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300 hover:text-emerald-300 hover:border-emerald-500/40 transition-colors cursor-pointer"
            >
              {pill}
            </button>
          ))}
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-2 pt-1">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Nearby & Featured ({filtered.length})
        </h4>

        {filtered.map((ev) => (
          <div
            key={ev.id}
            onClick={() => onSelectEvent(ev)}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-[#090e1c] border border-slate-800/80 hover:border-emerald-500/40 transition-all cursor-pointer group"
          >
            <img
              src={ev.image}
              alt={ev.title}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-lg object-cover shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80';
              }}
            />
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-semibold text-slate-200 truncate group-hover:text-emerald-300 transition-colors">
                {ev.title}
              </h5>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                <MapPin size={11} className="text-emerald-400" />
                <span>
                  {ev.city}, {ev.country}
                </span>
                <span>·</span>
                <span>{ev.date}</span>
              </div>
            </div>
            <Compass size={15} className="text-slate-500 group-hover:text-emerald-400 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};
