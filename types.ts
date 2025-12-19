
export type TrackType = 'video' | 'audio' | 'text';
export type TitleEffect = 'none' | 'reveal' | 'glitch' | 'typewriter';

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
}

export interface ClipFX {
  shakeIntensity: number;
  shakeFrequency: number;
  shakeZoom: number;
  shakeEnabled: boolean;
  seed: number;
}

export interface TimelineItem {
  id: string;
  assetId?: string;
  type: TrackType;
  startTime: number;
  duration: number;
  trimStart: number;
  originalDuration?: number;
  allowExtension?: boolean;
  name: string;
  url?: string;
  content?: string;
  effect?: TitleEffect;
  color: string;
  volume?: number;
  muted?: boolean;
  fx?: ClipFX;
}

export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  duration: number;
  type: TrackType;
  isOffline?: boolean; 
}

export interface Project {
  id: string;
  name: string;
  lastModified: number;
  items: TimelineItem[];
  settings: ProjectSettings;
  library: MediaAsset[];
}

export interface ProjectMetadata {
  id: string;
  name: string;
  lastModified: number;
  thumbnail?: string; // 新增專案縮圖 (Base64)
}

export interface FXPreset {
  id: string;
  name: string;
  fx: ClipFX;
  type: 'shake' | 'full';
}

export interface RenderSettings {
  filename: string;
  quality: 'low' | 'medium' | 'high';
  bitrate: number;
}
