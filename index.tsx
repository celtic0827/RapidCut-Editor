
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
 */
function useTimeline(initialItems: TimelineItem[]) {
  const [items, setItems] = useState<TimelineItem[]>(initialItems);
  
  const updateItem = useCallback((id: string, updates: Partial<TimelineItem>) => 
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i)), []);
  
  const deleteItem = useCallback((id: string) => 
    setItems(prev => prev.filter(i => i.id !== id)), []);
  
  const addItem = useCallback((item: TimelineItem) => 
    setItems(prev => [...prev, item]), []);
  
  const splitItem = useCallback((id: string, time: number) => {
    setItems(prev => {
      const target = prev.find(i => i.id === id);
      if (!target || time <= target.startTime || time >= target.startTime + target.duration) return prev;
      const splitRel = time - target.startTime;
      const newItem: TimelineItem = { 
        ...target, 
        id: Math.random().toString(), 
        startTime: time, 
        duration: target.duration - splitRel, 
        trimStart: (target.trimStart || 0) + splitRel,
        fx: target.fx ? { ...target.fx, seed: Math.floor(Math.random() * 100) } : undefined
      };
      return [...prev.map(i => i.id === id ? { ...i, duration: splitRel } : i), newItem];
    });
  }, []);

  const autoArrange = useCallback(() => {
    setItems(prev => {
      let cursor = 0;
      const videos = prev.filter(v => v.type === 'video').sort((a,b) => a.startTime - b.startTime);
      const others = prev.filter(v => v.type !== 'video');
      return [...videos.map(v => { const res = { ...v, startTime: cursor }; cursor += v.duration; return res; }), ...others];
    });
  }, []);

  return { items, setItems, updateItem, deleteItem, addItem, splitItem, autoArrange };
}

/**
 * [ARCHITECTURE: PLAYBACK CONTROLLER]
 */
function usePlayback(
  items: TimelineItem[], 
  pxPerSec: number, 
  videoRef: React.RefObject<HTMLVideoElement>, 
  playheadRef: React.RefObject<HTMLDivElement>, 
  timeDisplayRef: React.RefObject<HTMLSpanElement>
) {
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
        if (forceSeek || Math.abs(v.currentTime - target) > 0.1 || !isPlaying) v.currentTime = target;
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

function RapidCutEditor() {
  const [pxPerSec, setPxPerSec] = useState(15);
  const [isMagnetEnabled, setIsMagnetEnabled] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({ width: 528, height: 768, fps: 30 });
  
  // Modal states
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRenderModal, setShowRenderModal] = useState(false);
  
  // Library states
  const [library, setLibrary] = useState<any[]>([]);
  const [draggingAsset, setDraggingAsset] = useState<any | null>(null);
  const [dragOverTime, setDragOverTime] = useState<number | null>(null);

  // Refs
  const playheadRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragInfoRef = useRef<any>(null);
  const isScrubbingRef = useRef(false);

  // 1. Data Controller
  const { items, setItems, updateItem, deleteItem, addItem, splitItem, autoArrange } = useTimeline([
    { id: 'v1', type: 'video', startTime: 0, duration: 8, trimStart: 0, originalDuration: 8, name: 'Sample_Clip', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', color: 'bg-zinc-700', fx: { shakeEnabled: true, shakeIntensity: 1.5, shakeFrequency: 1.0, shakeZoom: 1.05, seed: 42 } }
  ]);

  // 2. Playback Controller
  const { isPlaying, setIsPlaying, isLooping, setIsLooping, internalTime, seek } = usePlayback(items, pxPerSec, videoRef, playheadRef, timeDisplayRef);

  // 3. Helper: Import logic
  const handleImport = async (files: FileList) => {
    const imported = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) continue;
      const url = URL.createObjectURL(file);
      const isAudio = file.type.startsWith('audio/');
      const dur = await new Promise<number>(r => {
        const el = document.createElement(isAudio ? 'audio' : 'video');
        el.src = url; el.onloadedmetadata = () => r(el.duration);
        el.onerror = () => r(5); // fallback
      });
      const asset = { name: file.name, url, duration: dur, type: isAudio ? 'audio' : 'video' };
      setLibrary(prev => [...prev, asset]);
      imported.push(asset);
    }
    return imported;
  };

  // 4. Interaction Events (Mouse)
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

  // 5. Global Keyboard Shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.code === 'Space') { e.preventDefault(); setIsPlaying(p => !p); }
      if (e.code === 'KeyS') { if (selectedItemId) splitItem(selectedItemId, internalTime.current); }
      if (e.code === 'Delete' || e.code === 'Backspace') { if (selectedItemId) { deleteItem(selectedItemId); setSelectedItemId(null); } }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedItemId, splitItem, deleteItem, setIsPlaying]);

  // Derived
  const projectDuration = useMemo(() => items.length === 0 ? 0 : Math.max(...items.map(i => i.startTime + i.duration)), [items]);
  const activeClip = useMemo(() => TimelineUtils.getClipAtTime(items, internalTime.current), [items, internalTime.current]);
  const totalTimelineDuration = useMemo(() => Math.max(60, projectDuration + 30), [projectDuration]);

  // Ruler rendering
  const renderRuler = useMemo(() => {
    const markers = [];
    const step = pxPerSec < 10 ? 10 : pxPerSec < 30 ? 5 : 1;
    for (let i = 0; i <= totalTimelineDuration; i += step) {
      markers.push(
        <div key={i} className="absolute top-0 border-l border-white/10 h-full" style={{ left: i * pxPerSec }}>
          <span className="text-[7px] text-zinc-600 ml-1 mt-1 block">{Math.floor(i / 60)}:{(i % 60).toString().padStart(2, '0')}</span>
        </div>
      );
    }
    return markers;
  }, [totalTimelineDuration, pxPerSec]);

  return (
    <div className="flex flex-col h-screen bg-[#0d0d0f] text-zinc-400 font-sans overflow-hidden select-none text-[11px]">
      <ProjectSettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} settings={projectSettings} setSettings={setProjectSettings} />
      <RenderModal isOpen={showRenderModal} onClose={() => setShowRenderModal(false)} items={items} projectSettings={projectSettings} projectDuration={projectDuration} />
      
      <Header 
        onSettingsClick={() => setShowSettingsModal(true)} 
        onBrandClick={() => setSelectedItemId(null)} 
        onRenderClick={() => setShowRenderModal(true)} 
        timeDisplayRef={timeDisplayRef} 
        projectDuration={projectDuration} 
      />
      
      <main className="flex-1 flex overflow-hidden min-h-0">
        <MediaBin 
          library={library} 
          onImport={handleImport} 
          onAddFromLibrary={(a) => addItem({ id: Math.random().toString(), type: a.type, startTime: internalTime.current, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: a.type === 'video' ? 'bg-zinc-700' : 'bg-emerald-600' })} 
          onDragStart={setDraggingAsset} 
        />
        
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
        projectDuration={projectDuration} totalTimelineDuration={totalTimelineDuration}
        onAddItem={(type) => addItem({ id: Math.random().toString(), type, startTime: internalTime.current, duration: 5, trimStart: 0, name: type.toUpperCase(), color: type === 'video' ? 'bg-zinc-700' : 'bg-indigo-600' })}
        onSplit={() => selectedItemId && splitItem(selectedItemId, internalTime.current)}
        onAutoArrange={autoArrange}
        isPlaying={isPlaying} setIsPlaying={setIsPlaying}
        onJumpToStart={() => seek(0)}
        onJumpToEnd={() => seek(projectDuration)}
        isLooping={isLooping} setIsLooping={setIsLooping}
        onMouseDown={() => { isScrubbingRef.current = true; setIsPlaying(false); }}
        onStartDrag={(e, item, type) => { dragInfoRef.current = { id: item.id, type, initialX: e.clientX, initialStart: item.startTime, initialDur: item.duration, initialTrim: item.trimStart || 0 }; }}
        renderRuler={renderRuler} timelineRef={timelineRef} playheadRef={playheadRef}
        draggingAsset={draggingAsset} dragOverTime={dragOverTime} onDragUpdate={setDragOverTime}
        onDropFromLibrary={(a, t) => {
          addItem({ id: Math.random().toString(), type: a.type, startTime: t, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: a.type === 'video' ? 'bg-zinc-700' : 'bg-emerald-600' });
          setDraggingAsset(null); setDragOverTime(null);
        }}
        onDropExternalFiles={async (f, t) => {
          const assets = await handleImport(f);
          let cursor = t;
          assets.forEach(a => {
            addItem({ id: Math.random().toString(), type: a.type, startTime: cursor, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: a.type === 'video' ? 'bg-zinc-700' : 'bg-emerald-600' });
            cursor += a.duration;
          });
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<RapidCutEditor />);
