import React, { useState, useRef } from 'react';
import { 
  Minimize2, 
  Upload, 
  Download, 
  CheckCircle2, 
  Loader2,
  Trash2,
  Zap,
  Image as ImageIcon,
  ArrowDownCircle,
  RefreshCw,
  Scaling
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import imageCompression from 'browser-image-compression';

export const PhotoCompressor: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [compressedImage, setCompressedImage] = useState<File | null>(null);
  const [compressedPreview, setCompressedPreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [targetSizeKB, setTargetSizeKB] = useState<number>(50);
  const [format, setFormat] = useState<'original' | 'image/jpeg' | 'image/png' | 'image/webp'>('original');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (file: File) => {
    setOriginalImage(file);
    setCompressedImage(null);
    setCompressedPreview(null);
    const reader = new FileReader();
    reader.onload = (e) => setOriginalPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const compressImage = async () => {
    if (!originalImage) return;
    setIsCompressing(true);
    
    try {
      const options = {
        maxSizeMB: targetSizeKB / 1024,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: format === 'original' ? undefined : format
      };

      const compressedBlob = await imageCompression(originalImage, options);
      const compressedFile = new File([compressedBlob], originalImage.name, {
        type: format === 'original' ? originalImage.type : format
      });

      setCompressedImage(compressedFile);
      const reader = new FileReader();
      reader.onload = (e) => setCompressedPreview(e.target?.result as string);
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('Compression failed:', error);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!compressedImage) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(compressedImage);
    const ext = compressedImage.type.split('/')[1];
    link.download = `compressed_${originalImage?.name.split('.')[0]}.${ext}`;
    link.click();
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/10 flex items-center justify-center">
            <Minimize2 className="w-6 h-6 text-indigo-500" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Smart Compressor</h2>
        </div>
        <p className="text-gray-500 text-sm">Resize and compress photos for forms (e.g. Under 50KB, 20KB) with AI quality preservation.</p>
      </div>

      {!originalImage ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="w-full aspect-[4/3] max-w-2xl mx-auto rounded-3xl border-2 border-dashed border-[#262626] bg-[#111] flex flex-col items-center justify-center gap-6 cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group relative overflow-hidden"
        >
          <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#262626 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
          <div className="w-20 h-20 rounded-2xl bg-indigo-600/10 flex items-center justify-center group-hover:scale-110 transition-transform relative z-10">
            <Upload className="w-10 h-10 text-indigo-500" />
          </div>
          <div className="text-center relative z-10">
            <p className="font-bold text-xl text-[#E5E7EB]">Drop Image Here</p>
            <p className="text-gray-500 text-sm mt-1 uppercase tracking-widest font-medium">JPG, PNG, WebP supported</p>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files && handleUpload(e.target.files[0])} />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Comparison View */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#555]">Original Image</span>
              <span className="text-[10px] font-mono text-gray-500">{(originalImage.size / 1024).toFixed(1)} KB</span>
            </div>
            <div className="aspect-square rounded-2xl overflow-hidden bg-[#111] border border-[#262626] relative">
              <img src={originalPreview!} className="w-full h-full object-contain" />
              <button 
                onClick={() => setOriginalImage(null)}
                className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-[#1A1A1A] border border-[#262626] space-y-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 border-b border-white/5 pb-4">Compression Settings</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-300">Target Size (KB)</label>
                  <span className="text-xs font-mono text-indigo-400 font-bold">{targetSizeKB} KB</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="500" 
                  step="5"
                  value={targetSizeKB}
                  onChange={(e) => setTargetSizeKB(Number(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5 bg-[#262626] rounded-full appearance-none cursor-pointer"
                />
                <div className="flex justify-between">
                  <button onClick={() => setTargetSizeKB(20)} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${targetSizeKB === 20 ? 'bg-indigo-600 text-white' : 'bg-[#262626] text-gray-500 hover:text-gray-300'}`}>20KB</button>
                  <button onClick={() => setTargetSizeKB(50)} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${targetSizeKB === 50 ? 'bg-indigo-600 text-white' : 'bg-[#262626] text-gray-500 hover:text-gray-300'}`}>50KB</button>
                  <button onClick={() => setTargetSizeKB(100)} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${targetSizeKB === 100 ? 'bg-indigo-600 text-white' : 'bg-[#262626] text-gray-500 hover:text-gray-300'}`}>100KB</button>
                  <button onClick={() => setTargetSizeKB(200)} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${targetSizeKB === 200 ? 'bg-indigo-600 text-white' : 'bg-[#262626] text-gray-500 hover:text-gray-300'}`}>200KB</button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-gray-300">Output Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'original', label: 'Match Original' },
                    { id: 'image/jpeg', label: 'JPG (Best for photos)' },
                    { id: 'image/png', label: 'PNG (Lossless)' },
                    { id: 'image/webp', label: 'WebP (Modern)' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFormat(f.id as any)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-bold border transition-all ${format === f.id ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-400' : 'bg-[#111] border-[#262626] text-gray-500 hover:border-[#333]'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                disabled={isCompressing}
                onClick={compressImage}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
              >
                {isCompressing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                {isCompressing ? 'AI Processing...' : 'Apply Smart Compression'}
              </button>
            </div>

            <AnimatePresence>
              {compressedImage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#555]">Compressed Result</span>
                    <div className="flex gap-4">
                      <span className="text-[10px] font-mono text-emerald-500 font-bold">{(compressedImage.size / 1024).toFixed(1)} KB</span>
                      <span className="text-[10px] font-mono text-gray-600 font-bold">-{Math.round((1 - compressedImage.size / originalImage.size) * 100)}%</span>
                    </div>
                  </div>
                  <div className="aspect-square rounded-2xl overflow-hidden bg-[#111] border border-emerald-500/20 relative group">
                    <img src={compressedPreview!} className="w-full h-full object-contain" />
                    <button 
                      onClick={handleDownload}
                      className="absolute inset-0 bg-emerald-600/10 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]"
                    >
                      <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-xl">
                        <Download className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-bold text-emerald-500 bg-black/80 px-3 py-1 rounded-full border border-emerald-500/20">Download Compressed File</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
};
