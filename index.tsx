
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

import { TimelineItem, ProjectSettings, FXPreset, ClipFX, TrackType } from './types';
import { 
  MAX_VIDEO_DURATION, 
  TIMELINE_BUFFER_SECONDS, 
  MIN_TIMELINE_DURATION 
} from './constants';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { RenderModal } from './RenderModal';
import { Header } from './Header';
import { MediaBin } from './MediaBin';
import { StylePalette } from './StylePalette';
import { PreviewPlayer } from './PreviewPlayer';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';

type DragType = 'move' | 'trim-start' | 'trim-end';

const DEFAULT_FX: ClipFX = {
  shakeEnabled: false,
  shakeIntensity: 1.5,
  shakeFrequency: 1.0,
  shakeZoom: 1.05,
  seed: Math.floor(Math.random() * 100)
};

function RapidCutEditor() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(15);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    width: 528, height: 768, fps: 30
  });
  
  const [items, setItems] = useState<TimelineItem[]>([
    { 
      id: 'v1', type: 'video', startTime: 0, duration: 8, trimStart: 0, 
      originalDuration: 8, allowExtension: false, name: 'Sample_Clip', 
      url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', 
      color: 'bg-zinc-700',
      fx: { ...DEFAULT_FX, shakeEnabled: true }
    },
    { id: 't1', type: 'text', startTime: 1, duration: 4, trimStart: 0, name: 'Title', content: 'RAPID CUT', color: 'bg-indigo-600', effect: 'reveal' },
  ]);
  
  const [library, setLibrary] = useState<{name: string, url: string, duration: number}[]>([]);
  const [presets, setPresets] = useState<FXPreset[]>([
    { id: 'p1', name: 'Handheld Subtle', fx: { ...DEFAULT_FX, shakeEnabled: true, shakeIntensity: 1.2, shakeFrequency: 0.8, seed: 12 }, type: 'shake' },
    { id: 'p2', name: 'Action Shake', fx: { ...DEFAULT_FX, shakeEnabled: true, shakeIntensity: 4.5, shakeFrequency: 2.5, shakeZoom: 1.15, seed: 45 }, type: 'shake' }
  ]);
  
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isMagnetEnabled, setIsMagnetEnabled] = useState(true);

  const playheadRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(null);
  const internalTimeRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const currentClipIdRef = useRef<string | null>(null);
  const isScrubbingRef = useRef(false);
  const dragInfo = useRef<{ id: string; type: DragType; initialX: number; initialStartTime: number; initialDuration: number; initialTrimStart: number; } | null>(null);

  const [draggingAsset, setDraggingAsset] = useState<{name: string, url: string, duration: number} | null>(null);
  const [dragOverTime, setDragOverTime] = useState<number | null>(null);

  const projectDuration = useMemo(() => items.length === 0 ? 0 : Math.max(...items.map(i => i.startTime + i.duration)), [items]);
  
  const totalTimelineDuration = useMemo(() => {
    return Math.min(MAX_VIDEO_DURATION, Math.max(MIN_TIMELINE_DURATION, projectDuration + TIMELINE_BUFFER_SECONDS));
  }, [projectDuration]);

  const activeClip = useMemo(() => 
    items.find(i => i.type === 'video' && internalTimeRef.current >= i.startTime && internalTimeRef.current < i.startTime + i.duration),
  [items, internalTimeRef.current]);

  const syncMedia = useCallback((t: number, forceSeek = false) => {
    const v = videoRef.current;
    if (!v) return;

    const activeVideo = items.find(i => i.type === 'video' && t >= i.startTime && t < i.startTime + i.duration);

    if (activeVideo) {
      const targetSeekTime = (t - activeVideo.startTime) + activeVideo.trimStart;
      const currentSrc = v.getAttribute('src') || '';
      const targetSrc = activeVideo.url || '';
      
      if (currentClipIdRef.current !== activeVideo.id || currentSrc !== targetSrc) {
        currentClipIdRef.current = activeVideo.id;
        v.src = targetSrc;
        const onReady = () => {
          v.currentTime = targetSeekTime;
          if (isPlaying && !isScrubbingRef.current) v.play().catch(() => {});
          v.onloadedmetadata = null;
        };
        v.onloadedmetadata = onReady;
      } else {
        const drift = Math.abs(v.currentTime - targetSeekTime);
        if (forceSeek || drift > 0.15 || !isPlaying) v.currentTime = targetSeekTime;
        if (isPlaying && v.paused && !isScrubbingRef.current) v.play().catch(() => {});
      }
      v.style.opacity = '1';
    } else {
      currentClipIdRef.current = null;
      v.pause();
      v.style.opacity = '0'; 
    }
  }, [items, isPlaying]);

  const updateUI = useCallback((t: number) => {
    internalTimeRef.current = t;
    if (playheadRef.current) playheadRef.current.style.transform = `translate3d(${t * pxPerSec}px, 0, 0)`;
    if (timeDisplayRef.current) {
      const mins = Math.floor(t / 60).toString().padStart(2, '0');
      const secs = Math.floor(t % 60).toString().padStart(2, '0');
      const ms = Math.floor((t % 1) * 100).toString().padStart(2, '0');
      timeDisplayRef.current.textContent = `${mins}:${secs}:${ms}`;
    }
  }, [pxPerSec]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        if (!(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          e.preventDefault();
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          setIsPlaying(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const animate = useCallback((now: number) => {
    if (!lastUpdateRef.current) lastUpdateRef.current = now;
    const delta = (now - lastUpdateRef.current) / 1000;
    lastUpdateRef.current = now;

    if (isPlaying && !isScrubbingRef.current) {
      let t = internalTimeRef.current + delta;
      if (t >= projectDuration) {
        if (isLooping) { t = 0; }
        else { t = projectDuration; setIsPlaying(false); }
      }
      updateUI(t);
      syncMedia(t);
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [isPlaying, updateUI, syncMedia, projectDuration, isLooping]);

  useEffect(() => {
    if (isPlaying) { 
      lastUpdateRef.current = performance.now(); 
      requestRef.current = requestAnimationFrame(animate); 
    } else { 
      if (requestRef.current) cancelAnimationFrame(requestRef.current); 
      videoRef.current?.pause(); 
    }
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isPlaying, animate]);

  useEffect(() => updateUI(internalTimeRef.current), [pxPerSec, updateUI]);

  const handleImport = async (files: FileList) => {
    const list = Array.from(files).filter(f => f.type.startsWith('video/'));
    const importedAssets = [];
    for (const file of list) {
      const url = URL.createObjectURL(file);
      const duration = await new Promise<number>((r) => {
        const v = document.createElement('video');
        v.src = url;
        v.onloadedmetadata = () => r(v.duration);
        v.onerror = () => r(5);
      });
      const asset = { name: file.name, url, duration };
      importedAssets.push(asset);
      setLibrary(prev => [...prev, asset]);
    }
    return importedAssets;
  };

  const onDropExternalFiles = useCallback(async (files: FileList, startTime: number) => {
    const assets = await handleImport(files);
    let currentStart = startTime;
    const newItems: TimelineItem[] = assets.map(asset => {
      const item: TimelineItem = { 
        id: Math.random().toString(), 
        type: 'video', 
        startTime: currentStart, 
        duration: asset.duration, 
        trimStart: 0, 
        originalDuration: asset.duration, 
        name: asset.name, 
        url: asset.url, 
        color: 'bg-zinc-700', 
        fx: { ...DEFAULT_FX, seed: Math.floor(Math.random() * 100) } 
      };
      currentStart += asset.duration;
      return item;
    });
    setItems(p => [...p, ...newItems]);
    if (newItems.length > 0) setSelectedItemId(newItems[0].id);
    setDragOverTime(null);
  }, []);

  const handleScrub = useCallback((clientX: number) => {
    if (timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clientX - rect.left + timelineRef.current.scrollLeft;
      const newTime = Math.max(0, x / pxPerSec);
      updateUI(newTime);
      syncMedia(newTime, true);
    }
  }, [pxPerSec, updateUI, syncMedia]);

  const handleSavePreset = (name: string, fx: ClipFX) => {
    setPresets(p => [...p, { id: Math.random().toString(), name, fx, type: 'shake' }]);
  };

  const handleApplyPreset = (preset: FXPreset) => {
    if (!selectedItemId) return;
    setItems(prev => prev.map(item => {
      if (item.id === selectedItemId && item.type === 'video') {
        return { ...item, fx: { ...preset.fx } };
      }
      return item;
    }));
  };

  const startDrag = (e: React.MouseEvent, item: TimelineItem, type: DragType) => {
    dragInfo.current = { 
      id: item.id, type, initialX: e.clientX, initialStartTime: item.startTime, 
      initialDuration: item.duration, initialTrimStart: item.trimStart
    };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isScrubbingRef.current) handleScrub(e.clientX);
      else if (dragInfo.current) {
        const info = dragInfo.current;
        const deltaTime = (e.clientX - info.initialX) / pxPerSec;
        
        setItems(prev => {
          // Calculate dynamic snapping threshold (e.g., 12 pixels) in seconds
          const snapThresholdSec = 12 / pxPerSec;
          
          // Snap points: Start of timeline, Playhead, and every other clip's boundary
          const snapPoints = [0, internalTimeRef.current];
          if (isMagnetEnabled) {
            prev.forEach(i => {
              if (i.id !== info.id) {
                snapPoints.push(i.startTime);
                snapPoints.push(i.startTime + i.duration);
              }
            });
          }

          const getSnappedTime = (time: number) => {
            if (!isMagnetEnabled) return time;
            let closest = time;
            let minDiff = snapThresholdSec;
            for (const p of snapPoints) {
              const diff = Math.abs(time - p);
              if (diff < minDiff) {
                minDiff = diff;
                closest = p;
              }
            }
            return closest;
          };

          return prev.map(item => {
            if (item.id === info.id) {
              const originalDuration = item.originalDuration ?? Infinity;

              if (info.type === 'move') {
                let newStart = info.initialStartTime + deltaTime;
                const snappedStart = getSnappedTime(newStart);
                const snappedEnd = getSnappedTime(newStart + item.duration);
                
                // Prioritize start snap, then end snap
                if (Math.abs(snappedStart - newStart) <= Math.abs(snappedEnd - (newStart + item.duration))) {
                  if (Math.abs(snappedStart - newStart) < snapThresholdSec) newStart = snappedStart;
                } else {
                  if (Math.abs(snappedEnd - (newStart + item.duration)) < snapThresholdSec) newStart = snappedEnd - item.duration;
                }
                
                return { ...item, startTime: Math.max(0, newStart) };
              }
              
              if (info.type === 'trim-end') {
                const rawEnd = info.initialStartTime + info.initialDuration + deltaTime;
                let finalEnd = getSnappedTime(rawEnd);
                
                // Trimming Constraints: Cannot trim past the source file's end
                if (item.type === 'video' && !item.allowExtension) {
                   const maxEnd = item.startTime + (originalDuration - item.trimStart);
                   finalEnd = Math.min(finalEnd, maxEnd);
                }
                
                return { ...item, duration: Math.max(0.1, finalEnd - item.startTime) };
              }
              
              if (info.type === 'trim-start') {
                const fixedEnd = info.initialStartTime + info.initialDuration;
                const rawStart = info.initialStartTime + deltaTime;
                let finalStart = getSnappedTime(rawStart);
                
                // Prevent trimming past the fixed end
                finalStart = Math.min(finalStart, fixedEnd - 0.1);

                // Trimming Constraints: trimStart cannot be negative
                if (item.type === 'video') {
                  const minPossibleStart = info.initialStartTime - info.initialTrimStart;
                  finalStart = Math.max(finalStart, minPossibleStart);
                }
                
                const finalDelta = finalStart - info.initialStartTime;
                return { 
                  ...item, 
                  startTime: Math.max(0, finalStart), 
                  duration: fixedEnd - finalStart, 
                  trimStart: info.initialTrimStart + finalDelta 
                };
              }
            }
            return item;
          });
        });
      }
    };
    const onUp = () => { isScrubbingRef.current = false; dragInfo.current = null; };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [pxPerSec, handleScrub, isMagnetEnabled]);

  const onSplit = useCallback(() => {
    if (!selectedItemId) return;
    const item = items.find(i => i.id === selectedItemId);
    if (!item) return;
    const t = internalTimeRef.current;
    if (t <= item.startTime || t >= item.startTime + item.duration) return;
    
    const splitRel = t - item.startTime;
    const newItem: TimelineItem = {
      ...item,
      id: Math.random().toString(),
      startTime: t,
      duration: item.duration - splitRel,
      trimStart: item.trimStart + splitRel,
      fx: item.fx ? { ...item.fx, seed: Math.floor(Math.random() * 100) } : undefined
    };
    
    setItems(prev => {
      const updated = prev.map(i => i.id === item.id ? { ...i, duration: splitRel } : i);
      return [...updated, newItem];
    });
    setSelectedItemId(newItem.id);
  }, [items, selectedItemId]);

  const onAutoArrange = useCallback(() => {
    setItems(prev => {
      // Only arrange 'video' track clips (V1)
      const videos = prev.filter(i => i.type === 'video').sort((a, b) => a.startTime - b.startTime);
      const nonVideos = prev.filter(i => i.type !== 'video');
      
      let cursor = 0;
      const arrangedVideos = videos.map(v => {
        const updated = { ...v, startTime: cursor };
        cursor += v.duration;
        return updated;
      });
      
      return [...arrangedVideos, ...nonVideos];
    });
  }, []);

  const onJumpToStart = useCallback(() => { updateUI(0); syncMedia(0, true); }, [updateUI, syncMedia]);
  const onJumpToEnd = useCallback(() => { updateUI(projectDuration); syncMedia(projectDuration, true); }, [updateUI, syncMedia, projectDuration]);

  const onDropFromLibrary = useCallback((asset: { name: string, url: string, duration: number }, startTime: number) => {
    const newItem: TimelineItem = { 
      id: Math.random().toString(), type: 'video', startTime, duration: asset.duration, trimStart: 0, originalDuration: asset.duration, name: asset.name, url: asset.url, color: 'bg-zinc-700', fx: { ...DEFAULT_FX, seed: Math.floor(Math.random() * 100) } 
    };
    setItems(p => [...p, newItem]);
    setSelectedItemId(newItem.id);
    setDraggingAsset(null);
    setDragOverTime(null);
  }, []);

  const renderRuler = useMemo(() => {
    const markers = [];
    const step = pxPerSec < 10 ? 10 : pxPerSec < 30 ? 5 : 1;
    for (let i = 0; i < totalTimelineDuration; i += step) {
      markers.push(
        <div key={i} className="absolute top-0 border-l border-white/10 h-full" style={{ left: i * pxPerSec }}>
          <span className="text-[7px] text-zinc-600 ml-1 mt-1 block">
            {Math.floor(i / 60)}:{(i % 60).toString().padStart(2, '0')}
          </span>
        </div>
      );
    }
    return markers;
  }, [totalTimelineDuration, pxPerSec]);

  return (
    <div className="flex flex-col h-screen bg-[#0d0d0f] text-zinc-400 font-sans overflow-hidden select-none text-[11px]">
      <ProjectSettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} settings={projectSettings} setSettings={setProjectSettings} />
      <RenderModal 
        isOpen={showRenderModal} 
        onClose={() => setShowRenderModal(false)} 
        items={items} 
        projectSettings={projectSettings} 
        projectDuration={projectDuration} 
      />
      <Header 
        onSettingsClick={() => setShowSettingsModal(true)} 
        onBrandClick={() => setSelectedItemId(null)} 
        onRenderClick={() => setShowRenderModal(true)}
        timeDisplayRef={timeDisplayRef} 
        projectDuration={projectDuration} 
      />
      <main className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex shrink-0">
          <MediaBin 
            library={library} 
            onImport={handleImport} 
            onAddFromLibrary={(a) => {
               const newItem: TimelineItem = { id: Math.random().toString(), type: 'video', startTime: internalTimeRef.current, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: 'bg-zinc-700', fx: { ...DEFAULT_FX, seed: Math.floor(Math.random() * 100) } };
               setItems(p => [...p, newItem]); setSelectedItemId(newItem.id);
            }}
            onDragStart={setDraggingAsset}
          />
          <StylePalette 
            presets={presets}
            onApplyPreset={handleApplyPreset}
          />
        </div>
        <div className="flex-1 flex flex-col bg-black relative overflow-hidden min-h-0">
          <PreviewPlayer 
            videoRef={videoRef} items={items} currentTime={internalTimeRef.current} 
            projectDuration={projectDuration} projectSettings={projectSettings} 
            activeClip={activeClip} isPlaying={isPlaying}
          />
        </div>
        <Inspector 
          activeItem={items.find(i => i.id === selectedItemId)} 
          onUpdateItem={(id, upd) => setItems(p => p.map(i => i.id === id ? { ...i, ...upd } : i))} 
          onDeleteItem={(id) => { setItems(p => p.filter(i => i.id !== id)); setSelectedItemId(null); }}
          onSavePreset={handleSavePreset}
        />
      </main>
      <Timeline 
        items={items} pxPerSec={pxPerSec} setPxPerSec={setPxPerSec} 
        selectedItemId={selectedItemId} setSelectedItemId={setSelectedItemId}
        isMagnetEnabled={isMagnetEnabled} setIsMagnetEnabled={setIsMagnetEnabled}
        projectDuration={projectDuration} totalTimelineDuration={totalTimelineDuration}
        onAddItem={(type: TrackType) => {
          const newItem: TimelineItem = { id: Math.random().toString(), type, startTime: internalTimeRef.current, duration: 5, trimStart: 0, name: type.toUpperCase(), color: type === 'video' ? 'bg-zinc-700' : 'bg-indigo-600', content: type === 'text' ? 'EDIT TEXT' : undefined, effect: type === 'text' ? 'reveal' : undefined, fx: type === 'video' ? { ...DEFAULT_FX, seed: Math.floor(Math.random() * 100) } : undefined };
          setItems(p => [...p, newItem]); setSelectedItemId(newItem.id);
        }}
        isPlaying={isPlaying} setIsPlaying={setIsPlaying}
        onMouseDown={(e) => { isScrubbingRef.current = true; setIsPlaying(false); handleScrub(e.clientX); }}
        onStartDrag={startDrag} timelineRef={timelineRef} playheadRef={playheadRef}
        onSplit={onSplit}
        onAutoArrange={onAutoArrange}
        onJumpToStart={onJumpToStart}
        onJumpToEnd={onJumpToEnd}
        isLooping={isLooping}
        setIsLooping={setIsLooping}
        renderRuler={renderRuler}
        onDropFromLibrary={onDropFromLibrary}
        onDropExternalFiles={onDropExternalFiles}
        draggingAsset={draggingAsset}
        dragOverTime={dragOverTime}
        onDragUpdate={setDragOverTime}
      />
      <style>{`
        @keyframes handheld {
          0% { transform: translate3d(0,0,0) rotate(0deg); }
          25% { transform: translate3d(calc(1px * var(--s-int)), calc(-1px * var(--s-int)), 0) rotate(0.1deg); }
          50% { transform: translate3d(calc(-1.2px * var(--s-int)), calc(1.2px * var(--s-int)), 0) rotate(-0.1deg); }
          75% { transform: translate3d(calc(0.8px * var(--s-int)), calc(0.5px * var(--s-int)), 0) rotate(0.05deg); }
          100% { transform: translate3d(0,0,0) rotate(0deg); }
        }
        .animate-handheld { animation: handheld calc(1s / var(--s-freq)) infinite ease-in-out; animation-delay: var(--s-delay); }
        .animate-reveal { animation: reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes reveal { 0% { opacity: 0; transform: translateY(20px) scale(0.9); filter: blur(10px); } 100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
        .scrollbar-thin::-webkit-scrollbar { width: 12px; height: 8px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; border: 2px solid #1a1a1e; }
      `}</style>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<RapidCutEditor />);
