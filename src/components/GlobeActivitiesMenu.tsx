import React from 'react';

export interface GlobeActivityPill {
  id: string;
  label: string;
  category: string;
  color?: string;
}

export interface GlobeActivityCategory {
  title: string;
  icon: string;
  pills: string[];
}

export const GLOBE_ACTIVITY_CATEGORIES: GlobeActivityCategory[] = [
  {
    title: 'LIVE SPORTS',
    icon: '⚽',
    pills: ['Football', 'Baseball', 'Basketball', 'F1', 'Tennis', 'Cycling'],
  },
  {
    title: 'REALITY TV',
    icon: '📺',
    pills: ['Nature', 'Cooking', 'City', 'Business', 'Travel', 'Talent'],
  },
  {
    title: 'REAL ESTATE',
    icon: '🏠',
    pills: ['Glyfada Center', 'Golf', 'Kato Glyfada', 'Aigli', 'Terpsithea'],
  },
  {
    title: 'PERSONAL',
    icon: '✨',
    pills: ['Bucket List', 'Kids School', 'Home', 'Family', 'Boat'],
  },
  {
    title: 'CONTRACTOR',
    icon: '🛠️',
    pills: ['Roof Jobs', 'Vehicles', 'New Builds', 'Remodels', 'Commercial'],
  },
  {
    title: 'CALENDAR',
    icon: '📅',
    pills: ['Events', 'kids', 'packages', 'work', 'family'],
  },
];

interface GlobeActivitiesMenuProps {
  activePill: string | null;
  onSelectPill: (pill: string, category: string) => void;
}

export const GlobeActivitiesMenu: React.FC<GlobeActivitiesMenuProps> = ({
  activePill,
  onSelectPill,
}) => {
  return (
    <div className="relative w-full h-full flex flex-col justify-start px-3.5 py-2.5 overflow-y-auto no-scrollbar select-none">
      {/* 5 Distinct Activity Rows with responsive capsule pills */}
      <div className="flex flex-col gap-2.5">
        {GLOBE_ACTIVITY_CATEGORIES.map((cat, idx) => (
          <div key={cat.title} className="flex flex-col gap-1">
            {/* Category Subheader */}
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-[11px] leading-none opacity-80">{cat.icon}</span>
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-cyan-300/80">
                {cat.title}
              </span>
            </div>

            {/* Pill Capsule Horizontal Carousel */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 pt-0.5">
              {cat.pills.map((pill) => {
                const isSelected = activePill === pill;
                return (
                  <button
                    key={pill}
                    type="button"
                    onClick={() => onSelectPill(pill, cat.title)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium tracking-wide transition-all duration-150 cursor-pointer border ${
                      isSelected
                        ? 'bg-cyan-500/30 border-cyan-300 text-white shadow-[0_0_12px_rgba(34,211,238,0.5)] scale-105'
                        : 'bg-slate-900/70 hover:bg-slate-800/90 border-slate-700/60 hover:border-cyan-500/40 text-slate-300 hover:text-white'
                    } backdrop-blur-md active:scale-95`}
                  >
                    {pill}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

