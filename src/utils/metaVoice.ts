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

export function stopAddyVoicePlayback() {
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

export function speakWithAddyVoice(text: string, voice = 'af_heart') {
  const clean = text.replace(/[*#_`~]/g, '').trim();
  if (!clean || typeof window === 'undefined') return;
  stopAddyVoicePlayback();

  const bridgeBase = (import.meta as any).env?.VITE_VOICE_BRIDGE_URL || '';
  if (bridgeBase) {
    try {
      const url = `${String(bridgeBase).replace(/\/+$/, '')}/tts?text=${encodeURIComponent(
        clean.slice(0, 500)
      )}&voice=${encodeURIComponent(voice)}`;
      const audio = new Audio(url);
      activeAudio = audio;
      audio.onerror = () => {
        activeAudio = null;
        speakBrowserFallback(clean);
      };
      audio.play().catch(() => {
        activeAudio = null;
        speakBrowserFallback(clean);
      });
      return;
    } catch {
      // fall through
    }
  }

  speakBrowserFallback(clean);
}

function speakBrowserFallback(clean: string) {
  try {
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(clean.slice(0, 450));
      utter.rate = 1.04;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    }
  } catch {}
}
