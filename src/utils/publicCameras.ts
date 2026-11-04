export interface PublicCamera {
  id: string;
  source: 'caltrans' | 'tfl';
  region: string;
  name: string;
  city?: string;
  lat: number;
  lng: number;
  imageUrl: string;
  videoUrl?: string;
  viewDirection?: string;
}

// In-memory cache to prevent repeated fetches
let cachedCameras: PublicCamera[] | null = null;
let fetchingPromise: Promise<PublicCamera[]> | null = null;

// Caltrans districts covering key metro areas
const CALTRANS_DISTRICTS = ['d4', 'd7', 'd11', 'd3', 'd12'];

async function fetchCaltransDistrict(district: string): Promise<PublicCamera[]> {
  try {
    const num = district.replace('d', '').padStart(2, '0');
    const url = `https://cwwp2.dot.ca.gov/data/${district}/cctv/cctvStatusD${num}.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    const cams: PublicCamera[] = [];

    for (const item of rows) {
      const c = item?.cctv;
      if (!c) continue;
      const lat = parseFloat(c.location?.latitude);
      const lng = parseFloat(c.location?.longitude);
      const img = c.imageData?.static?.currentImageURL;
      if (isNaN(lat) || isNaN(lng) || !img) continue;

      cams.push({
        id: `caltrans-${c.location?.district || district}-${c.index}`,
        source: 'caltrans',
        region: 'California, US',
        name: c.location?.locationName || `Hwy ${c.location?.route || ''}`,
        city: c.location?.nearbyPlace || c.location?.county || 'California',
        lat,
        lng,
        imageUrl: img.replace(/\\\//g, '/'),
        videoUrl: c.imageData?.streamingVideoURL?.replace(/\\\//g, '/'),
        viewDirection: c.location?.direction,
      });
    }
    return cams;
  } catch {
    return [];
  }
}

async function fetchLondonJamCams(): Promise<PublicCamera[]> {
  try {
    const url = 'https://api.tfl.gov.uk/Place/Type/JamCam';
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const cams: PublicCamera[] = [];
    for (const item of data) {
      const lat = item.lat;
      const lng = item.lon;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;

      const props: Record<string, string> = {};
      if (Array.isArray(item.additionalProperties)) {
        for (const p of item.additionalProperties) {
          if (p.key && p.value) props[p.key] = p.value;
        }
      }

      const img = props.imageUrl;
      if (!img || props.available === 'false') continue;

      cams.push({
        id: `tfl-${item.id}`,
        source: 'tfl',
        region: 'London, Europe',
        name: item.commonName || 'Traffic Camera',
        city: 'London',
        lat,
        lng,
        imageUrl: img,
        videoUrl: props.videoUrl,
        viewDirection: props.view,
      });
    }
    return cams;
  } catch {
    return [];
  }
}

export async function loadPublicCameras(): Promise<PublicCamera[]> {
  if (cachedCameras && cachedCameras.length > 0) {
    return cachedCameras;
  }
  if (fetchingPromise) {
    return fetchingPromise;
  }

  fetchingPromise = (async () => {
    try {
      // Fetch California key districts + London in parallel
      const results = await Promise.allSettled([
        ...CALTRANS_DISTRICTS.map((d) => fetchCaltransDistrict(d)),
        fetchLondonJamCams(),
      ]);

      const all: PublicCamera[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          all.push(...r.value);
        }
      }

      cachedCameras = all;
      return all;
    } catch {
      return [];
    } finally {
      fetchingPromise = null;
    }
  })();

  return fetchingPromise;
}

export function buildCameraGeoJSON(cameras: PublicCamera[]) {
  return {
    type: 'FeatureCollection',
    features: cameras.map((c) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [c.lng, c.lat],
      },
      properties: {
        id: c.id,
        source: c.source,
        region: c.region,
        name: c.name,
        city: c.city || '',
        imageUrl: c.imageUrl,
        videoUrl: c.videoUrl || '',
        viewDirection: c.viewDirection || '',
      },
    })),
  };
}
