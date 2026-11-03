/**
 * Meta Model API Voice Recorder, ASR Transcriber (`muse-voice-transcribe-1.0`),
 * and `voices_addyfresh` TTS Bridge / SpeechSynthesis speaker.
 *
 * Audio format required by `POST https://api.meta.ai/v1/asr/transcribe`:
 * - Container: RIFF/WAVE (`audio/wav`)
 * - Encoding: 16-bit signed integer PCM (`pcm_s16le`)
 * - Sample rate: 24000 Hz (or 16000 Hz)
 * - Channels: 1 (mono)
 */

const TARGET_SAMPLE_RATE = 24000;

function writeAscii(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function encodeMono16BitWav(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): ArrayBuffer {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const dataByteLength = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, 'WAVE');

  // fmt sub-chunk (16-bit PCM mono)
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true); // SampleRate (24000 Hz)
  view.setUint32(28, sampleRate * bytesPerSample, true); // ByteRate
  view.setUint16(32, bytesPerSample, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample (16)

  // data sub-chunk
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outSampleRate: number): Float32Array {
  if (outSampleRate === inputSampleRate) return buffer;
  const ratio = inputSampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

export interface MetaVoiceCaptureHandle {
  stopAndTranscribe: () => Promise<string>;
  cancel: () => void;
}

export async function startMetaVoiceCapture(
  onInterimText?: (text: string) => void
): Promise<MetaVoiceCaptureHandle> {
  let interimTranscript = '';
  const SpeechRec: any =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : undefined;
  let speechRec: any = null;

  if (SpeechRec) {
    try {
      speechRec = new SpeechRec();
      speechRec.lang = navigator.language || 'en-US';
      speechRec.interimResults = true;
      speechRec.continuous = false;
      speechRec.onresult = (ev: any) => {
        let txt = '';
        for (let i = 0; i < ev.results.length; i++) {
          txt += ev.results[i][0].transcript;
        }
        interimTranscript = txt.trim();
        onInterimText?.(interimTranscript);
      };
      speechRec.onerror = () => {};
      speechRec.start();
    } catch {
      speechRec = null;
    }
  }

  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  const recordedChunks: Float32Array[] = [];
  let inputSampleRate = TARGET_SAMPLE_RATE;

  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioCtx();
      inputSampleRate = audioCtx.sampleRate || 48000;
      sourceNode = audioCtx.createMediaStreamSource(stream);
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        recordedChunks.push(new Float32Array(input));
      };
      sourceNode.connect(processor);
      processor.connect(audioCtx.destination);
    } catch {
      // If getUserMedia fails or is blocked, we still have speechRec fallback
    }
  }

  const cleanup = () => {
    try {
      speechRec?.stop?.();
    } catch {}
    try {
      processor?.disconnect();
      sourceNode?.disconnect();
    } catch {}
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    } catch {}
  };

  return {
    cancel: () => {
      cleanup();
    },
    stopAndTranscribe: async (): Promise<string> => {
      cleanup();

      const totalLength = recordedChunks.reduce((acc, c) => acc + c.length, 0);
      if (totalLength > 1200) {
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of recordedChunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        const resampled = downsampleBuffer(merged, inputSampleRate, TARGET_SAMPLE_RATE);
        const wavBuffer = encodeMono16BitWav(resampled, TARGET_SAMPLE_RATE);
        const audioBase64 = arrayBufferToBase64(wavBuffer);

        try {
          const res = await fetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64,
              sessionId: `addyfresh-${Date.now()}`,
              keywords: ['AddyFresh', 'FreshAddy', 'Tokyo', 'Cesium', 'Rain Radar', 'GDACS', 'Alerts'],
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (typeof data?.transcript === 'string' && data.transcript.trim()) {
              return data.transcript.trim();
            }
          }
        } catch {
          // Fall back to interimTranscript if offline
        }
      }

      return interimTranscript.trim();
    },
  };
}

let activeAudio: HTMLAudioElement | null = null;
let playbackToken = 0;

/** Which engine actually spoke, so the UI can say so instead of guessing. */
export type AddyVoiceSource = 'bridge' | 'server' | 'browser';

export type AddyVoiceReport = {
  source: AddyVoiceSource;
  /** Human label for the UI, e.g. "Bella (bridge)". */
  label: string;
  /** Why the Bella attempts failed, when the browser voice had to take over. */
  reason?: string;
  at: number;
};

let lastReport: AddyVoiceReport | null = null;
let reportListener: ((r: AddyVoiceReport) => void) | null = null;

const LABELS: Record<AddyVoiceSource, string> = {
  bridge: 'Bella (bridge)',
  server: 'Bella (server)',
  browser: 'Browser voice',
};

/** The most recent report, or null before anything has spoken. */
export function lastAddyVoiceReport(): AddyVoiceReport | null {
  return lastReport;
}

/** Subscribe to every report. Returns an unsubscribe function. */
export function onAddyVoiceReport(fn: ((r: AddyVoiceReport) => void) | null) {
  reportListener = fn;
  return () => {
    if (reportListener === fn) reportListener = null;
  };
}

function report(source: AddyVoiceSource, reason?: string): AddyVoiceReport {
  const next: AddyVoiceReport = { source, label: LABELS[source], reason, at: Date.now() };
  lastReport = next;
  try {
    reportListener?.(next);
  } catch {}
  return next;
}

export function stopAddyVoicePlayback() {
  playbackToken++;
  try {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.src = '';
      activeAudio = null;
    }
  } catch {}
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {}
}

/** The bridge URL compiled into the bundle, if any. */
export function configuredBridgeUrl(): string {
  const env = (import.meta as any).env || {};
  return String(env.VITE_VOICE_BRIDGE_URL || '').trim().replace(/\/+$/, '');
}

/** A failure the caller can show, instead of a silent null. */
type Attempt = { ok: true; url: string } | { ok: false; reason: string };

async function fetchWav(url: string, init: RequestInit, what: string): Promise<Attempt> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      let coded = '';
      try {
        coded = JSON.parse(detail)?.error || '';
      } catch {}
      return { ok: false, reason: `${what} answered HTTP ${res.status}${coded ? ` (${coded})` : ''}` };
    }
    const body = await res.arrayBuffer();
    if (body.byteLength < 44) return { ok: false, reason: `${what} returned an empty clip` };
    return { ok: true, url: URL.createObjectURL(new Blob([body], { type: 'audio/wav' })) };
  } catch (err: any) {
    const message = String(err?.message || err);
    // A CORS or connection failure surfaces as a bare TypeError; name the common cause.
    const hint = /Failed to fetch|NetworkError|Load failed/i.test(message)
      ? ` - is the voice bridge running and allowed to accept this origin?`
      : '';
    return { ok: false, reason: `${what} unreachable: ${message}${hint}` };
  }
}

/**
 * Gets Bella audio, in order: the bridge compiled into the build, then the same-origin
 * Netlify function. Both are real Kokoro. Only if both fail does the caller hear the
 * browser voice, and then it reports why.
 */
async function fetchBellaAudio(clean: string, voice: string, signal: AbortSignal): Promise<Attempt & { source?: AddyVoiceSource }> {
  const reasons: string[] = [];
  const text = clean.slice(0, 900);

  const bridge = configuredBridgeUrl();
  if (bridge) {
    const url = `${bridge}/tts?text=${encodeURIComponent(text.slice(0, 500))}&voice=${encodeURIComponent(voice)}`;
    const got = await fetchWav(url, { method: 'GET', signal }, `voice bridge ${bridge}`);
    if (got.ok) return { ...got, source: 'bridge' };
    reasons.push(got.reason);
  } else {
    reasons.push('VITE_VOICE_BRIDGE_URL is not set');
  }

  const got = await fetchWav(
    '/api/voice/tts',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice }), signal },
    '/api/voice/tts',
  );
  if (got.ok) return { ...got, source: 'server' };
  reasons.push(got.reason);

  return { ok: false, reason: reasons.join('; ') };
}

/** True when either Bella path is reachable right now. Never throws. */
export async function addyVoiceAvailable(): Promise<{ ok: boolean; detail: string }> {
  if (typeof window === 'undefined') return { ok: false, detail: 'no window' };
  const bridge = configuredBridgeUrl();
  if (bridge) {
    try {
      const res = await fetch(`${bridge}/health`);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: Boolean(data?.ok), detail: `bridge ${bridge}` };
      }
      return { ok: false, detail: `bridge answered HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, detail: `bridge unreachable: ${err?.message || err}` };
    }
  }
  try {
    const res = await fetch('/api/voice/health');
    const data = await res.json().catch(() => ({}));
    return { ok: Boolean(data?.ok), detail: '/api/voice/health' };
  } catch (err: any) {
    return { ok: false, detail: `server unreachable: ${err?.message || err}` };
  }
}

export function speakWithAddyVoice(text: string, voice = 'af_bella') {
  const clean = text.replace(/[*#_`~]/g, '').trim();
  if (!clean || typeof window === 'undefined') return;
  stopAddyVoicePlayback();
  const token = playbackToken;

  const ctl = new AbortController();
  fetchBellaAudio(clean, voice, ctl.signal)
    .then((got) => {
      if (token !== playbackToken) {
        if (got.ok) URL.revokeObjectURL(got.url);
        return; // a newer answer already took the floor
      }
      if (!got.ok) {
        report('browser', got.reason);
        speakBrowserFallback(clean);
        return;
      }
      const audio = new Audio(got.url);
      activeAudio = audio;
      const release = () => {
        URL.revokeObjectURL(got.url);
        if (activeAudio === audio) activeAudio = null;
      };
      audio.onended = release;
      audio.onerror = () => {
        release();
        report('browser', 'Bella played back as an error; using the browser voice');
        speakBrowserFallback(clean);
      };
      audio.play().then(
        () => report(got.source || 'server'),
        (err: any) => {
          release();
          report('browser', `audio was blocked by the browser (${err?.message || err})`);
          speakBrowserFallback(clean);
        },
      );
    })
    .catch((err: any) => {
      if (token !== playbackToken) return;
      report('browser', `voice request failed: ${err?.message || err}`);
      speakBrowserFallback(clean);
    });
}

function speakBrowserFallback(clean: string) {
  try {
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(clean.slice(0, 450));
      utter.rate = 1.04;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
      // Only report here when no caller already explained why Bella was skipped.
      if (!lastReport || lastReport.source !== 'browser') report('browser', 'browser voice used');
    }
  } catch {}
}
