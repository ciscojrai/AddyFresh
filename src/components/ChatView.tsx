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
  Search,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { safeShare } from '../utils/share';
import { startMetaVoiceCapture, MetaVoiceCaptureHandle } from '../utils/metaVoice';
import PagosPop from './PagosPop';
import type { SessionState } from '../voice/conversation';

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
  /** Continuous duplex voice session state, shown on the chat drawer trigger. */
  voiceState?: SessionState;
  voiceSecondsLeft?: number;
  onToggleVoice?: () => void;
  /** Panel speaker, separate from the globe speaker. Audio on/off only. */
  audioOn?: boolean;
  onToggleAudio?: () => void;
  /** Back action for the arrow that replaces New Chat in the list header. */
  onBackFromChat?: () => void;
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
  voiceState = 'closed',
  voiceSecondsLeft = 0,
  onToggleVoice,
  audioOn = true,
  onToggleAudio,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [listSearch, setListSearch] = useState('');
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
  // --- Tap-to-dictate speech-to-text via Meta muse-voice-transcribe-1.0 (WAV 24kHz PCM + Web Speech interim preview). Tap, never hold. ---
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

  // Silence after speech before dictation stops. Stopping keeps the transcript in
  // the box for review; it does not send it on its own.
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
      if (finalTranscript) setInputVal(finalTranscript);
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
    // While dictating, Send first stops the microphone and keeps the text
    // in the box. Tap Send again to send it.
    if (listening || captureRef.current) {
      void stopListening();
      return;
    }
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
        {/* Top bar, as in the mockup: highlighted ← Chats left (goes to chat list), + New Chat right only — no Pin, no voice at the top */}
        <div className="px-2 pt-1.5 shrink-0 flex items-center justify-between">
          <button
            onClick={() => onSelectConversation(null)}
            className="flex items-center gap-1 p-1 rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 transition-colors cursor-pointer"
            title="Back to chats"
            aria-label="Back to chats"
          >
            <ArrowLeft size={15} />
            <span className="text-[11px] font-medium">Chats</span>
          </button>
          <button
            type="button"
            onClick={() => onNewChat()}
            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            title="New chat"
            aria-label="New chat"
          >
            <Plus size={12} />
            <span>New Chat</span>
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 scrollbar-none">
          {activeConv.messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center px-6 text-center">
              <div className="flex items-center gap-4">
                <video
                  src="/pagos.mp4"
                  muted
                  playsInline
                  autoPlay
                  loop
                  aria-label="Pagos"
                  className="w-44 h-44 object-cover rounded-2xl shrink-0"
                />
                {onToggleVoice && (
                  <button
                    type="button"
                    onClick={onToggleVoice}
                    aria-pressed={voiceState !== 'closed'}
                    title={voiceState !== 'closed' ? 'End voice chat' : 'Start voice chat'}
                    className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 pr-3 text-[13px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      voiceState !== 'closed'
                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                        : 'border-cyan-400/60 text-cyan-300 hover:bg-cyan-500/10'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0 text-white">
                      {voiceState === 'countdown' ? (
                        <span className="text-[11px] font-bold tabular-nums">{voiceSecondsLeft}</span>
                      ) : voiceState === 'thinking' ? (
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      ) : (
                        <span className="flex items-end gap-[2px] h-4">
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className={`voice-wave-bar ${voiceState === 'listening' ? 'voice-wave-bar--live' : 'voice-wave-bar--idle'}`}
                              style={voiceState === 'listening' ? { animationDelay: `${i * 110}ms` } : undefined}
                            />
                          ))}
                        </span>
                      )}
                    </span>
                    {voiceState !== 'closed' ? 'End talk' : 'I have a Voice, Lets Chat'}
                  </button>
                )}
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-slate-200">
                Hi, I’m Pagos, your live AI Discovery guide inside FreshAddy. Ask me about music festivals, clubs, concerts, rain radar, or emergency alerts across the globe.
              </p>
            </div>
          )}
          {activeConv.messages.map((msg, msgIdx) => {
            const isUser = msg.sender === 'user';
            // MUSE version, copied: App posts a pending assistant message with
            // this exact text while Pagos is thinking — that is the thinking
            // state, so Pagos pops up next to it here, every trigger.
            const isThinking = !isUser && msg.text === 'Pagos is thinking…';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                {isThinking && <PagosPop variant="inline" show={true} />}
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

        {/* Bottom search bar, as in images 2-3: search pill (mic inside, send inside at far right) [voice wave icon, stays outside right during the chat] — no conversations icon */}
        <form
          onSubmit={handleSend}
          className="p-2.5 bg-[#090e1c] border-t border-slate-800/80 flex items-center gap-2 shrink-0"
        >
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={listening ? 'Listening...' : 'Ask Pagos...'}
              className="w-full h-10 bg-slate-900 border border-slate-700/80 rounded-full pl-4 pr-[5.5rem] text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {voiceSupported && (
                <button
                  type="button"
                  data-listening={listening || transcribing ? 'true' : 'false'}
                  title={
                    listening
                      ? 'Listening… tap again to stop dictation'
                      : transcribing
                      ? 'Transcribing with Meta muse-voice-transcribe-1.0...'
                      : 'Tap for dictation (Meta Voice)'
                  }
                  aria-label="Tap for dictation (Meta Voice)"
                  onClick={() => {
                    // Tap only, never hold. Tap to start, tap again to stop.
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
                      ? 'text-cyan-300 bg-cyan-500/30 ring-2 ring-cyan-400'
                      : 'text-slate-400 hover:text-blue-300'
                  }`}
                >
                  <Mic size={15} />
                  {listening && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  )}
                </button>
              )}
              <button
                type="submit"
                disabled={transcribing || (!inputVal.trim() && !listening)}
                className="w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-slate-950 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                title={listening ? 'Stop microphone' : 'Send'}
                aria-label={listening ? 'Stop microphone' : 'Send'}
              >
                <Send size={15} />
              </button>
            </div>
          </div>

          {onToggleVoice && (
            <button
              type="button"
              onClick={onToggleVoice}
              aria-pressed={voiceState !== 'closed'}
              title={voiceState === 'countdown' ? `Listening: ${voiceSecondsLeft}s to reply` : voiceState !== 'closed' ? 'End voice chat' : 'Start voice chat'}
              aria-label="Voice chat"
              className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center shrink-0 cursor-pointer text-white"
            >
              {voiceState === 'countdown' ? (
                <span className="text-[11px] font-bold tabular-nums">{voiceSecondsLeft}</span>
              ) : voiceState === 'thinking' ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <span className="flex items-end gap-[2px] h-4">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`voice-wave-bar ${voiceState === 'listening' ? 'voice-wave-bar--live' : 'voice-wave-bar--idle'}`}
                      style={voiceState === 'listening' ? { animationDelay: `${i * 110}ms` } : undefined}
                    />
                  ))}
                </span>
              )}
            </button>
          )}

          {/* Panel speaker: audio on/off for the panel voice chat only, separate from globe. */}
          {onToggleAudio && (
            <button
              type="button"
              onClick={onToggleAudio}
              title={audioOn ? 'Panel audio: On (tap to mute)' : 'Panel audio: Off (tap to unmute)'}
              aria-label={audioOn ? 'Turn panel audio off' : 'Turn panel audio on'}
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer text-white ${
                audioOn ? 'bg-cyan-600' : 'bg-slate-700 text-slate-400'
              }`}
            >
              {audioOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          )}
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
        {/* Title only, one line per item */}
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

  const listQuery = listSearch.trim().toLowerCase();
  const matchesList = (conv: ChatConversation) =>
    !listQuery || conv.title.toLowerCase().includes(listQuery);
  return (
    <div
      onClick={() => setOpenMenuId(null)}
      className="flex-1 w-full h-full overflow-y-auto px-2.5 py-3 space-y-3 scrollbar-none relative"
    >
      {/* List top, as in the 01:01 screenshot: search box, + New Chat far right, no back arrow */}
      <div className="flex items-center gap-2 px-1">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Search"
            aria-label="Search chats"
            className="w-full h-10 bg-slate-900 border border-slate-700/80 rounded-full pl-9 pr-3 text-[13px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>
        <button
          onClick={() => onNewChat()}
          className="flex items-center gap-1 text-[13px] text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer rounded shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <Plus size={14} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Pinned section */}
      <div>
        <div className="flex items-center gap-1.5 text-cyan-400 font-medium text-[13px] tracking-wide mb-1 px-2">
          <Pin size={13} className="text-cyan-400" />
          <span>Pinned</span>
        </div>
        <div className="space-y-0.5">
          {pinnedConvs.filter(matchesList).map((conv) => renderRow(conv, true))}
        </div>
      </div>

      {/* Recents section */}
      <div>
        <div className="flex items-center gap-1.5 text-cyan-400 font-medium text-[11px] tracking-wide mb-1 px-2">
          <MessageSquare size={11} className="text-cyan-400" />
          <span>Recents</span>
        </div>
        <div className="space-y-0.5">
          {recentConvs.filter(matchesList).map((conv) => renderRow(conv, false))}
        </div>
      </div>
    </div>
  );
};
