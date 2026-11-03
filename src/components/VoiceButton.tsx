/**
 * The voice-session button: taps open or close the Pagos conversation session.
 *
 * Two shapes share one component:
 *  - 'globe': a round floating button in the globe's bottom-right corner.
 *  - 'nav': the circular waves chip that sits just outside the chat icon in the
 *    bottom navigation, matching the app's existing icon row.
 *
 * While a session is open it shows live waves; during the reply countdown it shows the
 * seconds left, which is the "respond within 30 seconds" cue.
 */
import React from 'react';
import type { SessionState } from '../voice/conversation';

export interface VoiceButtonProps {
  state: SessionState;
  secondsLeft: number;
  onToggle: () => void;
  /** 'globe' floats over the map; 'nav' joins the bottom icon row. */
  variant?: 'globe' | 'nav';
}

/** The app's cyan accent, so the voice chip matches the existing icon row. */
const ACCENT = '#38bdf8';

/**
 * Four bars: short and still when idle, breathing while a session listens. Sizes come
 * from the .voice-wave-bar rules in index.css, so they render even without Tailwind
 * arbitrary values.
 */
function WaveBars({ animate }: { animate: boolean }) {
  return (
    <span className="flex items-end gap-[3px] h-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`voice-wave-bar ${animate ? 'voice-wave-bar--live' : 'voice-wave-bar--idle'}`}
          style={animate ? { animationDelay: `${i * 110}ms` } : undefined}
        />
      ))}
    </span>
  );
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  state,
  secondsLeft,
  onToggle,
  variant = 'nav',
}) => {
  const open = state !== 'closed';
  const listening = state === 'listening' || state === 'countdown';
  const label = open
    ? state === 'countdown'
      ? `Voice chat open, ${secondsLeft} seconds to reply. Tap to end.`
      : 'Voice chat open. Tap to end.'
    : 'Start voice chat with Pagos';

  const ringStyle: React.CSSProperties = open
    ? { borderColor: ACCENT, boxShadow: `0 0 16px ${ACCENT}66`, color: ACCENT }
    : {};

  if (variant === 'globe') {
    return (
      <button
        type="button"
        data-voice-state={state}
        onClick={onToggle}
        title={state === 'countdown' ? `Listening: ${secondsLeft}s to reply` : label}
        aria-label={label}
        aria-pressed={open}
        className={`relative w-11 h-11 rounded-full flex items-center justify-center border transition-all active:scale-90 cursor-pointer ${
          open
            ? 'bg-slate-900/90 text-sky-300'
            : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700/80 text-slate-300 hover:text-sky-300'
        }`}
        style={ringStyle}
      >
        {state === 'countdown' ? (
          <span className="text-[11px] font-bold tabular-nums">{secondsLeft}</span>
        ) : state === 'thinking' ? (
          <span className="w-3 h-3 rounded-full border-2 border-sky-300 border-t-transparent animate-spin" />
        ) : (
          <WaveBars animate={listening} />
        )}
      </button>
    );
  }

  // Navigation chip: sits to the right of the chat icon, outside it.
  return (
    <button
      type="button"
      data-voice-state={state}
      onClick={onToggle}
      title={state === 'countdown' ? `Listening: ${secondsLeft}s to reply` : label}
      aria-label={label}
      aria-pressed={open}
      className={`relative p-2.5 rounded-full transition-all duration-200 cursor-pointer ${
        open ? 'bg-sky-950/60' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
      }`}
      style={open ? { ...ringStyle, color: ACCENT } : undefined}
    >
      {state === 'countdown' ? (
        <span className="w-5 h-5 flex items-center justify-center text-[11px] font-bold tabular-nums">{secondsLeft}</span>
      ) : state === 'thinking' ? (
        <span className="w-5 h-5 flex items-center justify-center">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        </span>
      ) : (
        <span className="w-5 h-5 flex items-center justify-center">
          <WaveBars animate={listening} />
        </span>
      )}
    </button>
  );
};
