
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
  assetId?: string; // 對應 IndexedDB 的 ID
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
  id: string; // 唯一 ID 用於 IndexedDB
  name: string;
  url: string; // Session URL
  duration: number;
  type: TrackType;
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
