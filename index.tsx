
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

import { TimelineItem, ProjectSettings, Project, ProjectMetadata, MediaAsset } from './types.ts';
import { ProjectSettingsModal } from './ProjectSettingsModal.tsx';
import { RenderModal } from './RenderModal.tsx';
import { ProjectManagerModal } from './ProjectManagerModal.tsx';
import { Header } from './Header.tsx';
import { MediaBin } from './MediaBin.tsx';
import { StylePalette } from './StylePalette.tsx';
import { PreviewPlayer } from './PreviewPlayer.tsx';
import { Inspector } from './Inspector.tsx';
import { Timeline } from './Timeline.tsx';
import { assetDB } from './db.ts';

const STORAGE_KEYS = {
  PROJECT_LIST: 'rapidcut_project_list',
  ACTIVE_ID: 'rapidcut_active_project_id',
  PROJECT_PREFIX: 'rapidcut_project_'
};

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
  const [pxPerSec, setPxPerSec] = useState(15);
  const [isMagnetEnabled, setIsMagnetEnabled] = useState(true);
  const [isMagneticMode, setIsMagneticMode] = useState(false);
  const [v1Muted, setV1Muted] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeDraggingId, setActiveDraggingId] = useState<string | null>(null);
  
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [projectName, setProjectName] = useState('Untitled Project');
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [library, setLibrary] = useState<MediaAsset[]>([]);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({ width: 528, height: 768, fps: 30 });
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRenderModal, setShowRenderModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
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

  // --- Persistence Logic ---

  const saveToStorage = useCallback(() => {
    if (isInitialLoad.current || !activeProjectId || isRestoringMedia) return;
    
    const projectData: Project = {
      id: activeProjectId,
      name: projectName,
      lastModified: Date.now(),
      items,
      settings: projectSettings,
      library
    };

    localStorage.setItem(STORAGE_KEYS.PROJECT_PREFIX + activeProjectId, JSON.stringify(projectData));
    
    setProjects(prev => {
      const exists = prev.find(p => p.id === activeProjectId);
      let newList;
      if (exists) {
        newList = prev.map(p => p.id === activeProjectId ? { ...p, name: projectName, lastModified: projectData.lastModified } : p);
      } else {
        newList = [...prev, { id: activeProjectId, name: projectName, lastModified: projectData.lastModified }];
      }
      localStorage.setItem(STORAGE_KEYS.PROJECT_LIST, JSON.stringify(newList));
      return newList;
    });
  }, [activeProjectId, projectName, items, projectSettings, library, isRestoringMedia]);

  useEffect(() => {
    const timer = setTimeout(saveToStorage, 1500);
    return () => clearTimeout(timer);
  }, [saveToStorage]);

  const restoreMediaUrls = async (lib: MediaAsset[], timelineItems: TimelineItem[]) => {
    setIsRestoringMedia(true);
    const urlMap = new Map<string, string>();
    
    // 1. 恢復 Library URLs
    const newLibrary = await Promise.all(lib.map(async (asset) => {
      const blob = await assetDB.getAsset(asset.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        urlMap.set(asset.id, url);
        return { ...asset, url };
      }
      return asset;
    }));

    // 2. 更新 Timeline Items
    const newItems = timelineItems.map(item => {
      if (item.assetId && urlMap.has(item.assetId)) {
        return { ...item, url: urlMap.get(item.assetId) };
      }
      return item;
    });

    setLibrary(newLibrary);
    setItems(newItems);
    setIsRestoringMedia(false);
  };

  const loadProject = async (id: string) => {
    const dataJson = localStorage.getItem(STORAGE_KEYS.PROJECT_PREFIX + id);
    if (!dataJson) return;
    
    const data = JSON.parse(dataJson) as Project;
    setActiveProjectId(id);
    setProjectName(data.name);
    setProjectSettings(data.settings || { width: 528, height: 768, fps: 30 });
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, id);
    setShowProjectModal(false);

    // 關鍵：重連媒體
    await restoreMediaUrls(data.library || [], data.items || []);
  };

  useEffect(() => {
    const initApp = async () => {
      await assetDB.init();
      const listJson = localStorage.getItem(STORAGE_KEYS.PROJECT_LIST);
      const activeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_ID);
      
      if (listJson) {
        const list = JSON.parse(listJson) as ProjectMetadata[];
        setProjects(list);
        if (activeId && list.find(p => p.id === activeId)) {
          await loadProject(activeId);
        } else if (list.length > 0) {
          await loadProject(list[0].id);
        } else {
          createNewProject();
        }
      } else {
        createNewProject();
      }
      isInitialLoad.current = false;
    };
    initApp();
  }, []);

  const createNewProject = () => {
    const id = Math.random().toString(36).substr(2, 9);
    const newProjectName = 'New Project ' + (projects.length + 1);
    setActiveProjectId(id);
    setProjectName(newProjectName);
    setItems([]);
    setLibrary([]);
    setProjectSettings({ width: 528, height: 768, fps: 30 });
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, id);
    setShowProjectModal(false);
  };

  const deleteProject = async (id: string) => {
    const dataJson = localStorage.getItem(STORAGE_KEYS.PROJECT_PREFIX + id);
    if (dataJson) {
      const data = JSON.parse(dataJson) as Project;
      // 刪除該專案的所有媒體實體
      for (const asset of data.library) {
        await assetDB.deleteAsset(asset.id);
      }
    }
    localStorage.removeItem(STORAGE_KEYS.PROJECT_PREFIX + id);
    const newList = projects.filter(p => p.id !== id);
    setProjects(newList);
    localStorage.setItem(STORAGE_KEYS.PROJECT_LIST, JSON.stringify(newList));
    if (activeProjectId === id) {
      if (newList.length > 0) loadProject(newList[0].id);
      else createNewProject();
    }
  };

  const exportProject = (id: string) => {
    const dataJson = localStorage.getItem(STORAGE_KEYS.PROJECT_PREFIX + id);
    if (!dataJson) return;
    const blob = new Blob([dataJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const meta = projects.find(p => p.id === id);
    link.download = `${meta?.name || 'Project'}.rapidcut`;
    link.click();
  };

  const importProject = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Project;
      const newId = Math.random().toString(36).substr(2, 9);
      data.id = newId;
      localStorage.setItem(STORAGE_KEYS.PROJECT_PREFIX + newId, JSON.stringify(data));
      setProjects(prev => {
        const newList = [...prev, { id: newId, name: data.name, lastModified: Date.now() }];
        localStorage.setItem(STORAGE_KEYS.PROJECT_LIST, JSON.stringify(newList));
        return newList;
      });
      loadProject(newId);
    } catch (e) {
      alert('Invalid project file.');
    }
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
    if (clip) {
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
      if (audioClip) {
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

  const handleImport = async (files: FileList) => {
    const imported = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) continue;
      
      const assetId = Math.random().toString(36).substr(2, 9);
      // 永久儲存至 IndexedDB
      await assetDB.saveAsset(assetId, file);
      
      const url = URL.createObjectURL(file);
      const isAudio = file.type.startsWith('audio/');
      const dur = await new Promise<number>(r => {
        const el = document.createElement(isAudio ? 'audio' : 'video');
        el.src = url; el.onloadedmetadata = () => r(el.duration);
        el.onerror = () => r(5);
      });
      const asset: MediaAsset = { id: assetId, name: file.name, url, duration: dur, type: isAudio ? 'audio' : 'video' };
      setLibrary(prev => [...prev, asset]);
      imported.push(asset);
    }
    return imported;
  };

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
  const autoArrange = () => {
    setItems(prev => {
      let cursor = 0;
      const videos = prev.filter(v => v.type === 'video').sort((a,b) => a.startTime - b.startTime);
      const others = prev.filter(v => v.type !== 'video');
      return [...videos.map(v => { const res = { ...v, startTime: cursor }; cursor += v.duration; return res; }), ...others];
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

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); setIsPlaying(p => !p); }
      if (e.code === 'KeyS') { if (selectedItemId) splitItem(selectedItemId, internalTimeRef.current); }
      if (e.code === 'Delete' || e.code === 'Backspace') { if (selectedItemId) { deleteItem(selectedItemId); setSelectedItemId(null); } }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedItemId, setIsPlaying]);

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
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={loadProject}
        onCreateProject={createNewProject}
        onDeleteProject={deleteProject}
        onExportProject={exportProject}
        onImportProject={importProject}
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
        {isRestoringMedia && (
          <div className="absolute inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fade-in">
             <div className="flex flex-col items-center gap-3">
               <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
               <span className="text-[10px] font-black text-indigo-100 uppercase tracking-widest">Restoring Media Assets...</span>
             </div>
          </div>
        )}

        <MediaBin 
          library={library} 
          onImport={handleImport} 
          onAddFromLibrary={(a) => addItem({ id: Math.random().toString(), assetId: a.id, type: a.type, startTime: internalTimeRef.current, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: a.type === 'video' ? 'bg-zinc-700' : 'bg-emerald-600', muted: false, volume: 1.0 })} 
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
        items={items} pxPerSec={pxPerSec} setPxPerSec={setPxPerSec} selectedItemId={selectedItemId} setSelectedItemId={setSelectedItemId} activeDraggingId={activeDraggingId} isMagnetEnabled={isMagnetEnabled} setIsMagnetEnabled={setIsMagnetEnabled} isMagneticMode={isMagneticMode} setIsMagneticMode={setIsMagneticMode} projectDuration={projectDuration} totalTimelineDuration={totalTimelineDuration} onAddItem={(type) => addItem({ id: Math.random().toString(), type, startTime: internalTimeRef.current, duration: 5, trimStart: 0, name: type.toUpperCase(), color: type === 'video' ? 'bg-zinc-700' : 'bg-indigo-600', muted: false, volume: 1.0 })} onSplit={() => selectedItemId && splitItem(selectedItemId, internalTimeRef.current)} onAutoArrange={autoArrange} isPlaying={isPlaying} setIsPlaying={setIsPlaying} onJumpToStart={() => seek(0)} onJumpToEnd={() => seek(projectDuration)} isLooping={isLooping} setIsLooping={setIsLooping} onMouseDown={(e) => { if (!timelineRef.current) return; const rect = timelineRef.current.getBoundingClientRect(); const scrollX = timelineRef.current.scrollLeft; const t = Math.max(0, (e.clientX - rect.left + scrollX) / pxPerSec); seek(t); isScrubbingRef.current = true; setIsPlaying(false); }} onStartDrag={(e, item, type) => { const rect = timelineRef.current?.getBoundingClientRect() || { left: 0 }; const scrollX = timelineRef.current?.scrollLeft || 0; const clickTime = (e.clientX - rect.left + scrollX) / pxPerSec; setActiveDraggingId(item.id); dragInfoRef.current = { id: item.id, type, initialStart: item.startTime, initialDur: item.duration, clickOffsetTime: clickTime - item.startTime }; }} renderRuler={renderRuler} timelineRef={timelineRef} playheadRef={playheadRef} draggingAsset={draggingAsset} dragOverTime={dragOverTime} onDragUpdate={setDragOverTime} onDropFromLibrary={(a, t) => { addItem({ id: Math.random().toString(), assetId: a.id, type: a.type, startTime: t, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: a.type === 'video' ? 'bg-zinc-700' : 'bg-emerald-600', muted: false, volume: 1.0 }); setDraggingAsset(null); setDragOverTime(null); }} onDropExternalFiles={async (f, t) => { const assets = await handleImport(f); let cursor = t; assets.forEach(a => { addItem({ id: Math.random().toString(), assetId: a.id, type: a.type, startTime: cursor, duration: a.duration, trimStart: 0, originalDuration: a.duration, name: a.name, url: a.url, color: a.type === 'video' ? 'bg-zinc-700' : 'bg-emerald-600', muted: false, volume: 1.0 }); cursor += a.duration; }); }}
        v1Muted={v1Muted} onToggleV1Mute={() => setV1Muted(!v1Muted)}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<RapidCutEditor />);
