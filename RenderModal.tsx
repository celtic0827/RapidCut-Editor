
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
      setErrorMsg('您的瀏覽器不支援 WebCodecs。請使用 Chrome。');
      return;
    }

    setStatus('rendering');
    setProgress(0);
    abortController.current = false;

    try {
      const fps = projectSettings.fps;
      const totalFrames = Math.ceil(projectDuration * fps);
      const { width, height } = projectSettings;

      // 建立 MP4Box 檔案實例
      const mp4boxFile = MP4Box.createFile();
      let videoTrackId: number | null = null;
      let audioTrackId: number | null = null;

      // --- 1. 音訊預處理 (混音) ---
      const sampleRate = 44100;
      const offlineCtx = new OfflineAudioContext(2, Math.max(1, Math.ceil(projectDuration * sampleRate)), sampleRate);
      
      const videoClips = items.filter(i => i.type === 'video' && i.url);
      const audioClips = items.filter(i => i.type === 'audio' && i.url);
      const allSoundClips = [...videoClips, ...audioClips];

      for (const clip of allSoundClips) {
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
          console.warn(`音訊載入失敗: ${clip.id}`, e);
        }
      }
      const mixedAudioBuffer = await offlineCtx.startRendering();

      // --- 2. 音訊編碼器 ---
      const audioEncoder = new (window as any).AudioEncoder({
        output: (chunk: any, metadata: any) => {
          if (audioTrackId === null && metadata?.decoderConfig) {
            // AAC 必須有 description
            const description = new Uint8Array(metadata.decoderConfig.description);
            audioTrackId = mp4boxFile.addTrack({
              timescale: 1000000,
              samplerate: sampleRate,
              channel_count: 2,
              hdlr: 'soun',
              type: 'mp4a',
              description: description,
            });
          }
          
          if (audioTrackId !== null) {
            const buffer = new ArrayBuffer(chunk.byteLength);
            chunk.copyTo(buffer);
            mp4boxFile.addSample(audioTrackId, buffer, {
              duration: chunk.duration ?? 0,
              dts: chunk.timestamp,
              cts: chunk.timestamp,
              is_sync: chunk.type === 'key',
            });
          }
        },
        error: (e: any) => { throw e; },
      });

      audioEncoder.configure({
        codec: 'mp4a.40.2', 
        numberOfChannels: 2,
        sampleRate: sampleRate,
        bitrate: 128000,
      });

      // --- 3. 影片編碼器 ---
      const videoEncoder = new (window as any).VideoEncoder({
        output: (chunk: any, metadata: any) => {
          if (videoTrackId === null && metadata?.decoderConfig) {
            // H.264 關鍵：必須使用 avcDecoderConfigRecord
            const description = new Uint8Array(metadata.decoderConfig.description);
            videoTrackId = mp4boxFile.addTrack({
              timescale: 1000000,
              width: width,
              height: height,
              hdlr: 'vide',
              type: 'avc1',
              avcDecoderConfigRecord: description,
            });
          }
          
          if (videoTrackId !== null) {
            const buffer = new ArrayBuffer(chunk.byteLength);
            chunk.copyTo(buffer);
            mp4boxFile.addSample(videoTrackId, buffer, {
              duration: chunk.duration || (1000000 / fps),
              dts: chunk.timestamp,
              cts: chunk.timestamp,
              is_sync: chunk.type === 'key',
            });
          }
        },
        error: (e: any) => { throw e; },
      });

      videoEncoder.configure({
        codec: 'avc1.42E01F', 
        width, 
        height,
        bitrate: settings.bitrate,
        framerate: fps,
        latencyMode: 'quality',
      });

      // --- 4. 餵入數據 ---
      // 先處理音訊
      const bufferLength = mixedAudioBuffer.length;
      const step = 2048;
      for (let offset = 0; offset < bufferLength; offset += step) {
        if (abortController.current) break;
        const currentLen = Math.min(step, bufferLength - offset);
        const data = new Float32Array(currentLen * 2);
        data.set(mixedAudioBuffer.getChannelData(0).subarray(offset, offset + currentLen), 0);
        data.set(mixedAudioBuffer.getChannelData(1).subarray(offset, offset + currentLen), currentLen);

        const audioFrame = new (window as any).AudioData({
          format: 'f32-planar',
          sampleRate: sampleRate,
          numberOfFrames: currentLen,
          numberOfChannels: 2,
          timestamp: Math.round((offset / sampleRate) * 1000000),
          data: data,
        });
        audioEncoder.encode(audioFrame);
        audioFrame.close();
      }

      // 再處理影片渲染
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false })!;
      
      const videoCache = new Map<string, HTMLVideoElement>();
      for (const clip of videoClips) {
        if (videoCache.has(clip.id)) continue;
        const v = document.createElement('video');
        v.src = clip.url!;
        v.crossOrigin = "anonymous";
        v.muted = true;
        v.preload = "auto";
        await new Promise(r => { v.onloadedmetadata = () => { v.currentTime = 0.001; r(null); }; });
        videoCache.set(clip.id, v);
      }

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
          const seekTime = (currentTime - activeVideo.startTime) + activeVideo.trimStart + 0.00001;
          await new Promise<void>((resolve) => {
            const onSeeked = () => {
              v.removeEventListener('seeked', onSeeked);
              resolve();
            };
            v.addEventListener('seeked', onSeeked);
            v.currentTime = seekTime;
            setTimeout(resolve, 500); 
          });

          if (v.readyState >= 2) {
            ctx.save();
            if (activeVideo.fx?.shakeEnabled) {
              const fx = activeVideo.fx;
              const t = currentTime * fx.shakeFrequency + fx.seed;
              ctx.translate(width / 2, height / 2);
              ctx.scale(fx.shakeZoom, fx.shakeZoom);
              ctx.translate(-width / 2 + Math.sin(t * 7) * fx.shakeIntensity, -height / 2 + Math.cos(t * 11) * fx.shakeIntensity);
            }
            ctx.drawImage(v, 0, 0, width, height);
            ctx.restore();
          }
        }

        const activeTexts = items.filter(t => 
          t.type === 'text' && currentTime >= t.startTime && currentTime < t.startTime + t.duration
        );
        for (const textClip of activeTexts) {
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.font = '900 72px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(textClip.content?.toUpperCase() || "", width / 2, height / 2);
          ctx.restore();
        }

        const frame = new (window as any).VideoFrame(canvas, { timestamp: Math.round(i * (1000000 / fps)) });
        videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
        frame.close();
      }

      // --- 5. 完成導出 ---
      await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
      videoEncoder.close();
      audioEncoder.close();

      // 在獲取 Buffer 之前確保文件結構已關閉
      const finalBuffer = mp4boxFile.getBuffer();
      if (!finalBuffer) throw new Error("生成失敗：數據緩衝區為空");

      const blob = new Blob([finalBuffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${settings.filename}.mp4`;
      a.click();
      URL.revokeObjectURL(url);

      setStatus('completed');
      videoCache.forEach(v => { v.src = ""; v.load(); });

    } catch (err: any) {
      console.error('Render Error:', err);
      setStatus('error');
      setErrorMsg(err.message || '導出失敗');
    }
  };

  const handleClose = () => {
    abortController.current = true;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 text-zinc-100">
      <div className="w-full max-w-md bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-indigo-400">
            <Video size={18} />
            <h3 className="text-xs font-black uppercase tracking-widest">Final Rendering</h3>
          </div>
          <button onClick={handleClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {status === 'idle' && (
            <>
              <div className="space-y-4">
                <div className="p-4 bg-black/40 border border-zinc-800 rounded-lg">
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    本工具使用 WebCodecs 技術直接在您的瀏覽器中編碼影片。<br/>
                    <b>導出期間請勿關閉分頁。</b>
                  </p>
                </div>
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase font-black mb-1.5 block">影片名稱</label>
                  <input 
                    type="text" 
                    value={settings.filename} 
                    onChange={e => setSettings({ ...settings, filename: e.target.value })}
                    className="w-full bg-black/40 border border-zinc-800 rounded px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-zinc-500 uppercase font-black mb-1.5 block">位元率 (Bitrate)</label>
                  <select 
                    value={settings.bitrate}
                    onChange={e => setSettings({ ...settings, bitrate: parseInt(e.target.value) })}
                    className="w-full bg-black/40 border border-zinc-800 rounded px-3 py-2 text-xs focus:outline-none"
                  >
                    <option value={8000000}>8 Mbps (標準)</option>
                    <option value={15000000}>15 Mbps (高畫質)</option>
                    <option value={30000000}>30 Mbps (超清)</option>
                  </select>
                </div>
              </div>
              <button 
                onClick={handleStartRender}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs py-3 rounded-lg uppercase shadow-lg shadow-indigo-600/20"
              >
                生成高品質 MP4
              </button>
            </>
          )}

          {status === 'rendering' && (
            <div className="py-8 flex flex-col items-center gap-6">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-zinc-800" />
                  <circle cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={301.6} strokeDashoffset={301.6 - (301.6 * progress) / 100} className="text-indigo-500 transition-all duration-300" />
                </svg>
                <div className="absolute flex flex-col items-center">
                   <span className="text-2xl font-black">{progress}%</span>
                   <span className="text-[8px] text-zinc-500 uppercase font-bold">Progress</span>
                </div>
              </div>
              <div className="text-center space-y-2">
                <Loader2 size={16} className="animate-spin text-indigo-400 mx-auto" />
                <p className="text-[10px] font-black uppercase text-zinc-300">正在進行多線程編碼...</p>
              </div>
            </div>
          )}

          {status === 'completed' && (
            <div className="py-8 flex flex-col items-center gap-6">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <h4 className="text-white font-black text-sm uppercase tracking-widest">導出成功</h4>
              <button onClick={handleClose} className="w-full bg-zinc-800 text-white font-black text-xs py-3 rounded-lg uppercase">完成</button>
            </div>
          )}

          {status === 'error' && (
            <div className="py-8 flex flex-col items-center gap-6 text-center">
              <AlertCircle size={48} className="text-rose-500" />
              <div className="space-y-1">
                <p className="text-[10px] text-rose-400 font-bold uppercase">渲染失敗</p>
                <p className="text-[9px] text-zinc-500 max-w-[240px] leading-relaxed">{errorMsg}</p>
              </div>
              <button onClick={() => setStatus('idle')} className="w-full bg-indigo-600 text-white font-black text-xs py-3 rounded-lg uppercase">返回重試</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
