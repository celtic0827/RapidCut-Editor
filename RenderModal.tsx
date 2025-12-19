
import React, { useState, useRef } from 'react';
import { X, Loader2, CheckCircle2, ShieldCheck, HardDriveDownload, AlertTriangle, Cpu, Globe, Info } from 'lucide-react';
import { TimelineItem, ProjectSettings, RenderSettings } from './types.ts';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

interface RenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TimelineItem[];
  projectSettings: ProjectSettings;
  projectDuration: number;
}

const TRANSITION_DUR = 0.4;

export const RenderModal = ({ isOpen, onClose, items, projectSettings, projectDuration }: RenderModalProps) => {
  const [status, setStatus] = useState<'idle' | 'loading-wasm' | 'rendering' | 'encoding' | 'completed' | 'error'>('idle');
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [settings, setSettings] = useState<RenderSettings>({
    filename: `RapidCut_Export_${new Date().toISOString().slice(0, 10)}`,
    quality: 'high',
    bitrate: 6000000 // 降低預設碼率以提高成功率
  });

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const abortController = useRef<boolean>(false);

  if (!isOpen) return null;

  const loadFFmpeg = async () => {
    if (!window.crossOriginIsolated) {
      throw new Error("Cross-Origin Isolation 未啟用。Vercel 需要配置 COOP/COEP 標頭。");
    }

    if (ffmpegRef.current && ffmpegRef.current.loaded) return ffmpegRef.current;
    
    setStage('正在啟動 WASM 引擎...');
    setStatus('loading-wasm');
    const ffmpeg = new FFmpeg();
    
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg Log]', message);
    });

    const coreVersion = '0.12.10';
    const baseURL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${coreVersion}/dist/esm`;
    
    try {
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      // 注意：0.12.10 ESM 不需要 workerURL，傳入會導致 404
      await ffmpeg.load({ coreURL, wasmURL });
      console.log('FFmpeg Core Loaded Successfully');
    } catch (err: any) {
      console.error('FFmpeg Initialization Failed:', err);
      throw new Error("無法加載渲染引擎。請檢查網路連線或更新瀏覽器。");
    }
    
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const bufferToWav = (abuffer: AudioBuffer) => {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample, offset = 0, pos = 0;
    const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(abuffer.sampleRate); setUint32(abuffer.sampleRate * 2 * numOfChan); setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746264); setUint32(length - pos - 4);
    for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));
    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
        view.setInt16(pos, sample, true); pos += 2;
      }
      offset++;
    }
    return new Uint8Array(buffer);
  };

  const handleStartRender = async () => {
    if (projectDuration <= 0) {
      setStatus('error');
      setErrorMsg('專案內沒有內容可供導出。');
      return;
    }

    try {
      const ffmpeg = await loadFFmpeg();
      setStatus('rendering');
      setProgress(0);
      abortController.current = false;

      const width = Math.floor(projectSettings.width / 2) * 2;
      const height = Math.floor(projectSettings.height / 2) * 2;
      const fps = projectSettings.fps;
      const totalFrames = Math.ceil(projectDuration * fps);

      // --- 1. 音訊處理 ---
      setStage('處理音軌中...');
      try {
        const sampleRate = 44100;
        const offlineCtx = new OfflineAudioContext(2, Math.max(1, Math.ceil(projectDuration * sampleRate)), sampleRate);
        const soundItems = items.filter(i => (i.type === 'video' || i.type === 'audio') && i.url);
        
        for (const item of soundItems) {
          try {
            const res = await fetch(item.url!);
            const buf = await res.arrayBuffer();
            const decoded = await offlineCtx.decodeAudioData(buf);
            const source = offlineCtx.createBufferSource();
            source.buffer = decoded;
            const gain = offlineCtx.createGain();
            gain.gain.value = (item.muted) ? 0 : (item.volume ?? 1.0);
            source.connect(gain);
            gain.connect(offlineCtx.destination);
            source.start(item.startTime, item.trimStart, item.duration);
          } catch (e) { console.warn('音訊素材加載失敗，已跳過'); }
        }
        const mixedAudio = await offlineCtx.startRendering();
        const wavData = bufferToWav(mixedAudio);
        await ffmpeg.writeFile('audio.wav', wavData);
      } catch (e) {
        console.warn('音訊渲染失敗，將使用靜音軌', e);
        const emptyWav = new Uint8Array(44); // 僅 Header 的無效 WAV 也能讓 ffmpeg 跑下去
        await ffmpeg.writeFile('audio.wav', emptyWav); 
      }

      // --- 2. 影像處理 ---
      setStage('逐影格合成中...');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false })!;
      
      const videoClips = items.filter(i => i.type === 'video' && i.url);
      const videoElements = new Map<string, HTMLVideoElement>();
      
      for (const clip of videoClips) {
        const v = document.createElement('video');
        v.src = clip.url!;
        v.crossOrigin = 'anonymous';
        v.muted = true;
        await new Promise(r => { 
          v.onloadeddata = r; 
          v.onerror = r; 
          setTimeout(r, 6000); 
        });
        videoElements.set(clip.id, v);
      }

      const drawClip = async (clip: TimelineItem, alpha: number, blur: number, currentTime: number) => {
        const v = videoElements.get(clip.id);
        if (!v || v.readyState < 2) return;
        
        const targetTime = Math.max(0, (currentTime - clip.startTime) + clip.trimStart);
        if (Math.abs(v.currentTime - targetTime) > 0.05) {
          v.currentTime = targetTime;
          await new Promise(r => { 
            const onSeek = () => { v.removeEventListener('seeked', onSeek); r(null); };
            v.addEventListener('seeked', onSeek);
            setTimeout(onSeek, 800); 
          });
        }
        
        ctx.save();
        ctx.globalAlpha = alpha;
        if (blur > 0) ctx.filter = `blur(${blur}px)`;
        
        if (clip.fx?.shakeEnabled) {
           const t = currentTime * clip.fx.shakeFrequency + clip.fx.seed;
           ctx.translate(Math.sin(t * 7) * clip.fx.shakeIntensity, Math.cos(t * 11) * clip.fx.shakeIntensity);
           ctx.scale(clip.fx.shakeZoom || 1.05, clip.fx.shakeZoom || 1.05);
        }
        ctx.drawImage(v, 0, 0, width, height);
        ctx.restore();
      };

      for (let i = 0; i < totalFrames; i++) {
        if (abortController.current) break;
        const currentTime = i / fps;
        setProgress(Math.round((i / totalFrames) * 85));

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        const incomingClip = items.find(c => 
          c.type === 'video' && 
          c.transition === 'blur' && 
          currentTime >= c.startTime && 
          currentTime <= c.startTime + TRANSITION_DUR
        );

        if (incomingClip) {
          const tp = (currentTime - incomingClip.startTime) / TRANSITION_DUR;
          const outgoingClip = items.find(c => 
            c.id !== incomingClip.id && 
            c.type === 'video' && 
            currentTime >= c.startTime && 
            currentTime <= c.startTime + c.duration
          );
          if (outgoingClip) await drawClip(outgoingClip, 1 - tp, tp * 20, currentTime);
          await drawClip(incomingClip, tp, (1 - tp) * 20, currentTime);
        } else {
          const activeClip = items.find(c => c.type === 'video' && currentTime >= c.startTime && currentTime < c.startTime + c.duration);
          if (activeClip) await drawClip(activeClip, 1, 0, currentTime);
        }

        // 文字層
        const activeTexts = items.filter(t => t.type === 'text' && currentTime >= t.startTime && currentTime < t.startTime + t.duration);
        for (const text of activeTexts) {
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.font = '900 64px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 10;
          ctx.fillText(text.content?.toUpperCase() || "", width / 2, height / 2);
          ctx.restore();
        }

        const frameBlob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.8));
        if (frameBlob) {
          const frameNum = i.toString().padStart(5, '0');
          const ab = await frameBlob.arrayBuffer();
          await ffmpeg.writeFile(`frame_${frameNum}.jpg`, new Uint8Array(ab));
        }
      }

      // --- 3. 編碼與打包 ---
      setStage('執行最終編碼 (h.264)...');
      setStatus('encoding');
      await ffmpeg.exec([
        '-framerate', fps.toString(),
        '-i', 'frame_%05d.jpg',
        '-i', 'audio.wav',
        '-c:v', 'libx264',
        '-b:v', `${settings.bitrate}`,
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-y', 'output.mp4'
      ]);

      setStage('正在寫入輸出檔案...');
      const data = await ffmpeg.readFile('output.mp4');
      const url = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${settings.filename}.mp4`;
      link.click();
      
      // 清理虛擬文件系統
      try {
        const files = await ffmpeg.listDir('.');
        for (const f of files) {
           if (f.name.startsWith('frame_') || f.name === 'audio.wav' || f.name === 'output.mp4') {
             await ffmpeg.deleteFile(f.name);
           }
        }
      } catch (e) {}

      setStatus('completed');
    } catch (err: any) {
      console.error('Render failure:', err);
      setStatus('error');
      setErrorMsg(err.message || '渲染失敗。可能是瀏覽器內存不足或 WebAssembly 核心崩潰。');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
      <div className="w-full max-w-sm bg-[#1a1a1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-indigo-400" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-100">RapidCut Render</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        <div className="p-8 text-center">
          {status === 'idle' && (
            <div className="space-y-6">
              {!window.crossOriginIsolated && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-left">
                  <Globe size={16} className="text-rose-400 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-[10px] text-rose-400 font-black uppercase tracking-wider">Environment Error</p>
                    <p className="text-[9px] text-rose-500/70 leading-relaxed uppercase font-bold">
                      您的瀏覽器隔離標頭尚未啟動。請重新部署或更換支援 SharedArrayBuffer 的瀏覽器。
                    </p>
                  </div>
                </div>
              )}
              
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-start gap-3 text-left">
                <ShieldCheck size={16} className="text-indigo-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-100 font-black uppercase tracking-wider">WASM Ready</p>
                  <p className="text-[9px] text-zinc-500 leading-relaxed uppercase font-bold text-pretty">
                    渲染大型專案可能需要數分鐘。渲染期間請保持此標籤頁開啟且處於前台。
                  </p>
                </div>
              </div>
              
              <div className="text-left">
                <label className="text-[9px] text-zinc-500 uppercase font-black mb-1.5 block">File Name</label>
                <input type="text" value={settings.filename} onChange={e => setSettings({ ...settings, filename: e.target.value })} className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <button 
                onClick={handleStartRender} 
                disabled={!window.crossOriginIsolated}
                className={`w-full font-black text-xs py-4 rounded-xl uppercase shadow-xl transition-all active:scale-95
                  ${window.crossOriginIsolated ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50'}
                `}
              >
                Start Rendering
              </button>
            </div>
          )}

          {status === 'loading-wasm' && (
            <div className="py-10 space-y-4 text-center">
              <Loader2 size={24} className="animate-spin text-indigo-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Booting Core</p>
                <p className="text-[8px] text-zinc-600 uppercase font-bold tracking-tighter">{stage}</p>
              </div>
            </div>
          )}

          {(status === 'rendering' || status === 'encoding') && (
            <div className="py-10 flex flex-col items-center gap-8">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="64" cy="64" r="58" stroke="#27272a" strokeWidth="8" fill="none" />
                  <circle cx="64" cy="64" r="58" stroke="#6366f1" strokeWidth="8" fill="none" strokeDasharray="364.4" strokeDashoffset={364.4 - (364.4 * (status === 'encoding' ? 92 : progress)) / 100} className="transition-all duration-300" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-black text-white">{status === 'encoding' ? '92%' : `${progress}%`}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Loader2 size={16} className="animate-spin text-indigo-400 mx-auto" />
                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em]">{stage}</p>
              </div>
            </div>
          )}

          {status === 'completed' && (
            <div className="py-10 flex flex-col items-center gap-6">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.15)] animate-pulse">
                <CheckCircle2 size={40} className="text-emerald-500" />
              </div>
              <h4 className="text-white font-black text-sm uppercase tracking-widest">Success</h4>
              <button onClick={onClose} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black text-xs py-3 rounded-lg uppercase mt-2">Finish</button>
            </div>
          )}

          {status === 'error' && (
            <div className="py-10 flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center">
                <AlertTriangle size={32} className="text-rose-500" />
              </div>
              <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg max-w-[280px]">
                 <p className="text-[8px] text-rose-400 font-bold uppercase tracking-widest leading-relaxed text-center mb-2">Stage: {stage}</p>
                 <p className="text-[9px] text-rose-100 font-bold uppercase tracking-tight text-center">{errorMsg}</p>
              </div>
              <div className="flex flex-col gap-2 w-full mt-4">
                <button onClick={() => setStatus('idle')} className="w-full bg-indigo-600 text-white py-3 rounded-xl uppercase text-[10px] font-black transition-all hover:bg-indigo-500">Retry</button>
                <button onClick={onClose} className="w-full bg-zinc-800 text-zinc-500 py-2 rounded-lg uppercase text-[9px] font-bold">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
