/**
 * Meta Model API Client - Spatial Query Engine
 *
 * Implements `sendSpatialQuery` using Meta's `muse-spark-1.3` model with automatic
 * `muse-spark-1.2` fallback, structured JSON parsing, and Server-Sent Events (SSE)
 * streaming support as specified in the Meta Model API specifications.
 */

import { EventItem } from '../types';

export const PRIMARY_MODEL = 'muse-spark-1.3';
export const FALLBACK_MODEL = 'muse-spark-1.2';
export const DEFAULT_META_BASE_URL = 'https://api.meta.ai/v1';

export interface SpatialViewportContext {
  lat?: number;
  lng?: number;
  altitudeMeters?: number;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  bounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export interface SpatialLocation {
  name: string;
  lat: number;
  lon: number;
  label?: string;
  altitudeMeters?: number;
  description?: string;
}

export interface SpatialAction {
  type: 'fly_to' | 'toggle_radar' | 'toggle_alerts';
  lat?: number;
  lon?: number;
  label?: string;
  altitudeMeters?: number;
  enabled?: boolean;
}

export interface SpatialStreamChunk {
  delta: string;
  accumulatedText: string;
  done: boolean;
  parsedJson?: Record<string, unknown> | null;
}

export interface SpatialQueryRequest {
  query: string;
  viewport?: SpatialViewportContext;
  events?: EventItem[];
  history?: Array<{
    role: 'user' | 'assistant' | 'developer' | 'system';
    content: string;
  }>;
  stream?: boolean;
  onChunk?: (chunk: SpatialStreamChunk) => void;
  responseFormat?: 'json_schema' | 'json_object' | 'text';
  jsonSchema?: Record<string, unknown>;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  timeoutMs?: number;
}

export interface SpatialQueryResult {
  text: string;
  parsedJson: Record<string, unknown> | null;
  actions: SpatialAction[];
  flyTo: { lat: number; lon: number; label?: string; altitudeMeters?: number } | null;
  toggleRadar: boolean | null;
  toggleAlerts: boolean | null;
  locations: SpatialLocation[];
  modelUsed: string;
  fallbackTriggered: boolean;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
}

/**
 * Default JSON Schema for Spatial Queries on the 3D globe.
 */
export const DEFAULT_SPATIAL_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Concise 1-3 sentence natural language response to the user.',
    },
    fly_to: {
      type: 'object',
      description: '3D Globe camera flight target coordinates.',
      properties: {
        lat: { type: 'number', description: 'Latitude between -90 and 90' },
        lon: { type: 'number', description: 'Longitude between -180 and 180' },
        label: { type: 'string', description: 'Display name or city label' },
        altitude_meters: { type: 'number', description: 'Camera target altitude in meters' },
      },
      required: ['lat', 'lon'],
    },
    toggle_radar: {
      type: 'boolean',
      description: 'true to activate live RainViewer rain radar, false to deactivate.',
    },
    toggle_alerts: {
      type: 'boolean',
      description: 'true to show GDACS/JTWC emergency hazard alerts, false to hide.',
    },
    locations: {
      type: 'array',
      description: 'List of relevant geographical venues, cities, or landmarks mentioned.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          lat: { type: 'number' },
          lon: { type: 'number' },
          description: { type: 'string' },
        },
        required: ['name', 'lat', 'lon'],
      },
    },
  },
  required: ['summary'],
};

/**
 * Builds the high-precedence developer/system prompt incorporating spatial viewport context.
 */
export function buildSpatialDeveloperPrompt(
  viewport?: SpatialViewportContext,
  events?: EventItem[]
): string {
  const parts: string[] = [
    'You are Muse, the spatial intelligence engine for FreshAddy, a 3D Earth globe application.',
    'Help users discover live music, festivals, venues, weather radar, and emergency hazards worldwide.',
    'Always provide concrete, accurate geographic coordinates for places mentioned.',
    'When a user asks to navigate, explore, or zoom to a place, specify flight coordinates.',
    'When the user mentions rain, storms, or weather, set toggle_radar accordingly.',
    'When the user mentions natural disasters, cyclones, earthquakes, or emergencies, set toggle_alerts accordingly.',
  ];

  if (viewport && (viewport.lat !== undefined || viewport.lng !== undefined)) {
    const latStr = viewport.lat !== undefined ? viewport.lat.toFixed(4) : 'unknown';
    const lngStr = viewport.lng !== undefined ? viewport.lng.toFixed(4) : 'unknown';
    const altStr = viewport.altitudeMeters ? `${Math.round(viewport.altitudeMeters)}m` : 'orbital';
    const zoomStr = viewport.zoom ? viewport.zoom.toFixed(1) : 'space';
    parts.push(
      `Current 3D globe camera viewport: lat=${latStr}, lng=${lngStr}, altitude=${altStr}, zoom=${zoomStr}.`
    );
  }

  if (events && events.length > 0) {
    const sample = events
      .slice(0, 10)
      .map((e) => `• ${e.title} (${e.city}, ${e.country}) @ [${e.lat}, ${e.lng}]`)
      .join('\n');
    parts.push(`Current active events on the globe:\n${sample}`);
  }

  return parts.join('\n');
}

/**
 * Robust JSON parser that handles pure JSON, markdown fenced blocks, or embedded objects.
 */
export function parseSpatialJson(rawText: string): Record<string, unknown> | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();

  // 1. Direct parse attempt
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // continue
  }

  // 2. Markdown fenced json: ```json ... ```
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // continue
    }
  }

  // 3. Extract outermost { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const snippet = trimmed.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(snippet);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Extracts normalized actions from parsed spatial JSON or natural text.
 */
function extractSpatialActions(
  parsed: Record<string, unknown> | null,
  rawText: string
): {
  actions: SpatialAction[];
  flyTo: { lat: number; lon: number; label?: string; altitudeMeters?: number } | null;
  toggleRadar: boolean | null;
  toggleAlerts: boolean | null;
  locations: SpatialLocation[];
} {
  const actions: SpatialAction[] = [];
  let flyTo: { lat: number; lon: number; label?: string; altitudeMeters?: number } | null = null;
  let toggleRadar: boolean | null = null;
  let toggleAlerts: boolean | null = null;
  const locations: SpatialLocation[] = [];

  if (parsed) {
    // Normalize keys to handle whitespace or model dialect artifacts (e.g. 'toggle_radar ')
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const cleanK = k.toLowerCase().trim();
      normalized[cleanK] = v;
      const stripped = cleanK.replace(/[^a-z_]/g, '');
      if (stripped) normalized[stripped] = v;
    }

    // 1. Check fly_to
    const flyVal: any =
      normalized['fly_to'] ||
      normalized['flyto'] ||
      Object.entries(normalized).find(([k]) => k.startsWith('fly_to') || k.startsWith('flyto'))?.[1];

    if (flyVal && typeof flyVal === 'object') {
      const lat = typeof flyVal.lat === 'number' ? flyVal.lat : typeof flyVal.latitude === 'number' ? flyVal.latitude : null;
      const lon = typeof flyVal.lon === 'number' ? flyVal.lon : typeof flyVal.lng === 'number' ? flyVal.lng : typeof flyVal.longitude === 'number' ? flyVal.longitude : null;
      if (lat !== null && lon !== null) {
        flyTo = {
          lat,
          lon,
          label: typeof flyVal.label === 'string' ? flyVal.label : typeof flyVal.name === 'string' ? flyVal.name : undefined,
          altitudeMeters: typeof flyVal.altitude_meters === 'number' ? flyVal.altitude_meters : undefined,
        };
        actions.push({
          type: 'fly_to',
          lat,
          lon,
          label: flyTo.label,
          altitudeMeters: flyTo.altitudeMeters,
        });
      }
    }

    // 2. Check radar toggle
    const radarVal: any =
      normalized['toggle_radar'] ||
      normalized['radar'] ||
      Object.entries(normalized).find(([k]) => k.includes('radar'))?.[1];
    if (typeof radarVal === 'boolean') {
      toggleRadar = radarVal;
      actions.push({ type: 'toggle_radar', enabled: radarVal });
    }

    // 3. Check alerts toggle
    const alertsVal: any =
      normalized['toggle_alerts'] ||
      normalized['alerts'] ||
      Object.entries(normalized).find(([k]) => k.includes('alert'))?.[1];
    if (typeof alertsVal === 'boolean') {
      toggleAlerts = alertsVal;
      actions.push({ type: 'toggle_alerts', enabled: alertsVal });
    }

    // 4. Check locations
    const locsVal: any =
      normalized['locations'] ||
      Object.entries(normalized).find(([k]) => k.startsWith('location'))?.[1];
    if (Array.isArray(locsVal)) {
      locsVal.forEach((loc: any) => {
        if (loc) {
          const lat = typeof loc.lat === 'number' ? loc.lat : typeof loc.latitude === 'number' ? loc.latitude : null;
          const lon = typeof loc.lon === 'number' ? loc.lon : typeof loc.lng === 'number' ? loc.lng : typeof loc.longitude === 'number' ? loc.longitude : null;
          if (lat !== null && lon !== null) {
            locations.push({
              name: String(loc.name || loc.label || 'Location'),
              lat,
              lon,
              description: typeof loc.description === 'string' ? loc.description : undefined,
            });
          }
        }
      });
    }
  }

  // Fallback heuristic for coordinates if json parsing produced no fly_to but rawText has coordinates
  if (!flyTo) {
    const coordMatch = rawText.match(/([-+]?\d{1,2}\.\d+)\s*,\s*([-+]?\d{1,3}\.\d+)/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        flyTo = { lat, lon };
        actions.push({ type: 'fly_to', lat, lon });
      }
    }
  }

  return { actions, flyTo, toggleRadar, toggleAlerts, locations };
}

/**
 * Resolves the API key from request, environment variables, or client fallback.
 */
function resolveApiKey(explicitKey?: string): string {
  if (explicitKey && explicitKey.trim()) return explicitKey.trim();

  // Vite browser env
  try {
    const viteKey = (import.meta as any).env?.VITE_META_API_KEY || (import.meta as any).env?.VITE_MODEL_API_KEY;
    if (viteKey && typeof viteKey === 'string' && !viteKey.startsWith('PASTE_')) {
      return viteKey.trim();
    }
  } catch {}

  // Node environment
  if (typeof process !== 'undefined' && process.env) {
    const nodeKey = process.env.MODEL_API_KEY || process.env.MUSE_KEY_1 || '';
    if (nodeKey && !nodeKey.startsWith('PASTE_')) {
      return nodeKey.trim();
    }
  }

  return '';
}

/**
 * Execute request against Meta Model API chat completions endpoint.
 */
async function executeChatRequest(
  model: string,
  request: SpatialQueryRequest,
  apiKey: string,
  baseUrl: string
): Promise<{ text: string; usage: any }> {
  const isStreaming = Boolean(request.stream && request.onChunk);
  const responseFormatType = request.responseFormat || 'json_schema';

  const messages: any[] = [
    {
      role: 'developer',
      content: buildSpatialDeveloperPrompt(request.viewport, request.events),
    },
    ...(request.history || []),
    {
      role: 'user',
      content: request.query,
    },
  ];

  const payload: Record<string, unknown> = {
    model,
    messages,
    stream: isStreaming,
  };

  if (request.reasoningEffort) {
    payload.reasoning_effort = request.reasoningEffort;
  }

  // Response format configuration
  if (responseFormatType === 'json_schema') {
    payload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'SpatialQueryResult',
        schema: request.jsonSchema || DEFAULT_SPATIAL_SCHEMA,
      },
    };
  } else if (responseFormatType === 'json_object') {
    payload.response_format = { type: 'json_object' };
  }

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs || 28000);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} from ${model}: ${errText.slice(0, 300)}`);
    }

    // 1. Streaming response (SSE)
    if (isStreaming && response.body) {
      let accumulatedText = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // comments/keepalives

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              break;
            }

            try {
              const data = JSON.parse(dataStr);
              const delta = data.choices?.[0]?.delta?.content || '';
              if (delta) {
                accumulatedText += delta;
                if (request.onChunk) {
                  request.onChunk({
                    delta,
                    accumulatedText,
                    done: false,
                    parsedJson: parseSpatialJson(accumulatedText),
                  });
                }
              }
            } catch {
              // skip unparseable SSE chunks
            }
          }
        }
      }

      if (request.onChunk) {
        request.onChunk({
          delta: '',
          accumulatedText,
          done: true,
          parsedJson: parseSpatialJson(accumulatedText),
        });
      }

      return { text: accumulatedText, usage: null };
    }

    // 2. Buffered response
    const json: any = await response.json();
    const text = json.choices?.[0]?.message?.content || '';
    const usage = json.usage
      ? {
          promptTokens: json.usage.prompt_tokens,
          completionTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens,
        }
      : null;

    return { text, usage };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fallback via internal /api/muse/chat proxy when calling from the client without direct keys.
 */
async function executeViaProxy(
  request: SpatialQueryRequest
): Promise<SpatialQueryResult> {
  const response = await fetch('/api/muse/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: request.query,
      history: request.history,
      events: request.events?.slice(0, 10).map((e) => ({
        title: e.title,
        city: e.city,
        date: e.date,
        lat: e.lat,
        lng: e.lng,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Proxy error: ${response.status}`);
  }

  const data: any = await response.json();
  const rawText = data.text || '';
  const parsed = parseSpatialJson(rawText);
  const actions: SpatialAction[] = (data.actions || []).map((a: any) => ({
    type: a.type,
    lat: a.lat,
    lon: a.lon,
    label: a.label,
    enabled: a.enabled,
  }));

  const firstFly = actions.find((a) => a.type === 'fly_to');
  const radarAct = actions.find((a) => a.type === 'toggle_radar');
  const alertsAct = actions.find((a) => a.type === 'toggle_alerts');

  return {
    text: rawText,
    parsedJson: parsed,
    actions,
    flyTo: firstFly && typeof firstFly.lat === 'number' && typeof firstFly.lon === 'number'
      ? { lat: firstFly.lat, lon: firstFly.lon, label: firstFly.label }
      : null,
    toggleRadar: radarAct && typeof radarAct.enabled === 'boolean' ? radarAct.enabled : null,
    toggleAlerts: alertsAct && typeof alertsAct.enabled === 'boolean' ? alertsAct.enabled : null,
    locations: [],
    modelUsed: PRIMARY_MODEL,
    fallbackTriggered: false,
    usage: null,
  };
}

/**
 * Primary spatial query function:
 * Executes a spatial reasoning query using `muse-spark-1.3` with automatic fallback to
 * `muse-spark-1.2`, providing JSON parsing and streaming support.
 */
export async function sendSpatialQuery(
  request: SpatialQueryRequest
): Promise<SpatialQueryResult> {
  const apiKey = resolveApiKey(request.apiKey);
  const baseUrl = request.baseUrl || DEFAULT_META_BASE_URL;
  const requestedModel = request.model || PRIMARY_MODEL;

  // If no direct API key is found in browser runtime, route via the secure backend proxy
  if (!apiKey && typeof window !== 'undefined') {
    try {
      return await executeViaProxy(request);
    } catch (proxyErr) {
      console.warn('[metaModelClient] Proxy attempt failed, attempting direct fetch:', proxyErr);
    }
  }

  // 1. Attempt Primary Model (muse-spark-1.3)
  try {
    const { text, usage } = await executeChatRequest(requestedModel, request, apiKey, baseUrl);
    const parsedJson = parseSpatialJson(text);
    const { actions, flyTo, toggleRadar, toggleAlerts, locations } = extractSpatialActions(
      parsedJson,
      text
    );

    // If summary field exists in JSON, use summary as user-facing text
    const displayText =
      parsedJson && typeof parsedJson.summary === 'string' ? parsedJson.summary : text;

    return {
      text: displayText,
      parsedJson,
      actions,
      flyTo,
      toggleRadar,
      toggleAlerts,
      locations,
      modelUsed: requestedModel,
      fallbackTriggered: false,
      usage,
    };
  } catch (primaryErr: any) {
    // If the caller explicitly requested a specific model (or fallback is not needed), rethrow
    if (request.model && request.model !== PRIMARY_MODEL) {
      throw primaryErr;
    }

    console.warn(
      `[metaModelClient] Primary model ${PRIMARY_MODEL} encountered error: "${primaryErr.message || primaryErr}". Falling back to ${FALLBACK_MODEL}...`
    );

    // 2. Attempt Fallback Model (muse-spark-1.2)
    try {
      const { text, usage } = await executeChatRequest(FALLBACK_MODEL, request, apiKey, baseUrl);
      const parsedJson = parseSpatialJson(text);
      const { actions, flyTo, toggleRadar, toggleAlerts, locations } = extractSpatialActions(
        parsedJson,
        text
      );

      const displayText =
        parsedJson && typeof parsedJson.summary === 'string' ? parsedJson.summary : text;

      return {
        text: displayText,
        parsedJson,
        actions,
        flyTo,
        toggleRadar,
        toggleAlerts,
        locations,
        modelUsed: FALLBACK_MODEL,
        fallbackTriggered: true,
        usage,
      };
    } catch (fallbackErr: any) {
      console.error(
        `[metaModelClient] Both ${PRIMARY_MODEL} and ${FALLBACK_MODEL} failed:`,
        fallbackErr
      );
      throw new Error(
        `Meta Model API spatial query failed on ${PRIMARY_MODEL} and fallback ${FALLBACK_MODEL}: ${fallbackErr.message || fallbackErr}`
      );
    }
  }
}
