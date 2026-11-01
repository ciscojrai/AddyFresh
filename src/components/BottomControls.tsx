import React from 'react';

export const BottomControls = ({ activeNav, onNavChange }: { activeNav: string, onNavChange: (nav: string) => void }) => (
  <div className="flex justify-around p-4 border-t border-slate-700 bg-slate-900">
    <button onClick={() => onNavChange('home')} className={activeNav === 'home' ? 'text-cyan-400' : ''}>Home</button>
    <button onClick={() => onNavChange('chat')} className={activeNav === 'chat' ? 'text-cyan-400' : ''}>Chat</button>
  </div>
);
