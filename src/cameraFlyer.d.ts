export interface FlyCameraOptions {
  lat: number;
  lng: number;
  tilt?: number;
  heading?: number;
  range?: number;
  duration?: number;
  target?: 'globe' | 'map' | 'photorealistic-3d' | 'auto';
}

export declare function flyCameraToCoordinate(options: FlyCameraOptions): void;
export declare function toggle3DGlobeMode(mode?: 'globe' | 'map' | 'photorealistic-3d' | boolean): string;
