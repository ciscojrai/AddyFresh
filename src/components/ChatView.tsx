import React from 'react';

export const ChatView = ({ onSend }: { onSend: (text: string) => void }) => (
  <div className="p-4">
    <h2 className="text-xl font-bold mb-4">Chat</h2>
    <input type="text" placeholder="Type..." className="w-full p-2 bg-slate-800 rounded" onKeyDown={(e) => e.key === 'Enter' && onSend(e.currentTarget.value)} />
  </div>
);
