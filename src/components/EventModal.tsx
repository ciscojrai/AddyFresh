import React from 'react';

export const EventModal = ({ event, onClose }: { event: any, onClose: () => void }) => {
  if (!event) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col justify-end z-50">
      <div className="bg-[#080c1c] p-6 rounded-t-3xl border-t-2 border-x-2 border-yellow-500 shadow-[0_-10px_30px_rgba(234,179,8,0.2)]">
        <div className="w-12 h-1.5 bg-slate-600 rounded-full mx-auto mb-6" />
        <h2 className="text-xl font-bold mb-2 text-white">{event.message}</h2>
        <div className="w-full h-48 bg-slate-800 rounded-xl mb-4 flex items-center justify-center text-slate-500">Map View</div>
        <button className="w-full p-3 bg-slate-800 text-yellow-500 border border-yellow-500/50 rounded-xl font-medium mb-2">Street View 360°</button>
        <button onClick={onClose} className="w-full p-3 bg-slate-800 rounded-xl text-white">Close</button>
      </div>
    </div>
  );
};
