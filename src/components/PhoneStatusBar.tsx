import React, { useState, useEffect } from 'react';
import { Wifi, Battery } from 'lucide-react';

export const PhoneStatusBar: React.FC = () => {
  const [time, setTime] = useState('04:24');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTime(`${hours}:${minutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-11 shrink-0 px-6 flex items-center justify-between text-slate-100 text-[13px] font-semibold tracking-tight z-50 select-none bg-transparent">
      {/* Time */}
      <span className="w-12 text-left tabular-nums">{time}</span>

      {/* Dynamic Island */}
      <div className="absolute left-1/2 -translate-x-1/2 top-2 h-7 w-28 bg-black rounded-full flex items-center justify-end px-2.5 space-x-1.5 shadow-md border border-slate-800/60 pointer-events-auto">
        <div className="w-2.5 h-2.5 rounded-full bg-[#0a1120] ring-1 ring-slate-800" />
        <div className="w-2 h-2 rounded-full bg-[#111c33]" />
      </div>

      {/* Status Icons */}
      <div className="flex items-center space-x-1.5 text-slate-200">
        {/* Cellular bars */}
        <div className="flex items-end space-x-0.5 h-3">
          <div className="w-[3px] h-1.5 bg-slate-200 rounded-xs" />
          <div className="w-[3px] h-2 bg-slate-200 rounded-xs" />
          <div className="w-[3px] h-2.5 bg-slate-200 rounded-xs" />
          <div className="w-[3px] h-3 bg-slate-200 rounded-xs" />
        </div>
        <Wifi size={13} className="stroke-[2.5]" />
        <div className="flex items-center space-x-0.5">
          <Battery size={18} className="stroke-[2.2] fill-slate-200" />
        </div>
      </div>
    </div>
  );
};
