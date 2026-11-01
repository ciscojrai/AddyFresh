import React, { useState } from 'react';
import { EventItem } from '../types';
import {
  Pin,
  PinOff,
  MessageSquare,
  MoreVertical,
  Share2,
  Edit2,
  Trash2,
  Send,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import { safeShare } from '../utils/share';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
  messages: ChatMessage[];
}

interface ChatViewProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onSendMessage: (conversationId: string, text: string) => void;
  onNewChat: (initialQuery?: string) => void;
  onTogglePin: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  events: EventItem[];
}

export const ChatView: React.FC<ChatViewProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onSendMessage,
  onNewChat,
  onTogglePin,
  onDeleteConversation,
  onRenameConversation,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitleVal, setEditTitleVal] = useState('');

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  const pinnedConvs = conversations.filter((c) => c.pinned);
  const recentConvs = conversations.filter((c) => !c.pinned);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || !activeConversationId) return;
    onSendMessage(activeConversationId, inputVal.trim());
    setInputVal('');
  };

  const handleStartRename = (e: React.MouseEvent, conv: ChatConversation) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitleVal(conv.title);
    setOpenMenuId(null);
  };

  const handleSaveRename = (id: string) => {
    if (editTitleVal.trim()) {
      onRenameConversation(id, editTitleVal.trim());
    }
    setEditingId(null);
  };

  // 1. If an active conversation is open, render interactive chat view
  if (activeConv) {
    return (
      <div className="flex-1 w-full h-full flex flex-col bg-slate-950">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#090e1c] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSelectConversation(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Back to conversation list"
            >
              <ArrowLeft size={17} />
            </button>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 truncate max-w-[220px]">
                {activeConv.title}
              </h3>
              <span className="text-[10px] text-cyan-400 font-mono">
                {activeConv.messages.length} messages
              </span>
            </div>
          </div>
          <button
            onClick={() => onNewChat()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs hover:bg-cyan-900/60 transition-colors cursor-pointer"
          >
            <Plus size={13} />
            <span>New</span>
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 scrollbar-none">
          {activeConv.messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-md ${
                    isUser
                      ? 'bg-cyan-600 text-white rounded-br-xs'
                      : 'bg-[#0f172a] text-slate-200 border border-slate-800 rounded-bl-xs whitespace-pre-line'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[10px] text-slate-500 mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            );
          })}
        </div>

        {/* Message Input Bar */}
        <form
          onSubmit={handleSend}
          className="p-2.5 bg-[#090e1c] border-t border-slate-800/80 flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Ask FreshAddy about cities, genres, venues..."
            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={!inputVal.trim()}
            className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-slate-950 transition-colors cursor-pointer"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    );
  }

  // 2. Default List of PINNED and RECENTS conversations (Screenshot 2)
  return (
    <div
      onClick={() => setOpenMenuId(null)}
      className="flex-1 w-full h-full overflow-y-auto px-4 py-3.5 space-y-4 scrollbar-none relative"
    >
      {/* Pinned Section Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs tracking-wider">
            <Pin size={13} className="stroke-[2.5]" />
            <span>PINNED</span>
            <span className="text-slate-500 font-normal">({pinnedConvs.length})</span>
          </div>

          <button
            onClick={() => onNewChat()}
            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
          >
            <Plus size={12} />
            <span>New Chat</span>
          </button>
        </div>

        {/* Pinned Cards */}
        <div className="space-y-2">
          {pinnedConvs.map((conv) => {
            const lastMsg =
              conv.messages[conv.messages.length - 1]?.text || 'No messages yet';

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className="group relative rounded-xl bg-[#090e1c] border border-cyan-950/80 hover:border-cyan-500/50 p-3 transition-all duration-150 cursor-pointer shadow-sm hover:shadow-cyan-950/40"
              >
                <div className="flex items-start gap-3">
                  {/* Pin Icon pill */}
                  <div className="w-8 h-8 rounded-lg bg-cyan-950/70 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                    <Pin size={14} className="stroke-[2.5]" />
                  </div>

                  {/* Text details */}
                  <div className="flex-1 min-w-0 pr-6">
                    {editingId === conv.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editTitleVal}
                        onChange={(e) => setEditTitleVal(e.target.value)}
                        onBlur={() => handleSaveRename(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(conv.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-slate-900 border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-white w-full"
                      />
                    ) : (
                      <h4 className="text-xs font-semibold text-slate-100 truncate group-hover:text-cyan-300 transition-colors">
                        {conv.title}
                      </h4>
                    )}
                    <p className="text-[11px] text-slate-400 truncate mt-0.5 leading-snug">
                      {lastMsg}
                    </p>
                  </div>
                </div>

                {/* 3 Dots Menu Trigger */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === conv.id ? null : conv.id);
                  }}
                  className="absolute top-2.5 right-2 p-1 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                  title="More actions"
                >
                  <MoreVertical size={14} />
                </button>

                {/* Dropdown Menu Modal / Sheet (Screenshot 2) */}
                {openMenuId === conv.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-2 top-8 w-32 bg-[#0d1527] border border-slate-700 rounded-xl shadow-2xl py-1.5 z-40 text-xs animate-in fade-in duration-150"
                  >
                    <button
                      onClick={() => {
                        onTogglePin(conv.id);
                        setOpenMenuId(null);
                      }}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-slate-300 hover:bg-slate-800 hover:text-white text-left cursor-pointer"
                    >
                      <PinOff size={13} className="text-slate-400" />
                      <span>Unpin</span>
                    </button>
                    <button
                      onClick={() => {
                        safeShare({ title: conv.title, text: lastMsg, url: window.location.href });
                        setOpenMenuId(null);
                      }}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-slate-300 hover:bg-slate-800 hover:text-white text-left cursor-pointer"
                    >
                      <Share2 size={13} className="text-slate-400" />
                      <span>Share</span>
                    </button>
                    <button
                      onClick={(e) => handleStartRename(e, conv)}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-slate-300 hover:bg-slate-800 hover:text-white text-left cursor-pointer"
                    >
                      <Edit2 size={13} className="text-slate-400" />
                      <span>Rename</span>
                    </button>
                    <button
                      onClick={() => {
                        onDeleteConversation(conv.id);
                        setOpenMenuId(null);
                      }}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 text-left border-t border-slate-800/80 mt-1 cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recents Section Header */}
      <div>
        <div className="flex items-center gap-1.5 text-slate-400 font-bold text-xs tracking-wider mb-2">
          <MessageSquare size={13} />
          <span>RECENTS</span>
          <span className="text-slate-500 font-normal">({recentConvs.length})</span>
        </div>

        {/* Recents Cards */}
        <div className="space-y-2">
          {recentConvs.map((conv) => {
            const lastMsg =
              conv.messages[conv.messages.length - 1]?.text || 'No messages yet';

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className="group relative rounded-xl bg-[#090e1c] border border-slate-800/80 hover:border-slate-700 p-3 transition-all duration-150 cursor-pointer shadow-sm"
              >
                <div className="flex items-start gap-3">
                  {/* Chat Icon pill */}
                  <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                    <MessageSquare size={14} />
                  </div>

                  {/* Text details */}
                  <div className="flex-1 min-w-0 pr-6">
                    {editingId === conv.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editTitleVal}
                        onChange={(e) => setEditTitleVal(e.target.value)}
                        onBlur={() => handleSaveRename(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(conv.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-slate-900 border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-white w-full"
                      />
                    ) : (
                      <h4 className="text-xs font-semibold text-slate-200 truncate group-hover:text-cyan-300 transition-colors">
                        {conv.title}
                      </h4>
                    )}
                    <p className="text-[11px] text-slate-400 truncate mt-0.5 leading-snug">
                      {lastMsg}
                    </p>
                  </div>
                </div>

                {/* 3 Dots Menu Trigger */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(openMenuId === conv.id ? null : conv.id);
                  }}
                  className="absolute top-2.5 right-2 p-1 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                  title="More actions"
                >
                  <MoreVertical size={14} />
                </button>

                {/* Dropdown Menu Modal / Sheet */}
                {openMenuId === conv.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-2 top-8 w-32 bg-[#0d1527] border border-slate-700 rounded-xl shadow-2xl py-1.5 z-40 text-xs animate-in fade-in duration-150"
                  >
                    <button
                      onClick={() => {
                        onTogglePin(conv.id);
                        setOpenMenuId(null);
                      }}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-slate-300 hover:bg-slate-800 hover:text-white text-left cursor-pointer"
                    >
                      <Pin size={13} className="text-slate-400" />
                      <span>Pin</span>
                    </button>
                    <button
                      onClick={() => {
                        safeShare({ title: conv.title, text: lastMsg, url: window.location.href });
                        setOpenMenuId(null);
                      }}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-slate-300 hover:bg-slate-800 hover:text-white text-left cursor-pointer"
                    >
                      <Share2 size={13} className="text-slate-400" />
                      <span>Share</span>
                    </button>
                    <button
                      onClick={(e) => handleStartRename(e, conv)}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-slate-300 hover:bg-slate-800 hover:text-white text-left cursor-pointer"
                    >
                      <Edit2 size={13} className="text-slate-400" />
                      <span>Rename</span>
                    </button>
                    <button
                      onClick={() => {
                        onDeleteConversation(conv.id);
                        setOpenMenuId(null);
                      }}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 text-left border-t border-slate-800/80 mt-1 cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
