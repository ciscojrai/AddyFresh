export const handler = async (event: {
  httpMethod?: string;
  body?: string | null;
}) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'method_not_allowed' }),
    };
  }

  const key = (process.env.MODEL_API_KEY || process.env.MUSE_KEY_1 || '').trim();
  const baseUrl = (process.env.META_API_BASE_URL || 'https://api.meta.ai/v1').replace(/\/+$/, '');
  const model = process.env.MUSE_VOICE_MODEL || 'muse-voice-transcribe-1.0';

  if (!key || key.startsWith('PASTE_')) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'muse_voice_not_configured' }),
    };
  }

  let parsedBody: {
    audioBase64?: string;
    sessionId?: string;
    languageBias?: string[];
    keywords?: string[];
  } = {};

  try {
    parsedBody = event.body ? JSON.parse(event.body) : {};
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_json' }),
    };
  }

  const rawBase64 = typeof parsedBody.audioBase64 === 'string'
    ? parsedBody.audioBase64.replace(/^data:audio\/[\w+-]+;base64,/, '').trim()
    : '';

  if (!rawBase64) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'audioBase64 required (16kHz or 24kHz mono 16-bit PCM WAV)' }),
    };
  }

  const sessionId =
    typeof parsedBody.sessionId === 'string' && parsedBody.sessionId.trim()
      ? parsedBody.sessionId.trim().slice(0, 80)
      : `addyfresh-voice-${Date.now()}`;

  const scrub = (t: string) => t.split(key).join('***').slice(0, 400);

  try {
    const wavBytes = Buffer.from(rawBase64, 'base64');
    if (wavBytes.byteLength < 44) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'audio_too_short' }),
      };
    }

    const requestPayload: Record<string, unknown> = {
      mode: 'PUSH_TO_TALK',
      model,
      audioEncoding: 'WAV',
    };

    if (Array.isArray(parsedBody.languageBias) && parsedBody.languageBias.length > 0) {
      requestPayload.languageBias = parsedBody.languageBias.slice(0, 5);
    }
    if (Array.isArray(parsedBody.keywords) && parsedBody.keywords.length > 0) {
      requestPayload.keywords = parsedBody.keywords.slice(0, 50);
    }

    const form = new FormData();
    form.append(
      'request',
      new Blob([JSON.stringify(requestPayload)], { type: 'application/json' })
    );
    form.append(
      'audio',
      new Blob([wavBytes], { type: 'audio/wav' }),
      'audio.wav'
    );

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);

    const upstreamUrl = `${baseUrl}/asr/transcribe?sessionId=${encodeURIComponent(sessionId)}`;
    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: form,
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      const errText = scrub(await response.text().catch(() => ''));
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'muse_asr_upstream_error',
          upstreamStatus: response.status,
          detail: errText,
        }),
      };
    }

    const data: any = await response.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: data?.sessionId || sessionId,
        transcript: typeof data?.transcript === 'string' ? data.transcript.trim() : '',
        audioDurationMs: data?.audioDurationMs ?? null,
        turns: Array.isArray(data?.turns) ? data.turns : [],
      }),
    };
  } catch (err: any) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'muse_asr_request_failed',
        detail: scrub(String(err?.message || err)),
      }),
    };
  }
};
