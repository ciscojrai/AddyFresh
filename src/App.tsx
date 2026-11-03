import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GlobeView } from './components/GlobeView';
import { HomeFeed } from './components/HomeFeed';
import { SearchView } from './components/SearchView';
import { ChatView, ChatConversation } from './components/ChatView';
import { SavedView } from './components/SavedView';
import { FestivalFeed } from './components/FestivalFeed';
import { BottomControls } from './components/BottomControls';
import { EventModal } from './components/EventModal';
import { StreetViewPanel } from './components/StreetViewPanel';
import { PhoneStatusBar } from './components/PhoneStatusBar';
import { EVENTS_DATA, MOODS } from './data/events';
import { FESTIVAL_VIDEOS } from './data/festivalVideos';
import {
  EventItem,
  Mood,
  ActiveNav,
  StreetViewTarget,
} from './types';
import { searchMcpEventsDetailed } from './services/mcpClient';
import * as maplibregl from 'maplibre-gl';
import { addEventPinsToMap } from './mapPins.js';
import { flyCameraToCoordinate } from './cameraFlyer.js';
import { initMapLibreWorker } from './maplibreWorker.ts';
import { GoogleMap3DView } from './components/GoogleMap3DView';
import { ChevronUp, Smartphone, Tablet, Tv, Globe, ArrowLeftRight, ArrowUpDown } from 'lucide-react';
import { useHaptic } from './hooks/useHaptic';
import { speakWithAddyVoice } from './utils/metaVoice';

const INITIAL_CONVERSATIONS: ChatConversation[] = [
  {
    id: 'conv-1',
    title: 'Tokyo Underground & Synthwave',
    pinned: true,
    updatedAt: '2h ago',
    messages: [
      {
        id: 'm1-1',
        sender: 'user',
        text: 'What are the top cyberpunk and synthwave venues in Tokyo right now?',
        timestamp: '10:14 PM',
      },
      {
        id: 'm1-2',
        sender: 'assistant',
        text: 'Top recommendations in Tokyo:\n\n1. Cyberpunk Rooftop Rave at Roppongi Hills Mori Tower\n2. Contact Tokyo in Shibuya B2 for raw modular synthwave\n3. Womb Tokyo for multi-floor visual mapping\n\nClear night weather (18°C) currently reported on rain radar.',
        timestamp: '10:15 PM',
      },
    ],
  },
  {
    id: 'conv-2',
    title: 'Comic-Con 2027 Schedule',
    pinned: true,
    updatedAt: '5h ago',
    messages: [
      {
        id: 'm2-1',
        sender: 'user',
        text: 'Do we have events logged into next year like Comic Con late 2027?',
        timestamp: '8:30 PM',
      },
      {
        id: 'm2-2',
        sender: 'assistant',
        text: 'Yes! Tokyo Comic-Con is scheduled for late November 2027 at Makuhari Messe, alongside San Diego Comic-Con 2027 badge registration lotteries. BigQuery graph indexing has all team aliases and guest panels mapped.',
        timestamp: '8:31 PM',
      },
    ],
  },
  {
    id: 'conv-3',
    title: 'Global Music Festivals Calendar',
    pinned: true,
    updatedAt: '1d ago',
    messages: [
      {
        id: 'm3-1',
        sender: 'user',
        text: 'Summarize the top European music festivals on the globe.',
        timestamp: 'Yesterday',
      },
      {
        id: 'm3-2',
        sender: 'assistant',
        text: '• London Printworks Drum & Bass Open Air\n• Berlin Kraftwerk Techno Marathon\n• Paris Nuit Blanche Sound Installations in Le Marais\n\nAll 3 have glowing pins on your 3D globe.',
        timestamp: 'Yesterday',
      },
    ],
  },
  {
    id: 'conv-4',
    title: 'Berlin Secret Boiler Rooms',
    pinned: false,
    updatedAt: '2h ago',
    messages: [
      {
        id: 'm4-1',
        sender: 'user',
        text: 'Any unlisted industrial techno sessions in Berlin?',
        timestamp: 'Nov 1',
      },
      {
        id: 'm4-2',
        sender: 'assistant',
        text: 'Tresor Berlin and Kraftwerk industrial boiler rooms are tracking 3,400+ attendees going this weekend. Sub-bass rave mood is active on the globe.',
        timestamp: 'Nov 1',
      },
    ],
  },
  {
    id: 'conv-5',
    title: 'Rio Sunset Beach Grooves',
    pinned: false,
    updatedAt: '3h ago',
    messages: [
      {
        id: 'm5-1',
        sender: 'user',
        text: 'Best sunset acoustic vibes in Rio de Janeiro?',
        timestamp: 'Nov 1',
      },
      {
        id: 'm5-2',
        sender: 'assistant',
        text: 'Ipanema Posto 9 sunset jam starts at 17:30 with live bossa fusions and seaside acoustic chill.',
        timestamp: 'Nov 1',
      },
    ],
  },
  {
    id: 'conv-6',
    title: 'Rain Radar Event Advisories',
    pinned: false,
    updatedAt: '4h ago',
    messages: [
      {
        id: 'm6-1',
        sender: 'user',
        text: 'How does rain radar affect outdoor festival alerts?',
        timestamp: 'Nov 1',
      },
      {
        id: 'm6-2',
        sender: 'assistant',
        text: 'When rain radar is toggled on, open-air stadiums in precipitation zones trigger weather advisories in your alerts drawer.',
        timestamp: 'Nov 1',
      },
    ],
  },
];

function generateAiResponse(query: string, events: EventItem[]): string {
  const q = query.toLowerCase();

  if (q.includes('comic') || q.includes('con') || q.includes('2027')) {
    return `Here are the latest updates for Comic-Con & Sci-Fi Expos through 2027:\n\n• San Diego Comic-Con: Summer dates confirmed at the Convention Center.\n• Tokyo Comic-Con (Late 2027): Confirmed for November 2027 at Makuhari Messe with special guest spotlights & international artist alley.\n• Badges & Passes: Pre-registration opens Q1 2027 with multi-day pass lotteries.\n\nAll venues are mapped on your 3D globe with live coordinates.`;
  }

  if (q.includes('tokyo') || q.includes('japan')) {
    return `Tokyo currently has several premier experiences tracked on the globe:\n\n• Cyberpunk Rooftop Rave (Roppongi Hills Mori Tower)\n• Neon Shibuya Underground Beats (Contact Tokyo / Shibuya B2)\n• Akihabara VR Retro Arcade & Tech Summit\n\nRain Radar status: Clear skies, 18°C. Camera perspective is calibrated for 3D orbital view.`;
  }

  if (q.includes('music') || q.includes('techno') || q.includes('rave') || q.includes('berlin')) {
    return `Berlin & European Underground Highlights:\n\n• Kraftwerk Industrial Techno Marathon (Tresor / Mitte)\n• Friedrichshain Sound Lab & Boiler Room session\n• London Drums & Bass Warehouse Rave (Printworks London)\n\nAll venues are glowing on the 3D globe with live atmospheric lighting.`;
  }

  if (q.includes('radar') || q.includes('rain') || q.includes('weather')) {
    return `Global Weather Radar Status:\n\n• Precipitation sweeps active in Western Europe and Southeast Asia.\n• Tokyo & London open-air venues report clear evening conditions.\n• Tap the 🌧 radar button below to project the real-time weather layer over the 3D globe.`;
  }

  const matches = events.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.city.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
  );

  if (matches.length > 0) {
    const list = matches
      .slice(0, 3)
      .map((m) => `• ${m.title} (${m.city}, ${m.country}) · ${m.date}`)
      .join('\n');
    return `Found ${matches.length} experience${matches.length > 1 ? 's' : ''} matching "${query}":\n\n${list}\n\nTap on any event to center the 3D globe and inspect deep links.`;
  }

  return `I searched 149k live experiences for "${query}".\n\nFound curated options across live music, culture, and interactive gatherings. I've logged this to your Recents in the chat sidebar so you can revisit updates or inspect globe pins at any time.`;
}

export default function App() {
  const { triggerPanelToggle, triggerGlobePin, triggerNav } = useHaptic();

  // State
  const [events, setEvents] = useState<EventItem[]>(EVENTS_DATA);
  const [activeMood, setActiveMood] = useState<Mood>(MOODS[0]); // Electric Pulse default
  const [activeNav, setActiveNav] = useState<ActiveNav>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [inspectEvent, setInspectEvent] = useState<EventItem | null>(null);
  const [streetViewTarget, setStreetViewTarget] = useState<StreetViewTarget | null>(null);
  const [likedEventIds, setLikedEventIds] = useState<Set<string>>(
    new Set(['ev-1', 'ev-3'])
  );
  const [isFeedCollapsed, setIsFeedCollapsed] = useState(false);

  // DeepSeek-style Chat state
  const [conversations, setConversations] = useState<ChatConversation[]>(INITIAL_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Netlify MCP connection state

  // Controls state


  // Desktop Preview Utility Bar frame mode

  // Cross-axis swap state (controlled via Globe Position pill toggle: top | bottom | left | right)
  const [isSwapped, setIsSwapped] = useState(false);
  const [sectionHeights, setSectionHeights] = useState({ globe: 0, card: 0 });
  const middleContainerRef = useRef<HTMLDivElement>(null);
  const globeSectionRef = useRef<HTMLElement>(null);
  const cardSectionRef = useRef<HTMLElement>(null);

  // Landscape-wide layout flag (same query as the landscape CSS block in index.css)
  const LANDSCAPE_QUERY = '(min-width: 768px)';
  const [isLandscapeWide, setIsLandscapeWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(LANDSCAPE_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(LANDSCAPE_QUERY);
    const onChange = () => setIsLandscapeWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Screen Target Device Viewport Toggle ('phone' | 'tablet' | 'tv')
  // Default is mobile ('phone') with globe top. Tablet & TV globe only available on right or left.
  const [deviceMode, setDeviceMode] = useState<'auto' | 'phone' | 'tablet' | 'tv'>(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('mode');
      if (param === 'phone' || param === 'tablet' || param === 'tv') return param;
    }
    return 'phone';
  });
  const effectiveDeviceMode: 'phone' | 'tablet' | 'tv' =
    deviceMode === 'auto' ? 'phone' : deviceMode;
  const isHorizontalSplit = effectiveDeviceMode === 'tablet' || effectiveDeviceMode === 'tv';

  // Globe Position Toggle:
  // Mobile default: 'top' (swappable to 'bottom' via AXIS Swap)
  // Tablet & TV: only available on 'right' or 'left' (swappable via AXIS Swap)
  const [globePosition, setGlobePosition] = useState<'top' | 'bottom' | 'left' | 'right'>('top');

  const handleSelectDeviceMode = (target: 'phone' | 'tablet' | 'tv') => {
    triggerPanelToggle();
    setDeviceMode(target);
    if (target === 'phone') {
      setGlobePosition('top');
      setIsSwapped(false);
    } else {
      // Tablet and TV: globe only available on right or left (default right)
      setGlobePosition('right');
      setIsSwapped(false);
    }
  };

  const handleToggleAxisSwap = () => {
    triggerPanelToggle();
    if (effectiveDeviceMode === 'phone') {
      const nextPos = globePosition === 'top' ? 'bottom' : 'top';
      setGlobePosition(nextPos);
      setIsSwapped(nextPos === 'bottom');
    } else {
      // Tablet or TV: flip between right and left
      const nextPos = globePosition === 'left' ? 'right' : 'left';
      setGlobePosition(nextPos);
      setIsSwapped(nextPos === 'left');
    }
  };

  // Track heights for smooth translation swap without collapsing or shrinking
  useEffect(() => {
    const updateHeights = () => {
      if (globeSectionRef.current && cardSectionRef.current) {
        setSectionHeights({
          globe: globeSectionRef.current.offsetHeight,
          card: cardSectionRef.current.offsetHeight,
        });
      }
    };

    updateHeights();
    const frameId = requestAnimationFrame(updateHeights);
    window.addEventListener('resize', updateHeights);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        updateHeights();
      });
      if (middleContainerRef.current) ro.observe(middleContainerRef.current);
      if (globeSectionRef.current) ro.observe(globeSectionRef.current);
      if (cardSectionRef.current) ro.observe(cardSectionRef.current);
    }

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateHeights);
      ro?.disconnect();
    };
  }, [isFeedCollapsed, effectiveDeviceMode, globePosition]);

  // Reset swap when feed is explicitly collapsed so full globe view is consistent
  useEffect(() => {
    if (isFeedCollapsed && isSwapped) {
      setIsSwapped(false);
    }
  }, [isFeedCollapsed, isSwapped]);

  // MapLibre map & Pins state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [topViewMode, setTopViewMode] = useState<'globe' | 'map' | 'photorealistic-3d'>('globe');

  // Initialize MapLibre Map instance
  useEffect(() => {
    if (!mapContainerRef.current) return;
    initMapLibreWorker();
    let mapInstance: maplibregl.Map | null = null;
    try {
      mapInstance = new maplibregl.Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            'carto-dark': {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              ],
              tileSize: 256,
              attribution: '&copy; OpenStreetMap',
            },
          },
          layers: [
            {
              id: 'carto-dark',
              type: 'raster',
              source: 'carto-dark',
            },
          ],
        },
        center: [139.6917, 35.6895], // Tokyo by default
        zoom: 1.5,
        attributionControl: false,
      });

      mapInstance.on('error', (e) => {
        if (e && e.error && e.error.message && e.error.message.includes('Worker')) {
          console.warn('[MapLibre Worker]:', e.error.message);
          return;
        }
        console.warn('[MapLibre]:', e);
      });

      mapInstance.on('load', () => {
        setMap(mapInstance);
        // Only register as primary map if GlobeView hasn't already registered its 3D globe
        if (!(window as any).__freshaddy_globe_active) {
          (window as any).map = mapInstance;
          (window as any).__freshaddy_map = mapInstance;
        }
        // Populate initial event pins to map
        addEventPinsToMap(mapInstance, events);
      });
    } catch (err) {
      console.warn('MapLibre init error:', err);
    }

    return () => {
      if (mapInstance) {
        mapInstance.remove();
      }
    };
  }, []);

  // Sync global view mode & listen for toggle-view-mode events
  useEffect(() => {
    (window as any).__freshaddy_current_mode = topViewMode;
    const handleToggleMode = (e: Event) => {
      const custom = e as CustomEvent<{ mode: 'globe' | 'map' | 'photorealistic-3d' }>;
      if (custom.detail?.mode) {
        setTopViewMode(custom.detail.mode);
        if (custom.detail.mode === 'map' && map) {
          setTimeout(() => map.resize(), 50);
        }
      }
    };

    window.addEventListener('freshaddy:toggle-view-mode', handleToggleMode);
    return () => {
      window.removeEventListener('freshaddy:toggle-view-mode', handleToggleMode);
    };
  }, [topViewMode, map]);

  // Listen for the card open CustomEvent from mapPins:
  useEffect(() => {
    const handleOpenCard = (e: Event) => {
      const customEv = e as CustomEvent<EventItem>;
      if (customEv.detail) {
        setSelectedEvent(customEv.detail);
        setInspectEvent(customEv.detail);
        // Programmatically fly camera to selected event coordinate
        if (typeof customEv.detail.lat === 'number' && typeof customEv.detail.lng === 'number') {
          flyCameraToCoordinate({
            lat: customEv.detail.lat,
            lng: customEv.detail.lng,
            tilt: 60,
            range: 1200,
          });
        }
      }
    };

    window.addEventListener('freshaddy:open-id-card', handleOpenCard);
    return () => {
      window.removeEventListener('freshaddy:open-id-card', handleOpenCard);
    };
  }, []);

  // Fly map when selectedEvent changes
  useEffect(() => {
    if (map && selectedEvent) {
      try {
        map.flyTo({
          center: [selectedEvent.lng, selectedEvent.lat],
          zoom: Math.max(map.getZoom(), 3.5),
          speed: 1.2,
          essential: true,
        });
      } catch {
        // safe
      }
    }
  }, [map, selectedEvent]);


  // Synchronize deep links on page load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const eventIdFromUrl = params.get('event');
      if (eventIdFromUrl) {
        const found = EVENTS_DATA.find((e) => e.id === eventIdFromUrl);
        if (found) {
          setSelectedEvent(found);
          setInspectEvent(found);
        }
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, []);

  // Update browser URL query parameter when modal opens or closes
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (inspectEvent) {
        url.searchParams.set('event', inspectEvent.id);
      } else {
        url.searchParams.delete('event');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Ignore history replace errors
    }
  }, [inspectEvent]);

  // Handlers
  const handleSelectEvent = (event: EventItem) => {
    triggerGlobePin();
    setSelectedEvent(event);
    setInspectEvent(event);
  };

  const handleAddNewDiscoveredEvents = (results: EventItem[]) => {
    setEvents((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      const fresh = results.filter((e) => !existingIds.has(e.id));
      // Prepend fresh events to the top of feed so live updates are immediately visible
      return fresh.length > 0 ? [...fresh, ...prev] : prev;
    });

    if (map) {
      addEventPinsToMap(map, results);
    }
  };

  // Pull-to-refresh handler for HomeFeed: queries server endpoint and updates globe & feed
  const handleRefreshHomeFeed = useCallback(async (): Promise<{ count: number; events: EventItem[] }> => {
    try {
      const res = await fetch('/api/events/live');
      if (res.ok) {
        const data = await res.json();
        if (data.events && Array.isArray(data.events) && data.events.length > 0) {
          handleAddNewDiscoveredEvents(data.events);
          return { count: data.events.length, events: data.events };
        }
      }
    } catch (err) {
      console.warn('Live events endpoint fetch error, applying fallback broadcast:', err);
    }

    // High fidelity fallback broadcast ensuring resilient offline/standalone execution
    const fallbackTimestamp = Date.now();
    const fallbackEvents: EventItem[] = [
      {
        id: `live-ev-kyoto-${fallbackTimestamp}`,
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
        attendees: 1420 + Math.floor(Math.random() * 50),
        weather: 'Crisp evening · 16°C',
        featured: true,
      },
      {
        id: `live-ev-seoul-${fallbackTimestamp}`,
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
        attendees: 2180 + Math.floor(Math.random() * 70),
        weather: 'Clear night · 15°C',
        featured: true,
      },
    ];

    handleAddNewDiscoveredEvents(fallbackEvents);
    return { count: fallbackEvents.length, events: fallbackEvents };
  }, [map]);

  const handleToggleLike = (e: React.MouseEvent, event: EventItem) => {
    e.stopPropagation();
    setLikedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(event.id)) {
        next.delete(event.id);
      } else {
        next.add(event.id);
      }
      return next;
    });
  };


  // Search to Chat Flow
  const handleSearchToChat = (query: string) => {
    if (!query.trim()) return;
    const trimmed = query.trim();
    const convId = `conv-${Date.now()}`;
    const aiAnswer = generateAiResponse(trimmed, events);

    searchMcpEventsDetailed({ query: trimmed, domain: 'all', limit: 15 })
      .then((mcpResponse) => {
        if (mcpResponse?.events && mcpResponse.events.length > 0) {
          const results = mcpResponse.events;
          handleAddNewDiscoveredEvents(results);
          if (map) {
            addEventPinsToMap(map, results);
          }
        }
      })
      .catch((err) => console.warn('MCP search during chat query:', err));

    const newConv: ChatConversation = {
      id: convId,
      title: trimmed.length > 28 ? `${trimmed.slice(0, 28)}...` : trimmed,
      pinned: false,
      updatedAt: 'Just now',
      messages: [
        {
          id: `msg-${Date.now()}-u`,
          sender: 'user',
          text: trimmed,
          timestamp: 'Just now',
        },
        {
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: aiAnswer,
          timestamp: 'Just now',
        },
      ],
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(convId);
    setActiveNav('chat');
    setIsFeedCollapsed(false);
    setSearchQuery('');
  };

  // Chat conversation actions
  const handleSendMessageInChat = (conversationId: string, messageText: string) => {
    const stamp = Date.now();
    const userMsg = {
      id: `msg-${stamp}-u`,
      sender: 'user' as const,
      text: messageText,
      timestamp: 'Just now',
    };
    const assistantId = `msg-${stamp}-a`;
    const pendingMsg = {
      id: assistantId,
      sender: 'assistant' as const,
      text: 'Muse is thinking…',
      timestamp: 'Just now',
    };
    const priorMessages = conversations.find((c) => c.id === conversationId)?.messages ?? [];
    const history = priorMessages
      .slice(-6)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, updatedAt: 'Just now', messages: [...c.messages, userMsg, pendingMsg] }
          : c
      )
    );

    const setAssistantText = (text: string) =>
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, messages: c.messages.map((m) => (m.id === assistantId ? { ...m, text } : m)) }
            : c
        )
      );

    // Meta Muse (server-side proxy: /api/muse/chat). On any failure fall back to the local search answer.
    fetch('/api/muse/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messageText,
        history,
        events: events.slice(0, 12).map((e) => ({
          title: e.title,
          city: e.city,
          date: e.date,
          lat: e.lat,
          lng: e.lng,
        })),
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`muse ${r.status}`);
        return r.json();
      })
      .then((data: { text?: string; actions?: Array<{ type: string; lat?: number; lon?: number; enabled?: boolean }> }) => {
        const replyText = data.text || 'Muse had no answer for that.';
        setAssistantText(replyText);
        speakWithAddyVoice(replyText);
        (data.actions || []).forEach((a) => {
          if (a.type === 'fly_to' && typeof a.lat === 'number' && typeof a.lon === 'number') {
            flyCameraToCoordinate({ lat: a.lat, lng: a.lon, target: 'globe' });
          } else if (a.type === 'toggle_radar') {
            window.dispatchEvent(new CustomEvent('freshaddy:set-radar', { detail: { enabled: a.enabled !== false } }));
          } else if (a.type === 'toggle_alerts') {
            window.dispatchEvent(new CustomEvent('freshaddy:set-alerts', { detail: { enabled: a.enabled !== false } }));
          }
        });
      })
      .catch((err) => {
        console.warn('Muse chat unavailable, using local search:', err);
        setAssistantText(`${generateAiResponse(messageText, events)}\n\nMuse offline - showing local results.`);
      });
  };

  const handleNewChat = (initialQuery?: string) => {
    const convId = `conv-${Date.now()}`;
    const initialTitle = initialQuery ? initialQuery.slice(0, 26) : 'New Experience Chat';
    const newConv: ChatConversation = {
      id: convId,
      title: initialTitle,
      pinned: false,
      updatedAt: 'Just now',
      messages: initialQuery
        ? [
            {
              id: `msg-${Date.now()}-u`,
              sender: 'user',
              text: initialQuery,
              timestamp: 'Just now',
            },
            {
              id: `msg-${Date.now()}-a`,
              sender: 'assistant',
              text: generateAiResponse(initialQuery, events),
              timestamp: 'Just now',
            },
          ]
        : [
            {
              id: `msg-${Date.now()}-a`,
              sender: 'assistant',
              text: 'Hello! I am FreshAddy, your 3D globe discovery assistant. Ask me about live music festivals, conventions, sports derbies, or weather radar around the world.',
              timestamp: 'Just now',
            },
          ],
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(convId);
    setActiveNav('chat');
  };

  const handleTogglePin = (id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))
    );
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
  };

  const handleRenameConversation = (id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
    );
  };

  return (
    <div
      data-device={effectiveDeviceMode}
      data-globe-pos={globePosition}
      className="app-shell min-h-screen w-full bg-[#05070e] text-slate-100 flex flex-col items-center justify-center p-0 sm:p-4 select-none font-sans overflow-x-hidden"
    >
      {/* Mobile Screen Container: Exactly 390×844 */}
      <main
        data-swapped={isSwapped ? 'true' : 'false'}
        data-globe-pos={globePosition}
        className="app-main relative flex flex-col overflow-hidden bg-slate-950 transition-all duration-300 w-full max-w-[390px] h-[844px] rounded-none sm:rounded-3xl shadow-2xl border border-slate-800"
      >
        {/* iOS Phone Status Bar (Dynamic Island & Clock) */}
        <div className="app-statusbar"><PhoneStatusBar /></div>

        {/* Cross-Axis Swap Layout Container: Encloses Globe and Feed for smooth vertical swap */}
        <div
          ref={middleContainerRef}
          className="app-middle relative flex-1 min-h-0 w-full flex flex-col overflow-hidden"
        >
          {/* 1. GLOBE & MAP — takes top ~40% of the screen OR expands to full/center screen when collapsed */}
          <section
            ref={globeSectionRef}
            aria-label="3D Interactive Globe and Map"
            data-swap-state={isSwapped ? 'swapped' : 'normal'}
            className={`app-globe relative w-full overflow-hidden touch-none bg-[#070c18] ${
              isFeedCollapsed ? 'flex-1 h-full' : 'h-[40%] shrink-0'
            }`}
            style={{
              transform:
                effectiveDeviceMode === 'phone' && (globePosition === 'bottom' || isSwapped) && (sectionHeights.card > 0 || (middleContainerRef.current?.offsetHeight ?? 0) > 0)
                  ? `translateY(${sectionHeights.card > 0 ? sectionHeights.card : (middleContainerRef.current?.offsetHeight ? middleContainerRef.current.offsetHeight * 0.6 : 472)}px)`
                  : 'translateY(0px)',
              transition: 'transform 450ms cubic-bezier(0.25, 1, 0.5, 1)',
              zIndex: isSwapped ? 25 : 10,
            }}
          >
            {/* Top Tactical Bar: 🌐 GOD'S EYE VIEW | SCREEN TARGET: [ ▯ Mobile ] [ ▭ Tablet ] [ 📺 TV 10' ] | [ AXIS Swap ] */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-2.5 right-3 z-30 flex flex-wrap items-center justify-end gap-1.5 pointer-events-auto max-w-[94%]"
            >
              {/* Screen Target Selector: [ ▯ Mobile ] [ ▭ Tablet ] [ 📺 TV 10' ] */}
              <div
                className="app-device-toggle flex items-center gap-0.5 p-0.5 rounded-full bg-slate-950/85 border border-slate-700/80 backdrop-blur-md shadow-lg"
                role="radiogroup"
                aria-label="Screen Target Selector"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={effectiveDeviceMode === 'phone'}
                  onClick={() => handleSelectDeviceMode('phone')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                    effectiveDeviceMode === 'phone'
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(34,211,238,0.25)]'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                  title="Mobile Portrait View (Globe Top)"
                >
                  <Smartphone size={11} />
                  <span>Mobile</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={effectiveDeviceMode === 'tablet'}
                  onClick={() => handleSelectDeviceMode('tablet')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                    effectiveDeviceMode === 'tablet'
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(34,211,238,0.25)]'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                  title="Tablet Split View (Globe Right or Left only)"
                >
                  <Tablet size={11} />
                  <span>Tablet</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={effectiveDeviceMode === 'tv'}
                  onClick={() => handleSelectDeviceMode('tv')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                    effectiveDeviceMode === 'tv'
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(34,211,238,0.25)]'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                  title="TV 10-Foot UI Mode (Globe Right or Left only)"
                >
                  <Tv size={11} />
                  <span>TV 10&prime;</span>
                </button>
              </div>

              {/* AXIS Swap Pill Button */}
              <button
                type="button"
                onClick={handleToggleAxisSwap}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-950/85 hover:bg-slate-900 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 text-[10px] font-semibold backdrop-blur-md shadow-lg transition-all cursor-pointer active:scale-95"
                title={
                  effectiveDeviceMode === 'phone'
                    ? `AXIS Swap (Current: Globe ${globePosition.toUpperCase()} · Click to swap Top/Bottom)`
                    : `AXIS Swap (Current: Globe ${globePosition.toUpperCase()} · Click to swap Right/Left)`
                }
              >
                {effectiveDeviceMode === 'phone' ? <ArrowUpDown size={11} /> : <ArrowLeftRight size={11} />}
                <span>AXIS Swap</span>
                <span className="font-mono text-[9px] uppercase text-slate-400 pl-0.5">[{globePosition}]</span>
              </button>
            </div>
            {/* MapLibre Map instance for map pins and markers */}
            <div
              ref={mapContainerRef}
              className={`absolute inset-0 transition-opacity duration-300 ${
                topViewMode === 'map' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
              }`}
            />

            {/* 3D Interactive Three.js Globe */}
            <div
              className={`absolute inset-0 transition-opacity duration-300 ${
                topViewMode === 'globe' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              }`}
            >
              <GlobeView
                events={events}
                selectedEvent={selectedEvent}
                onSelectEvent={handleSelectEvent}
                activeMood={activeMood}
                radarActive={false}
                perspective={'3D'}
                themeMode={'dark'}
              />
            </div>

            {/* Photorealistic Google 3D Map */}
            {topViewMode === 'photorealistic-3d' && (
              <div className="absolute inset-0 z-10 pointer-events-auto">
                <GoogleMap3DView
                  selectedEvent={selectedEvent}
                  onSelectEvent={handleSelectEvent}
                  events={events}
                />
              </div>
            )}
          </section>

          {/* 2. SECTION AREA — COLLAPSIBLE WITH TOP HANDLE (includes Nav Bar & Slide-Up Sheets) */}
          <section
            ref={cardSectionRef}
            aria-label="Section Content Panel"
            className={`app-feed relative w-full flex flex-col bg-slate-950 border-x-2 border-t-2 rounded-t-2xl shadow-2xl ${
              isFeedCollapsed
                ? 'shrink-0 cursor-pointer'
                : 'flex-1 min-h-0 overflow-hidden'
            } ${
              activeNav === 'home'
                ? 'border-purple-500 shadow-[inset_0_0_18px_rgba(168,85,247,0.35),0_0_24px_rgba(168,85,247,0.3)]'
                : activeNav === 'play'
                ? 'border-yellow-400 shadow-[inset_0_0_20px_rgba(250,204,21,0.4),0_0_28px_rgba(250,204,21,0.35)]'
                : activeNav === 'search'
                ? 'border-emerald-400 shadow-[inset_0_0_18px_rgba(52,211,153,0.35),0_0_24px_rgba(52,211,153,0.3)]'
                : activeNav === 'chat'
                ? 'border-cyan-400 shadow-[inset_0_0_18px_rgba(34,211,238,0.35),0_0_24px_rgba(34,211,238,0.3)]'
                : 'border-rose-500 shadow-[inset_0_0_20px_rgba(244,63,94,0.4),0_0_28px_rgba(244,63,94,0.35)]'
            }`}
            style={{
              transform:
                effectiveDeviceMode === 'phone' && (globePosition === 'bottom' || isSwapped) && (sectionHeights.globe > 0 || (middleContainerRef.current?.offsetHeight ?? 0) > 0)
                  ? `translateY(-${sectionHeights.globe > 0 ? sectionHeights.globe : (middleContainerRef.current?.offsetHeight ? middleContainerRef.current.offsetHeight * 0.4 : 313)}px)`
                  : 'translateY(0px)',
              transition: 'transform 450ms cubic-bezier(0.25, 1, 0.5, 1)',
              zIndex: isSwapped ? 10 : 25,
            }}
          >
            {/* Top Grab Handle to Collapse / Expand */}
            <div
              onClick={() => {
                triggerPanelToggle();
                setIsFeedCollapsed((prev) => !prev);
              }}
              className={`w-full flex flex-col items-center justify-center ${
                isFeedCollapsed ? 'py-1' : 'pt-2 pb-1'
              } cursor-pointer group hover:bg-slate-900/60 select-none shrink-0`}
              title={isFeedCollapsed ? 'Expand Feed' : 'Collapse Feed to Full Globe'}
            >
              {isFeedCollapsed && (
                <ChevronUp size={12} className="text-slate-400 group-hover:text-cyan-300 -mb-0.5 animate-bounce" />
              )}
              <div
                className={`w-12 h-1.5 rounded-full transition-all duration-200 ${
                  isFeedCollapsed
                    ? 'bg-slate-300 shadow-[0_0_8px_rgba(255,255,255,0.7)] group-hover:bg-white'
                    : 'bg-slate-600 group-hover:bg-slate-400'
                }`}
              />
            </div>

            {/* Feed Content (shown when not collapsed) */}
            {!isFeedCollapsed && (
              <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
                {/* Home Icon: Infinite scrolling feed of ID cards */}
                {activeNav === 'home' && (
                  <HomeFeed
                    events={events}
                    selectedEvent={selectedEvent}
                    likedEventIds={likedEventIds}
                    onSelectEvent={handleSelectEvent}
                    onToggleLike={handleToggleLike}
                    onOpenStreetView={(target) => setStreetViewTarget(target)}
                    onRefresh={handleRefreshHomeFeed}
                  />
                )}

                {/* Play Icon: YouTube Clips of saved music festivals */}
                {activeNav === 'play' && (
                  <FestivalFeed
                    videos={FESTIVAL_VIDEOS}
                    onOpenStreetView={(target) => setStreetViewTarget(target)}
                  />
                )}

                {/* Search Icon: Quick discover & semantic search */}
                {activeNav === 'search' && (
                  <SearchView
                    events={events}
                    onSelectEvent={handleSelectEvent}
                    onSubmitSearch={handleSearchToChat}
                  />
                )}

                {/* Chat Icon: DeepSeek-style AI chat panel */}
                {activeNav === 'chat' && (
                  <ChatView
                    conversations={conversations}
                    activeConversationId={activeConversationId}
                    onSelectConversation={(id) => setActiveConversationId(id)}
                    onSendMessage={handleSendMessageInChat}
                    onNewChat={handleNewChat}
                    onTogglePin={handleTogglePin}
                    onDeleteConversation={handleDeleteConversation}
                    onRenameConversation={handleRenameConversation}
                    events={events}
                  />
                )}

                {/* Heart (Liked) Icon: List of liked ID cards */}
                {activeNav === 'likes' && (
                  <SavedView
                    events={events}
                    likedEventIds={likedEventIds}
                    selectedEvent={selectedEvent}
                    onSelectEvent={handleSelectEvent}
                    onToggleLike={handleToggleLike}
                    onOpenStreetView={(target) => setStreetViewTarget(target)}
                  />
                )}
              </div>
            )}

            {/* 3. BOTTOM CONTROLS (Moves with section area so it sits below feed when swapped to top) */}
            <div className="app-controls shrink-0">
              <BottomControls
                activeNav={activeNav}
                onNavChange={(nav) => {
                  triggerNav();
                  setActiveNav(nav);
                  setIsFeedCollapsed(false);
                }}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSubmitSearch={handleSearchToChat}
                likedCount={likedEventIds.size}
              />
            </div>

            {/* Home Indicator line (iOS native cue) */}
            <div className="app-homeind w-full bg-slate-950 flex justify-center pb-2 pt-0 shrink-0">
              <div className="w-32 h-1 bg-slate-700/80 rounded-full" />
            </div>

            {/* Event Detail Sheet Modal (expands upward from bottom of section) */}
            <EventModal
              event={inspectEvent}
              isLiked={inspectEvent ? likedEventIds.has(inspectEvent.id) : false}
              onToggleLike={handleToggleLike}
              onClose={() => setInspectEvent(null)}
              onCenterOnGlobe={(ev) => {
                setSelectedEvent(ev);
              }}
              onOpenStreetView={(target) => setStreetViewTarget(target)}
            />

            {/* Street View Slide-Up Panel (expands upward from bottom of section) */}
            <StreetViewPanel
              target={streetViewTarget}
              onClose={() => setStreetViewTarget(null)}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
