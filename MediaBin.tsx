
import React, { useRef, useState, useMemo } from 'react';
import { Plus, UploadCloud, Library, FileVideo, AlertCircle, CheckCircle } from 'lucide-react';
import { MediaAsset, TimelineItem } from './types.ts';

interface MediaBinProps {
  library: MediaAsset[];
  onImport: () => void;
  onRelink: () => void;
  onAddFromLibrary: (asset: MediaAsset) => void;
  onDragStart: (asset: MediaAsset) => void;
  timelineItems: TimelineItem[];
}

const MediaThumbnail: React.FC<{ asset: MediaAsset; isUsed: boolean; onClick: () => void; onDragStart: (e: React.DragEvent) => void }> = ({ asset, isUsed, onClick, onDragStart }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div 
      onClick={asset.isOffline ? undefined : onClick} 
      draggable={!asset.isOffline}
      onDragStart={onDragStart}
      className={`group relative aspect-video bg-black rounded overflow-hidden transition-all border shadow-md
        ${asset.isOffline ? 'border-amber-600/50 grayscale cursor-not-allowed opacity-60' : isUsed ? 'border-red-500' : 'border-zinc-800 hover:border-indigo-500 cursor-pointer'}
      `}
    >
      {!asset.isOffline && (
        <video 
          ref={videoRef}
          src={asset.url} 
          onLoadedMetadata={() => videoRef.current && (videoRef.current.currentTime = asset.duration * 0.1)}
          className="w-full h-full object-cover opacity-60 group-hover:opacity-100" 
        />
      )}
      
      {asset.isOffline && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-amber-900/20 text-amber-500 gap-1">
          <AlertCircle size={16} />
          <span className="text-[7px] font-black uppercase">Offline</span>
        </div>
      )}

      {isUsed && !asset.isOffline && (
        <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_5px_rgba(239,68,68,1)] z-20" />
      )}

      {!asset.isOffline && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40">
          <Plus size={16} />
        </div>
      )}

      <div className="absolute bottom-1 left-1 right-1 truncate text-[7px] bg-black/80 px-1 py-0.5 rounded font-black uppercase flex items-center gap-1">
        <FileVideo size={8} className={asset.isOffline ? 'text-amber-500' : isUsed ? 'text-red-400' : 'text-indigo-400'} />
        <span className="truncate">{asset.name}</span>
      </div>
    </div>
  );
};

export const MediaBin = ({ library, onImport, onRelink, onAddFromLibrary, onDragStart, timelineItems }: MediaBinProps) => {
  const usedUrls = useMemo(() => new Set(timelineItems.map(item => item.url).filter(Boolean)), [timelineItems]);
  const hasOffline = useMemo(() => library.some(a => a.isOffline), [library]);

  return (
    <aside className="w-48 border-r border-black bg-[#111114] flex flex-col shrink-0 overflow-hidden">
      <div className="h-8 flex items-center justify-between px-3 border-b border-black bg-[#1a1a1e]">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <Library size={12} /> Media
        </span>
        {hasOffline && (
          <button onClick={onRelink} className="flex items-center gap-1 text-[8px] font-black text-amber-500 hover:text-amber-400 animate-pulse transition-colors uppercase">
            <AlertCircle size={10} /> Relink
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
        <button 
          onClick={onImport}
          className="w-full h-20 border border-dashed border-zinc-800 bg-black/20 text-zinc-600 rounded flex flex-col items-center justify-center gap-2 hover:border-indigo-500 hover:text-indigo-400 transition-all group"
        >
          <UploadCloud size={18} className="group-hover:scale-110 transition-transform" />
          <span className="text-[9px] font-black uppercase">Linked Import</span>
        </button>
        
        <div className="space-y-2">
          {library.map((asset) => (
            <MediaThumbnail 
              key={asset.id} 
              asset={asset} 
              isUsed={usedUrls.has(asset.url)}
              onClick={() => onAddFromLibrary(asset)}
              onDragStart={(e) => {
                onDragStart(asset);
                e.dataTransfer.setData('application/json', JSON.stringify(asset));
              }}
            />
          ))}
        </div>
      </div>
    </aside>
  );
};
