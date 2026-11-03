import React, { useState, useEffect, useRef } from 'react';
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
  Mic,
} from 'lucide-react';
import { safeShare } from '../utils/share';
import { startMetaVoiceCapture, MetaVoiceCaptureHandle } from '../utils/metaVoice';

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

  // --- Pin (persisted in localStorage as a list of pinned conversation ids) ---
  const PIN_KEY = 'freshaddy.pinnedConversations';
  const readPinned = (): string[] => {
    try {
      const v = JSON.parse(localStorage.getItem(PIN_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const restoredPinsRef = useRef(false);
  useEffect(() => {
    if (restoredPinsRef.current) return;
    restoredPinsRef.current = true;
    const saved = readPinned();
    conversations.forEach((c) => {
      if (saved.includes(c.id) && !c.pinned) onTogglePin(c.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleTogglePinned = (conv: ChatConversation) => {
    const saved = readPinned().filter((id) => id !== conv.id);
    if (!conv.pinned) saved.push(conv.id);
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(saved));
    } catch {
      /* storage unavailable: pin still works for this session */
    }
    onTogglePin(conv.id);
  };

  // --- Press-and-speak speech-to-text via Meta muse-voice-transcribe-1.0 (WAV 24kHz PCM + Web Speech interim preview) ---
  const voiceSupported =
    typeof window !== 'undefined' &&
    Boolean(
      navigator.mediaDevices?.getUserMedia ||
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition
    );
  const captureRef = useRef<MetaVoiceCaptureHandle | null>(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // Silence after speech before the turn is sent. Without this the transcript was sent
  // on mic release, which cut people off the moment they paused.
  const SILENCE_END_MS = 1800;
  const silenceEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSilenceEnd = () => {
    if (silenceEndRef.current) {
      clearTimeout(silenceEndRef.current);
      silenceEndRef.current = null;
    }
  };

  const startListening = async () => {
    if (!voiceSupported || captureRef.current || listening || transcribing) return;
    setListening(true);
    try {
      const handle = await startMetaVoiceCapture((interim) => {
        if (interim) setInputVal(interim);
        // Every recognised word restarts the pause timer, so thinking out loud is fine.
        clearSilenceEnd();
        silenceEndRef.current = setTimeout(() => {
          void stopListeningRef.current?.();
        }, SILENCE_END_MS);
      });
      captureRef.current = handle;
    } catch {
      setListening(false);
      captureRef.current = null;
    }
  };

  const stopListening = async () => {
    clearSilenceEnd();
    const handle = captureRef.current;
    if (!handle) {
      setListening(false);
      return;
    }
    captureRef.current = null;
    setListening(false);
    setTranscribing(true);
    try {
      const finalTranscript = await handle.stopAndTranscribe();
      if (finalTranscript) {
        setInputVal(finalTranscript);
        if (activeConversationId) {
          onSendMessage(activeConversationId, finalTranscript);
          setInputVal('');
        }
      }
    } catch {
      /* ignore */
    } finally {
      setTranscribing(false);
    }
  };

  const stopListeningRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(
    () => () => {
      clearSilenceEnd();
      try {
        captureRef.current?.cancel();
      } catch {
        /* ignore */
      }
    },
    []
  );

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
        {/* Back arrow only (no header) */}
        <div className="px-2 pt-1.5 shrink-0">
          <button
            onClick={() => onSelectConversation(null)}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 transition-colors cursor-pointer"
            title="Back to conversation list"
            aria-label="Back to conversation list"
          >
            <ArrowLeft size={15} />
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
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed shadow-md ${
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

        {/* Message Input Bar: [+ New] [ pill input: pin, mic ] [send] */}
        <form
          onSubmit={handleSend}
          className="p-2.5 bg-[#090e1c] border-t border-slate-800/80 flex items-center gap-2 shrink-0"
        >
          <button
            type="button"
            onClick={() => onNewChat()}
            className="flex items-center gap-1 h-10 px-3 rounded-full border border-slate-600 text-slate-300 text-[11px] font-medium hover:border-cyan-400 hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 transition-colors cursor-pointer shrink-0"
            title="Start a new chat"
          >
            <Plus size={12} />
            <span>New</span>
          </button>

          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Ask Muse..."
              className="w-full h-10 bg-slate-900 border border-slate-700/80 rounded-full pl-4 pr-[5.25rem] text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => handleTogglePinned(activeConv)}
                aria-pressed={activeConv.pinned}
                title={activeConv.pinned ? 'Unpin this chat' : 'Pin this chat'}
                className={`w-9 h-9 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 transition-colors cursor-pointer ${
                  activeConv.pinned ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Pin size={15} className={activeConv.pinned ? 'fill-cyan-400' : ''} />
              </button>
              {voiceSupported && (
                <button
                  type="button"
                  data-listening={listening || transcribing ? 'true' : 'false'}
                  title={
                    listening
                      ? 'Listening… tap again to finish'
                      : transcribing
                      ? 'Transcribing with Meta muse-voice-transcribe-1.0...'
                      : 'Tap to speak (Meta Voice)'
                  }
                  aria-label="Tap to speak (Meta Voice)"
                  onClick={() => {
                    // Tap to start, tap to finish. The turn also ends on its own after a
                    // pause, so a tap is only needed to begin or to cut it short.
                    if (captureRef.current || listening) void stopListening();
                    else void startListening();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (captureRef.current || listening) void stopListening();
                      else void startListening();
                    }
                  }}
                  className={`relative w-9 h-9 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 transition-colors cursor-pointer touch-none ${
                    listening
                      ? 'text-white bg-blue-500/30 ring-2 ring-blue-400'
                      : 'text-slate-400 hover:text-blue-300'
                  }`}
                >
                  <Mic size={15} />
                  {listening && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  )}
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!inputVal.trim()}
            className="p-2.5 rounded-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-slate-950 transition-colors cursor-pointer shrink-0"
            title="Send"
          >
            <Send size={15} />
          </button>
        </form>
        <div className="bg-[#090e1c] text-center text-[9px] text-slate-600 pb-1 -mt-1 shrink-0 select-none">
          Powered by Meta Muse
        </div>
      </div>
    );
  }

  // 2. Default list of PINNED and RECENTS conversations: slim Grok-style rows
  const renderRow = (conv: ChatConversation, isPinnedSection: boolean) => {
    const lastMsg = conv.messages[conv.messages.length - 1]?.text || 'No messages yet';
    return (
      <div
        key={conv.id}
        role="button"
        tabIndex={0}
        data-chat-row
        onClick={() => onSelectConversation(conv.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectConversation(conv.id);
          }
        }}
        className="group relative flex items-center gap-3 rounded-xl px-2 py-2 cursor-pointer transition-colors hover:bg-slate-800/50 focus:outline-none focus-visible:bg-slate-800/60 focus-visible:ring-2 focus-visible:ring-cyan-400/70"
      >
        {/* Name + one-line preview */}
        <div className="flex-1 min-w-0 pr-5">
          {editingId === conv.id ? (
            <input
              type="text"
              autoFocus
              value={editTitleVal}
              onChange={(e) => setEditTitleVal(e.target.value)}
              onBlur={() => handleSaveRename(conv.id)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') handleSaveRename(conv.id);
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-cyan-500 rounded px-1.5 py-0.5 text-[13px] text-white w-full"
            />
          ) : (
            <h4 className="text-[13px] font-bold text-white truncate leading-tight">{conv.title}</h4>
          )}
          <p className="text-[11px] text-slate-400 truncate mt-0.5 leading-snug">{lastMsg}</p>
        </div>

        {/* Small, faint 3-dot menu: shown on hover / focus (always faintly visible on touch) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(openMenuId === conv.id ? null : conv.id);
          }}
          className="absolute top-1/2 -translate-y-1/2 right-1 p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 opacity-0 group-hover:opacity-70 group-focus-within:opacity-70 focus:opacity-100 pointer-coarse:opacity-60 transition-opacity cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          title="More actions"
          aria-label="More actions"
        >
          <MoreVertical size={13} />
        </button>

        {openMenuId === conv.id && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2 top-full -mt-1 w-32 bg-[#0d1527] border border-slate-700 rounded-xl shadow-2xl py-1.5 z-40 text-xs animate-in fade-in duration-150"
          >
            <button
              onClick={() => {
                onTogglePin(conv.id);
                setOpenMenuId(null);
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2 text-slate-300 hover:bg-slate-800 hover:text-white text-left cursor-pointer"
            >
              {isPinnedSection ? (
                <PinOff size={13} className="text-slate-400" />
              ) : (
                <Pin size={13} className="text-slate-400" />
              )}
              <span>{isPinnedSection ? 'Unpin' : 'Pin'}</span>
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
  };

  return (
    <div
      onClick={() => setOpenMenuId(null)}
      className="flex-1 w-full h-full overflow-y-auto px-2.5 py-3 space-y-3 scrollbar-none relative"
    >
      {/* Pinned section */}
      <div>
        <div className="flex items-center justify-between mb-1 px-2">
          <div className="flex items-center gap-1.5 text-cyan-400 font-medium text-[11px] tracking-wide">
            <Pin size={11} className="text-cyan-400" />
            <span>Pinned</span>
          </div>

          <button
            onClick={() => onNewChat()}
            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <Plus size={12} />
            <span>New Chat</span>
          </button>
        </div>
        <div className="space-y-0.5">{pinnedConvs.map((conv) => renderRow(conv, true))}</div>
      </div>

      {/* Recents section */}
      <div>
        <div className="flex items-center gap-1.5 text-cyan-400 font-medium text-[11px] tracking-wide mb-1 px-2">
          <MessageSquare size={11} className="text-cyan-400" />
          <span>Recents</span>
        </div>
        <div className="space-y-0.5">{recentConvs.map((conv) => renderRow(conv, false))}</div>
      </div>
    </div>
  );
};
