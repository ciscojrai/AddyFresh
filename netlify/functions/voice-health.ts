/** Reports whether the live voice runner is reachable, so the UI can choose an engine. */
const target = () =>
  (process.env.LOCAL_VOICE_TUNNEL_URL || process.env.VOICE_TUNNEL_URL || '').trim().replace(/\/+$/, '');

export const handler = async () => {
  const url = target();
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (!url) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'not_configured' }) };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(`${url}/health`, { signal: ctl.signal });
    const data = await res.json().catch(() => ({}));
    return { statusCode: 200, headers, body: JSON.stringify({ ok: res.ok && Boolean(data?.ok), runner: data }) };
  } catch {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'unreachable' }) };
  } finally {
    clearTimeout(timer);
  }
};
