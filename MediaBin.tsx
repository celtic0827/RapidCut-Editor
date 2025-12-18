
import React, { useRef, useState } from 'react';
import { Plus, UploadCloud, Library, FileVideo } from 'lucide-react';
// Added TrackType import to define correct asset type
import { TrackType } from './types.ts';

interface MediaAsset {
  name: string;
  url: string;
  duration: number;
  // Added type property to match Timeline requirements
  type: TrackType;
}

interface MediaBinProps {
  library: MediaAsset[];
  onImport: (files: FileList) => void;
  onAddFromLibrary: (asset: MediaAsset) => void;
  onDragStart: (asset: MediaAsset) => void;
}

export const MediaBin = ({ library, onImport, onAddFromLibrary, onDragStart }: MediaBinProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImport(e.dataTransfer.files);
    }
  };

  return (
    <aside 
      className="w-48 border-r border-black bg-[#111114] flex flex-col shrink-0 overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="h-8 flex items-center px-3 border-b border-black bg-[#1a1a1e]">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <Library size={12} /> Media
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin relative">
        <button 
          onClick={() => fileInputRef.current?.click()}
          className={`w-full h-24 border border-dashed rounded flex flex-col items-center justify-center transition-all gap-2 group
            ${isOver ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-black/20 border-zinc-800 text-zinc-600 hover:text-indigo-400 hover:border-indigo-500/50'}
          `}
        >
          <UploadCloud size={20} className={isOver ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'} />
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black uppercase">Import Clip</span>
            <span className="text-[7px] opacity-50 uppercase font-bold tracking-tighter">Drop Files Here</span>
          </div>
        </button>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="video/*" 
          multiple 
          onChange={(e) => e.target.files && onImport(e.target.files)} 
        />
        
        <div className="space-y-2">
          {library.map((asset, i) => (
            <div 
              key={i} 
              onClick={() => onAddFromLibrary(asset)} 
              draggable
              onDragStart={(e) => {
                onDragStart(asset);
                e.dataTransfer.setData('application/json', JSON.stringify(asset));
              }}
              className="group relative aspect-video bg-black rounded overflow-hidden cursor-pointer border border-zinc-800 hover:border-indigo-500 transition-all shadow-md"
            >
              <video src={asset.url} className="w-full h-full object-cover opacity-60 group-hover:opacity-100" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40">
                <Plus size={16} />
              </div>
              <div className="absolute bottom-1 left-1 right-1 truncate text-[7px] bg-black/80 px-1 py-0.5 rounded font-black uppercase flex items-center gap-1">
                <FileVideo size={8} className="text-indigo-400" />
                <span className="truncate">{asset.name}</span>
              </div>
            </div>
          ))}
        </div>

        {library.length === 0 && !isOver && (
          <div className="text-center py-10 opacity-10 uppercase text-[7px] font-black flex flex-col items-center gap-2">
            <FileVideo size={24} />
            Empty Bin
          </div>
        )}
      </div>

      {/* Visual Feedback Overlay */}
      {isOver && (
        <div className="absolute inset-0 z-50 pointer-events-none bg-indigo-600/10 backdrop-blur-[1px] border-2 border-indigo-500/50 m-1 rounded flex items-center justify-center animate-pulse">
          <div className="flex flex-col items-center gap-2 bg-black/80 px-4 py-3 rounded-lg border border-indigo-500/30">
            <UploadCloud size={24} className="text-indigo-400" />
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Drop to Import</span>
          </div>
        </div>
      )}
    </aside>
  );
};
