
import React, { useRef } from 'react';
import { Plus, UploadCloud, Library } from 'lucide-react';

interface MediaAsset {
  name: string;
  url: string;
  duration: number;
}

interface MediaBinProps {
  library: MediaAsset[];
  onImport: (files: FileList) => void;
  onAddFromLibrary: (asset: MediaAsset) => void;
  onDragStart: (asset: any) => void;
}

export const MediaBin = ({ library, onImport, onAddFromLibrary, onDragStart }: MediaBinProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <aside className="w-48 border-r border-black bg-[#111114] flex flex-col shrink-0 overflow-hidden">
      <div className="h-8 flex items-center px-3 border-b border-black bg-[#1a1a1e]">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <Library size={12} /> Media
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin relative">
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-16 border border-dashed border-zinc-800 rounded flex flex-col items-center justify-center text-zinc-600 hover:text-indigo-400 hover:border-indigo-500/50 transition-all gap-1"
        >
          <UploadCloud size={16} />
          <span className="text-[8px] font-bold uppercase">Import Clip</span>
        </button>
        <input type="file" ref={fileInputRef} className="hidden" accept="video/*" multiple onChange={(e) => e.target.files && onImport(e.target.files)} />
        
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
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40"><Plus size={16} /></div>
            <div className="absolute bottom-1 left-1 right-1 truncate text-[7px] bg-black/80 px-1 py-0.5 rounded font-black uppercase">{asset.name}</div>
          </div>
        ))}

        {library.length === 0 && (
          <div className="text-center py-10 opacity-10 uppercase text-[7px] font-black">Empty Bin</div>
        )}
      </div>
    </aside>
  );
};
