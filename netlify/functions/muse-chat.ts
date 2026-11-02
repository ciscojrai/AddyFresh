const MUSE_SYSTEM_PROMPT = `You are Muse, the assistant inside FreshAddy, a 3D globe app for discovering live music, festivals and nightlife.
Keep answers short (1-3 sentences), friendly and concrete. Use the event list provided as context when it fits.
When the user wants to see or go to a place, call the fly_to tool with that place's latitude, longitude and a short label.
Do not invent ticket prices or times that are not in the context.`;

const MUSE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fly_to',
      description: 'Move the FreshAddy globe to a place.',
      parameters: {
        type: 'object',
        properties: {
          lat: { type: 'number', description: 'Latitude' },
          lon: { type: 'number', description: 'Longitude' },
          label: { type: 'string', description: 'Short place label, e.g. Tokyo' },
        },
        required: ['lat', 'lon', 'label'],
      },
    },
  },
];

export const handler = async (event: { httpMethod?: string; body?: string | null }) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  const key = (process.env.MODEL_API_KEY || process.env.MUSE_KEY_1 || '').trim();
  const baseUrl = process.env.META_API_BASE_URL || 'https://api.meta.ai/v1';
  const model = process.env.MUSE_DEFAULT_MODEL || 'muse-spark-1.3-contributor';

  let parsedBody: any = {};
  try {
    parsedBody = event.body ? JSON.parse(event.body) : {};
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_json' }) };
  }

  const message = typeof parsedBody?.message === 'string' ? parsedBody.message.trim().slice(0, 1000) : '';
  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'message required' }) };
  }
  if (!key || key.startsWith('PASTE_')) {
    return { statusCode: 503, body: JSON.stringify({ error: 'muse_not_configured' }) };
  }

  const history: Array<{ role: string; content: string }> = Array.isArray(parsedBody?.history)
    ? parsedBody.history
        .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-6)
        .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 800) }))
    : [];

  const eventContext = Array.isArray(parsedBody?.events)
    ? parsedBody.events
        .slice(0, 12)
        .map((e: any) => `${String(e.title).slice(0, 80)} (${String(e.city)}, ${String(e.date)}) lat=${e.lat} lng=${e.lng}`)
        .join('\n')
    : '';

  const messages: any[] = [
    { role: 'system', content: MUSE_SYSTEM_PROMPT },
    ...(eventContext ? [{ role: 'system', content: `Events currently on the globe:\n${eventContext}` }] : []),
    ...history,
    { role: 'user', content: message },
  ];

  const actions: Array<{ type: 'fly_to'; lat: number; lon: number; label: string }> = [];
  const scrub = (t: string) => t.split(key).join('***').slice(0, 300);

  try {
    let text = '';
    for (let turn = 0; turn < 3; turn++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, tools: MUSE_TOOLS, tool_choice: 'auto' }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));

      if (!r.ok) {
        const body = scrub(await r.text().catch(() => ''));
        return {
          statusCode: 502,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'muse_upstream_error', upstreamStatus: r.status, detail: body }),
        };
      }

      const data: any = await r.json();
      const msg = data?.choices?.[0]?.message;
      if (!msg) break;
      messages.push(msg);

      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        for (const call of msg.tool_calls) {
          let args: any = {};
          try {
            args = JSON.parse(call.function?.arguments || '{}');
          } catch {
            /* ignore */
          }
          if (call.function?.name === 'fly_to' && Number.isFinite(args.lat) && Number.isFinite(args.lon)) {
            actions.push({ type: 'fly_to', lat: args.lat, lon: args.lon, label: String(args.label || '') });
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: true }) });
        }
      } else {
        text = typeof msg.content === 'string' ? msg.content : '';
        break;
      }
    }

    if (!text && actions.length > 0) text = `Taking you to ${actions[0].label || 'that spot'}.`;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text || 'Muse had no answer for that.', actions }),
    };
  } catch (err: any) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'muse_request_failed', detail: scrub(String(err?.message || err)) }),
    };
  }
};

