
import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Loader2, CheckCircle2, AlertCircle, Video, Settings, Save } from 'lucide-react';
import { TimelineItem, ProjectSettings, RenderSettings } from './types';

interface RenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TimelineItem[];
  projectSettings: ProjectSettings;
  projectDuration: number;
}

export const RenderModal = ({ isOpen, onClose, items, projectSettings, projectDuration }: RenderModalProps) => {
  const [status, setStatus] = useState<'idle' | 'rendering' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [settings, setSettings] = useState<RenderSettings>({
    filename: `RapidCut_${new Date().toISOString().slice(0, 10)}`,
    quality: 'medium',
    bitrate: 12000000 // 12 Mbps default for better quality
  });

  const renderState = useRef({
    stop: false,
    videoElements: new Map<string, HTMLVideoElement>(),
    audioContext: null as AudioContext | null,
    recorder: null as MediaRecorder | null,
    animationFrame: 0
  });

  if (!isOpen) return null;

  const handleStartRender = async () => {
    setStatus('rendering');
    setProgress(0);
    renderState.current.stop = false;

    try {
      // 1. Setup Canvas
      const canvas = document.createElement('canvas');
      canvas.width = projectSettings.width;
      canvas.height = projectSettings.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error("Canvas context failed");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 2. Setup Audio
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      renderState.current.audioContext = audioCtx;
      const audioDest = audioCtx.createMediaStreamDestination();

      // 3. Prepare Media
      const videoClips = items.filter(i => i.type === 'video' && i.url);
      for (const clip of videoClips) {
        const v = document.createElement('video');
        v.src = clip.url!;
        v.crossOrigin = "anonymous";
        v.muted = false; // Must be unmuted to capture audio
        v.preload = "auto";
        
        await new Promise((resolve, reject) => {
          v.onloadedmetadata = () => resolve(null);
          v.onerror = () => reject(new Error(`Failed to load: ${clip.name}`));
        });

        // Route audio
        const source = audioCtx.createMediaElementSource(v);
        source.connect(audioDest);
        // We don't connect to audioCtx.destination to keep the render silent for the user
        
        renderState.current.videoElements.set(clip.id, v);
      }

      // 4. Setup Recorder
      const canvasStream = canvas.captureStream(projectSettings.fps);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks()
      ]);

      const mimeType = [
        'video/mp4;codecs=h264,aac',
        'video/webm;codecs=vp9,opus',
        'video/webm'
      ].find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: settings.bitrate
      });
      renderState.current.recorder = recorder;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      
      const finishPromise = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${settings.filename}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
          a.click();
          resolve();
        };
      });

      // 5. Start Process
      await audioCtx.resume();
      recorder.start();
      const startTime = performance.now();

      const renderLoop = async () => {
        if (renderState.current.stop) {
          recorder.stop();
          return;
        }

        const elapsed = (performance.now() - startTime) / 1000;
        const currentProgress = Math.min(100, (elapsed / projectDuration) * 100);
        setProgress(Math.round(currentProgress));

        if (elapsed >= projectDuration) {
          recorder.stop();
          await finishPromise;
          setStatus('completed');
          return;
        }

        // --- DRAWING PHASE ---
        // Clear with background color
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Find active video
        const activeVideo = items.find(i => 
          i.type === 'video' && elapsed >= i.startTime && elapsed < i.startTime + i.duration
        );

        if (activeVideo) {
          const v = renderState.current.videoElements.get(activeVideo.id);
          if (v) {
            const targetTime = (elapsed - activeVideo.startTime) + activeVideo.trimStart;
            
            // Keep video in sync with master clock
            if (v.paused) v.play().catch(() => {});
            if (Math.abs(v.currentTime - targetTime) > 0.1) {
              v.currentTime = targetTime;
            }

            ctx.save();
            const fx = activeVideo.fx;
            if (fx?.shakeEnabled) {
              const freq = fx.shakeFrequency;
              const int = fx.shakeIntensity;
              const seed = fx.seed;
              const time = elapsed * freq + seed;
              const dx = Math.sin(time * 7) * int * 2;
              const dy = Math.cos(time * 11) * int * 2;
              const dr = Math.sin(time * 3) * 0.01 * int;
              
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.scale(fx.shakeZoom, fx.shakeZoom);
              ctx.rotate(dr);
              ctx.translate(-canvas.width / 2 + dx, -canvas.height / 2 + dy);
            }
            
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
        } else {
          // Pause all videos if no video is active to save resources
          renderState.current.videoElements.forEach(v => { if (!v.paused) v.pause(); });
        }

        // Draw Text Layer
        const activeTexts = items.filter(i => 
          i.type === 'text' && elapsed >= i.startTime && elapsed < i.startTime + i.duration
        );

        for (const textClip of activeTexts) {
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 20;
          ctx.font = '900 72px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          const age = elapsed - textClip.startTime;
          if (age < 0.5) {
            const p = age / 0.5;
            ctx.globalAlpha = p;
            ctx.translate(0, 40 * (1 - p));
          }

          ctx.fillText(textClip.content?.toUpperCase() || "", canvas.width / 2, canvas.height / 2);
          ctx.restore();
        }

        renderState.current.animationFrame = requestAnimationFrame(renderLoop);
      };

      renderState.current.animationFrame = requestAnimationFrame(renderLoop);

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'Export failed');
      cleanup();
    }
  };

  const cleanup = () => {
    renderState.current.stop = true;
    cancelAnimationFrame(renderState.current.animationFrame);
    renderState.current.videoElements.forEach(v => {
      v.pause();
      v.src = "";
      v.load();
    });
    renderState.current.videoElements.clear();
    if (renderState.current.audioContext) {
      renderState.current.audioContext.close();
    }
  };

  const handleClose = () => {
    cleanup();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-indigo-400">
            <Video size={18} />
            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-100">Export Media</h3>
          </div>
          <button onClick={handleClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {status === 'idle' && (
            <>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase font-black mb-1.5 block">Output Filename</label>
                  <input 
                    type="text" 
                    value={settings.filename} 
                    onChange={e => setSettings({ ...settings, filename: e.target.value })}
                    className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase font-black mb-1.5 block">Render Quality</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'low', label: 'Draft', bit: 4000000 },
                      { id: 'medium', label: 'Pro', bit: 12000000 },
                      { id: 'high', label: 'Master', bit: 40000000 },
                    ].map(q => (
                      <button 
                        key={q.id}
                        onClick={() => setSettings({ ...settings, quality: q.id as any, bitrate: q.bit })}
                        className={`py-2 px-1 rounded-lg border text-[9px] font-black uppercase transition-all
                          ${settings.quality === q.id ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-black/20 border-zinc-800 text-zinc-600'}
                        `}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button 
                onClick={handleStartRender}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs py-3 rounded-lg uppercase transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Download size={16} /> Start Render
              </button>
            </>
          )}

          {status === 'rendering' && (
            <div className="py-8 flex flex-col items-center gap-6">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-zinc-800" />
                  <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={251.2} strokeDashoffset={251.2 - (251.2 * progress) / 100} className="text-indigo-500 transition-all duration-300" />
                </svg>
                <span className="absolute text-xl font-black text-white">{progress}%</span>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-indigo-400 mb-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Encoding Final Video...</span>
                </div>
                <p className="text-[9px] text-zinc-500 uppercase tracking-tighter">Real-time processing. Keep this tab active.</p>
              </div>
              <button onClick={handleClose} className="text-[9px] font-black text-rose-500 uppercase border border-rose-500/20 px-4 py-2 rounded hover:bg-rose-500/10">Abort</button>
            </div>
          )}

          {status === 'completed' && (
            <div className="py-8 flex flex-col items-center gap-6 animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/50">
                <CheckCircle2 size={40} className="text-emerald-500" />
              </div>
              <h4 className="text-white font-black text-sm uppercase">Export Successful</h4>
              <button onClick={handleClose} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black text-xs py-3 rounded-lg uppercase">Close</button>
            </div>
          )}

          {status === 'error' && (
            <div className="py-8 flex flex-col items-center gap-6">
              <AlertCircle size={40} className="text-rose-500" />
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest">{errorMsg}</p>
              <button onClick={() => setStatus('idle')} className="w-full bg-indigo-600 text-white font-black text-xs py-3 rounded-lg uppercase">Retry</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
