import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Dynamic pool of live events broadcasted across the planet
const LIVE_EVENT_POOL = [
  {
    id: 'live-ev-1',
    title: 'Kyoto Arashiyama Lantern Soundwave',
    city: 'Kyoto',
    country: 'Japan',
    date: 'Tonight · Live Now',
    category: 'Ambient & Spatial',
    tags: ['#LiveNow', '#Lanterns', '#Ambient'],
    venue: 'Arashiyama Bamboo Grove / Tenryu-ji',
    lat: 35.0116,
    lng: 135.6778,
    image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=80',
    description: 'Bespoke hydrophone recordings and traditional koto acoustics reverberating across illuminated night bamboo canopies.',
    attendees: 1420,
    weather: 'Crisp evening · 16°C',
    featured: true,
  },
  {
    id: 'live-ev-2',
    title: 'Seoul Hongdae Underground Bass Cypher',
    city: 'Seoul',
    country: 'South Korea',
    date: 'Tonight · Broadcasting Live',
    category: 'Bass & Cypher',
    tags: ['#LiveNow', '#Bass', '#KUnderground'],
    venue: 'Club Soap Seoul / Itaewon B1',
    lat: 37.5348,
    lng: 126.9946,
    image: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=800&q=80',
    description: 'Live multi-mic cypher and heavy 808 subs streamed with binaural spatial audio directly to connected globe nodes.',
    attendees: 2180,
    weather: 'Clear night · 15°C',
    featured: true,
  },
  {
    id: 'live-ev-3',
    title: 'Reykjavik Aurora Borealis Dome Live Session',
    city: 'Reykjavik',
    country: 'Iceland',
    date: 'Tonight · Aurora Peak',
    category: 'Modular Drone',
    tags: ['#LiveNow', '#Aurora', '#Modular'],
    venue: 'Harpa Concert Hall Geodesic Terrace',
    lat: 64.1504,
    lng: -21.9328,
    image: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=800&q=80',
    description: 'Glacial synthesizer drones synchronized with real-time geomagnetic sky sensors under vivid green northern lights.',
    attendees: 980,
    weather: 'Starlit · 2°C · KP 6 Aurora',
    featured: true,
  },
  {
    id: 'live-ev-4',
    title: 'Amsterdam NDSM Crane Warehouse Rave',
    city: 'Amsterdam',
    country: 'Netherlands',
    date: 'Tonight · Secret Location',
    category: 'Underground Techno',
    tags: ['#LiveNow', '#Warehouse', '#Industrial'],
    venue: 'NDSM Werf Sub-dock 4',
    lat: 52.3995,
    lng: 4.8936,
    image: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=800&q=80',
    description: 'Raw analog synthesizers and strobes inside repurposed industrial shipyard hangar with 360-degree holographic visuals.',
    attendees: 3120,
    weather: 'Light rain · 11°C',
    featured: true,
  },
  {
    id: 'live-ev-5',
    title: 'San Francisco Presidio Fog Horizon Audio Lab',
    city: 'San Francisco',
    country: 'United States',
    date: 'Tonight · Sunset Session',
    category: 'Chilled Downtempo',
    tags: ['#LiveNow', '#FogHorns', '#Downtempo'],
    venue: 'Fort Point Historic Vaults',
    lat: 37.8107,
    lng: -122.4770,
    image: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=800&q=80',
    description: 'Analog tape loops harmonized with live Golden Gate bridge fog horns and deep sub-bass acoustic sensors.',
    attendees: 1650,
    weather: 'Pacific fog · 13°C',
    featured: true,
  },
  {
    id: 'live-ev-6',
    title: 'Melbourne St Kilda Rooftop Sunset Dub',
    city: 'Melbourne',
    country: 'Australia',
    date: 'Tonight · Live Broadcast',
    category: 'Dub & Sound System',
    tags: ['#LiveNow', '#SoundSystem', '#Dub'],
    venue: 'St Kilda Pier Horizon Deck',
    lat: -37.8640,
    lng: 144.9723,
    image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
    description: 'Handcrafted custom valve sound system warming the coastal breeze with deep roots dub and melodic brass improv.',
    attendees: 1890,
    weather: 'Seaside breeze · 21°C',
    featured: true,
  },
];

let refreshCounter = 0;

// API endpoint for live events pull-to-refresh
app.get('/api/events/live', (_req: Request, res: Response) => {
  refreshCounter++;
  const batchSize = 2;
  const startIndex = ((refreshCounter - 1) * batchSize) % LIVE_EVENT_POOL.length;
  const picked = [];

  for (let i = 0; i < batchSize; i++) {
    const item = LIVE_EVENT_POOL[(startIndex + i) % LIVE_EVENT_POOL.length];
    picked.push({
      ...item,
      id: `${item.id}-sync-${Date.now()}-${i}`,
      attendees: item.attendees + Math.floor(Math.random() * 90),
    });
  }

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    refreshCount: refreshCounter,
    events: picked,
    message: `Discovered ${picked.length} new live events on planetary mesh`,
  });
});

// ---------------------------------------------------------------------------
// Meta Muse chat (server side only: the key is read from .env.muse and never sent to the client)
// Same approach as God's Eye TV: OpenAI-compatible chat/completions with tool calling.
// ---------------------------------------------------------------------------
function loadMuseConfig() {
  let key = process.env.MODEL_API_KEY || process.env.MUSE_KEY_1 || '';
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '.env.muse'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?(MODEL_API_KEY|MUSE_KEY_1)\s*=\s*(.*)\s*$/);
      if (m) key = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    /* no .env.muse: Muse stays disabled and the client falls back to local search */
  }
  if (key.startsWith('PASTE_')) key = '';
  return {
    key,
    baseUrl: process.env.META_API_BASE_URL || 'https://api.meta.ai/v1',
    model: process.env.MUSE_DEFAULT_MODEL || 'muse-spark-1.3-contributor',
  };
}

const MUSE_SYSTEM_PROMPT = `You are Muse, the assistant inside FreshAddy, a 3D globe app for discovering live music, festivals, nightlife, weather radar, and GDACS/JTWC emergency alerts.
Keep answers short (1-3 sentences), friendly and concrete. Use the event list provided as context when it fits.
When the user wants to see or go to a place, call the fly_to tool with that place's latitude, longitude and a short label.
When the user asks to turn on/off rain radar or weather radar, call toggle_radar.
When the user asks to show/hide emergency alerts, cyclone alerts, or hazard alerts, call toggle_alerts.
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
  {
    type: 'function',
    function: {
      name: 'toggle_radar',
      description: 'Turn the live Rain Radar overlay on or off on the 3D globe.',
      parameters: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', description: 'true to enable rain radar, false to disable' },
        },
        required: ['enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_alerts',
      description: 'Turn the GDACS / JTWC / USGS Emergency Alerts layer (with 20-day post-expiry awareness) on or off on the 3D globe.',
      parameters: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', description: 'true to enable emergency alerts, false to disable' },
        },
        required: ['enabled'],
      },
    },
  },
];

app.post('/api/muse/chat', async (req: Request, res: Response) => {
  const cfg = loadMuseConfig();
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1000) : '';
  if (!message) return res.status(400).json({ error: 'message required' });
  if (!cfg.key) return res.status(503).json({ error: 'muse_not_configured' });

  const history: Array<{ role: string; content: string }> = Array.isArray(req.body?.history)
    ? req.body.history
        .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-6)
        .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 800) }))
    : [];
  const eventContext = Array.isArray(req.body?.events)
    ? req.body.events
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
  const actions: Array<
    | { type: 'fly_to'; lat: number; lon: number; label: string }
    | { type: 'toggle_radar'; enabled: boolean }
    | { type: 'toggle_alerts'; enabled: boolean }
  > = [];
  const scrub = (t: string) => t.split(cfg.key).join('***').slice(0, 300);

  try {
    let text = '';
    for (let turn = 0; turn < 3; turn++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({ model: cfg.model, messages, tools: MUSE_TOOLS, tool_choice: 'auto' }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      if (!r.ok) {
        const body = scrub(await r.text().catch(() => ''));
        return res.status(502).json({ error: 'muse_upstream_error', upstreamStatus: r.status, detail: body });
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
          } else if (call.function?.name === 'toggle_radar') {
            actions.push({ type: 'toggle_radar', enabled: args.enabled !== false });
          } else if (call.function?.name === 'toggle_alerts') {
            actions.push({ type: 'toggle_alerts', enabled: args.enabled !== false });
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: true }) });
        }
      } else {
        text = typeof msg.content === 'string' ? msg.content : '';
        break;
      }
    }
    if (!text && actions.length > 0) {
      const first = actions[0];
      if (first.type === 'fly_to') text = `Taking you to ${first.label || 'that spot'}.`;
      else if (first.type === 'toggle_radar') text = `Rain Radar turned ${first.enabled ? 'on' : 'off'}.`;
      else if (first.type === 'toggle_alerts') text = `Emergency Alerts turned ${first.enabled ? 'on' : 'off'}.`;
    }
    return res.json({ text: text || 'Muse had no answer for that.', actions });
  } catch (err: any) {
    return res.status(502).json({ error: 'muse_request_failed', detail: scrub(String(err?.message || err)) });
  }
});

app.post('/api/voice/transcribe', async (req: Request, res: Response) => {
  const cfg = loadMuseConfig();
  if (!cfg.key) return res.status(503).json({ error: 'muse_voice_not_configured' });

  const rawBase64 = typeof req.body?.audioBase64 === 'string'
    ? req.body.audioBase64.replace(/^data:audio\/[\w+-]+;base64,/, '').trim()
    : '';
  if (!rawBase64) return res.status(400).json({ error: 'audioBase64 required' });

  const sessionId =
    typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()
      ? req.body.sessionId.trim().slice(0, 80)
      : `addyfresh-voice-${Date.now()}`;
  const model = process.env.MUSE_VOICE_MODEL || 'muse-voice-transcribe-1.0';
  const scrub = (t: string) => t.split(cfg.key).join('***').slice(0, 400);

  try {
    const wavBytes = Buffer.from(rawBase64, 'base64');
    if (wavBytes.byteLength < 44) {
      return res.status(400).json({ error: 'audio_too_short' });
    }

    const form = new FormData();
    form.append(
      'request',
      new Blob([JSON.stringify({ mode: 'PUSH_TO_TALK', model, audioEncoding: 'WAV' })], {
        type: 'application/json',
      })
    );
    form.append('audio', new Blob([wavBytes], { type: 'audio/wav' }), 'audio.wav');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const upstreamUrl = `${cfg.baseUrl.replace(/\/+$/, '')}/asr/transcribe?sessionId=${encodeURIComponent(sessionId)}`;

    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}` },
      body: form,
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      const errText = scrub(await response.text().catch(() => ''));
      return res.status(502).json({ error: 'muse_asr_upstream_error', upstreamStatus: response.status, detail: errText });
    }

    const data: any = await response.json();
    return res.json({
      sessionId: data?.sessionId || sessionId,
      transcript: typeof data?.transcript === 'string' ? data.transcript.trim() : '',
      audioDurationMs: data?.audioDurationMs ?? null,
      turns: Array.isArray(data?.turns) ? data.turns : [],
    });
  } catch (err: any) {
    return res.status(502).json({ error: 'muse_asr_request_failed', detail: scrub(String(err?.message || err)) });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
