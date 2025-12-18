import React, { useState, useRef } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Music, ShieldCheck, Zap, HardDriveDownload, AlertTriangle } from 'lucide-react';
import { TimelineItem, ProjectSettings, RenderSettings } from './types';

// 我們改用 index.html 中引入的 UMD 版本全局對象，以避開 ESM Worker 的跨域攔截問題
const { FFmpeg } = (window as any).FFmpegWasm || {};
const { toBlobURL } = (window as any).FFmpegUtil || {};

interface RenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TimelineItem[];
  projectSettings: ProjectSettings;
  projectDuration: number;
}

export const RenderModal = ({ isOpen, onClose, items, projectSettings, projectDuration }: RenderModalProps) => {
  const [status, setStatus] = useState<'idle' | 'loading-wasm' | 'rendering' | 'encoding' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [settings, setSettings] = useState<RenderSettings>({
    filename: `RapidCut_Export_${new Date().toISOString().slice(0, 10)}`,
    quality: 'high',
    bitrate: 10000000 
  });

  const ffmpegRef = useRef<any>(null);
  const abortController = useRef<boolean>(false);

  if (!isOpen) return null;

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    
    setStatus('loading-wasm');
    
    if (!FFmpeg) {
      throw new Error("FFmpeg 庫尚未載入。請檢查網路連接。");
    }

    const ffmpeg = new FFmpeg();
    
    // 優先考慮穩定性：在不支援 SharedArrayBuffer 的環境中強制載入單線程版本
    // 這裡我們使用與 0.12.10 相容的核心路徑
    const coreVersion = '0.12.10';
    const isSharedArrayBufferEnabled = typeof SharedArrayBuffer !== 'undefined';
    
    // 如果沒有 COOP/COEP，我們必須使用不支持多線程的環境
    const baseURL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${coreVersion}/dist/umd`;
    
    try {
      // 終極解決方案：使用 toBlobURL 將跨域腳本轉換為本地 Blob
      // 這能解決大部分沙盒環境下的 'Failed to construct Worker' 錯誤
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        // 即使是單線程模式，也建議提供 workerURL 以防萬一
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
    } catch (err: any) {
      console.error('FFmpeg Load Error Details:', err);
      throw new Error(`渲染引擎啟動失敗。這通常是因為當前託管環境禁止了 Web Worker 的跨域運行。建議在支援 COOP/COEP 的伺服器上部署，或更換瀏覽器試試。`);
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

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1); 
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }
    return new Uint8Array(buffer);
  };

  const handleStartRender = async () => {
    setStatus('rendering');
    setProgress(0);
    abortController.current = false;

    try {
      const ffmpeg = await loadFFmpeg();
      const { width, height, fps } = projectSettings;
      const sampleRate = 44100;
      const totalFrames = Math.ceil(projectDuration * fps);

      // --- 1. 音訊導出 ---
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
          gain.gain.value = item.volume ?? 1.0;
          source.connect(gain);
          gain.connect(offlineCtx.destination);
          source.start(item.startTime, item.trimStart, item.duration);
        } catch (e) { console.warn('Audio sync failed', item.name); }
      }
      const mixedAudio = await offlineCtx.startRendering();
      const wavData = bufferToWav(mixedAudio);
      await ffmpeg.writeFile('audio.wav', wavData);

      // --- 2. 畫面渲染 ---
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false })!;
      
      const videoClips = items.filter(i => i.type === 'video' && i.url);
      const videoElements = new Map<string, HTMLVideoElement>();
      for (const clip of videoClips) {
        if (videoElements.has(clip.id)) continue;
        const v = document.createElement('video');
        v.src = clip.url!;
        v.crossOrigin = 'anonymous';
        v.muted = true;
        await new Promise(r => { v.onloadedmetadata = r; v.onerror = r; });
        videoElements.set(clip.id, v);
      }

      for (let i = 0; i < totalFrames; i++) {
        if (abortController.current) break;
        const currentTime = i / fps;
        setProgress(Math.round((i / totalFrames) * 80));

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        const activeVideo = items.find(c => c.type === 'video' && currentTime >= c.startTime && currentTime < c.startTime + c.duration);
        if (activeVideo) {
          const v = videoElements.get(activeVideo.id)!;
          v.currentTime = (currentTime - activeVideo.startTime) + activeVideo.trimStart;
          await new Promise(r => { 
            const onSeek = () => { v.removeEventListener('seeked', onSeek); r(null); };
            v.addEventListener('seeked', onSeek);
            setTimeout(onSeek, 60); 
          });
          
          ctx.save();
          if (activeVideo.fx?.shakeEnabled) {
             const t = currentTime * activeVideo.fx.shakeFrequency + activeVideo.fx.seed;
             ctx.translate(Math.sin(t * 7) * activeVideo.fx.shakeIntensity, Math.cos(t * 11) * activeVideo.fx.shakeIntensity);
             ctx.scale(activeVideo.fx.shakeZoom, activeVideo.fx.shakeZoom);
          }
          ctx.drawImage(v, 0, 0, width, height);
          ctx.restore();
        }

        const activeTexts = items.filter(t => t.type === 'text' && currentTime >= t.startTime && currentTime < t.startTime + t.duration);
        for (const text of activeTexts) {
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.font = '900 64px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text.content?.toUpperCase() || "", width / 2, height / 2);
          ctx.restore();
        }

        const frameBlob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.85));
        if (frameBlob) {
          const frameNum = i.toString().padStart(5, '0');
          const arrayBuffer = await frameBlob.arrayBuffer();
          await ffmpeg.writeFile(`frame_${frameNum}.jpg`, new Uint8Array(arrayBuffer));
        }
      }

      // --- 3. 編碼 ---
      setStatus('encoding');
      await ffmpeg.exec([
        '-framerate', fps.toString(),
        '-i', 'frame_%05d.jpg',
        '-i', 'audio.wav',
        '-c:v', 'libx264',
        '-b:v', `${settings.bitrate}`,
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-pix_fmt', 'yuv420p',
        '-y', 'output.mp4'
      ]);

      const data = await ffmpeg.readFile('output.mp4');
      const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: 'video/mp4' }));
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${settings.filename}.mp4`;
      link.click();

      setStatus('completed');
    } catch (err: any) {
      console.error('RapidCut FFmpeg Error:', err);
      setStatus('error');
      setErrorMsg(err.message || '渲染核心異常。');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
      <div className="w-full max-sm bg-[#1a1a1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <HardDriveDownload size={16} className="text-indigo-400" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-100">RapidCut FFmpeg Engine</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        <div className="p-8 text-center">
          {status === 'idle' && (
            <div className="space-y-6">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3 text-left">
                <ShieldCheck size={16} className="text-emerald-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-100 font-black uppercase tracking-wider">相容性渲染模式 (v5)</p>
                  <p className="text-[9px] text-zinc-500 leading-relaxed uppercase font-bold">
                    已自動切換至 UMD 模式並套用 Blob 封裝技術。這專為嚴格的沙盒環境設計，能大幅降低跨域錯誤率。
                  </p>
                </div>
              </div>
              <div className="text-left">
                <label className="text-[9px] text-zinc-500 uppercase font-black mb-1.5 block">輸出檔案名稱</label>
                <input type="text" value={settings.filename} onChange={e => setSettings({ ...settings, filename: e.target.value })} className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <button onClick={handleStartRender} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs py-4 rounded-xl uppercase shadow-xl shadow-indigo-600/20 transition-all active:scale-95">極速導出 MP4</button>
            </div>
          )}

          {status === 'loading-wasm' && (
            <div className="py-10 space-y-4">
              <Loader2 size={24} className="animate-spin text-indigo-400 mx-auto" />
              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">初始化 FFmpeg 核心...</p>
            </div>
          )}

          {(status === 'rendering' || status === 'encoding') && (
            <div className="py-10 flex flex-col items-center gap-8">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="64" cy="64" r="58" stroke="#27272a" strokeWidth="8" fill="none" />
                  <circle cx="64" cy="64" r="58" stroke="#6366f1" strokeWidth="8" fill="none" strokeDasharray="364.4" strokeDashoffset={364.4 - (364.4 * (status === 'encoding' ? 85 + (progress/100*15) : progress)) / 100} className="transition-all duration-300" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-black text-white">{status === 'encoding' ? 'MUX' : `${progress}%`}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Loader2 size={16} className="animate-spin text-indigo-400 mx-auto" />
                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em]">
                  {status === 'rendering' ? '正在合成幀數據...' : '正在封裝影音串流...'}
                </p>
              </div>
            </div>
          )}

          {status === 'completed' && (
            <div className="py-10 flex flex-col items-center gap-6">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center animate-pulse">
                <CheckCircle2 size={40} className="text-emerald-500" />
              </div>
              <h4 className="text-white font-black text-sm uppercase tracking-widest">渲染任務成功</h4>
              <p className="text-[10px] text-zinc-500 uppercase font-bold leading-relaxed">影片已生成並自動下載。</p>
              <button onClick={onClose} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black text-xs py-3 rounded-lg uppercase mt-2">關閉</button>
            </div>
          )}

          {status === 'error' && (
            <div className="py-10 flex flex-col items-center gap-4">
              <AlertTriangle size={48} className="text-amber-500" />
              <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg">
                 <p className="text-[9px] text-rose-400 font-bold uppercase tracking-widest leading-relaxed">
                   {errorMsg}
                 </p>
              </div>
              <button onClick={() => setStatus('idle')} className="w-full bg-zinc-800 text-white py-3 rounded-xl uppercase text-[10px] font-black mt-4 transition-all hover:bg-zinc-700">重試渲染</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};