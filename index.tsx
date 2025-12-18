
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

import { TimelineItem, ProjectSettings, TrackType } from './types';
import { SNAP_THRESHOLD, MAX_VIDEO_DURATION, MIN_ZOOM, MAX_ZOOM } from './constants';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { Header } from './Header';
import { MediaBin } from './MediaBin';
import { PreviewPlayer } from './PreviewPlayer';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';
import { TransportControls } from './TransportControls';

function QuickCutEditor() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(15);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    width: 528, height: 768, fps: 30
  });
  const [items, setItems] = useState<TimelineItem[]>([
    { id: 'v1', type: 'video', startTime: 0, duration: 8, originalDuration: 8, allowExtension: false, name: 'Ferret_Christmas_Vibe', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', color: 'bg-zinc-700' },
    { id: 't1', type: 'text', startTime: 1, duration: 4, name: 'Title_Main', content: 'MERRY XMAS', color: 'bg-indigo-600' },
  ]);
  const [library, setLibrary] = useState<{name: string, url: string, duration: number}[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [shakeIntensity, setShakeIntensity] = useState(1.2);
  const [isShakeEnabled, setIsShakeEnabled] = useState(true);
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
  const dragInfo = useRef<{ id: string; type: 'move' | 'trim'; initialX: number; initialStartTime: number; initialDuration: number; } | null>(null);

  const projectDuration = useMemo(() => items.length === 0 ? 0 : Math.max(...items.map(i => i.startTime + i.duration)), [items]);

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

  const syncMedia = useCallback((t: number, forceSeek = false) => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const activeVideo = items.find(i => i.type === 'video' && t >= i.startTime && t <= i.startTime + i.duration);
    
    if (activeVideo) {
      const targetSeekTime = t - activeVideo.startTime;
      if (currentClipIdRef.current !== activeVideo.id) {
        currentClipIdRef.current = activeVideo.id;
        v.src = activeVideo.url!;
        v.currentTime = targetSeekTime;
        if (isPlaying && !isScrubbingRef.current) v.play().catch(() => {});
      } else {
        const clamped = activeVideo.originalDuration ? Math.min(targetSeekTime, activeVideo.originalDuration - 0.01) : targetSeekTime;
        if (forceSeek || Math.abs(v.currentTime - clamped) > 0.3) v.currentTime = clamped;
        if (activeVideo.originalDuration && targetSeekTime >= activeVideo.originalDuration) {
          if (!v.paused) v.pause();
        } else if (isPlaying && v.paused && !isScrubbingRef.current) {
          v.play().catch(() => {});
        }
      }
    } else {
      currentClipIdRef.current = null;
      if (!v.paused) v.pause();
    }
  }, [items, isPlaying]);

  const animate = useCallback((now: number) => {
    if (!lastUpdateRef.current) lastUpdateRef.current = now;
    const delta = (now - lastUpdateRef.current) / 1000;
    lastUpdateRef.current = now;

    if (isPlaying && !isScrubbingRef.current) {
      let t = internalTimeRef.current + delta;
      if (videoRef.current && currentClipIdRef.current) {
        const activeClip = items.find(i => i.id === currentClipIdRef.current);
        if (activeClip && !videoRef.current.paused && !videoRef.current.seeking) {
           if (activeClip.originalDuration && (t - activeClip.startTime) < activeClip.originalDuration) {
              t = activeClip.startTime + videoRef.current.currentTime;
           }
        }
      }
      if (t >= projectDuration) {
        if (isLooping) { t = 0; syncMedia(0, true); }
        else { t = projectDuration; setIsPlaying(false); syncMedia(t, true); }
      }
      if (t >= MAX_VIDEO_DURATION) { setIsPlaying(false); t = 0; syncMedia(0, true); }
      updateUI(t);
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [isPlaying, updateUI, syncMedia, items, projectDuration, isLooping]);

  useEffect(() => {
    if (isPlaying) { lastUpdateRef.current = performance.now(); requestRef.current = requestAnimationFrame(animate); }
    else { if (requestRef.current) cancelAnimationFrame(requestRef.current); videoRef.current?.pause(); }
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isPlaying, animate]);

  useEffect(() => updateUI(internalTimeRef.current), [pxPerSec, updateUI]);

  const jumpToStart = () => { setIsPlaying(false); updateUI(0); syncMedia(0, true); };
  const jumpToEnd = () => { setIsPlaying(false); updateUI(projectDuration); syncMedia(projectDuration, true); };

  const splitClip = useCallback(() => {
    const t = internalTimeRef.current;
    const targetId = selectedItemId || items.find(i => t > i.startTime && t < i.startTime + i.duration)?.id;
    if (!targetId) return;
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === targetId);
      const item = prev[idx];
      if (!item || t <= item.startTime || t >= item.startTime + item.duration) return prev;
      const first = { ...item, duration: t - item.startTime };
      const second = { ...item, id: Math.random().toString(36).substr(2, 9), startTime: t, duration: item.duration - (t - item.startTime), name: `${item.name}_part2` };
      const next = [...prev];
      next.splice(idx, 1, first, second);
      return next;
    });
  }, [selectedItemId, items]);

  const handleImport = async (files: FileList) => {
    const list = Array.from(files).filter(f => f.type.startsWith('video/'));
    const assets = [];
    for (const file of list) {
      const url = URL.createObjectURL(file);
      const duration = await new Promise<number>((r) => {
        const v = document.createElement('video');
        v.src = url;
        v.onloadedmetadata = () => r(v.duration);
        v.onerror = () => r(5);
      });
      assets.push({ name: file.name, url, duration });
    }
    setLibrary(prev => [...prev, ...assets]);
  };

  const handleScrub = useCallback((clientX: number) => {
    if (timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const x = clientX - rect.left + timelineRef.current.scrollLeft;
      const newTime = Math.max(0, x / pxPerSec);
      updateUI(newTime);
      syncMedia(newTime, true);
    }
  }, [pxPerSec, updateUI, syncMedia]);

  const startDrag = (e: React.MouseEvent, item: TimelineItem, type: 'move' | 'trim') => {
    dragInfo.current = { id: item.id, type, initialX: e.clientX, initialStartTime: item.startTime, initialDuration: item.duration };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isScrubbingRef.current) handleScrub(e.clientX);
      else if (dragInfo.current) {
        const info = dragInfo.current;
        const deltaTime = (e.clientX - info.initialX) / pxPerSec;
        setItems(prev => prev.map(item => {
          if (item.id === info.id) {
            if (info.type === 'move') {
              let next = Math.max(0, info.initialStartTime + deltaTime);
              if (isMagnetEnabled) {
                if (next < SNAP_THRESHOLD) next = 0;
                if (Math.abs(next - internalTimeRef.current) < SNAP_THRESHOLD) next = internalTimeRef.current;
                if (Math.abs(next - projectDuration) < SNAP_THRESHOLD) next = projectDuration;
              }
              return { ...item, startTime: next };
            } else {
              let nextDur = Math.max(0.1, info.initialDuration + deltaTime);
              if (item.type === 'video' && !item.allowExtension && item.originalDuration) nextDur = Math.min(nextDur, item.originalDuration);
              return { ...item, duration: nextDur };
            }
          }
          return item;
        }));
      }
    };
    const onUp = () => { isScrubbingRef.current = false; dragInfo.current = null; };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isMagnetEnabled, pxPerSec, handleScrub, projectDuration]);

  const renderRuler = useMemo(() => {
    const res = [];
    let step = pxPerSec < 6 ? 60 : pxPerSec < 12 ? 30 : 10;
    for (let i = 0; i <= MAX_VIDEO_DURATION; i += step) {
      const isMin = i % 60 === 0;
      res.push(<div key={i} className="absolute flex flex-col" style={{ left: i * pxPerSec }}><div className={`w-[1px] bg-zinc-700 mb-1 ${isMin ? 'h-3 bg-zinc-500' : 'h-2'}`} />{(isMin || pxPerSec > 10) && <span className={`text-[7px] font-mono leading-none ${isMin ? 'text-zinc-400 font-bold' : 'text-zinc-600'}`}>{Math.floor(i / 60)}:{(i % 60).toString().padStart(2, '0')}</span>}</div>);
    }
    return res;
  }, [pxPerSec]);

  return (
    <div className="flex flex-col h-screen bg-[#0d0d0f] text-zinc-400 font-sans overflow-hidden select-none text-[11px]">
      <ProjectSettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} settings={projectSettings} setSettings={setProjectSettings} />
      <Header onSettingsClick={() => setShowSettingsModal(true)} onBrandClick={() => setSelectedItemId(null)} timeDisplayRef={timeDisplayRef} />
      <main className="flex-1 flex overflow-hidden min-h-0">
        <MediaBin library={library} onImport={handleImport} onAddFromLibrary={(a) => {
          const newItem = { id: Math.random().toString(36).substr(2, 9), type: 'video' as TrackType, startTime: internalTimeRef.current, duration: a.duration, originalDuration: a.duration, allowExtension: false, name: a.name, url: a.url, color: 'bg-zinc-700' };
          setItems(p => [...p, newItem]); setSelectedItemId(newItem.id);
        }} />
        <div className="flex-1 flex flex-col bg-black relative overflow-hidden min-h-0">
          <PreviewPlayer videoRef={videoRef} items={items} currentTime={internalTimeRef.current} projectSettings={projectSettings} isShakeEnabled={isShakeEnabled} shakeIntensity={shakeIntensity} isPlaying={isPlaying} />
          <TransportControls isPlaying={isPlaying} setIsPlaying={setIsPlaying} onSplit={splitClip} onJumpToStart={jumpToStart} onJumpToEnd={jumpToEnd} isLooping={isLooping} setIsLooping={setIsLooping} />
        </div>
        <Inspector 
          activeItem={items.find(i => i.id === selectedItemId)} 
          onUpdateItem={(id, upd) => setItems(p => p.map(i => i.id === id ? { ...i, ...upd } : i))} 
          onDeleteItem={(id) => { setItems(p => p.filter(i => i.id !== id)); setSelectedItemId(null); }}
          isShakeEnabled={isShakeEnabled} setIsShakeEnabled={setIsShakeEnabled}
          shakeIntensity={shakeIntensity} setShakeIntensity={setShakeIntensity}
        />
      </main>
      <Timeline 
        items={items} pxPerSec={pxPerSec} setPxPerSec={setPxPerSec} 
        selectedItemId={selectedItemId} setSelectedItemId={setSelectedItemId}
        isMagnetEnabled={isMagnetEnabled} setIsMagnetEnabled={setIsMagnetEnabled}
        projectDuration={projectDuration}
        onAddItem={(type) => {
          const newItem = { id: Math.random().toString(36).substr(2, 9), type, startTime: internalTimeRef.current, duration: 5, name: type.toUpperCase(), color: type === 'video' ? 'bg-zinc-700' : 'bg-indigo-600', content: type === 'text' ? 'EDIT TEXT' : undefined, allowExtension: type === 'text' };
          setItems(p => [...p, newItem]); setSelectedItemId(newItem.id);
        }}
        onMouseDown={(e) => { isScrubbingRef.current = true; setIsPlaying(false); handleScrub(e.clientX); }}
        onStartDrag={startDrag} renderRuler={renderRuler} 
        playheadRef={playheadRef} timelineRef={timelineRef}
      />
      <style>{`
        @keyframes handheld { 0% { transform: translate3d(0,0,0); } 25% { transform: translate3d(calc(0.6px * var(--shake-intensity)), calc(-0.4px * var(--shake-intensity)), 0) rotate(0.02deg); } 50% { transform: translate3d(calc(-0.4px * var(--shake-intensity)), calc(0.8px * var(--shake-intensity)), 0) rotate(-0.02deg); } 100% { transform: translate3d(0,0,0); } }
        .animate-handheld { animation: handheld 0.9s infinite ease-in-out; }
        .animate-reveal { animation: reveal 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes reveal { 0% { opacity: 0; transform: translateY(10px); filter: blur(4px); } 100% { opacity: 1; transform: translateY(0); filter: blur(0); } }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; height: 4px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<QuickCutEditor />);
