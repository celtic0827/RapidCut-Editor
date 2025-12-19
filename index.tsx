
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

const TimelineUtils = {
  getSnapPoints(items: TimelineItem[], excludeId: string | null, playheadTime: number) {
    const points = new Set([0, playheadTime]);
    items.forEach(i => {
      if (i.id !== excludeId) {
        points.add(i.startTime);
        points.add(i.startTime + i.duration);
      }
    });
    return Array.from(points);
  },
  applySnap(time: number, snapPoints: number[], threshold: number): { time: number, diff: number } {
    let closest = time;
    let minDiff = Infinity;
    snapPoints.forEach(p => {
      const diff = Math.abs(time - p);
      if (diff < minDiff) { minDiff = diff; closest = p; }
    });
    return { time: closest, diff: minDiff };
  },
  getClipAtTime(items: TimelineItem[], time: number): TimelineItem | undefined {
    return items.find(i => i.type === 'video' && time >= i.startTime && time <= i.startTime + i.duration + 0.001);
  }
};

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

function usePlayback(
  items: TimelineItem[], 
  pxPerSec: number, 
  videoRef: React.RefObject<HTMLVideoElement>, 
  audioRef: React.RefObject<HTMLAudioElement>,
  playheadRef: React.RefObject<HTMLDivElement>, 
  timeDisplayRef: React.RefObject<HTMLSpanElement>,
  trimPreviewTime: number | null,
  v1Muted: boolean // 新增：軌道靜音狀態
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

  useEffect(() => { syncUI(internalTimeRef.current); }, [pxPerSec, syncUI]);

  useEffect(() => {
    if (!isPlaying) {
      videoRef.current?.pause();
      audioRef.current?.pause();
    }
  }, [isPlaying, videoRef, audioRef]);

  const syncMedia = useCallback((t: number, forceSeek = false) => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;

    const clip = TimelineUtils.getClipAtTime(items, t);
    if (clip) {
      const target = (t - clip.startTime) + (clip.trimStart || 0);
      if (v.src !== clip.url) {
        v.src = clip.url || '';
        v.onloadedmetadata = () => { 
          v.currentTime = target; 
          if (isPlaying && !trimPreviewTime) v.play().catch(()=>{}); 
        };
      } else {
        if (trimPreviewTime !== null) { v.pause(); v.currentTime = target; }
        else {
          if (forceSeek || Math.abs(v.currentTime - target) > 0.05 || !isPlaying) v.currentTime = target;
          if (isPlaying && v.paused) v.play().catch(()=>{});
        }
      }
      v.style.opacity = '1';
      // 影像音量控制：全軌道靜音 OR 片段靜音
      v.muted = v1Muted || (clip.muted ?? false);
      v.volume = clip.volume ?? 1.0;
    } else {
      v.pause(); v.style.opacity = '0';
    }

    if (a) {
      const audioClip = items.find(i => i.type === 'audio' && t >= i.startTime && t <= i.startTime + i.duration + 0.001);
      if (audioClip) {
        const aTarget = (t - audioClip.startTime) + (audioClip.trimStart || 0);
        if (a.src !== audioClip.url) {
          a.src = audioClip.url || '';
          a.onloadedmetadata = () => {
            a.currentTime = aTarget;
            if (isPlaying && !trimPreviewTime) a.play().catch(() => {});
          };
        } else {
          if (trimPreviewTime !== null) { a.pause(); a.currentTime = aTarget; }
          else {
            if (forceSeek || Math.abs(a.currentTime - aTarget) > 0.1 || !isPlaying) a.currentTime = aTarget;
            if (isPlaying && a.paused) a.play().catch(() => {});
          }
        }
        a.volume = audioClip.volume ?? 1.0;
        a.muted = audioClip.muted ?? false;
      } else {
        a.pause();
        if (a.src) a.src = '';
      }
    }
  }, [items, isPlaying, trimPreviewTime, audioRef, videoRef, v1Muted]);

  const seek = useCallback((t: number) => { syncUI(t); syncMedia(t, true); }, [syncUI, syncMedia]);

  useEffect(() => {
    if (trimPreviewTime !== null) syncMedia(trimPreviewTime, true);
    else syncMedia(internalTimeRef.current, true);
  }, [trimPreviewTime, syncMedia]);

  useEffect(() => {
    let frame: number;
    lastUpdateRef.current = 0;
    const animate = (now: number) => {
      if (!lastUpdateRef.current) { lastUpdateRef.current = now; frame = requestAnimationFrame(animate); return; }
      const dt = (now - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = now;
      if (isPlaying && trimPreviewTime === null) {
        const projectDuration = items.length === 0 ? 0 : Math.max(...items.map(i => i.startTime + i.duration));
        let t = internalTimeRef.current + dt;
        if (t >= projectDuration) {
          if (isLooping) t = 0; else { t = projectDuration; setIsPlaying(false); }
        }
        syncUI(t); syncMedia(t);
        frame = requestAnimationFrame(animate);
      }
    };
    if (isPlaying && trimPreviewTime === null) frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, isLooping, items, syncUI, syncMedia, trimPreviewTime]);

  return { isPlaying, setIsPlaying, isLooping, setIsLooping, internalTime: internalTimeRef, seek };
}

function RapidCutEditor() {
  const [pxPerSec, setPxPerSec] = useState(15);
  const [isMagnetEnabled, setIsMagnetEnabled] = useState(true);
  const [isMagneticMode, setIsMagneticMode] = useState(false);
  const [v1Muted, setV1Muted] = useState(false); // 新增：影像軌道全域靜音
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeDraggingId, setActiveDraggingId] = useState<string | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({ width: 528, height: 768, fps: 30 });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [library, setLibrary] = useState<any[]>([]);
  const [draggingAsset, setDraggingAsset] = useState<any | null>(null);
  const [dragOverTime, setDragOverTime] = useState<number | null>(null);
  const [trimPreviewTime, setTrimPreviewTime] = useState<number | null>(null);

  const playheadRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragInfoRef = useRef<any>(null);
  const isScrubbingRef = useRef(false);

  const { items, setItems, updateItem, deleteItem, addItem, splitItem, autoArrange } = useTimeline([
    { id: 'v1', type: 'video', startTime: 0, duration: 8, trimStart: 0, originalDuration: 8, name: 'Sample_Clip', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', color: 'bg-zinc-700', fx: { shakeEnabled: true, shakeIntensity: 1.5, shakeFrequency: 1.0, shakeZoom: 1.05, seed: 42 }, muted: false, volume: 1.0 }
  ]);

  const { isPlaying, setIsPlaying, isLooping, setIsLooping, internalTime, seek } = usePlayback(
    items, pxPerSec, videoRef, audioRef, playheadRef, timeDisplayRef, trimPreviewTime, v1Muted
  );

  const handleImport = async (files: FileList) => {
    const imported = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) continue;
      const url = URL.createObjectURL(file);
      const isAudio = file.type.startsWith('audio/');
      const dur = await new Promise<number>(r => {
        const el = document.createElement(isAudio ? 'audio' : 'video');
        el.src = url; el.onloadedmetadata = () => r(el.duration);
        el.onerror = () => r(5);
      });
      const asset = { name: file.name, url, duration: dur, type: isAudio ? 'audio' : 'video' };
      setLibrary(prev => [...prev, asset]);
      imported.push(asset);
    }
    return imported;
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const scrollX = timelineRef.current.scrollLeft;
      if (isScrubbingRef.current) { const t = Math.max(0, (e.clientX - rect.left + scrollX) / pxPerSec); seek(t); return; }
      const info = dragInfoRef.current;
      if (!info) return;
      const mouseTime = (e.clientX - rect.left + scrollX) / pxPerSec;
      const threshold = 12 / pxPerSec;
      setItems(prev => {
        const snapPoints = isMagnetEnabled ? TimelineUtils.getSnapPoints(prev, info.id, internalTime.current) : [];
        return prev.map(item => {
          if (item.id !== info.id) return item;
          if (info.type === 'move') {
            let newStart = mouseTime - info.clickOffsetTime;
            if (isMagnetEnabled) {
              const snapPointsExceptSelf = snapPoints.filter(p => Math.abs(p - item.startTime) > 0.001);
              const snapStart = TimelineUtils.applySnap(newStart, snapPointsExceptSelf, threshold);
              const snapEnd = TimelineUtils.applySnap(newStart + item.duration, snapPointsExceptSelf, threshold);
              if (snapStart.diff < snapEnd.diff) { if (snapStart.diff < threshold) newStart = snapStart.time; }
              else { if (snapEnd.diff < threshold) newStart = snapEnd.time - item.duration; }
            }
            return { ...item, startTime: Math.max(0, newStart) };
          }
          if (info.type === 'trim-end') {
            let newEnd = mouseTime;
            if (isMagnetEnabled) { const snapped = TimelineUtils.applySnap(newEnd, snapPoints, threshold); if (snapped.diff < threshold) newEnd = snapped.time; }
            if (item.type === 'video') newEnd = Math.min(newEnd, item.startTime + ((item.originalDuration || 100) - (item.trimStart || 0)));
            const newDuration = Math.max(0.1, newEnd - item.startTime);
            setTrimPreviewTime(item.startTime + newDuration);
            return { ...item, duration: newDuration };
          }
          if (info.type === 'trim-start') {
            const fixedEnd = info.initialStart + info.initialDur;
            let newStart = mouseTime;
            if (isMagnetEnabled) { const snapped = TimelineUtils.applySnap(newStart, snapPoints, threshold); if (snapped.diff < threshold) newStart = snapped.time; }
            newStart = Math.min(newStart, fixedEnd - 0.1);
            if (item.type === 'video') { const maxPossibleStart = fixedEnd - (item.originalDuration || 100); newStart = Math.max(newStart, maxPossibleStart); }
            setTrimPreviewTime(newStart);
            return { ...item, startTime: newStart, duration: fixedEnd - newStart, trimStart: (item.trimStart || 0) + (newStart - item.startTime) };
          }
          return item;
        });
      });
    };
    const onUp = () => { if (dragInfoRef.current && isMagneticMode) autoArrange(); isScrubbingRef.current = false; dragInfoRef.current = null; setTrimPreviewTime(null); setActiveDraggingId(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [pxPerSec, isMagnetEnabled, isMagneticMode, setItems, seek, autoArrange]);

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

  const projectDuration = useMemo(() => items.length === 0 ? 0 : Math.max(...items.map(i => i.startTime + i.duration)), [items]);
  const effectiveTime = trimPreviewTime !== null ? trimPreviewTime : internalTime.current;
  const activeClip = useMemo(() => TimelineUtils.getClipAtTime(items, effectiveTime), [items, effectiveTime]);
  const totalTimelineDuration = useMemo(() => Math.max(60, projectDuration + 30), [projectDuration]);

  const renderRuler = useMemo(() => {
    const markers = [];
    const step = pxPerSec < 10 ? 10 : pxPerSec < 30 ? 5 : 1;
    for (let i = 0; i <= totalTimelineDuration; i += step) {
      markers.push(<div key={i} className="absolute top-0 border-l border-white/10 h-full pointer-events-none" style={{ left: i * pxPerSec }}><span className="text-[7px] text-zinc-600 ml-1 mt-1 block">{Math.floor(i / 60)}:{(i % 60).toString().padStart(2, '0')}</span></div>);
    }
    return markers;
  }, [totalTimelineDuration, pxPerSec]);

  return (
    <div className="flex flex-col h-screen bg-[#0d0d0f] text-zinc-400 font-sans overflow-hidden select-none text-[11px]">
      <ProjectSettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} settings={projectSettings} setSettings={setProjectSettings} />
      <RenderModal isOpen={showRenderModal} onClose={() => setShowRenderModal(false)} items={items} projectSettings={projectSettings} projectDuration={projectDuration} />
      <Header onSettingsClick={() => setShowSettingsModal(true)} onBrandClick={() => setSelectedItemId(null)} onRenderClick={() => setShowRenderModal(true)} timeDisplayRef={timeDisplayRef} projectDuration={projectDuration} />
      <main className="flex-1 flex overflow-hidden min-h-0">
        <MediaBin library={library} onImport={handleImport} onAddFromLibrary={(a) => addItem({ id: Math.random().toString(), type: a.type, startTime: internalTime.current, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: a.type === 'video' ? 'bg-zinc-700' : 'bg-emerald-600', muted: false, volume: 1.0 })} onDragStart={setDraggingAsset} timelineItems={items} />
        <StylePalette presets={[]} onApplyPreset={()=>{}} />
        <div className="flex-1 flex flex-col bg-black relative overflow-hidden min-h-0">
          <PreviewPlayer videoRef={videoRef} audioRef={audioRef} items={items} currentTime={effectiveTime} projectDuration={projectDuration} projectSettings={projectSettings} activeClip={activeClip} isPlaying={isPlaying && trimPreviewTime === null} isTrimming={trimPreviewTime !== null} />
        </div>
        <Inspector activeItem={items.find(i => i.id === selectedItemId)} onUpdateItem={updateItem} onDeleteItem={deleteItem} onSavePreset={()=>{}} />
      </main>
      <Timeline 
        items={items} pxPerSec={pxPerSec} setPxPerSec={setPxPerSec} selectedItemId={selectedItemId} setSelectedItemId={setSelectedItemId} activeDraggingId={activeDraggingId} isMagnetEnabled={isMagnetEnabled} setIsMagnetEnabled={setIsMagnetEnabled} isMagneticMode={isMagneticMode} setIsMagneticMode={setIsMagneticMode} projectDuration={projectDuration} totalTimelineDuration={totalTimelineDuration} onAddItem={(type) => addItem({ id: Math.random().toString(), type, startTime: internalTime.current, duration: 5, trimStart: 0, name: type.toUpperCase(), color: type === 'video' ? 'bg-zinc-700' : 'bg-indigo-600', muted: false, volume: 1.0 })} onSplit={() => selectedItemId && splitItem(selectedItemId, internalTime.current)} onAutoArrange={autoArrange} isPlaying={isPlaying} setIsPlaying={setIsPlaying} onJumpToStart={() => seek(0)} onJumpToEnd={() => seek(projectDuration)} isLooping={isLooping} setIsLooping={setIsLooping} onMouseDown={(e) => { if (!timelineRef.current) return; const rect = timelineRef.current.getBoundingClientRect(); const scrollX = timelineRef.current.scrollLeft; const t = Math.max(0, (e.clientX - rect.left + scrollX) / pxPerSec); seek(t); isScrubbingRef.current = true; setIsPlaying(false); }} onStartDrag={(e, item, type) => { const rect = timelineRef.current?.getBoundingClientRect() || { left: 0 }; const scrollX = timelineRef.current?.scrollLeft || 0; const clickTime = (e.clientX - rect.left + scrollX) / pxPerSec; setActiveDraggingId(item.id); dragInfoRef.current = { id: item.id, type, initialStart: item.startTime, initialDur: item.duration, clickOffsetTime: clickTime - item.startTime }; }} renderRuler={renderRuler} timelineRef={timelineRef} playheadRef={playheadRef} draggingAsset={draggingAsset} dragOverTime={dragOverTime} onDragUpdate={setDragOverTime} onDropFromLibrary={(a, t) => { addItem({ id: Math.random().toString(), type: a.type, startTime: t, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: a.type === 'video' ? 'bg-zinc-700' : 'bg-emerald-600', muted: false, volume: 1.0 }); setDraggingAsset(null); setDragOverTime(null); }} onDropExternalFiles={async (f, t) => { const assets = await handleImport(f); let cursor = t; assets.forEach(a => { addItem({ id: Math.random().toString(), type: a.type, startTime: cursor, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: a.type === 'video' ? 'bg-zinc-700' : 'bg-emerald-600', muted: false, volume: 1.0 }); cursor += a.duration; }); }}
        v1Muted={v1Muted} onToggleV1Mute={() => setV1Muted(!v1Muted)} // 新增控制
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<RapidCutEditor />);
