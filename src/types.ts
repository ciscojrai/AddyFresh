/**
 * Clean boilerplate types for AddySpace
 */

export interface EventItem {
  id: string;
  title: string;
  city: string;
  country: string;
  date: string;
  category: string;
  tags?: string[];
  image?: string;
  venue?: string;
  lat: number;
  lng: number;
  description?: string;
  ticketUrl?: string;
  weather?: string;
  attendees?: number;
  featured?: boolean;
}

export interface Mood {
  id: string;
  name: string;
  color: string;
  gradient?: string;
  emoji?: string;
}

export type CameraPerspective = '3D' | 'Sky';

export type ThemeMode = 'dark' | 'obsidian' | 'aurora';

export type ViewportMode = 'auto' | 'mobile' | 'tablet' | 'widescreen';

export type SurfaceMode = 'mobile' | 'tablet' | 'tv';

export type ActiveNav = 'home' | 'play' | 'search' | 'chat' | 'likes';

export type SatelliteCategory =
  | 'festivals'
  | 'sports'
  | 'trivia'
  | 'b2b-intel'
  | 'tv-reality';

export interface SatelliteSphereItem {
  id: SatelliteCategory;
  name: string;
  tagline: string;
  count: number;
  color: string;
  accentHex: string;
  glowColor: string;
  description: string;
  orbitAngle: number;
  orbitRadius: number;
  featuredEventId: string;
  tags: string[];
  telemetry: {
    speedKmS: string;
    altitudeKm: number;
    listenersActive: string;
    signalStrength: number;
  };
}

export interface AlertItem {
  id: string;
  title: string;
  location: string;
  time: string;
  severity: 'warning' | 'info' | 'critical';
  details: string;
}

export interface FestivalVideo {
  id: string;
  title: string;
  location: string;
  date: string;
  tags: string[];
  thumbnail?: string;
  youtubeId: string;
  duration?: string;
  views?: string;
  lat?: number;
  lng?: number;
}

export interface StreetViewTarget {
  title: string;
  location: string;
  lat: number;
  lng: number;
}
