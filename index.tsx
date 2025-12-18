
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

import { TimelineItem, ProjectSettings, FXPreset, ClipFX, TrackType } from './types.ts';
import { 
  MAX_VIDEO_DURATION, 
  TIMELINE_BUFFER_SECONDS, 
  MIN_TIMELINE_DURATION 
} from './constants.ts';
import { ProjectSettingsModal } from './ProjectSettingsModal.tsx';
import { RenderModal } from './RenderModal.tsx';
import { Header } from './Header.tsx';
import { MediaBin } from './MediaBin.tsx';
import { StylePalette } from './StylePalette.tsx';
import { PreviewPlayer } from './PreviewPlayer.tsx';
import { Inspector } from './Inspector.tsx';
import { Timeline } from './Timeline.tsx';

/**
 * [ARCHITECTURE: DOMAIN LOGIC]
 * 純粹的物理與數學運算
 */
const TimelineUtils = {
  calculateSnap(time: number, items: TimelineItem[], excludeId: string | null, playheadTime: number, threshold: number): number {
    const points = [0, playheadTime];
    items.forEach(i => {
      if (i.id !== excludeId) {
        points.push(i.startTime);
        points.push(i.startTime + i.duration);
      }
    });
    let closest = time;
    let minDiff = threshold;
    points.forEach(p => {
      const diff = Math.abs(time - p);
      if (diff < minDiff) { minDiff = diff; closest = p; }
    });
    return closest;
  },
  getClipAtTime(items: TimelineItem[], time: number): TimelineItem | undefined {
    return items.find(i => i.type === 'video' && time >= i.startTime && time < i.startTime + i.duration);
  }
};

/**
 * [ARCHITECTURE: DATA CONTROLLER]
 * 管理 Timeline 數據模型
 */
function useTimeline(initialItems: TimelineItem[]) {
  const [items, setItems] = useState<TimelineItem[]>(initialItems);
  const updateItem = useCallback((id: string, updates: Partial<TimelineItem>) => setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i)), []);
  const deleteItem = useCallback((id: string) => setItems(prev => prev.filter(i => i.id !== id)), []);
  const addItem = useCallback((item: TimelineItem) => setItems(prev => [...prev, item]), []);
  const splitItem = useCallback((id: string, time: number) => {
    setItems(prev => {
      const target = prev.find(i => i.id === id);
      if (!target || time <= target.startTime || time >= target.startTime + target.duration) return prev;
      const splitRel = time - target.startTime;
      const newItem: TimelineItem = { ...target, id: Math.random().toString(), startTime: time, duration: target.duration - splitRel, trimStart: (target.trimStart || 0) + splitRel };
      return [...prev.map(i => i.id === id ? { ...i, duration: splitRel } : i), newItem];
    });
  }, []);
  return { items, setItems, updateItem, deleteItem, addItem, splitItem };
}

/**
 * [ARCHITECTURE: PLAYBACK CONTROLLER]
 * 隔離播放、循環、媒體同步
 */
function usePlayback(items: TimelineItem[], pxPerSec: number, videoRef: React.RefObject<HTMLVideoElement>, playheadRef: React.RefObject<HTMLDivElement>, timeDisplayRef: React.RefObject<HTMLSpanElement>) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const internalTimeRef = useRef(0);
  const lastUpdateRef = useRef(0);

  const syncUI = useCallback((t: number) => {
    internalTimeRef.current = t;
    if (playheadRef.current) playheadRef.current.style.transform = `translate3d(${t * pxPerSec}px, 0, 0)`;
    if (timeDisplayRef.current) {
      const mins = Math.floor(t / 60).toString().padStart(2, '0');
      const secs = Math.floor(t % 60).toString().padStart(2, '0');
      const ms = Math.floor((t % 1) * 100).toString().padStart(2, '0');
      timeDisplayRef.current.textContent = `${mins}:${secs}:${ms}`;
    }
  }, [pxPerSec]);

  const syncMedia = useCallback((t: number, forceSeek = false) => {
    const v = videoRef.current;
    if (!v) return;
    const clip = TimelineUtils.getClipAtTime(items, t);
    if (clip) {
      const target = (t - clip.startTime) + (clip.trimStart || 0);
      if (v.src !== clip.url) {
        v.src = clip.url || '';
        v.onloadedmetadata = () => { v.currentTime = target; if (isPlaying) v.play().catch(()=>{}); };
      } else {
        if (forceSeek || Math.abs(v.currentTime - target) > 0.15 || !isPlaying) v.currentTime = target;
        if (isPlaying && v.paused) v.play().catch(()=>{});
      }
      v.style.opacity = '1';
    } else {
      v.pause(); v.style.opacity = '0';
    }
  }, [items, isPlaying]);

  const seek = useCallback((t: number) => { syncUI(t); syncMedia(t, true); }, [syncUI, syncMedia]);

  useEffect(() => {
    let frame: number;
    const animate = (now: number) => {
      if (!lastUpdateRef.current) lastUpdateRef.current = now;
      const dt = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;
      if (isPlaying) {
        const projectDuration = items.length === 0 ? 0 : Math.max(...items.map(i => i.startTime + i.duration));
        let t = internalTimeRef.current + dt;
        if (t >= projectDuration) {
          if (isLooping) t = 0; else { t = projectDuration; setIsPlaying(false); }
        }
        syncUI(t); syncMedia(t);
        frame = requestAnimationFrame(animate);
      }
    };
    if (isPlaying) frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, isLooping, items, syncUI, syncMedia]);

  return { isPlaying, setIsPlaying, isLooping, setIsLooping, internalTime: internalTimeRef, seek };
}

/**
 * [ARCHITECTURE: INTERACTION CONTROLLER]
 * 隔離拖拽、磁吸計算、Scrubbing
 */
function useInteraction(
  setItems: React.Dispatch<React.SetStateAction<TimelineItem[]>>,
  pxPerSec: number,
  isMagnetEnabled: boolean,
  internalTime: React.MutableRefObject<number>,
  seek: (t: number) => void,
  timelineRef: React.RefObject<HTMLDivElement>
) {
  const dragInfoRef = useRef<any>(null);
  const isScrubbingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isScrubbingRef.current && timelineRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        seek(Math.max(0, (e.clientX - rect.left + timelineRef.current.scrollLeft) / pxPerSec));
        return;
      }
      const info = dragInfoRef.current;
      if (!info) return;

      const deltaT = (e.clientX - info.initialX) / pxPerSec;
      const threshold = 12 / pxPerSec;

      setItems(prev => prev.map(item => {
        if (item.id !== info.id) return item;
        if (info.type === 'move') {
          let newStart = info.initialStart + deltaT;
          if (isMagnetEnabled) {
            const snapStart = TimelineUtils.calculateSnap(newStart, prev, info.id, internalTime.current, threshold);
            const snapEnd = TimelineUtils.calculateSnap(newStart + item.duration, prev, info.id, internalTime.current, threshold);
            newStart = (Math.abs(snapStart - newStart) <= Math.abs(snapEnd - (newStart + item.duration))) 
              ? (Math.abs(snapStart - newStart) < threshold ? snapStart : newStart)
              : (Math.abs(snapEnd - (newStart + item.duration)) < threshold ? snapEnd - item.duration : newStart);
          }
          return { ...item, startTime: Math.max(0, newStart) };
        }
        if (info.type === 'trim-end') {
          let newEnd = info.initialStart + info.initialDur + deltaT;
          if (isMagnetEnabled) newEnd = TimelineUtils.calculateSnap(newEnd, prev, info.id, internalTime.current, threshold);
          if (item.type === 'video') newEnd = Math.min(newEnd, item.startTime + ((item.originalDuration || 100) - item.trimStart));
          return { ...item, duration: Math.max(0.1, newEnd - item.startTime) };
        }
        if (info.type === 'trim-start') {
          const fixedEnd = info.initialStart + info.initialDur;
          let newStart = info.initialStart + deltaT;
          if (isMagnetEnabled) newStart = TimelineUtils.calculateSnap(newStart, prev, info.id, internalTime.current, threshold);
          newStart = Math.min(newStart, fixedEnd - 0.1);
          if (item.type === 'video') newStart = Math.max(newStart, info.initialStart - item.trimStart);
          return { ...item, startTime: newStart, duration: fixedEnd - newStart, trimStart: info.initialTrim + (newStart - info.initialStart) };
        }
        return item;
      }));
    };
    const onUp = () => { isScrubbingRef.current = false; dragInfoRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [pxPerSec, isMagnetEnabled, setItems, seek]);

  const startDrag = (e: React.MouseEvent, item: TimelineItem, type: any) => {
    dragInfoRef.current = { id: item.id, type, initialX: e.clientX, initialStart: item.startTime, initialDur: item.duration, initialTrim: item.trimStart || 0 };
  };
  const startScrub = () => { isScrubbingRef.current = true; };

  return { startDrag, startScrub };
}

function RapidCutEditor() {
  const [pxPerSec, setPxPerSec] = useState(15);
  const [isMagnetEnabled, setIsMagnetEnabled] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({ width: 528, height: 768, fps: 30 });
  
  // Refs for Sync
  const playheadRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // 模組 1: Data
  const { items, setItems, updateItem, deleteItem, addItem, splitItem } = useTimeline([
    { id: 'v1', type: 'video', startTime: 0, duration: 8, trimStart: 0, originalDuration: 8, name: 'Sample_Clip', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', color: 'bg-zinc-700', fx: { shakeEnabled: true, shakeIntensity: 1.5, shakeFrequency: 1.0, shakeZoom: 1.05, seed: 42 } }
  ]);

  // 模組 2: Playback
  const { isPlaying, setIsPlaying, isLooping, setIsLooping, internalTime, seek } = usePlayback(items, pxPerSec, videoRef, playheadRef, timeDisplayRef);

  // 模組 3: Interaction
  const { startDrag, startScrub } = useInteraction(setItems, pxPerSec, isMagnetEnabled, internalTime, seek, timelineRef);

  const projectDuration = useMemo(() => items.length === 0 ? 0 : Math.max(...items.map(i => i.startTime + i.duration)), [items]);
  const activeClip = useMemo(() => TimelineUtils.getClipAtTime(items, internalTime.current), [items, internalTime.current]);

  return (
    <div className="flex flex-col h-screen bg-[#0d0d0f] text-zinc-400 font-sans overflow-hidden select-none text-[11px]">
      <ProjectSettingsModal isOpen={false} onClose={() => {}} settings={projectSettings} setSettings={setProjectSettings} />
      <Header onSettingsClick={() => {}} onBrandClick={() => setSelectedItemId(null)} onRenderClick={() => {}} timeDisplayRef={timeDisplayRef} projectDuration={projectDuration} />
      
      <main className="flex-1 flex overflow-hidden min-h-0">
        <MediaBin library={[]} onImport={()=>{}} onAddFromLibrary={(a)=>addItem({...a, id: Math.random().toString(), startTime: internalTime.current, trimStart: 0})} onDragStart={()=>{}} />
        <StylePalette presets={[]} onApplyPreset={()=>{}} />
        <div className="flex-1 flex flex-col bg-black relative overflow-hidden min-h-0">
          <PreviewPlayer videoRef={videoRef} items={items} currentTime={internalTime.current} projectDuration={projectDuration} projectSettings={projectSettings} activeClip={activeClip} isPlaying={isPlaying} />
        </div>
        <Inspector activeItem={items.find(i => i.id === selectedItemId)} onUpdateItem={updateItem} onDeleteItem={deleteItem} onSavePreset={()=>{}} />
      </main>

      <Timeline 
        items={items} pxPerSec={pxPerSec} setPxPerSec={setPxPerSec} 
        selectedItemId={selectedItemId} setSelectedItemId={setSelectedItemId}
        isMagnetEnabled={isMagnetEnabled} setIsMagnetEnabled={setIsMagnetEnabled}
        projectDuration={projectDuration} totalTimelineDuration={Math.max(60, projectDuration + 30)}
        onAddItem={(type) => addItem({ id: Math.random().toString(), type, startTime: internalTime.current, duration: 5, trimStart: 0, name: type.toUpperCase(), color: 'bg-zinc-700' })}
        onSplit={() => selectedItemId && splitItem(selectedItemId, internalTime.current)}
        isPlaying={isPlaying} setIsPlaying={setIsPlaying}
        onJumpToStart={() => seek(0)}
        onJumpToEnd={() => seek(projectDuration)}
        isLooping={isLooping} setIsLooping={setIsLooping}
        onMouseDown={startScrub}
        onStartDrag={startDrag}
        timelineRef={timelineRef} playheadRef={playheadRef}
        draggingAsset={null} dragOverTime={null} onDragUpdate={()=>{}}
        onAutoArrange={()=>{}} onDropFromLibrary={()=>{}} onDropExternalFiles={()=>{}} renderRuler={[]}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<RapidCutEditor />);
