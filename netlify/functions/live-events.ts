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

export const handler = async () => {
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

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      refreshCount: refreshCounter,
      events: picked,
      message: `Discovered ${picked.length} new live events on planetary mesh`,
    }),
  };
};
