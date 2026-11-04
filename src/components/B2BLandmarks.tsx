import React, { useEffect, useState } from 'react';

/**
 * Verified permanent landmarks, transported from AddyFresh-MUSE
 * public/b2b/global_infrastructure_combined.json (231 pins, 20 categories).
 * These are infrastructure that does not move: solar farms, airports,
 * skyscrapers, spaceports, dams, ports, factories, etc. Space stations are
 * NOT included on purpose: the ISS moves, it is not a fixed landmark.
 * Spaceports & Launch Sites is the fixed-landmark equivalent in this data.
 * Underwater Internet Cables is excluded: it is lines on a seabed, not a
 * place you can fly to and stand at. Every other source category is a pill.
 */

export interface B2BPin {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  visual_stat?: string;
  fact?: string;
}

const PILL_LABELS: Record<string, string> = {
  'Largest Solar Farms': 'Solar Farms',
  'Busiest Airports': 'Airports',
  'Global Air Cargo Hubs': 'Cargo Airports',
  'Tallest Skyscrapers': 'Tall Buildings',
  'Spaceports & Launch Sites': 'Spaceports',
  'Largest Wind Farms': 'Wind Farms',
  'Global Superports': 'Superports',
  'Major Dams & Hydroelectric': 'Dams',
  'Nuclear Power Plants': 'Nuclear Plants',
  'Mega-Stadiums': 'Stadiums',
  'Hyperscale Data Centers': 'Data Centers',
  'Mega-Factories': 'Factories',
  'Semiconductor Mega-Fabs': 'Chip Fabs',
  'Battery Gigafactories': 'Battery Plants',
  'LNG Export Terminals': 'LNG Terminals',
  'Oil Refineries': 'Refineries',
  'Critical Mineral Mines': 'Mines',
  'Military Bases': 'Military Bases',
  'Global Stock Exchanges': 'Stock Exchanges',
};

interface Props {
  onSelectLandmark: (pin: B2BPin) => void;
}

export const B2BLandmarks: React.FC<Props> = ({ onSelectLandmark }) => {
  const [pins, setPins] = useState<B2BPin[]>([]);
  const [selected, setSelected] = useState<string>('Largest Solar Farms');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/b2b/global_infrastructure_combined.json')
      .then((r) => {
        if (!r.ok) throw new Error(`b2b ${r.status}`);
        return r.json();
      })
      .then((data: { pins?: B2BPin[] }) => {
        const list = (data.pins || []).filter((p) => p.category !== 'Underwater Internet Cables');
        setPins(list);
      })
      .catch(() => setError('Landmark data not loaded'));
  }, []);

  const categories = Object.keys(PILL_LABELS).filter((c) => pins.some((p) => p.category === c));
  const shown = pins.filter((p) => p.category === selected);

  if (error) return null;
  if (pins.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2 px-3.5 py-2.5 select-none">
      <div className="flex items-center gap-1.5 px-1">
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-amber-300/90">
          Verified Landmarks · Doesn&apos;t Move · {pins.length} pins
        </span>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {categories.map((cat) => {
          const count = pins.filter((p) => p.category === cat).length;
          const active = selected === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelected(cat)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium border cursor-pointer transition-all ${
                active
                  ? 'bg-amber-500/30 border-amber-300 text-white shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                  : 'bg-slate-900/70 border-slate-700/60 text-slate-300 hover:text-white hover:border-amber-500/40'
              }`}
            >
              {PILL_LABELS[cat]} · {count}
            </button>
          );
        })}
      </div>
      {/* Each landmark in this category gets its own pill, horizontal scroll — room is available, so no category is capped. */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {shown.map((pin) => (
          <button
            key={pin.id}
            type="button"
            onClick={() => onSelectLandmark(pin)}
            title={pin.fact || pin.visual_stat || pin.name}
            className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium border cursor-pointer bg-slate-900/70 border-slate-700/60 text-slate-200 hover:text-white hover:border-amber-500/40 whitespace-nowrap"
          >
            {pin.name}{pin.visual_stat ? ` · ${pin.visual_stat}` : ''}
          </button>
        ))}
      </div>
    </div>
  );
};
