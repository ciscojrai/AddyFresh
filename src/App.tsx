import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GlobeView } from './components/GlobeView';
import { HomeFeed } from './components/HomeFeed';
import { SearchView } from './components/SearchView';
import { ChatView, ChatConversation, MuseGlobeAction } from './components/ChatView';
import { SavedView } from './components/SavedView';
import { FestivalFeed } from './components/FestivalFeed';
import { BottomControls } from './components/BottomControls';
import { EventModal } from './components/EventModal';
import { StreetViewPanel } from './components/StreetViewPanel';
import { PhoneStatusBar } from './components/PhoneStatusBar';
import { EVENTS_DATA, MOODS } from './data/events';
import { LIVE_SPORTS_DATA } from './data/liveSports';
import { REALITY_TV_DATA } from './data/realityTv';
import { COLLAPSED_PILLS_DATA } from './data/collapsedPills';
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
import { GlobeActivitiesMenu } from './components/GlobeActivitiesMenu';
import { B2BLandmarks, B2BPin } from './components/B2BLandmarks';
import { ChevronUp, Smartphone, Tablet, Tv, Globe, ArrowLeftRight, ArrowUpDown, ArrowDown, ArrowUp, ArrowRight, ArrowLeft } from 'lucide-react';
import { useHaptic } from './hooks/useHaptic';
import { speakWithAddyVoice, stopAddyVoicePlayback } from './utils/metaVoice';
import { useVoiceSession } from './hooks/useVoiceSession';

const INITIAL_CONVERSATIONS: ChatConversation[] = [
  { id: 'conv-muse', title: 'Where is my car?', pinned: true, updatedAt: 'Active', messages: [
    { id: 'm-car-q', sender: 'user', text: 'Where is my car?', timestamp: 'Just now' },
    { id: 'm-car-a', sender: 'assistant', text: 'Your Family SUV (demo plate DEMO-001, Dana\'s pickup car) is at the Coral Grove home base, Miami — 25.76, -80.19, city level only in this demo. Your sedan (DEMO-002, Alex) is listed at the same home base. Want me to show the SUV on the globe?', timestamp: 'Just now', globeActions: [{ type: 'fly_to', lat: 25.76, lon: -80.19, label: 'Coral Grove home base, Miami' }] },
  ] },
  { id: 'conv-1', title: 'Where is my delivery?', pinned: false, updatedAt: '2h ago', messages: [
    { id: 'm1-1', sender: 'user', text: 'Where is my delivery?', timestamp: '10:14 PM' },
    { id: 'm1-2', sender: 'assistant', text: 'In the revised demo list: your Walmart order #2000151-51102757 was delayed, then arrived — USPS 9361289715768024660055. Your FedEx #FX-88472910 and USPS #9400 1118 9956 2000 were both out for delivery in the demo set. Your Amazon order #114-8839201 is still the delayed one in this demo.', timestamp: '10:15 PM', globeActions: [{ type: 'fly_to', lat: 25.76, lon: -80.19, label: 'Coral Grove home base, Miami' }] },
  ] },
  { id: 'conv-2', title: 'Where is my service appointment?', pinned: false, updatedAt: '5h ago', messages: [
    { id: 'm2-1', sender: 'user', text: 'Where is my service appointment?', timestamp: '8:30 PM' },
    { id: 'm2-2', sender: 'assistant', text: 'In the demo, your next service-style appointment is the school club showcase — Saturday, 10:30, Bayside Elementary (fictional), 25.78, -80.18, with Riley + Alex — followed by the family grocery stop at Coral Grove Market at 12:00. No real appointment is booked in this demo data.', timestamp: '8:31 PM', globeActions: [{ type: 'fly_to', lat: 25.78, lon: -80.18, label: 'Bayside Elementary' }] },
  ] },
  { id: 'conv-3', title: 'Where is my family member\'s birthday package?', pinned: false, updatedAt: '1d ago', messages: [
    { id: 'm3-1', sender: 'user', text: 'Where is my family member\'s birthday package?', timestamp: 'Yesterday' },
    { id: 'm3-2', sender: 'assistant', text: 'The demo birthday is the family birthday party — Saturday, 16:30, at a friend\'s house in Coral Grove (fictional), 25.75, -80.21. Pagos reminder from the demo: bring gift + party supplies. No separate birthday package tracking number is in the demo data.', timestamp: 'Yesterday', globeActions: [{ type: 'fly_to', lat: 25.75, lon: -80.21, label: 'Coral Grove birthday party' }] },
  ] },
  { id: 'conv-4', title: 'What deliveries should I expect tomorrow?', pinned: false, updatedAt: '2h ago', messages: [
    { id: 'm4-1', sender: 'user', text: 'What deliveries should I expect tomorrow?', timestamp: 'Nov 1' },
    { id: 'm4-2', sender: 'assistant', text: 'Tomorrow in the revised demo list (Nov 5): the eBay delivery #EB-993820 and the USPS package #9400 1118 9956 2000, both marked out for delivery / delivered in the demo set. Nothing else in the revised list is dated Nov 5 — the next ones are Nov 6 (Walmart) and Nov 7 (Amazon).', timestamp: 'Nov 1', globeActions: [{ type: 'fly_to', lat: 25.76, lon: -80.19, label: 'Coral Grove home base, Miami' }] },
  ] },
];

function generateAiResponse(query: string, events: EventItem[]): string {
  const q = query.toLowerCase();

  if (q.includes('comic') || q.includes('con') || q.includes('2027')) {
    return `Here are the latest updates for Comic-Con & Sci-Fi Expos through 2027:\n\n• San Diego Comic-Con: Summer dates confirmed at the Convention Center.\n• Tokyo Comic-Con (Late 2027): Confirmed for November 2027 at Makuhari Messe with special guest spotlights & international artist alley.\n• Badges & Passes: Pre-registration opens Q1 2027 with multi-day pass lotteries.\n\nAll venues are mapped on your 3D globe with live coordinates.`;
  }

  if (q.includes('tokyo') || q.includes('japan')) {
    return `Tokyo currently has several premier experiences tracked on the globe:\n\n• Cyberpunk Rooftop Rave (Roppongi Hills Mori Tower)\n• Neon Shibuya Underground Beats (Tokyo / Shibuya B2)\n• Akihabara VR Retro Arcade & Tech Summit\n\nRain Radar status: Clear skies, 18°C. Camera perspective is calibrated for 3D orbital view.`;
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

const TallArrowIcon = ({ className = 'w-[11px] h-[11px]' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 3v18" />
    <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
    <path d="m7.5 16.5 4.5 4.5 4.5-4.5" />
  </svg>
);

const WideArrowIcon = ({ className = 'w-[11px] h-[11px]' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M3 12h18" />
    <path d="m7.5 7.5-4.5 4.5 4.5 4.5" />
    <path d="m16.5 7.5 4.5 4.5-4.5 4.5" />
  </svg>
);

const TvArrowIcon = ({ className = 'w-[11px] h-[11px]' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M4 4l16 16" />
    <path d="M4 20L20 4" />
    <path d="M4 9V4h5" />
    <path d="M15 4h5v5" />
    <path d="M4 15v5h5" />
    <path d="M15 20h5v-5" />
  </svg>
);

const eventToStreetViewTarget = (event: EventItem): StreetViewTarget => ({
  title: event.title,
  location: `${event.venue ? `${event.venue}, ` : ''}${event.city}, ${event.country}`,
  lat: event.lat,
  lng: event.lng,
});

export default function App() {
  const { triggerPanelToggle, triggerGlobePin, triggerNav } = useHaptic();

  // State
  const [events, setEvents] = useState<EventItem[]>([...EVENTS_DATA, ...LIVE_SPORTS_DATA, ...REALITY_TV_DATA, ...COLLAPSED_PILLS_DATA]);
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
  const [activeActivityPill, setActiveActivityPill] = useState<string | null>('Football');

  // DeepSeek-style Chat state
  const [conversations, setConversations] = useState<ChatConversation[]>(INITIAL_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState<string | null>('conv-muse');

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
  // Default: mobile ('phone') with globe top.
  // Tablet & TV default: globe left.
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
  // Mobile default: 'top' (Axis Swapped -> 'bottom')
  // Tablet default: 'left' (Axis Swapped -> 'right')
  // TV default: 'left' (Axis Swapped -> 'right')
  const [globePosition, setGlobePosition] = useState<'top' | 'bottom' | 'left' | 'right'>('top');

  const handleSelectDeviceMode = (target: 'phone' | 'tablet' | 'tv') => {
    triggerPanelToggle();
    setDeviceMode(target);
    if (target === 'phone') {
      setGlobePosition('top');
      setIsSwapped(false);
    } else {
      // Tablet and TV default: globe left, axis swap off (not highlighted)
      setGlobePosition('left');
      setIsSwapped(false);
    }
  };

  // Transient active highlight state for 3D Globe swap button (clears as soon as swap triggers/completes)
  const [isGlobeSwapActive, setIsGlobeSwapActive] = useState(false);

  const handleToggleAxisSwap = () => {
    triggerPanelToggle();
    setIsGlobeSwapActive(true);
    if (effectiveDeviceMode === 'phone') {
      const nextPos = globePosition === 'top' ? 'bottom' : 'top';
      setGlobePosition(nextPos);
      setIsSwapped(nextPos === 'bottom');
    } else {
      // Tablet or TV default is left (isSwapped=false).
      // Swapping flips to right (isSwapped=true).
      const nextPos = globePosition === 'left' ? 'right' : 'left';
      setGlobePosition(nextPos);
      setIsSwapped(nextPos === 'right');
    }
    // Immediately unhighlight upon the globe switching
    setTimeout(() => {
      setIsGlobeSwapActive(false);
    }, 180);
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
  // (REMOVED: User requested that when collapse is triggered, panel strictly stays on its given side)
  /* useEffect(() => {
    if (isFeedCollapsed && isSwapped) {
      setIsSwapped(false);
    }
  }, [isFeedCollapsed, isSwapped]); */

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
            'esri-dark': {
              type: 'raster',
              tiles: [
                'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
              ],
              tileSize: 256,
              attribution: 'Esri, HERE, Garmin',
            },
          },
          layers: [
            {
              id: 'esri-dark',
              type: 'raster',
              source: 'esri-dark',
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
          setStreetViewTarget(eventToStreetViewTarget(found));
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

    handleNewChat(trimmed);
    setSearchQuery('');
  };

  // Chat conversation actions
  // Two separate voice chats, each with its own speaker: globe (no log) and
  // panel (with log). Typed searches stay silent; speaking is done by the
  // voice wrapper that asked, not by the chat handler itself.
  const [globeAudioOn, setGlobeAudioOn] = useState(true);
  const [panelAudioOn, setPanelAudioOn] = useState(true);
  const globeAudioOnRef = useRef(true);
  const panelAudioOnRef = useRef(true);
  const toggleGlobeAudio = () => {
    globeAudioOnRef.current = !globeAudioOnRef.current;
    setGlobeAudioOn(globeAudioOnRef.current);
    if (!globeAudioOnRef.current) stopAddyVoicePlayback();
  };
  const togglePanelAudio = () => {
    panelAudioOnRef.current = !panelAudioOnRef.current;
    setPanelAudioOn(panelAudioOnRef.current);
    if (!panelAudioOnRef.current) stopAddyVoicePlayback();
  };
  const applyMuseActions = (actions?: Array<{ type: string; lat?: number; lon?: number; label?: string; enabled?: boolean }>) => {
    (actions || []).forEach((a) => {
      if (a.type === 'fly_to' && typeof a.lat === 'number' && typeof a.lon === 'number') {
        flyCameraToCoordinate({ lat: a.lat, lng: a.lon, target: 'globe' });
      } else if (a.type === 'toggle_radar') {
        window.dispatchEvent(new CustomEvent('freshaddy:set-radar', { detail: { enabled: a.enabled !== false } }));
      } else if (a.type === 'toggle_alerts') {
        window.dispatchEvent(new CustomEvent('freshaddy:set-alerts', { detail: { enabled: a.enabled !== false } }));
      }
    });
  };

  // Refresh icon handler: re-apply a logged message's stored actions only.
  // No Muse call, no retyping, no new chat log entry. With no stored actions,
  // fall back to the currently selected event (if any); otherwise do nothing
  // and never invent a location.
  const handleRefreshGlobe = (actions?: MuseGlobeAction[]) => {
    if (!actions || actions.length === 0) {
      if (selectedEvent) handleSelectEvent(selectedEvent);
      return;
    }
    applyMuseActions(actions);
    const fly = actions.find(
      (a) => a.type === 'fly_to' && typeof a.lat === 'number' && typeof a.lon === 'number'
    );
    if (fly && typeof fly.lat === 'number' && typeof fly.lon === 'number') {
      const matched = events.find(
        (e) => Math.abs(e.lat - (fly.lat as number)) < 0.01 && Math.abs(e.lng - (fly.lon as number)) < 0.01
      );
      if (matched) {
        handleSelectEvent(matched);
      } else {
        handleSelectEvent({
          id: `refresh-${Math.round((fly.lat as number) * 10000)}-${Math.round((fly.lon as number) * 10000)}`,
          title: fly.label || 'That place',
          city: fly.label || '',
          country: '',
          date: '',
          category: '',
          lat: fly.lat as number,
          lng: fly.lon as number,
          description: '',
        });
      }
    }
  };

  const handleSendMessageInChat = async (
    conversationId: string,
    messageText: string
  ): Promise<{ reply: Promise<string>; id: string; placeholder: string }> => {
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
      text: 'Pagos is thinking…',
      timestamp: 'Just now',
    };
    let lastReply = '';
    // The request below is a promise chain, not an await, so this function would return
    // an empty string the instant it is called. Expose the in-flight answer so callers
    // that need the real reply (the voice session) can wait for it.
    let resolveReply: (text: string) => void = () => {};
    const replyReady = new Promise<string>((resolve) => {
      resolveReply = resolve;
    });
    const priorMessages = conversations.find((c) => c.id === conversationId)?.messages ?? [];
    const history = priorMessages
      .slice(-6)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              updatedAt: 'Just now',
              title:
                c.messages.length === 0 || c.title === 'New Chat'
                  ? messageText.length > 26
                    ? `${messageText.slice(0, 26)}…`
                    : messageText
                  : c.title,
              messages: [...c.messages, userMsg, pendingMsg],
            }
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

    // Store the reply's globe actions on that assistant message, so the
    // refresh icon can re-apply them later with no new Muse call.
    const setAssistantActions = (actions?: MuseGlobeAction[]) =>
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantId ? { ...m, globeActions: actions || [] } : m
                ),
              }
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
      .then((data: { text?: string; actions?: Array<{ type: string; lat?: number; lon?: number; label?: string; enabled?: boolean }> }) => {
        const replyText = data.text || 'Pagos had no answer for that.';
        setAssistantText(replyText);
        setAssistantActions(data.actions);
        lastReply = replyText;
        resolveReply(replyText);
        applyMuseActions(data.actions);
      })
      .catch((err) => {
        console.warn('Muse chat unavailable, using local search:', err);
        const local = `${generateAiResponse(messageText, events)}\n\nMuse offline - showing local results.`;
        setAssistantText(local);
        setAssistantActions([]);
        lastReply = local;
        resolveReply(local);
      });
    // Resolves once the reply text exists, for a caller that needs the real answer.
    const spokeReply = lastReply ? Promise.resolve(lastReply) : replyReady;
    return { reply: spokeReply, id: assistantId, placeholder: 'Pagos is thinking…' };
  };

  // Globe voice: NO chat log. Asks Muse, flies the globe, speaks only if the
  // globe speaker is on. Never touches conversations, never opens the panel.
  const handleGlobeVoiceAsk = async (text: string): Promise<string> => {
    try {
      const r = await fetch('/api/muse/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: [],
          events: events.slice(0, 12).map((e) => ({
            title: e.title,
            city: e.city,
            date: e.date,
            lat: e.lat,
            lng: e.lng,
          })),
        }),
      });
      if (!r.ok) throw new Error(`muse ${r.status}`);
      const data = await r.json();
      const replyText = data.text || 'Pagos had no answer for that.';
      applyMuseActions(data.actions);
      if (globeAudioOnRef.current) speakWithAddyVoice(replyText);
      return replyText;
    } catch {
      const local = `${generateAiResponse(text, events)}\n\nMuse offline - showing local results.`;
      if (globeAudioOnRef.current) speakWithAddyVoice(local);
      return local;
    }
  };
  const globeVoice = useVoiceSession({ ask: handleGlobeVoiceAsk });
  // Panel voice: WITH log. Asks via the panel chat handler, speaks only if the
  // panel speaker is on. Typed panel messages stay silent.
  const panelVoice = useVoiceSession({
    ask: async (text) => {
      setActiveNav('chat');
      const sent = await handleSendMessageInChat(voiceConversationRef.current, text);
      const reply = await sent.reply;
      if (panelAudioOnRef.current) speakWithAddyVoice(reply);
      return reply;
    },
  });
  // Only one voice chat active at a time.
  const toggleGlobeVoice = () => {
    if (!globeVoice.isOpen() && panelVoice.isOpen()) panelVoice.toggle();
    globeVoice.toggle();
  };
  const togglePanelVoice = () => {
    if (!panelVoice.isOpen() && globeVoice.isOpen()) globeVoice.toggle();
    panelVoice.toggle();
  };
  // The chat conversation the voice session appends to: the open one, or the first.
  const voiceConversationRef = useRef<string>(
    conversations.find((c) => c.id === activeConversationId)?.id ?? conversations[0]?.id ?? ''
  );
  useEffect(() => {
    if (activeConversationId) voiceConversationRef.current = activeConversationId;
  }, [activeConversationId]);

  const handleNewChat = (initialQuery?: string) => {
    const convId = `conv-${Date.now()}`;
    const initialTitle = initialQuery
      ? initialQuery.length > 26
        ? `${initialQuery.slice(0, 26)}…`
        : initialQuery
      : 'New Chat';
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
              text: 'Pagos is thinking…',
              timestamp: 'Just now',
            },
          ]
        : [],
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(convId);
    setActiveNav('chat');
    setIsFeedCollapsed(false);
    if (initialQuery) {
      handleSendMessageInChat(convId, initialQuery);
    }
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
          {/* 1. GLOBE & MAP — fixed height/allocation, does NOT expand when panel collapses */}
          <section
            ref={globeSectionRef}
            aria-label="3D Interactive Globe and Map"
            data-swap-state={isSwapped ? 'swapped' : 'normal'}
            className={`app-globe relative w-full overflow-hidden touch-none bg-[#070c18] ${
              effectiveDeviceMode === 'phone' ? 'h-[40%] shrink-0' : 'h-full flex-1'
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
            {/* Top-Center Tactical Bar: Screen Target Selector (Tall, Wide, TV) + 3D Globe toggle */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-auto"
            >
              {/* Line 1: Screen Target Selector centered */}
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
                  title="Tall View (Globe Top)"
                >
                  <TallArrowIcon className="w-[11px] h-[11px]" />
                  <span>Tall</span>
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
                  title="Wide View (Globe Left default, right on swap)"
                >
                  <WideArrowIcon className="w-[11px] h-[11px]" />
                  <span>Wide</span>
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
                  title="TV Mode (Globe Left default, right on swap)"
                >
                  <TvArrowIcon className="w-[11px] h-[11px]" />
                  <span>TV</span>
                </button>
              </div>

              {/* Line 2: 3D Globe position toggle matching radio bar styling above */}
              <button
                type="button"
                onClick={handleToggleAxisSwap}
                aria-pressed={isGlobeSwapActive}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold backdrop-blur-md shadow-lg transition-all cursor-pointer active:scale-95 ${
                  isGlobeSwapActive
                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(34,211,238,0.25)]'
                    : 'bg-slate-950/85 hover:bg-slate-900 border border-slate-700/80 text-slate-400 hover:text-slate-200'
                }`}
                title={
                  effectiveDeviceMode === 'phone'
                    ? globePosition === 'top'
                      ? '3D Globe (Top - click to move down)'
                      : '3D Globe (Bottom - click to move up)'
                    : globePosition === 'left'
                      ? '3D Globe (Left - click to move right)'
                      : '3D Globe (Right - click to move left)'
                }
                aria-label="3D Globe Position"
              >
                <span>3D Globe</span>
                {effectiveDeviceMode === 'phone' ? (
                  globePosition === 'top' ? (
                    <ArrowDown className="w-[11px] h-[11px]" />
                  ) : (
                    <ArrowUp className="w-[11px] h-[11px]" />
                  )
                ) : (
                  globePosition === 'left' ? (
                    <ArrowRight className="w-[11px] h-[11px]" />
                  ) : (
                    <ArrowLeft className="w-[11px] h-[11px]" />
                  )
                )}
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
                voiceState={globeVoice.state}
                voiceSecondsLeft={globeVoice.secondsLeft}
                onToggleVoice={toggleGlobeVoice}
                audioOn={globeAudioOn}
                onToggleAudio={toggleGlobeAudio}
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSendMessage={handleSendMessageInChat}
                onNewChat={handleNewChat}
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
            className={`app-feed relative w-full flex flex-col ${
              isFeedCollapsed
                ? 'bg-[#030712] border-x border-t border-cyan-500/30 rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.85)]'
                : 'bg-slate-950 border-x-2 border-t-2 rounded-t-2xl shadow-2xl'
            } flex-1 min-h-0 overflow-hidden ${
              !isFeedCollapsed && activeNav === 'home'
                ? 'border-purple-500 shadow-[inset_0_0_18px_rgba(168,85,247,0.35),0_0_24px_rgba(168,85,247,0.3)]'
                : !isFeedCollapsed && activeNav === 'play'
                ? 'border-yellow-400 shadow-[inset_0_0_20px_rgba(250,204,21,0.4),0_0_28px_rgba(250,204,21,0.35)]'
                : !isFeedCollapsed && activeNav === 'search'
                ? 'border-emerald-400 shadow-[inset_0_0_18px_rgba(52,211,153,0.35),0_0_24px_rgba(52,211,153,0.3)]'
                : !isFeedCollapsed && activeNav === 'chat'
                ? 'border-cyan-400 shadow-[inset_0_0_18px_rgba(34,211,238,0.35),0_0_24px_rgba(34,211,238,0.3)]'
                : !isFeedCollapsed
                ? 'border-rose-500 shadow-[inset_0_0_20px_rgba(244,63,94,0.4),0_0_28px_rgba(244,63,94,0.35)]'
                : ''
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
                isFeedCollapsed ? 'pt-2 pb-1.5' : 'pt-2 pb-1'
              } cursor-pointer group hover:bg-slate-900/40 select-none shrink-0 border-b ${
                isFeedCollapsed ? 'border-cyan-500/20 bg-slate-950/70' : 'border-transparent'
              }`}
              title={isFeedCollapsed ? 'Expand Panel' : 'Collapse Panel Down'}
            >
              <div
                className={`w-12 h-1.5 rounded-full transition-all duration-200 ${
                  isFeedCollapsed
                    ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)] group-hover:bg-white group-hover:w-16'
                    : 'bg-slate-600 group-hover:bg-slate-400'
                }`}
              />
              <span className="text-[9px] text-slate-400 group-hover:text-cyan-300 font-mono tracking-wider mt-1 uppercase">
                {isFeedCollapsed ? '▾ Collapsed Down · Tap to Expand' : 'Tap to Collapse'}
              </span>
            </div>

            {/* Collapsed Scene: Matching Globe Starfield Deep Space Background with 5 Activity Rows */}
            {isFeedCollapsed ? (
              <div className="relative flex-1 min-h-0 w-full overflow-hidden flex flex-col bg-radial from-slate-950/60 via-[#030712] to-[#010409]">
                {/* Subtle starlight texture overlay to match the globe scene seamlessly */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-40"
                  style={{
                    backgroundImage: `radial-gradient(1px 1px at 20px 30px, #ffffff, rgba(0,0,0,0)),
                                      radial-gradient(1.2px 1.2px at 90px 40px, #38bdf8, rgba(0,0,0,0)),
                                      radial-gradient(1px 1px at 150px 120px, #ffffff, rgba(0,0,0,0)),
                                      radial-gradient(1.5px 1.5px at 260px 80px, #93c5fd, rgba(0,0,0,0)),
                                      radial-gradient(1px 1px at 320px 180px, #ffffff, rgba(0,0,0,0)),
                                      radial-gradient(1px 1px at 70px 220px, #67e8f9, rgba(0,0,0,0)),
                                      radial-gradient(1.2px 1.2px at 210px 270px, #ffffff, rgba(0,0,0,0))`,
                    backgroundRepeat: 'repeat',
                    backgroundSize: '360px 320px',
                  }}
                />

                <GlobeActivitiesMenu
                  activePill={activeActivityPill}
                  onSelectPill={(pill, cat) => {
                    triggerPanelToggle();
                    setActiveActivityPill(pill);
                    // Filter or shift view on globe based on selection
                    const matchedEvent = events.find(
                      (e) =>
                        e.title.toLowerCase().includes(pill.toLowerCase()) ||
                        e.category.toLowerCase().includes(pill.toLowerCase()) ||
                        e.tags.some((t) => t.toLowerCase().includes(pill.toLowerCase()))
                    );
                    if (matchedEvent) {
                      handleSelectEvent(matchedEvent);
                    }
                  }}
                />
                <B2BLandmarks
                  onSelectLandmark={(pin: B2BPin) =>
                    handleSelectEvent({
                      id: `b2b-${pin.id}`,
                      title: pin.name,
                      city: pin.name,
                      country: '',
                      date: 'Verified landmark',
                      category: pin.category,
                      tags: [pin.category],
                      lat: pin.latitude,
                      lng: pin.longitude,
                      description: pin.fact || pin.visual_stat || '',
                    })
                  }
                />
              </div>
            ) : (
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
                    voiceState={panelVoice.state}
                    voiceSecondsLeft={panelVoice.secondsLeft}
                    onToggleVoice={togglePanelVoice}
                    audioOn={panelAudioOn}
                    onToggleAudio={togglePanelAudio}
                    onUploadData={(items) => {
                      setEvents((prev) => {
                        const seen = new Set(prev.map((e) => e.id));
                        return [...items.filter((it) => !seen.has(it.id)), ...prev];
                      });
                      if (items[0]) handleSelectEvent(items[0]);
                    }}
                    onRefreshGlobe={handleRefreshGlobe}
                    onBackFromChat={() => setActiveNav('home')}
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
                voiceState={panelVoice.state}
                voiceSecondsLeft={panelVoice.secondsLeft}
                onToggleVoice={togglePanelVoice}
                voiceEngineLabel={panelVoice.voiceReport?.label ?? null}
                voiceEngineReason={panelVoice.voiceReport?.reason ?? null}
                activeNav={activeNav}
                onNavChange={(nav) => {
                  triggerNav();
                  setActiveNav(nav);
                  setIsFeedCollapsed(false);
                  if (nav === 'chat') setActiveConversationId(null);
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
