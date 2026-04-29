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
  const [activeTab, setActiveTab] = useState<'id-card' | 'signature' | 'pdf'>(initialTab as any);

  useEffect(() => {
    setActiveTab(initialTab as any);
  }, [initialTab]);

  const [idFront, setIdFront] = useState<string | null>(null);
  const [idBack, setIdBack] = useState<string | null>(null);
  const [pdfImages, setPdfImages] = useState<string[]>([]);
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

  const handlePdfUpload = (files: FileList) => {
    const newImages: string[] = [];
    let processed = 0;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newImages.push(e.target?.result as string);
        processed++;
        if (processed === files.length) {
          setPdfImages(prev => [...prev, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const generateIdPdf = async () => {
    if (!idFront || !idBack) return;
    setIsGenerating(true);
    
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    const w = 85.6;
    const h = 54;
    const x = (210 - w) / 2;

    pdf.addImage(idFront, 'JPEG', x, 20, w, h);
    pdf.addImage(idBack, 'JPEG', x, 20 + h + 10, w, h);
    
    pdf.save('id_card_print.pdf');
    setIsGenerating(false);
  };

  const generateMergedPdf = async () => {
    if (pdfImages.length === 0) return;
    setIsGenerating(true);
    
    const pdf = new jsPDF();
    
    pdfImages.forEach((img, index) => {
      if (index > 0) pdf.addPage();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(img, 'JPEG', 0, 0, pageWidth, pageHeight);
    });

    pdf.save('merged_document.pdf');
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
          <div className="max-w-4xl mx-auto space-y-8">
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files) handlePdfUpload(e.dataTransfer.files);
              }}
              className="w-full min-h-[300px] rounded-3xl border-2 border-dashed border-[#262626] bg-[#0A0A0A] flex flex-col items-center justify-center p-12 text-center gap-6 group hover:border-blue-500/50 transition-all"
            >
              <div className="w-20 h-20 rounded-2xl bg-blue-600/10 flex items-center justify-center group-hover:scale-110 transition-all">
                <FilePlus className="w-10 h-10 text-blue-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white">Add photos to PDF</h3>
                <p className="text-gray-500 text-sm tracking-[0.1em] uppercase">DRAG AND DROP OR CLICK TO UPLOAD</p>
              </div>
              <button 
                onClick={() => pdfInputRef.current?.click()}
                className="px-8 py-3 bg-[#1A1A1A] border border-[#262626] text-white rounded-xl font-bold hover:bg-[#222] transition-all"
              >
                Select Files
              </button>
              <input 
                type="file" 
                ref={pdfInputRef} 
                className="hidden" 
                multiple 
                accept="image/*" 
                onChange={(e) => e.target.files && handlePdfUpload(e.target.files)} 
              />
            </div>

            {pdfImages.length > 0 && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {pdfImages.map((img, idx) => (
                    <div key={idx} className="aspect-[3/4] rounded-xl overflow-hidden border border-[#262626] relative group">
                      <img src={img} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setPdfImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] font-bold text-white">
                        Page {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center pt-4">
                  <button
                    disabled={isGenerating}
                    onClick={generateMergedPdf}
                    className="px-10 py-4 bg-blue-600 text-white hover:bg-blue-500 rounded-2xl font-bold flex items-center gap-3 transition-all shadow-xl shadow-blue-500/20"
                  >
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    Generate Merged PDF ({pdfImages.length} Pages)
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


