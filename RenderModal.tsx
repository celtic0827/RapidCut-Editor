
import React, { useState, useRef } from 'react';
import { X, Download, Loader2, CheckCircle2, AlertCircle, Video } from 'lucide-react';
import { TimelineItem, ProjectSettings, RenderSettings } from './types';
import MP4Box from 'mp4box';

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
    bitrate: 12000000 
  });

  const abortController = useRef<boolean>(false);

  if (!isOpen) return null;

  const handleStartRender = async () => {
    if (!('VideoEncoder' in window)) {
      setStatus('error');
      setErrorMsg('Your browser does not support WebCodecs. Please use Chrome or Edge.');
      return;
    }

    setStatus('rendering');
    setProgress(0);
    abortController.current = false;

    try {
      const fps = projectSettings.fps;
      const totalFrames = Math.ceil(projectDuration * fps);
      const { width, height } = projectSettings;

      const mp4boxFile = MP4Box.createFile();
      let videoTrackId: number | null = null;

      // 1. Audio Rendering (Keep simple for now, can expand later)
      const sampleRate = 44100;
      const offlineCtx = new OfflineAudioContext(2, Math.max(1, projectDuration * sampleRate), sampleRate);
      
      const videoClips = items.filter(i => i.type === 'video' && i.url);
      for (const clip of videoClips) {
        try {
          const response = await fetch(clip.url!);
          const arrayBuffer = await response.arrayBuffer();
          const decoded = await offlineCtx.decodeAudioData(arrayBuffer);
          const source = offlineCtx.createBufferSource();
          source.buffer = decoded;
          const gain = offlineCtx.createGain();
          gain.gain.value = clip.volume ?? 1.0;
          source.connect(gain);
          gain.connect(offlineCtx.destination);
          source.start(clip.startTime, clip.trimStart, clip.duration);
        } catch (e) {
          console.warn(`Audio decode failed for clip ${clip.id}`, e);
        }
      }
      await offlineCtx.startRendering();

      // 2. Video Encoder Setup
      const videoEncoder = new VideoEncoder({
        output: (chunk, metadata) => {
          if (!videoTrackId) {
            videoTrackId = mp4boxFile.addTrack({
              timescale: 1000000,
              width, height,
              nb_samples: totalFrames,
              avcDecoderConfigRecord: metadata?.decoderConfig?.description,
            });
          }
          const buffer = new ArrayBuffer(chunk.byteLength);
          chunk.copyTo(buffer);
          mp4boxFile.addSample(videoTrackId, buffer, {
            duration: chunk.duration || (1000000 / fps),
            dts: chunk.timestamp,
            cts: chunk.timestamp,
            is_sync: chunk.type === 'key',
          });
        },
        error: (e) => { throw e; },
      });

      videoEncoder.configure({
        codec: 'avc1.42E01F',
        width, height,
        bitrate: settings.bitrate,
        framerate: fps,
        latencyMode: 'quality',
      });

      // 3. Prepare Canvas and Video Cache
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;
      
      const videoCache = new Map<string, HTMLVideoElement>();
      for (const clip of videoClips) {
        if (videoCache.has(clip.id)) continue;
        const v = document.createElement('video');
        v.src = clip.url!;
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.preload = "auto";
        v.playsInline = true;
        // Pre-warm the decoder
        await new Promise(r => { 
          v.onloadedmetadata = async () => {
            v.currentTime = clip.trimStart;
            r(null);
          };
        });
        videoCache.set(clip.id, v);
      }

      // 4. Rendering Loop
      for (let i = 0; i < totalFrames; i++) {
        if (abortController.current) break;

        const currentTime = i / fps;
        setProgress(Math.round((i / totalFrames) * 100));

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const activeVideo = items.find(clip => 
          clip.type === 'video' && currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
        );

        if (activeVideo) {
          const v = videoCache.get(activeVideo.id)!;
          const seekTime = (currentTime - activeVideo.startTime) + activeVideo.trimStart;
          
          // CRITICAL FIX: Safe Seek Pattern
          await new Promise<void>((resolve) => {
            const onSeeked = () => {
              v.removeEventListener('seeked', onSeeked);
              resolve();
            };
            // If we are already extremely close to the target time, don't wait for seeked event 
            // as it might not fire in some browsers.
            if (Math.abs(v.currentTime - seekTime) < 0.001) {
              return resolve();
            }
            v.addEventListener('seeked', onSeeked);
            v.currentTime = seekTime;
            
            // Safety timeout to prevent hanging on corrupted frames
            setTimeout(() => {
              v.removeEventListener('seeked', onSeeked);
              resolve();
            }, 500);
          });

          // Verify readyState before drawing
          if (v.readyState >= 2) {
            ctx.save();
            const fx = activeVideo.fx;
            if (fx?.shakeEnabled) {
              const freq = fx.shakeFrequency;
              const int = fx.shakeIntensity;
              const seed = fx.seed;
              const t = currentTime * freq + seed;
              const dx = Math.sin(t * 7.3) * int * 2;
              const dy = Math.cos(t * 11.1) * int * 2;
              const dr = Math.sin(t * 3.7) * 0.01 * int;
              ctx.translate(width / 2, height / 2);
              ctx.scale(fx.shakeZoom, fx.shakeZoom);
              ctx.rotate(dr);
              ctx.translate(-width / 2 + dx, -height / 2 + dy);
            }
            ctx.drawImage(v, 0, 0, width, height);
            ctx.restore();
          }
        }

        // Overlay Text
        const activeTexts = items.filter(t => 
          t.type === 'text' && currentTime >= t.startTime && currentTime < t.startTime + t.duration
        );

        for (const textClip of activeTexts) {
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 20;
          ctx.font = '900 72px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const age = currentTime - textClip.startTime;
          if (age < 0.5) ctx.globalAlpha = age / 0.5;
          ctx.fillText(textClip.content?.toUpperCase() || "", width / 2, height / 2);
          ctx.restore();
        }

        const frame = new VideoFrame(canvas, { timestamp: Math.round(i * (1000000 / fps)) });
        videoEncoder.encode(frame, { keyFrame: i % 60 === 0 });
        frame.close();
      }

      await videoEncoder.flush();
      videoEncoder.close();

      mp4boxFile.save(`${settings.filename}.mp4`);
      setStatus('completed');

      videoCache.forEach(v => { v.src = ""; v.load(); });

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'Professional export failed.');
    }
  };

  const handleClose = () => {
    abortController.current = true;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-indigo-400">
            <Video size={18} />
            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-100">Pro MP4 Export</h3>
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
                  <label className="text-[9px] text-zinc-500 uppercase font-black mb-1.5 block">Bitrate</label>
                  <select 
                    value={settings.bitrate}
                    onChange={e => setSettings({ ...settings, bitrate: parseInt(e.target.value) })}
                    className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value={8000000}>8 Mbps (Social Media)</option>
                    <option value={15000000}>15 Mbps (High Quality)</option>
                    <option value={40000000}>40 Mbps (ProRes-like)</option>
                  </select>
                </div>
              </div>
              <button 
                onClick={handleStartRender}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs py-3 rounded-lg uppercase transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Download size={16} /> Render Pro MP4
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
                  <span className="text-[10px] font-black uppercase tracking-widest">Encoding Frame-By-Frame...</span>
                </div>
                <p className="text-[9px] text-zinc-500 uppercase tracking-tighter">Please keep this tab active.</p>
              </div>
            </div>
          )}

          {status === 'completed' && (
            <div className="py-8 flex flex-col items-center gap-6">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/50">
                <CheckCircle2 size={40} className="text-emerald-500" />
              </div>
              <h4 className="text-white font-black text-sm uppercase">Export Complete</h4>
              <button onClick={handleClose} className="w-full bg-zinc-800 text-white font-black text-xs py-3 rounded-lg uppercase">Close</button>
            </div>
          )}

          {status === 'error' && (
            <div className="py-8 flex flex-col items-center gap-6">
              <AlertCircle size={40} className="text-rose-500" />
              <p className="text-[9px] text-rose-400 font-bold uppercase tracking-widest text-center px-4">{errorMsg}</p>
              <button onClick={() => setStatus('idle')} className="w-full bg-indigo-600 text-white font-black text-xs py-3 rounded-lg uppercase">Retry</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
