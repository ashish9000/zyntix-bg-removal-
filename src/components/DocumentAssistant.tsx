import React, { useState, useRef, useEffect } from 'react';
import { 
  Scan, 
  Fingerprint, 
  FilePlus, 
  Upload, 
  Download, 
  CheckCircle2, 
  Loader2,
  Trash2,
  Maximize,
  ArrowRight,
  FileDigit
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from "jspdf";

interface DocumentAssistantProps {
  onSignatureExtract: (file: File) => void;
  initialTab?: 'id-card' | 'signature' | 'pdf';
}

export const DocumentAssistant: React.FC<DocumentAssistantProps> = ({ onSignatureExtract, initialTab = 'id-card' }) => {
  const [activeTab, setActiveTab] = useState<'id-card' | 'signature' | 'pdf'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const [idFront, setIdFront] = useState<string | null>(null);
  const [idBack, setIdBack] = useState<string | null>(null);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleIdUpload = (side: 'front' | 'back', file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (side === 'front') setIdFront(e.target?.result as string);
      else setIdBack(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const generateIdPdf = async () => {
    if (!idFront || !idBack) return;
    setIsGenerating(true);
    
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    // ID Card dimensions: ~85.6 x 54 mm
    const w = 85.6;
    const h = 54;
    const x = (210 - w) / 2; // Center on A4 (210mm wide)

    pdf.addImage(idFront, 'JPEG', x, 20, w, h);
    pdf.addImage(idBack, 'JPEG', x, 20 + h + 10, w, h);
    
    pdf.save('id_card_print.pdf');
    setIsGenerating(false);
  };

  const generateMultiplePdf = async () => {
    if (pdfFiles.length === 0) return;
    setIsGenerating(true);
    
    const pdf = new jsPDF();
    
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      const reader = new FileReader();
      const imgData = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 10, 10, 190, 277); // Approx full page with margins
    }
    
    pdf.save('documents.pdf');
    setIsGenerating(false);
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight text-white">Document Assistant</h2>
        <p className="text-gray-500 text-sm">Convert IDs, signatures, and photos to professional documents.</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#1A1A1A] p-1 rounded-2xl border border-[#262626] w-fit">
        {[
          { id: 'id-card', icon: Scan, label: 'ID Card' },
          { id: 'signature', icon: Fingerprint, label: 'Signature' },
          { id: 'pdf', icon: FilePlus, label: 'PDF Maker' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {activeTab === 'id-card' && (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#555]">Step 1: Upload Front</span>
                {idFront && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              </div>
              <div 
                onClick={() => frontInputRef.current?.click()}
                className="aspect-[1.58/1] rounded-2xl border-2 border-dashed border-[#262626] bg-[#111] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all overflow-hidden relative group"
              >
                {idFront ? (
                  <img src={idFront} className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Scan className="w-8 h-8 text-blue-500/50" />
                    <span className="text-xs text-gray-500">Front Side (Aadhar/PAN)</span>
                  </>
                )}
                <input type="file" ref={frontInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files && handleIdUpload('front', e.target.files[0])} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#555]">Step 2: Upload Back</span>
                {idBack && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              </div>
              <div 
                onClick={() => backInputRef.current?.click()}
                className="aspect-[1.58/1] rounded-2xl border-2 border-dashed border-[#262626] bg-[#111] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all overflow-hidden relative group"
              >
                {idBack ? (
                  <img src={idBack} className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Scan className="w-8 h-8 text-indigo-500/50 backdrop-rotate-180" />
                    <span className="text-xs text-gray-500">Back Side (Aadhar/PAN)</span>
                  </>
                )}
                <input type="file" ref={backInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files && handleIdUpload('back', e.target.files[0])} />
              </div>
            </div>

            <div className="md:col-span-2 flex justify-center pt-8">
              <button
                disabled={!idFront || !idBack || isGenerating}
                onClick={generateIdPdf}
                className="px-10 py-4 bg-white text-black hover:bg-gray-200 disabled:bg-gray-800 disabled:text-gray-600 rounded-2xl font-bold flex items-center gap-3 transition-all active:scale-95 shadow-xl shadow-white/5"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Maximize className="w-5 h-5" />}
                Generate Print-Ready PDF
              </button>
            </div>
          </div>
        )}

        {activeTab === 'signature' && (
          <div className="max-w-2xl mx-auto flex flex-col items-center justify-center text-center py-12 gap-8">
            <div className="w-24 h-24 rounded-full bg-blue-600/10 flex items-center justify-center">
              <Fingerprint className="w-12 h-12 text-blue-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold">Signature Extractor</h3>
              <p className="text-gray-500 text-sm max-w-sm">Upload a photo of your signature on white paper. Our AI will extract it as a transparent PNG.</p>
            </div>
            <button
              onClick={() => signatureInputRef.current?.click()}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-3 transition-all"
            >
              <Upload className="w-5 h-5" />
              Upload Signature Photo
            </button>
            <input 
              type="file" 
              ref={signatureInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={(e) => e.target.files && onSignatureExtract(e.target.files[0])} 
            />
          </div>
        )}

        {activeTab === 'pdf' && (
          <div className="space-y-8">
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); setPdfFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
              className="w-full p-12 rounded-2xl border-2 border-dashed border-[#262626] bg-[#111] flex flex-col items-center justify-center gap-4 hover:border-blue-500/30 transition-all group"
            >
              <FilePlus className="w-12 h-12 text-blue-500/50 group-hover:scale-110 transition-transform" />
              <div className="text-center">
                <p className="font-semibold text-gray-300">Add photos to PDF</p>
                <p className="text-[11px] text-gray-500 mt-1 uppercase tracking-widest">DRAG AND DROP OR CLICK TO UPLOAD</p>
              </div>
              <button 
                onClick={() => pdfInputRef.current?.click()}
                className="mt-2 px-6 py-2 bg-[#222] border border-[#333] hover:bg-[#333] text-gray-300 rounded-lg text-sm font-medium transition-colors"
              >
                Select Files
              </button>
              <input type="file" multiple className="hidden" ref={pdfInputRef} onChange={(e) => e.target.files && setPdfFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
            </div>

            {pdfFiles.length > 0 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#555]">Selected Photos ({pdfFiles.length})</span>
                  <button onClick={() => setPdfFiles([])} className="text-[10px] uppercase font-bold text-red-500 hover:text-red-400">Clear All</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                  {pdfFiles.map((file, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-[#1A1A1A] border border-[#262626] group">
                      <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button onClick={() => setPdfFiles(prev => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 className="w-5 h-5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center pt-8">
                  <button
                    disabled={isGenerating}
                    onClick={generateMultiplePdf}
                    className="px-10 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold flex items-center gap-3 transition-all active:scale-95 shadow-xl shadow-blue-600/20"
                  >
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDigit className="w-5 h-5" />}
                    Convert to PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
