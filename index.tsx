
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

import { TimelineItem, ProjectSettings, Project, ProjectMetadata, MediaAsset } from './types.ts';
import { ProjectSettingsModal } from './ProjectSettingsModal.tsx';
import { RenderModal } from './RenderModal.tsx';
import { ProjectManagerModal } from './ProjectManagerModal.tsx';
import { DeleteConfirmModal } from './DeleteConfirmModal.tsx';
import { Header } from './Header.tsx';
import { MediaBin } from './MediaBin.tsx';
import { StylePalette } from './StylePalette.tsx';
import { PreviewPlayer } from './PreviewPlayer.tsx';
import { Inspector } from './Inspector.tsx';
import { Timeline } from './Timeline.tsx';
import { assetDB } from './db.ts';
import { useProjectManager } from './useProjectManager.ts';

const TimelineUtils = {
  round: (num: number) => Math.round(num * 1000) / 1000,
  getSnapPoints(items: TimelineItem[], excludeId: string | null, playheadTime: number) {
    const points = new Set([0, this.round(playheadTime)]);
    items.forEach(i => {
      if (i.id !== excludeId) {
        points.add(this.round(i.startTime));
        points.add(this.round(i.startTime + i.duration));
      }
    });
    return Array.from(points);
  },
  applySnap(time: number, snapPoints: number[], threshold: number): { time: number, snapped: boolean } {
    if (snapPoints.length === 0) return { time, snapped: false };
    let closest = time;
    let minDiff = Infinity;
    for (const p of snapPoints) {
      const diff = Math.abs(time - p);
      if (diff < minDiff) { minDiff = diff; closest = p; }
    }
    if (minDiff < threshold) return { time: this.round(closest), snapped: true };
    return { time: this.round(time), snapped: false };
  },
  getClipAtTime(items: TimelineItem[], time: number): TimelineItem | undefined {
    return items.find(i => i.type === 'video' && time >= i.startTime && time <= i.startTime + i.duration + 0.001);
  }
};

function RapidCutEditor() {
  const pm = useProjectManager();
  
  // UI 狀態
  const [pxPerSec, setPxPerSec] = useState(15);
  const [isMagnetEnabled, setIsMagnetEnabled] = useState(true);
  const [isMagneticMode, setIsMagneticMode] = useState(false);
  const [v1Muted, setV1Muted] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeDraggingId, setActiveDraggingId] = useState<string | null>(null);
  
  // 編輯器核心數據
  const [projectName, setProjectName] = useState('Untitled Project');
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [library, setLibrary] = useState<MediaAsset[]>([]);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({ width: 528, height: 768, fps: 30 });
  
  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectMetadata | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoringMedia, setIsRestoringMedia] = useState(false);
  
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
  const isInitialLoad = useRef(true);

  // 素材還原邏輯
  const restoreMediaUrls = async (lib: MediaAsset[]) => {
    const updatedLib = [...lib];
    const urlMap = new Map<string, string>();

    for (let i = 0; i < updatedLib.length; i++) {
      const asset = updatedLib[i];
      const handle = await assetDB.getHandle(asset.id);
      if (handle) {
        // @ts-ignore
        const state = await handle.queryPermission({ mode: 'read' });
        if (state === 'granted') {
          const file = await handle.getFile();
          const url = URL.createObjectURL(file);
          updatedLib[i] = { ...asset, url, isOffline: false, handle };
          urlMap.set(asset.id, url);
        } else {
          updatedLib[i] = { ...asset, isOffline: true, handle };
        }
      }
    }

    setLibrary(updatedLib);
    setItems(prev => prev.map(item => {
      if (item.assetId && urlMap.has(item.assetId)) {
        return { ...item, url: urlMap.get(item.assetId) };
      }
      return item;
    }));
  };

  // 載入專案流程
  const loadProject = async (id: string) => {
    const data = pm.getProjectData(id);
    if (!data) return;

    // 重置編輯器狀態
    pm.markActive(id);
    setProjectName(data.name);
    setProjectSettings(data.settings || { width: 528, height: 768, fps: 30 });
    setItems(data.items);
    setLibrary(data.library.map(a => ({ ...a, isOffline: true })));
    setSelectedItemId(null);
    setShowProjectModal(false);

    // 嘗試還原素材連結
    await restoreMediaUrls(data.library);
  };

  // 自動存檔監聽
  useEffect(() => {
    if (isInitialLoad.current || !pm.activeProjectId) return;
    const timer = setTimeout(() => {
      pm.saveProject({
        id: pm.activeProjectId,
        name: projectName,
        lastModified: Date.now(),
        items,
        settings: projectSettings,
        library
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [pm.activeProjectId, projectName, items, projectSettings, library]);

  // 初始化
  useEffect(() => {
    const initApp = async () => {
      await assetDB.init();
      const lastActiveId = localStorage.getItem('rapidcut_active_project_id');
      if (lastActiveId) {
        await loadProject(lastActiveId);
      } else {
        createNewProject();
      }
      isInitialLoad.current = false;
    };
    initApp();
  }, []);

  const createNewProject = () => {
    const id = Math.random().toString(36).substr(2, 9);
    const newName = 'Project ' + (pm.projects.length + 1);
    pm.markActive(id);
    setProjectName(newName);
    setItems([]);
    setLibrary([]);
    setProjectSettings({ width: 528, height: 768, fps: 30 });
    setShowProjectModal(false);
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    await pm.deleteProject(projectToDelete.id);
    if (pm.activeProjectId === projectToDelete.id) {
      createNewProject();
    }
    setIsDeleting(false);
    setProjectToDelete(null);
  };

  const internalTimeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);

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
    const a = audioRef.current;
    if (!v) return;

    const clip = TimelineUtils.getClipAtTime(items, t);
    if (clip && clip.url) {
      const target = (t - clip.startTime) + (clip.trimStart || 0);
      if (v.src !== clip.url) {
        v.src = clip.url || '';
        v.onloadedmetadata = () => { v.currentTime = target; if (isPlaying && !trimPreviewTime) v.play().catch(()=>{}); };
      } else {
        if (trimPreviewTime !== null) { v.pause(); v.currentTime = target; }
        else {
          if (forceSeek || Math.abs(v.currentTime - target) > 0.05 || !isPlaying) v.currentTime = target;
          if (isPlaying && v.paused) v.play().catch(()=>{});
        }
      }
      v.style.opacity = '1';
      v.muted = v1Muted || (clip.muted ?? false);
      v.volume = clip.volume ?? 1.0;
    } else {
      v.pause(); v.style.opacity = '0';
    }

    if (a) {
      const audioClip = items.find(i => i.type === 'audio' && t >= i.startTime && t <= i.startTime + i.duration + 0.001);
      if (audioClip && audioClip.url) {
        const aTarget = (t - audioClip.startTime) + (audioClip.trimStart || 0);
        if (a.src !== audioClip.url) {
          a.src = audioClip.url || '';
          a.onloadedmetadata = () => { a.currentTime = aTarget; if (isPlaying && !trimPreviewTime) a.play().catch(() => {}); };
        } else {
          if (trimPreviewTime !== null) { a.pause(); a.currentTime = aTarget; }
          else {
            if (forceSeek || Math.abs(a.currentTime - aTarget) > 0.1 || !isPlaying) a.currentTime = aTarget;
            if (isPlaying && a.paused) a.play().catch(() => {});
          }
        }
        a.volume = audioClip.volume ?? 1.0;
        a.muted = audioClip.muted ?? false;
      } else { a.pause(); if (a.src) a.src = ''; }
    }
  }, [items, isPlaying, trimPreviewTime, v1Muted]);

  const seek = useCallback((t: number) => { syncUI(t); syncMedia(t, true); }, [syncUI, syncMedia]);

  useEffect(() => {
    let frame: number;
    let lastUpdate = 0;
    const animate = (now: number) => {
      if (!lastUpdate) { lastUpdate = now; frame = requestAnimationFrame(animate); return; }
      const dt = (now - lastUpdate) / 1000;
      lastUpdate = now;
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

  const addItem = (item: TimelineItem) => setItems(prev => [...prev, item]);
  const updateItem = (id: string, updates: Partial<TimelineItem>) => setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  const deleteItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const splitItem = (id: string, time: number) => {
    setItems(prev => {
      const target = prev.find(i => i.id === id);
      if (!target || time <= target.startTime || time >= target.startTime + target.duration) return prev;
      const splitRel = time - target.startTime;
      const newItem: TimelineItem = { ...target, id: Math.random().toString(), startTime: time, duration: target.duration - splitRel, trimStart: (target.trimStart || 0) + splitRel };
      return [...prev.map(i => i.id === id ? { ...i, duration: splitRel } : i), newItem];
    });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!timelineRef.current || !dragInfoRef.current) {
        if (isScrubbingRef.current && timelineRef.current) {
           const rect = timelineRef.current.getBoundingClientRect();
           const t = Math.max(0, (e.clientX - rect.left + timelineRef.current.scrollLeft) / pxPerSec);
           seek(t);
        }
        return;
      }
      const rect = timelineRef.current.getBoundingClientRect();
      const scrollX = timelineRef.current.scrollLeft;
      const info = dragInfoRef.current;
      const rawMouseTime = (e.clientX - rect.left + scrollX) / pxPerSec;
      const threshold = 12 / pxPerSec;

      setItems(prev => {
        const snapPoints = isMagnetEnabled ? TimelineUtils.getSnapPoints(prev, info.id, internalTimeRef.current) : [];
        return prev.map(item => {
          if (item.id !== info.id) return item;
          if (info.type === 'move') {
            let newStart = rawMouseTime - info.clickOffsetTime;
            if (isMagnetEnabled) {
              const startRes = TimelineUtils.applySnap(newStart, snapPoints, threshold);
              const endRes = TimelineUtils.applySnap(newStart + item.duration, snapPoints, threshold);
              if (startRes.snapped) newStart = startRes.time;
              else if (endRes.snapped) newStart = endRes.time - item.duration;
            }
            return { ...item, startTime: Math.max(0, TimelineUtils.round(newStart)) };
          }
          if (info.type === 'trim-end') {
            let newEnd = rawMouseTime;
            if (isMagnetEnabled) {
              const res = TimelineUtils.applySnap(newEnd, snapPoints, threshold);
              if (res.snapped) newEnd = res.time;
            }
            if (item.type === 'video') newEnd = Math.min(newEnd, item.startTime + ((item.originalDuration || 100) - (item.trimStart || 0)));
            const newDuration = Math.max(0.1, newEnd - item.startTime);
            setTrimPreviewTime(item.startTime + newDuration);
            return { ...item, duration: TimelineUtils.round(newDuration) };
          }
          if (info.type === 'trim-start') {
            const fixedEnd = info.initialStart + info.initialDur;
            let newStart = rawMouseTime;
            if (isMagnetEnabled) {
              const res = TimelineUtils.applySnap(newStart, snapPoints, threshold);
              if (res.snapped) newStart = res.time;
            }
            newStart = Math.min(newStart, fixedEnd - 0.1);
            if (item.type === 'video') {
              const maxPossibleStart = fixedEnd - (item.originalDuration || 100);
              newStart = Math.max(newStart, maxPossibleStart);
            }
            setTrimPreviewTime(newStart);
            return { 
              ...item, startTime: TimelineUtils.round(newStart), 
              duration: TimelineUtils.round(fixedEnd - newStart), 
              trimStart: TimelineUtils.round((item.trimStart || 0) + (newStart - item.startTime)) 
            };
          }
          return item;
        });
      });
    };
    const onUp = () => { if (dragInfoRef.current && isMagneticMode) autoArrange(); isScrubbingRef.current = false; dragInfoRef.current = null; setTrimPreviewTime(null); setActiveDraggingId(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [pxPerSec, isMagnetEnabled, isMagneticMode, seek]);

  const autoArrange = () => {
    setItems(prev => {
      let cursor = 0;
      const videos = prev.filter(v => v.type === 'video').sort((a,b) => a.startTime - b.startTime);
      const others = prev.filter(v => v.type !== 'video');
      return [...videos.map(v => { const res = { ...v, startTime: cursor }; cursor += v.duration; return res; }), ...others];
    });
  };

  const projectDuration = useMemo(() => items.length === 0 ? 0 : Math.max(...items.map(i => i.startTime + i.duration)), [items]);
  const effectiveTime = trimPreviewTime !== null ? trimPreviewTime : internalTimeRef.current;
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
      <ProjectManagerModal 
        isOpen={showProjectModal} 
        onClose={() => setShowProjectModal(false)} 
        projects={pm.projects}
        activeProjectId={pm.activeProjectId}
        onSelectProject={loadProject}
        onCreateProject={createNewProject}
        onDeleteProject={(id) => setProjectToDelete(pm.projects.find(p => p.id === id) || null)}
        onExportProject={() => {}} // 導出邏輯可留待後續實裝
        onImportProject={() => {}} // 導入邏輯可留待後續實裝
      />
      <DeleteConfirmModal 
        isOpen={!!projectToDelete} 
        onClose={() => setProjectToDelete(null)} 
        onConfirm={handleConfirmDelete} 
        projectName={projectToDelete?.name || ''} 
        isProcessing={isDeleting}
      />
      
      <Header 
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onOpenProjectManager={() => setShowProjectModal(true)}
        onSettingsClick={() => setShowSettingsModal(true)} 
        onBrandClick={() => setSelectedItemId(null)} 
        onRenderClick={() => setShowRenderModal(true)} 
        timeDisplayRef={timeDisplayRef} 
        projectDuration={projectDuration} 
      />

      <main className="flex-1 flex overflow-hidden min-h-0 relative">
        <MediaBin 
          library={library} 
          onImport={async () => {
             try {
                // @ts-ignore
                const handles = await window.showOpenFilePicker({ multiple: true, types: [{ accept: { 'video/*': ['.mp4'], 'audio/*': ['.mp3'] } }] });
                for (const h of handles) {
                  const f = await h.getFile();
                  const assetId = Math.random().toString(36).substr(2, 9);
                  await assetDB.saveHandle(assetId, h);
                  const url = URL.createObjectURL(f);
                  const asset: MediaAsset = { id: assetId, name: f.name, url, duration: 5, type: f.type.startsWith('video') ? 'video' : 'audio', isOffline: false };
                  setLibrary(prev => [...prev, asset]);
                }
             } catch(e){}
          }} 
          onRelink={() => restoreMediaUrls(library)}
          onAddFromLibrary={(a) => addItem({ id: Math.random().toString(), assetId: a.id, type: a.type, startTime: internalTimeRef.current, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: 'bg-zinc-700', muted: false, volume: 1.0 })} 
          onDragStart={setDraggingAsset} 
          timelineItems={items} 
        />
        <StylePalette presets={[]} onApplyPreset={()=>{}} />
        <div className="flex-1 flex flex-col bg-black relative overflow-hidden min-h-0">
          <PreviewPlayer videoRef={videoRef} audioRef={audioRef} items={items} currentTime={effectiveTime} projectDuration={projectDuration} projectSettings={projectSettings} activeClip={activeClip} isPlaying={isPlaying && trimPreviewTime === null} isTrimming={trimPreviewTime !== null} />
        </div>
        <Inspector activeItem={items.find(i => i.id === selectedItemId)} onUpdateItem={updateItem} onDeleteItem={deleteItem} onSavePreset={()=>{}} />
      </main>

      <Timeline 
        items={items} pxPerSec={pxPerSec} setPxPerSec={setPxPerSec} selectedItemId={selectedItemId} setSelectedItemId={setSelectedItemId} activeDraggingId={activeDraggingId} isMagnetEnabled={isMagnetEnabled} setIsMagnetEnabled={setIsMagnetEnabled} isMagneticMode={isMagneticMode} setIsMagneticMode={setIsMagneticMode} projectDuration={projectDuration} totalTimelineDuration={totalTimelineDuration} onAddItem={(type) => addItem({ id: Math.random().toString(), type, startTime: internalTimeRef.current, duration: 5, trimStart: 0, name: type.toUpperCase(), color: 'bg-zinc-700', muted: false, volume: 1.0 })} onSplit={() => selectedItemId && splitItem(selectedItemId, internalTimeRef.current)} onAutoArrange={autoArrange} isPlaying={isPlaying} setIsPlaying={setIsPlaying} onJumpToStart={() => seek(0)} onJumpToEnd={() => seek(projectDuration)} isLooping={isLooping} setIsLooping={setIsLooping} onMouseDown={(e) => { if (!timelineRef.current) return; const rect = timelineRef.current.getBoundingClientRect(); const scrollX = timelineRef.current.scrollLeft; const t = Math.max(0, (e.clientX - rect.left + scrollX) / pxPerSec); seek(t); isScrubbingRef.current = true; setIsPlaying(false); }} onStartDrag={(e, item, type) => { const rect = timelineRef.current?.getBoundingClientRect() || { left: 0 }; const scrollX = timelineRef.current?.scrollLeft || 0; const clickTime = (e.clientX - rect.left + scrollX) / pxPerSec; setActiveDraggingId(item.id); dragInfoRef.current = { id: item.id, type, initialStart: item.startTime, initialDur: item.duration, clickOffsetTime: clickTime - item.startTime }; }} renderRuler={renderRuler} timelineRef={timelineRef} playheadRef={playheadRef} draggingAsset={draggingAsset} dragOverTime={dragOverTime} onDragUpdate={setDragOverTime} onDropFromLibrary={(a, t) => { addItem({ id: Math.random().toString(), assetId: a.id, type: a.type, startTime: t, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: 'bg-zinc-700', muted: false, volume: 1.0 }); setDraggingAsset(null); setDragOverTime(null); }} onDropExternalFiles={() => {}}
        v1Muted={v1Muted} onToggleV1Mute={() => setV1Muted(!v1Muted)}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<RapidCutEditor />);
