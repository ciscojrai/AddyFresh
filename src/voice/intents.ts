/**
 * Spoken-intent parser for the Pagos voice layer.
 *
 * Pure functions only: no DOM, no network, no timers. That makes every rule here
 * unit-testable, which matters because the rest of the voice loop needs a microphone
 * and a browser to exercise.
 *
 * Pipeline: raw transcript -> stripWake() -> parseIntent() -> VoiceIntent.
 * The caller dispatches local intents itself and sends `ask` to the chat backend.
 */

/** The assistant's name, as spoken. One place to change it. */
export const ASSISTANT_NAME = 'Pagos';

export type VoiceIntent =
  | { kind: 'zoom'; dir: 'in' | 'out' }
  | { kind: 'pan'; dir: 'left' | 'right' }
  | { kind: 'end'; reason: 'spoken' }
  | { kind: 'ask'; text: string };

/** True when the phrase names the assistant, alone or with a greeting before it. Recognizes both Pagos and Muse. */
const WAKE_RE = new RegExp(`\\b(?:hey\\s+|hi\\s+|ok\\s+|okay\\s+)?(?:pagos|muse)\\b`, 'i');

/**
 * Words that end a conversation. The whole utterance must be the closing phrase, so
 * "stop the rain radar" stays a command and only a lone "stop" ends the session.
 */
const END_RE = /^(?:(?:pagos|muse)\s+)?(?:end|stop|quit|exit|cancel|hang\s*up|bye|bye\s*bye|goodbye|never\s*mind)(?:\s+(?:the\s+)?(?:chat|conversation|session|voice|now))?$/i;

const ZOOM_IN_RE = /\b(?:zoom\s*(?:in|closer|deeper)|closer|zoom\s+it\s+in|come\s+closer)\b/i;
const ZOOM_OUT_RE = /\b(?:zoom\s*(?:out|back|wider)|further\s+out|farther\s+out|back\s+out|zoom\s+out\s+a\s+bit)\b/i;
const PAN_LEFT_RE = /\b(?:left|go\s+left|move\s+left|look\s+left|pan\s+left)\b/i;
const PAN_RIGHT_RE = /\b(?:right|go\s+right|move\s+right|look\s+right|pan\s+right)\b/i;

/** Collapse whitespace and drop leading/trailing punctuation that ASR likes to add. */
export function normalize(transcript: string): string {
  return String(transcript || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, '')
    .trim();
}

/** True when the transcript contains the wake phrase anywhere in it. */
export function hasWake(transcript: string): boolean {
  return WAKE_RE.test(normalize(transcript));
}

/**
 * Removes the wake phrase (and the greeting in front of it) from a transcript.
 * "Hey Pagos, zoom in" -> "zoom in". "Hey Pagos" alone -> "".
 * Returns null when no wake phrase is present, so callers can tell "not for me" apart
 * from "addressed to me with nothing after it".
 */
export function stripWake(transcript: string): string | null {
  const text = normalize(transcript);
  if (!WAKE_RE.test(text)) return null;
  // Drop everything up to and including the name: ASR often puts filler before it.
  const after = text.replace(/^.*?\b(?:pagos|muse)\b[,\s]*/i, '');
  return normalize(after);
}

/**
 * Parses a command that has already been addressed to the assistant (wake stripped).
 * Order matters: negatives and terminal words are checked before positives, so
 * "stop the radar" never matches a zoom rule and "zoom out" never matches "zoom in".
 */
export function parseIntent(command: string): VoiceIntent | null {
  const text = normalize(command);
  if (!text) return null;
  if (END_RE.test(text)) return { kind: 'end', reason: 'spoken' };
  if (ZOOM_OUT_RE.test(text)) return { kind: 'zoom', dir: 'out' };
  if (ZOOM_IN_RE.test(text)) return { kind: 'zoom', dir: 'in' };
  if (PAN_RIGHT_RE.test(text) && !/\bright\s+now\b/i.test(text)) return { kind: 'pan', dir: 'right' };
  if (PAN_LEFT_RE.test(text)) return { kind: 'pan', dir: 'left' };
  return { kind: 'ask', text };
}

/**
 * The one entry point the conversation layer calls.
 * - No wake phrase -> null (the utterance was not addressed to the assistant).
 * - Wake phrase with nothing after it -> { kind: 'wake' } with empty command.
 * - Wake phrase plus a command -> the parsed intent.
 */
export function listenForIntent(
  transcript: string,
): { intent: VoiceIntent | null; command: string; woke: boolean } {
  const command = stripWake(transcript);
  if (command === null) return { intent: null, command: '', woke: false };
  return { intent: parseIntent(command), command, woke: true };
}

/** A short spoken confirmation for a local intent, or null when it needs no reply. */
export function confirmIntent(intent: VoiceIntent | null): string | null {
  if (!intent) return null;
  switch (intent.kind) {
    case 'zoom':
      return intent.dir === 'in' ? 'Zooming in.' : 'Pulling back.';
    case 'pan':
      return intent.dir === 'left' ? 'Moving left.' : 'Moving right.';
    case 'end':
      return 'Ending the voice session.';
    default:
      return null;
  }
}
