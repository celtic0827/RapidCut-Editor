
import React from 'react';
import { TimelineItem, ProjectSettings } from './types';

interface PreviewPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  videoSecRef: React.RefObject<HTMLVideoElement>; // 新增次要影片槽
  audioRef: React.RefObject<HTMLAudioElement>;
  items: TimelineItem[];
  currentTime: number;
  projectDuration: number;
  projectSettings: ProjectSettings;
  activeClip?: TimelineItem;
  isPlaying: boolean;
  isTrimming?: boolean;
  transitionProgress: number | null; // 轉場進度 0~1
}

const formatTime = (t: number) => {
  const mins = Math.floor(t / 60).toString().padStart(2, '0');
  const secs = Math.floor(t % 60).toString().padStart(2, '0');
  const ms = Math.floor((t % 1) * 100).toString().padStart(2, '0');
  return `${mins}:${secs}:${ms}`;
};

export const PreviewPlayer = ({ 
  videoRef, videoSecRef, audioRef, items, currentTime, projectDuration, projectSettings, activeClip, isPlaying, isTrimming, transitionProgress
}: PreviewPlayerProps) => {
  const fx = activeClip?.fx;
  const isShakeActive = fx?.shakeEnabled && isPlaying;

  // 計算轉場 CSS
  const isTrans = transitionProgress !== null;
  const blurAmount = 24; // 最大模糊度
  
  // A 片段 (退場)：模糊增加，透明度減少
  const styleA: React.CSSProperties = isTrans ? {
    filter: `blur(${transitionProgress! * blurAmount}px)`,
    opacity: 1 - transitionProgress!,
    zIndex: 10
  } : { opacity: 0, zIndex: 0 };

  // B 片段 (進場)：模糊減少，透明度增加
  const styleB: React.CSSProperties = isTrans ? {
    filter: `blur(${(1 - transitionProgress!) * blurAmount}px)`,
    opacity: transitionProgress!,
    zIndex: 20
  } : { opacity: 1, zIndex: 10 };

  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-0 bg-[#101012]">
      <div 
        className="relative bg-black border border-white/5 shadow-2xl overflow-hidden flex items-center justify-center" 
        style={{ 
          aspectRatio: `${projectSettings.width} / ${projectSettings.height}`,
          height: '100%', maxHeight: '100%', maxWidth: '100%'
        }}
      >
        <div 
          className={`w-full h-full relative will-change-transform ${isShakeActive ? 'animate-handheld' : ''}`}
          style={{
            '--s-int': fx?.shakeIntensity || 1,
            '--s-freq': fx?.shakeFrequency || 1,
            '--s-delay': `-${(fx?.seed || 0) % 10}s`, 
            transformOrigin: 'center center',
            transform: `scale(${fx?.shakeEnabled ? fx.shakeZoom : 1})`
          } as any}
        >
          {/* Video B (Primary / Incoming) */}
          <video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-75" 
            style={styleB}
            playsInline 
          />
          
          {/* Video A (Secondary / Outgoing) */}
          <video 
            ref={videoSecRef} 
            className="absolute inset-0 w-full h-full object-contain pointer-events-none" 
            style={styleA}
            playsInline 
          />

          <audio ref={audioRef} hidden />
        </div>

        {/* Dynamic Titles */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
          {items.filter(i => i.type === 'text' && currentTime >= i.startTime && currentTime <= i.startTime + i.duration).map(item => (
            <div key={item.id} className="animate-reveal text-center px-4 max-w-full">
              <h2 className="text-2xl md:text-4xl font-black text-white tracking-tighter uppercase italic drop-shadow-2xl text-shadow-glow leading-tight">
                {item.content}
              </h2>
            </div>
          ))}
        </div>

        {/* HUD UI */}
        <div className="absolute top-2 left-2 flex items-center gap-2 opacity-50 pointer-events-none z-40">
          <div className={`w-1.5 h-1.5 rounded-full ${isTrimming ? 'bg-amber-500' : 'bg-red-600 animate-pulse'}`} />
          <span className="text-[7px] font-black uppercase text-white tracking-widest">
            {isTrimming ? 'Trim Preview' : isTrans ? 'Blur Transition' : 'Live Preview'}
          </span>
        </div>

        {isTrimming && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-600/90 rounded text-[9px] font-black text-white uppercase tracking-tighter flex items-center gap-2 shadow-2xl backdrop-blur-md animate-fade-in border border-amber-400/50 z-40">
            <span className="opacity-70">Seek</span>
            {formatTime(currentTime)}
          </div>
        )}
      </div>
      <style>{`
        .text-shadow-glow { text-shadow: 0 0 15px rgba(255,255,255,0.4), 0 0 30px rgba(99,102,241,0.5); }
      `}</style>
    </div>
  );
};
