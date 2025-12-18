
import React, { useState, useRef } from 'react';
import { Plus, UploadCloud } from 'lucide-react';

interface MediaAsset {
  name: string;
  url: string;
  duration: number;
}

interface MediaBinProps {
  library: MediaAsset[];
  onImport: (files: FileList) => void;
  onAddFromLibrary: (asset: MediaAsset) => void;
  onDragStart: (asset: MediaAsset | null) => void;
}

export const MediaBin = ({ library, onImport, onAddFromLibrary, onDragStart }: MediaBinProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) onImport(e.dataTransfer.files);
  };

  const handleAssetDragStart = (e: React.DragEvent, asset: MediaAsset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart(asset);
    
    // Create a very small or invisible drag image so we can show our custom ghost in the timeline instead
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleAssetDragEnd = () => {
    onDragStart(null);
  };

  return (
    <aside 
      className={`w-56 border-r border-black bg-[#111114] flex flex-col shrink-0 transition-colors relative ${isDragging ? 'bg-[#1a1a2e]' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="h-8 flex items-center justify-between px-3 border-b border-black bg-[#1a1a1e]">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Media Bin</span>
        <button onClick={() => fileInputRef.current?.click()} className="p-1 hover:text-white transition-colors"><Plus size={14} /></button>
        <input 
          type="file" ref={fileInputRef} className="hidden" 
          accept="video/*" multiple 
          onChange={(e) => e.target.files && onImport(e.target.files)} 
        />
      </div>
      
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-indigo-600/20 flex flex-col items-center justify-center border-2 border-dashed border-indigo-500 animate-pulse pointer-events-none">
          <UploadCloud size={32} className="text-indigo-400 mb-2" />
          <span className="text-[9px] font-black uppercase tracking-widest text-indigo-200">Drop to Import</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
        {library.length === 0 && (
          <div className="h-32 border border-dashed border-zinc-800 rounded flex flex-col items-center justify-center text-center p-4 opacity-20">
            <UploadCloud size={24} className="mb-2" />
            <div className="uppercase text-[8px] font-bold">Drag & Drop Videos</div>
          </div>
        )}
        {library.map((asset, i) => (
          <div 
            key={i} 
            draggable 
            onDragStart={(e) => handleAssetDragStart(e, asset)}
            onDragEnd={handleAssetDragEnd}
            onClick={() => onAddFromLibrary(asset)} 
            className="group relative aspect-video bg-black rounded overflow-hidden cursor-grab active:cursor-grabbing border border-zinc-800 hover:border-indigo-500 transition-all shadow-md"
          >
            <video src={asset.url} className="w-full h-full object-cover opacity-50 group-hover:opacity-100 pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 pointer-events-none"><Plus size={16} /></div>
            <div className="absolute bottom-1 left-1 right-1 truncate text-[8px] bg-black/60 px-1 py-0.5 rounded font-bold uppercase backdrop-blur-sm pointer-events-none">
              {asset.name}
              <div className="text-[6px] opacity-60 tabular-nums">{(asset.duration).toFixed(2)}s</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
