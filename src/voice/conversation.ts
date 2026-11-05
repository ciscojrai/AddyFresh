/**
 * Pagos voice conversation session.
 *
 * The browser's SpeechRecognition stops itself after a few seconds of silence, so a
 * "stay open" conversation cannot rely on one long recognizer. This module owns the
 * session instead: it keeps a recognizer armed while the session is open, restarts it
 * whenever the browser ends it, and runs a visible countdown between turns.
 *
 * Flow: tap -> open -> listening (waves) -> transcript -> ask -> countdown -> listening.
 * The mic never opens on its own: no background wake-word listener exists. A leading
 * "Pagos" is accepted and ignored, so both "zoom in" and "Pagos, zoom in" work.
 * Saying an end phrase closes the session.
 *
 * No DOM and no React: the caller supplies callbacks, which keeps this testable.
 */

import { confirmIntent, normalize, parseIntent, stripWake } from './intents.js';
import type { VoiceIntent } from './intents.js';

export type SessionState = 'closed' | 'listening' | 'thinking' | 'countdown';

export type VoiceSessionOptions = {
  /** Milliseconds the user has to speak again before the session closes. */
  countdownMs?: number;
  /** How long the recognizer waits after the user stops talking before acting. */
  silenceMs?: number;
  /** Send the question to the chat backend; resolve with the reply text. */
  ask: (text: string) => Promise<string>;
  /** Run a local intent (zoom, pan). Return a short spoken confirmation. */
  run: (intent: VoiceIntent) => void;
  /** State changes, for the waves and countdown UI. */
  onState?: (state: SessionState, secondsLeft: number) => void;
  /** A transcript was accepted as the user's turn. */
  onUserText?: (text: string) => void;
  /** Something to show the user without sending it to the backend. */
  onNotice?: (text: string) => void;
  onError?: (message: string) => void;
};

const speechRecognition = (): any => {
  const w = typeof window !== 'undefined' ? (window as any) : null;
  return w ? w.SpeechRecognition || w.webkitSpeechRecognition || null : null;
};

export function createVoiceSession(options: VoiceSessionOptions) {
  const countdownMs = options.countdownMs ?? 30_000;
  const silenceMs = options.silenceMs ?? 1_600;

  let state: SessionState = 'closed';
  let rec: any = null;
  let recRunning = false;
  let buffer = '';
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let deadline = 0;
  let turnToken = 0;
  let committed = '';
  let interimText = '';
  let muted = false;
  let microphoneReady = false;
  let priming = false;

  function emit(next: SessionState, secondsLeft = 0) {
    state = next;
    options.onState?.(next, secondsLeft);
  }

  /** Reads live state; a closure over the variable, so awaits cannot see a stale value. */
  function isOpen(): boolean {
    return state !== 'closed';
  }

  function clearCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function clearSilence() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  /** Starts counting down; when it hits zero the session closes on its own. */
  function startCountdown() {
    clearCountdown();
    deadline = Date.now() + countdownMs;
    emit('countdown', Math.ceil(countdownMs / 1000));
    countdownTimer = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      if (left <= 0) {
        clearCountdown();
        close('timeout');
        return;
      }
      emit('countdown', Math.ceil(left / 1000));
    }, 250);
    // Keep the mic armed during the countdown: that is what makes it feel live.
    arm();
  }

  function stopRecognizer() {
    if (!rec) return;
    const r = rec;
    rec = null;
    recRunning = false;
    try {
      r.onresult = r.onerror = r.onend = null;
      r.abort();
    } catch {
      /* already stopped */
    }
  }

  /**
   * Opens the microphone device itself. SpeechRecognition does not reliably capture
   * audio unless the page has obtained a media stream first; without this the
   * recognizer starts and then never emits a single event.
   * The track is released immediately: recognition has its own capture by then.
   */
  async function primeMicrophone(): Promise<boolean> {
    if (microphoneReady) return true;
    if (!navigator?.mediaDevices?.getUserMedia) return true; // let the recognizer try
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      stream.getTracks().forEach((track) => track.stop());
      microphoneReady = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Opens a recognizer if the session is open and nothing is speaking.
   * Called again from onend, which is how the session survives the browser's
   * own silence timeout.
   */
  function arm() {
    const SR = speechRecognition();
    if (state === 'closed' || muted || recRunning || !SR) return;
    if (state === 'thinking') return; // never listen while waiting on the answer
    if (!microphoneReady && !priming) {
      // Opening the device is async, and it is what makes the recognizer hear anything.
      // It must never block the session: if it fails, recognition still starts and the
      // recognizer reports its own error.
      priming = true;
      void primeMicrophone().then((ok) => {
        priming = false;
        if (!ok) {
          options.onError?.('Microphone is blocked. Allow mic access for this site, then tap again.');
        }
        arm();
      });
      return;
    }
    if (priming) return; // the priming callback will arm the recognizer
    stopRecognizer();
    rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;

    // Interim results repeat with a growing transcript, so appending each one
    // duplicates words ("New" + "New York" + "New York City" ...). Interim
    // replaces, final appends once. Buffer is the full current transcript.
    rec.onresult = (event: any) => {
      const start = typeof event.resultIndex === 'number' ? event.resultIndex : 0;
      let freshFinal = '';
      let freshInterim = '';
      for (let i = start; i < event.results.length; i++) {
        if (event.results[i].isFinal) freshFinal += ` ${event.results[i][0].transcript}`;
        else freshInterim = event.results[i][0].transcript;
      }
      if (freshFinal) {
        committed = normalize(`${committed} ${freshFinal}`);
        interimText = freshInterim;
      } else if (freshInterim) {
        interimText = freshInterim;
      }
      buffer = normalize(`${committed} ${interimText}`);
      clearSilence();
      if (buffer) silenceTimer = setTimeout(() => submit(buffer), silenceMs);
    };

    // A browser-initiated end starts the next recognizer with an empty result list, so
    // anything already heard is carried over rather than lost.
    rec.onend = () => {
      recRunning = false;
      rec = null;
      if (state === 'closed' || state === 'thinking' || muted) return;
      // The browser closed the recognizer on its own; keep the session live.
      setTimeout(() => arm(), 250);
    };

    try {
      rec.start();
      recRunning = true;
    } catch {
      recRunning = false;
    }
  }

  /** Mutes the mic while the assistant speaks, so it never transcribes itself. */
  function mute() {
    muted = true;
    clearSilence();
    stopRecognizer();
  }

  function unmute() {
    muted = false;
    if (state === 'listening' || state === 'countdown') arm();
  }

  async function submit(transcript: string) {
    const text = transcript.trim();
    buffer = '';
    committed = '';
    interimText = '';
    clearSilence();
    if (!text || state === 'closed') return;
    if (state === 'thinking') return;

    // The mic only runs inside an open session, so anything said here is for the
    // assistant. A leading "Pagos" is accepted and dropped, never required.
    const command = stripWake(text) ?? text;

    clearCountdown();
    const intent = parseIntent(command);
    const token = ++turnToken;

    if (!intent) return;

    if (intent.kind === 'end') {
      options.onUserText?.(command);
      options.onNotice?.(confirmIntent(intent) || '');
      close('spoken');
      return;
    }

    if (intent.kind === 'zoom' || intent.kind === 'pan') {
      options.onUserText?.(command);
      options.run(intent);
      const line = confirmIntent(intent);
      if (line) options.onNotice?.(line);
      startCountdown();
      return;
    }

    // A real question: stop listening, hand it to the backend, then count down.
    options.onUserText?.(text);
    emit('thinking');
    mute();
    // close() can run while the answer is in flight, so re-read the live state.
    const stillOpen = () => token === turnToken && isOpen();
    try {
      const reply = await options.ask(intent.text);
      if (!stillOpen()) return;
      if (reply) options.onNotice?.(reply);
    } catch {
      if (!stillOpen()) return;
      options.onError?.('That took too long. Try again or tap the mic.');
    }
    if (!stillOpen()) return;
    unmute();
    startCountdown();
  }

  function open() {
    if (state !== 'closed') return;
    if (!speechRecognition()) {
      options.onError?.('Voice input is not supported in this browser. Try Chrome.');
      return;
    }
    buffer = '';
    committed = '';
    interimText = '';
    muted = false;
    emit('listening', 0);
    arm();
  }

  /** Ends the session. The reason is accepted for callers that log it. */
  function close(_reason?: string) {
    turnToken++;
    clearCountdown();
    clearSilence();
    stopRecognizer();
    buffer = '';
    committed = '';
    interimText = '';
    muted = false;
    emit('closed', 0);
  }

  return {
    open,
    close,
    /** Exposed for the UI: the assistant is about to speak. */
    mute,
    unmute,
    state: () => state,
    isOpen,
  };
}
