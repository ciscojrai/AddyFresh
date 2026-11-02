import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GlobeView } from './components/GlobeView';
import { MoodMover } from './components/MoodMover';
import { HomeFeed } from './components/HomeFeed';
import { SearchView } from './components/SearchView';
import { ChatView, ChatConversation } from './components/ChatView';
import { SavedView } from './components/SavedView';
import { FestivalFeed } from './components/FestivalFeed';
import { BottomControls } from './components/BottomControls';
import { EventModal } from './components/EventModal';
import { StreetViewPanel } from './components/StreetViewPanel';
import { PhoneStatusBar } from './components/PhoneStatusBar';
import { McpInfoModal } from './components/McpInfoModal';
import { EVENTS_DATA, MOODS } from './data/events';
import { FESTIVAL_VIDEOS } from './data/festivalVideos';
import {
  EventItem,
  Mood,
  ActiveNav,
  StreetViewTarget,
} from './types';
import { getMcpServerStatus, McpServerInfo, searchMcpEventsDetailed } from './services/mcpClient';
import * as maplibregl from 'maplibre-gl';
import { addEventPinsToMap } from './mapPins.js';
import { flyCameraToCoordinate } from './cameraFlyer.js';
import { initMapLibreWorker } from './maplibreWorker.ts';
import { GoogleMap3DView } from './components/GoogleMap3DView';
import { Smartphone, Maximize2, Radio, ChevronUp } from 'lucide-react';
import { useHaptic } from './hooks/useHaptic';

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
  const [mcpServerInfo, setMcpServerInfo] = useState<McpServerInfo | null>(null);
  const [isMcpConnecting, setIsMcpConnecting] = useState(false);
  const [mcpModalOpen, setMcpModalOpen] = useState(false);

  // Controls state


  // Desktop Preview Utility Bar frame mode
  const [showFrameBezel, setShowFrameBezel] = useState(true);

  // Cross-axis drag swap state (between 3D globe and bottom card section)
  const [isSwapped, setIsSwapped] = useState(false);
  const isSwappedRef = useRef(false);
  const [sectionHeights, setSectionHeights] = useState({ globe: 0, card: 0 });
  const middleContainerRef = useRef<HTMLDivElement>(null);
  const globeSectionRef = useRef<HTMLElement>(null);
  const cardSectionRef = useRef<HTMLElement>(null);
  const isTouchMultiRef = useRef(false);

  // Pointer tracking refs for cross-axis drag swap: reset to null onPointerUp
  const startCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const lastCoordsRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    isSwappedRef.current = isSwapped;
  }, [isSwapped]);

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
    if (middleContainerRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        updateHeights();
      });
      ro.observe(middleContainerRef.current);
    }

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateHeights);
      ro?.disconnect();
    };
  }, [isFeedCollapsed]);

  // Reset swap when feed is explicitly collapsed so full globe view is consistent
  useEffect(() => {
    if (isFeedCollapsed && isSwapped) {
      setIsSwapped(false);
    }
  }, [isFeedCollapsed, isSwapped]);

  // Touch handlers for multi-touch (pinch-zoom) isolation
  const handleGlobeTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length > 1) {
      isTouchMultiRef.current = true;
    }
  };

  const handleGlobeTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length <= 1) {
      isTouchMultiRef.current = false;
    }
  };

  // Resets both pointer tracking refs to null every time
  const handleGlobePointerUp = () => {
    startCoordsRef.current = null;
    lastCoordsRef.current = null;
  };

  // Cross-axis pointer drag handler for the globe section
  const handleGlobePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || isTouchMultiRef.current) return;

    startCoordsRef.current = { x: e.clientX, y: e.clientY };
    lastCoordsRef.current = { x: e.clientX, y: e.clientY };
    let triggered = false;

    const handleWindowPointerMove = (moveEv: PointerEvent) => {
      if (triggered || isTouchMultiRef.current || !startCoordsRef.current || !lastCoordsRef.current) return;

      const currentX = moveEv.clientX;
      const currentY = moveEv.clientY;
      const prevX = lastCoordsRef.current.x;
      const prevY = lastCoordsRef.current.y;
      lastCoordsRef.current = { x: currentX, y: currentY };

      // Incremental movement for this step
      const stepDx = currentX - prevX;
      const stepDy = currentY - prevY;

      // Direction check uses fresh start coords each move:
      // If the incremental move is predominantly horizontal, refresh start coordinates
      if (Math.abs(stepDx) >= Math.abs(stepDy)) {
        startCoordsRef.current = { x: currentX, y: currentY };
        return;
      }

      // Check displacement from the freshly established start coordinates
      const dy = currentY - startCoordsRef.current.y;
      const dx = currentX - startCoordsRef.current.x;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // Horizontal check against fresh start coords: if horizontal motion dominates, refresh start coords
      if (absX >= absY) {
        startCoordsRef.current = { x: currentX, y: currentY };
        return;
      }

      // Must be predominantly vertical drag
      if (absY < absX * 1.2) return;

      // Deliberate upward drag past forty-pixel threshold triggers swap
      if (!isSwappedRef.current && dy <= -40) {
        triggered = true;
        setIsSwapped(true);
        triggerPanelToggle();
        cleanup();
      }
      // When swapped, deliberate downward (or upward) drag past forty-pixel threshold swaps back
      else if (isSwappedRef.current && (dy >= 40 || dy <= -40)) {
        triggered = true;
        setIsSwapped(false);
        triggerPanelToggle();
        cleanup();
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
      // onPointerUp resets both refs to null every time
      startCoordsRef.current = null;
      lastCoordsRef.current = null;
    };

    const handleWindowPointerUp = () => {
      // onPointerUp resets both refs to null every time
      startCoordsRef.current = null;
      lastCoordsRef.current = null;
      cleanup();
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
  };

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
        (window as any).map = mapInstance;
        (window as any).__freshaddy_map = mapInstance;
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


  // Connect to Netlify MCP on startup
  const connectToMcp = useCallback(async () => {
    setIsMcpConnecting(true);
    try {
      const info = await getMcpServerStatus();
      setMcpServerInfo(info);
    } catch (err) {
      console.warn('Could not establish initial MCP connection to Netlify:', err);
    } finally {
      setIsMcpConnecting(false);
    }
  }, []);

  useEffect(() => {
    connectToMcp();
  }, [connectToMcp]);

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
    const aiAnswer = generateAiResponse(messageText, events);
    const userMsg = {
      id: `msg-${Date.now()}-u`,
      sender: 'user' as const,
      text: messageText,
      timestamp: 'Just now',
    };
    const assistantMsg = {
      id: `msg-${Date.now()}-a`,
      sender: 'assistant' as const,
      text: aiAnswer,
      timestamp: 'Just now',
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              updatedAt: 'Just now',
              messages: [...c.messages, userMsg, assistantMsg],
            }
          : c
      )
    );
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
    <div className="min-h-screen w-full bg-[#05070e] text-slate-100 flex flex-col items-center justify-center p-0 sm:p-4 select-none font-sans overflow-x-hidden">
      {/* Desktop Preview Utility Bar */}
      <aside
        aria-label="Screen Viewport Controls"
        className="hidden sm:flex items-center justify-between w-full max-w-[420px] mb-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 backdrop-blur-md"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-semibold text-slate-200">FreshAddy 3D Globe</span>
          <span className="text-slate-500">· 390×844</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Netlify MCP Badge button */}
          <button
            onClick={() => setMcpModalOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/60 transition-colors cursor-pointer text-[10px] font-mono"
            title="Inspect MCP endpoint (/api/mcp)"
          >
            <Radio size={10} className="text-cyan-400 animate-pulse" />
            <span>MCP 149k</span>
          </button>

          <button
            onClick={() => setShowFrameBezel(!showFrameBezel)}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title="Toggle Smartphone Bezel"
          >
            {showFrameBezel ? <Smartphone size={12} /> : <Maximize2 size={12} />}
            <span>{showFrameBezel ? 'Bezel' : 'Frameless'}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Screen Container: Exactly 390×844 */}
      <main
        className={`relative flex flex-col overflow-hidden bg-slate-950 transition-all duration-300 ${
          showFrameBezel
            ? 'w-full max-w-[390px] h-[844px] sm:rounded-[44px] shadow-[0_0_60px_rgba(0,0,0,0.9),_0_0_40px_rgba(0,242,254,0.12)] border-[8px] border-slate-800/90 ring-1 ring-slate-700/60'
            : 'w-full max-w-[390px] h-[844px] rounded-none sm:rounded-3xl shadow-2xl border border-slate-800'
        }`}
        style={{
          boxShadow: showFrameBezel
            ? `0 25px 60px -15px rgba(0,0,0,0.95), 0 0 35px ${activeMood.color}20`
            : undefined,
        }}
      >
        {/* iOS Phone Status Bar (Dynamic Island & Clock) */}
        <PhoneStatusBar />

        {/* Cross-Axis Swap Layout Container: Encloses Globe and Feed for smooth vertical swap */}
        <div
          ref={middleContainerRef}
          className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden"
        >
          {/* 1. GLOBE & MAP — takes top ~40% of the screen OR expands to full/center screen when collapsed */}
          <section
            ref={globeSectionRef}
            aria-label="3D Interactive Globe and Map"
            onPointerDown={handleGlobePointerDown}
            onPointerUp={handleGlobePointerUp}
            onPointerCancel={handleGlobePointerUp}
            onTouchStart={handleGlobeTouchStart}
            onTouchEnd={handleGlobeTouchEnd}
            data-swap-state={isSwapped ? 'swapped' : 'normal'}
            title={isSwapped ? 'Drag downward past threshold to swap back' : 'Drag upward past threshold to swap with bottom card'}
            className={`relative w-full overflow-hidden bg-[#070c18] ${
              isFeedCollapsed ? 'flex-1 h-full' : 'h-[40%] shrink-0'
            }`}
            style={{
              transform:
                isSwapped && (sectionHeights.card > 0 || (middleContainerRef.current?.offsetHeight ?? 0) > 0)
                  ? `translateY(${sectionHeights.card > 0 ? sectionHeights.card : (middleContainerRef.current?.offsetHeight ? middleContainerRef.current.offsetHeight * 0.6 : 415)}px)`
                  : 'translateY(0px)',
              transition: 'transform 450ms cubic-bezier(0.25, 1, 0.5, 1)',
              zIndex: isSwapped ? 25 : 10,
            }}
          >
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

            {/* Mood mover button floats at bottom-center of the globe */}
            <div className="relative z-30">
              <MoodMover
                activeMood={activeMood}
                onSelectMood={(mood) => setActiveMood(mood)}
              />
            </div>
          </section>

          {/* 2. SECTION AREA — COLLAPSIBLE WITH TOP HANDLE (similar to Google Maps app) */}
          <section
            ref={cardSectionRef}
            aria-label="Section Content Panel"
            className={`relative w-full flex flex-col bg-slate-950 border-x-2 border-t-2 rounded-t-2xl shadow-2xl ${
              isFeedCollapsed
                ? 'h-8 shrink-0 overflow-hidden cursor-pointer'
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
                isSwapped && (sectionHeights.globe > 0 || (middleContainerRef.current?.offsetHeight ?? 0) > 0)
                  ? `translateY(-${sectionHeights.globe > 0 ? sectionHeights.globe : (middleContainerRef.current?.offsetHeight ? middleContainerRef.current.offsetHeight * 0.4 : 277)}px)`
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
          </section>
        </div>

        {/* 3. BOTTOM CONTROLS */}
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

        {/* Home Indicator line (iOS native cue) */}
        <div className="w-full bg-slate-950 flex justify-center pb-2 pt-0 shrink-0">
          <div className="w-32 h-1 bg-slate-700/80 rounded-full" />
        </div>

        {/* Event Detail Sheet Modal */}
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

        {/* Netlify MCP Connection Info Modal */}
        <McpInfoModal
          isOpen={mcpModalOpen}
          onClose={() => setMcpModalOpen(false)}
          serverInfo={mcpServerInfo}
          isLoading={isMcpConnecting}
          onRefresh={connectToMcp}
          onQuickQuery={(q) => handleSearchToChat(q)}
        />

        {/* Street View Slide-Up Panel (direct center 1/3 bottom screen with top handle) */}
        <StreetViewPanel
          target={streetViewTarget}
          onClose={() => setStreetViewTarget(null)}
        />
      </main>
    </div>
  );
}
