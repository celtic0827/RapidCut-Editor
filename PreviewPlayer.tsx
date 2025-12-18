
import React from 'react';
import { TimelineItem, ProjectSettings } from './types';

interface PreviewPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  items: TimelineItem[];
  currentTime: number;
  projectDuration: number;
  projectSettings: ProjectSettings;
  isShakeEnabled: boolean;
  isPlaying: boolean;
  shakeIntensity: number;
  shakeFrequency: number;
  shakeZoom: number;
  shakeAnimationDelay: string;
}

export const PreviewPlayer = ({ 
  videoRef, items, currentTime, projectDuration, projectSettings, 
  isShakeEnabled, isPlaying, shakeIntensity, shakeFrequency, shakeZoom, shakeAnimationDelay
}: PreviewPlayerProps) => {
  const isOutOfBounds = currentTime >= projectDuration && projectDuration > 0;

  return (
    <div className="flex-1 flex items-center justify-center p-2 md:p-6 min-h-0 overflow-hidden bg-[#101012]">
      {/* Outer Monitor Frame: Constrain height to 100% to let aspect-ratio drive width */}
      <div 
        className="relative bg-[#08080a] border border-white/5 shadow-2xl overflow-hidden group flex items-center justify-center" 
        style={{ 
          aspectRatio: `${projectSettings.width} / ${projectSettings.height}`,
          height: '100%',
          maxHeight: '100%',
          maxWidth: '100%'
        }}
      >
        {/* Mask Layer */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center bg-black">
           {/* Transformation Layer */}
           <div 
             className={`w-full h-full will-change-transform ${isShakeEnabled && isPlaying ? 'animate-handheld-v2' : ''}`}
             style={{
               '--shake-intensity': shakeIntensity,
               '--shake-frequency': shakeFrequency,
               '--shake-delay': shakeAnimationDelay,
               transform: `scale(${isShakeEnabled ? shakeZoom : 1.0})`
             } as any}
           >
             <video 
               ref={videoRef} 
               className="w-full h-full object-contain pointer-events-none" 
               playsInline
               muted
             />
           </div>
        </div>
        
        {/* HUD / UI Overlay Layer */}
        <div className="absolute inset-0 pointer-events-none z-20">
          {/* Project Range Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
            <div 
              className="h-full bg-indigo-500 transition-all duration-100 ease-linear"
              style={{ width: `${projectDuration > 0 ? Math.min(100, (currentTime / projectDuration) * 100) : 0}%` }}
            />
          </div>

          {/* Out of Bounds Overlay */}
          {isOutOfBounds && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center animate-fade-in">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] border border-zinc-800 px-3 py-1 rounded bg-black/40">
                End of Project
              </span>
            </div>
          )}

          {/* Dynamic Titles */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {items.filter(i => i.type === 'text' && currentTime >= i.startTime && currentTime <= i.startTime + i.duration).map(item => (
              <div key={item.id} className="animate-reveal text-center px-4">
                <h2 className="text-xl md:text-3xl font-black text-white tracking-widest uppercase italic drop-shadow-2xl text-shadow-glow">
                  {item.content}
                </h2>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        .text-shadow-glow {
          text-shadow: 0 0 20px rgba(255,255,255,0.4), 0 0 40px rgba(99, 102, 241, 0.3);
        }
      `}</style>
    </div>
  );
};
