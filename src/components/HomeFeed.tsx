import React from 'react';

export const HomeFeed = ({ events }: { events: any[] }) => (
  <div className="p-4">
    <h2 className="text-xl font-bold mb-4 text-white">Home Feed</h2>
    {events.map((evt) => (
      <div key={evt.id} className="p-4 mb-3 bg-[#0a1128] border border-cyan-900/50 rounded-2xl">
        <h3 className="font-semibold text-white">{evt.message}</h3>
        <button className="mt-3 px-4 py-2 bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 rounded-lg text-sm font-medium">Street View 360°</button>
      </div>
    ))}
  </div>
);
