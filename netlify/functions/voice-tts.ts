/**
 * Live voice proxy: POST { text, voice? } -> audio/wav.
 *
 * Forwards to the Mac voice runner through a Cloudflare tunnel. The target comes from
 * LOCAL_VOICE_TUNNEL_URL so a new tunnel address never needs a code change: update the
 * Netlify environment variable and redeploy is not required for the value to update.
 *
 * Answers 503 with a JSON body whenever the runner is missing or down, which is the signal
 * the client turns into its browser-speech fallback.
 */
const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

export const handler = async (event: {
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
}) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Accept either name so a rename in the dashboard cannot silently disable voice.
  const target = (process.env.LOCAL_VOICE_TUNNEL_URL || process.env.VOICE_TUNNEL_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!target) return json(503, { error: 'voice_runner_not_configured' });

  let body: { text?: string; voice?: string } = {};
  try {
    let raw = event.body || '{}';
    if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
  if (!text) return json(400, { error: 'nothing_to_say' });
  const voice = typeof body.voice === 'string' && body.voice.trim() ? body.voice.trim() : 'af_bella';

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(`${target}/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}`, {
      method: 'GET', // the runner's GET form takes the query directly; no CORS involved
      signal: ctl.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return json(503, { error: `voice_runner_error`, status: res.status, detail: detail.slice(0, 200) });
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.byteLength < 44) return json(503, { error: 'voice_runner_empty' });
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audio.byteLength),
        'Cache-Control': 'no-store',
        'X-Voice-Engine': 'kokoro',
        'X-Voice-Id': voice,
      },
      body: audio.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err: any) {
    return json(503, { error: 'voice_runner_unreachable', detail: String(err?.message || err).slice(0, 200) });
  } finally {
    clearTimeout(timer);
  }
};
