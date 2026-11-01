/**
 * Types for FreshAddy 3D Terrarium & Particle Vector Sphere
 */

export type WeatherType = 'sunny' | 'aurora' | 'mist' | 'rain' | 'starlight';

export interface GlobeNode {
  id: string;
  name: string;
  type: 'weather' | 'flora' | 'sensor' | 'biome';
  lat: number;
  lon: number;
  altitude?: number;
  status: 'active' | 'syncing' | 'dormant';
  value: string;
  detail: string;
  iconType: 'cloud' | 'crystal' | 'sprout' | 'radar';
}

export interface EcosystemTelemetry {
  bcpRate: string; // e.g. "BCP 340k"
  biophilicHealth: number; // 0 - 100
  climateState: WeatherType;
  temperature: number; // in °C
  humidity: number; // in %
  photoperiod: 'day' | 'golden_hour' | 'night' | 'eclipse';
  floraCount: number;
  co2Ppm: number;
}

export interface TerrariumEvent {
  id: string;
  timestamp: string;
  source: string;
  category: 'flora' | 'weather' | 'system' | 'radar';
  message: string;
  level: 'info' | 'success' | 'warn';
  coordinates?: { lat: number; lon: number };
}

export interface GlobeViewSettings {
  autoRotate: boolean;
  rotationSpeed: number;
  pointDensity: number;
  showNodes: boolean;
  wireframeRings: boolean;
  zoomLevel: number; // 1.0 default
}
