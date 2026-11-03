/**
 * React binding for the Pagos voice session.
 *
 * Keeps the session out of component state logic: one session per app, its state and
 * countdown mirrored into React so the globe button and the nav chip render from the
 * same source. The caller supplies the two app-specific actions: asking the assistant
 * (the existing chat handler) and running a local globe move.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createVoiceSession } from '../voice/conversation.js';
import type { SessionState } from '../voice/conversation.js';
import type { VoiceIntent } from '../voice/intents.js';
import { runGlobeIntent } from '../voice/globeCommands.js';
import { lastAddyVoiceReport, onAddyVoiceReport } from '../utils/metaVoice';
import type { AddyVoiceReport } from '../utils/metaVoice';

export interface UseVoiceSessionOptions {
  /** Send a question to the assistant, resolve with its reply text. */
  ask: (text: string) => Promise<string>;
  /** Called with the user's words so the chat panel can show them. */
  onUserText?: (text: string) => void;
}

export function useVoiceSession({ ask, onUserText }: UseVoiceSessionOptions) {
  const [state, setState] = useState<SessionState>('closed');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // Which engine spoke last, and why the browser voice had to take over.
  const [voiceReport, setVoiceReport] = useState<AddyVoiceReport | null>(() => lastAddyVoiceReport());

  useEffect(() => onAddyVoiceReport(setVoiceReport), []);

  // Latest callbacks without rebuilding the session on every render.
  const askRef = useRef(ask);
  const userTextRef = useRef(onUserText);
  askRef.current = ask;
  userTextRef.current = onUserText;

  const session = useMemo<ReturnType<typeof createVoiceSession>>(
    () =>
      createVoiceSession({
        ask: (text) => askRef.current(text),
        onUserText: (text) => userTextRef.current?.(text),
        run: (intent: VoiceIntent) => {
          runGlobeIntent(intent);
        },
        onState: (next, left) => {
          setState(next);
          setSecondsLeft(left);
        },
        onNotice: (text) => setNotice(text),
        onError: (message) => setNotice(`error: ${message}`),
      }),
    []
  );

  const toggle = useCallback<() => void>(() => {
    setNotice(null);
    if (session.isOpen()) session.close();
    else session.open();
  }, [session]);

  useEffect(() => () => session.close(), [session]);

  return {
    state,
    secondsLeft,
    notice,
    /** Latest engine label ("Bella (bridge)") plus the reason when it was the browser. */
    voiceReport,
    toggle,
    clearNotice: () => setNotice(null),
    /** Live session truth, safe to read from handlers that render-time values can miss. */
    isOpen: () => session.isOpen(),
  };
}
