import React, { useState } from 'react';
import { Mood } from '../types';
import { MOODS } from '../data/events';
import { Sparkles, ChevronUp } from 'lucide-react';

interface MoodMoverProps {
  activeMood: Mood;
  onSelectMood: (mood: Mood) => void;
}

export const MoodMover: React.FC<MoodMoverProps> = ({ activeMood, onSelectMood }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
      {/* Expanded Mood Menu */}
      {isOpen && (
        <div className="mb-2 p-1.5 bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {MOODS.map((mood) => {
            const isSelected = mood.id === activeMood.id;
            return (
              <button
                key={mood.id}
                onClick={() => {
                  onSelectMood(mood);
                  setIsOpen(false);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
                style={{
                  borderLeft: isSelected ? `2px solid ${mood.color}` : '2px solid transparent',
                }}
              >
                <span>{mood.emoji}</span>
                <span>{mood.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Trigger Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 hover:bg-slate-800/90 border border-slate-700/60 backdrop-blur-md shadow-lg transition-transform active:scale-95 cursor-pointer text-xs font-medium text-slate-200 group"
        style={{
          boxShadow: `0 0 16px ${activeMood.color}33`,
        }}
        title="Switch Aura Mood"
      >
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: activeMood.color }}
        />
        <span>{activeMood.name}</span>
        <ChevronUp
          size={12}
          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
};
