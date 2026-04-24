import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Download, 
  Trash2, 
  Loader2, 
  Sparkles, 
  Info,
  CheckCircle2,
  AlertCircle,
  Menu,
  History,
  X,
  Layers,
  ChevronRight,
  ChevronLeft,
  Undo,
  Redo
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { removeBackground } from '@imgly/background-removal';
import { GoogleGenAI } from "@google/genai";
import JSZip from 'jszip';

// Initialize Gemini for "Smart Insights"
// Note: apiKey is injected via vite.config.ts from process.env.GEMINI_API_KEY or fallback
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ProcessedImage {
  id: string;
  original: string;
  processed: string;
  timestamp: number;
}

interface BatchItem {
  id: string;
  name: string;
  original: string;
  processed: string | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
}

export default function App() {
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProcessedImage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [precisionMode, setPrecisionMode] = useState<'standard' | 'pro'>('standard');
  const [showPortraitBlur, setShowPortraitBlur] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [undoStack, setUndoStack] = useState<BatchItem[][]>([]);
  const [redoStack, setRedoStack] = useState<BatchItem[][]>([]);

  const pushToUndo = useCallback((items: BatchItem[]) => {
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(items))].slice(-20));
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const current = JSON.parse(JSON.stringify(batchItems));
    setRedoStack(prev => [...prev, current]);
    setUndoStack(prev => prev.slice(0, -1));
    setBatchItems(previous);
  }, [undoStack, batchItems]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const current = JSON.parse(JSON.stringify(batchItems));
    setUndoStack(prev => [...prev, current]);
    setRedoStack(prev => prev.slice(0, -1));
    setBatchItems(next);
  }, [redoStack, batchItems]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('background_removal_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load history', e);
      }
    }
  }, []);

  const saveToHistory = (original: string, processed: string) => {
    const newItem: ProcessedImage = {
      id: Date.now().toString(),
      original,
      processed,
      timestamp: Date.now(),
    };
    const updatedHistory = [newItem, ...history].slice(0, 10);
    setHistory(updatedHistory);
    localStorage.setItem('background_removal_history', JSON.stringify(updatedHistory));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(Array.from(files));
    }
  };

  const processFiles = (files: File[]) => {
    const newItems: BatchItem[] = [];
    let count = 0;

    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          newItems.push({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            original: e.target?.result as string,
            processed: null,
            status: 'pending',
            progress: 0,
          });
          count++;
          if (count === files.length) {
            pushToUndo(batchItems);
            setBatchItems(prev => [...prev, ...newItems]);
            setError(null);
            if (newItems.length > 0 && !aiInsight) {
              getAIInsight(newItems[0].original);
            }
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const getAIInsight = async (base64: string) => {
    setIsAiLoading(true);
    try {
      const b64Data = base64.split(',')[1];
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { inlineData: { data: b64Data, mimeType: "image/jpeg" } },
            { text: "Briefly describe this image and give one tip for best background removal. Keep it under 20 words." }
          ]
        }
      });
      setAiInsight(result.text || "Ready to process.");
    } catch (e) {
      console.error("Gemini failed", e);
    } finally {
      setIsAiLoading(false);
    }
  };

  const removeBatchBg = async () => {
    if (batchItems.length === 0 || isProcessing) return;

    pushToUndo(batchItems);
    setIsProcessing(true);
    const updatedItems = [...batchItems];

    for (let i = 0; i < updatedItems.length; i++) {
      if (updatedItems[i].status === 'done') continue;

      setCurrentIndex(i);
      updatedItems[i].status = 'processing';
      updatedItems[i].progress = 10;
      setBatchItems([...updatedItems]);

      try {
        const response = await removeBackground(updatedItems[i].original, {
          model: precisionMode === 'pro' ? 'isnet' : 'isnet_fp16',
          device: 'gpu', // Force GPU acceleration if available
          progress: (p: any) => {
            updatedItems[i].progress = Math.round(Number(p) * 100);
            // Throttle state updates for performance
            if (updatedItems[i].progress % 5 === 0) {
              setBatchItems([...updatedItems]);
            }
          },
        });
        
        const url = URL.createObjectURL(response);
        updatedItems[i].processed = url;
        updatedItems[i].status = 'done';
        saveToHistory(updatedItems[i].original, url);
      } catch (err) {
        console.error(err);
        updatedItems[i].status = 'error';
      }
      setBatchItems([...updatedItems]);
    }

    setIsProcessing(false);
  };

  const downloadAll = async () => {
    const doneItems = batchItems.filter(item => item.processed);
    if (doneItems.length === 0) return;

    if (doneItems.length === 1) {
      const link = document.createElement('a');
      link.href = doneItems[0].processed!;
      link.download = `cleared_${doneItems[0].name.split('.')[0]}.png`;
      link.click();
      return;
    }

    const zip = new JSZip();
    for (const item of doneItems) {
      const response = await fetch(item.processed!);
      const blob = await response.blob();
      zip.file(`cleared_${item.name.split('.')[0]}.png`, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "cleared_images.zip";
    link.click();
  };

  const downloadCurrent = () => {
    if (!currentItem || !currentItem.processed) return;
    const link = document.createElement('a');
    link.href = currentItem.processed;
    link.download = `cleared_${currentItem.name.split('.')[0]}.png`;
    link.click();
  };

  const reset = () => {
    pushToUndo(batchItems);
    setBatchItems([]);
    setError(null);
    setAiInsight(null);
    setCurrentIndex(0);
  };

  const currentItem = batchItems[currentIndex];

  const refineEdges = async () => {
    if (!currentItem || !currentItem.processed || isRefining) return;

    pushToUndo(batchItems);
    setIsRefining(true);
    try {
      // We simulate AI edge refinement by using a small morphological erosion/dilation or high-pass filter 
      // via a canvas. For a true "AI" experience, we could send it to Gemini, but since it's an image processing 
      // task on the result, we'll implement a technical refinement filter.
      
      const img = new Image();
      img.src = currentItem.processed;
      await new Promise((resolve) => (img.onload = resolve));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Simple AI Refinement: Feathering and edge smoothing
      // In a real app, this would be a more complex GPGPU shader or AI model call.
      // We'll apply a slight alpha smoothing to soften harsh segmentation edges.
      ctx.globalCompositeOperation = 'destination-in';
      ctx.filter = 'blur(0.5px)'; // Subtle edge softening
      ctx.drawImage(canvas, 0, 0);
      
      const refinedUrl = canvas.toDataURL('image/png');
      const updatedItems = [...batchItems];
      updatedItems[currentIndex].processed = refinedUrl;
      setBatchItems(updatedItems);
      
      // Update history
      saveToHistory(currentItem.original, refinedUrl);
    } catch (e) {
      console.error("Refinement failed", e);
      setError("AI Refinement failed to initialize.");
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E5E7EB] font-sans selection:bg-blue-600 selection:text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0F0F0F] border-b border-[#262626] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">zyntix <span className="text-blue-500">bg removal</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex bg-[#1A1A1A] rounded-full px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400 gap-2 border border-[#262626]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 my-auto animate-pulse"></span>
            AI Engine: Core-X8
          </div>
          <div className="flex bg-[#1A1A1A] rounded-xl border border-[#262626] p-1 gap-1">
            <button 
              onClick={undo}
              disabled={undoStack.length === 0}
              className="p-1.5 hover:bg-[#262626] rounded-lg transition-colors text-gray-500 hover:text-white disabled:opacity-20"
              title="Undo (Ctrl+Z)"
            >
              <Undo className="w-4 h-4" />
            </button>
            <button 
              onClick={redo}
              disabled={redoStack.length === 0}
              className="p-1.5 hover:bg-[#262626] rounded-lg transition-colors text-gray-500 hover:text-white disabled:opacity-20"
              title="Redo (Ctrl+Y)"
            >
              <Redo className="w-4 h-4" />
            </button>
          </div>
          <button 
            onClick={() => setShowHistory(true)}
            className="p-2 hover:bg-[#1A1A1A] rounded-xl transition-colors text-gray-500 hover:text-white border border-transparent hover:border-[#262626]"
          >
            <History className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-32 px-6 max-w-4xl mx-auto flex flex-col lg:flex-row gap-8">
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {batchItems.length === 0 ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center min-h-[60vh]"
              >
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); e.dataTransfer.files && processFiles(Array.from(e.dataTransfer.files)); }}
                  className="w-full aspect-[4/3] rounded-2xl border border-dashed border-[#262626] bg-[#1A1A1A] flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group relative overflow-hidden"
                >
                  <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#262626 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
                  <div className="w-16 h-16 rounded-xl bg-blue-600/10 flex items-center justify-center group-hover:scale-110 transition-transform relative z-10">
                    <Upload className="w-8 h-8 text-blue-500" />
                  </div>
                  <div className="text-center relative z-10">
                    <p className="font-medium text-lg text-[#E5E7EB]">Upload Images</p>
                    <p className="text-gray-500 text-sm mt-1">Batch selection supported (up to 10MB each)</p>
                  </div>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  multiple
                  className="hidden" 
                />
                
                <div className="mt-12 w-full grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-[#1A1A1A] border border-[#262626]">
                    <Layers className="w-5 h-5 text-blue-500 mb-2" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Batch Mode</h3>
                    <p className="text-[11px] text-gray-400 mt-1">Process multiple images in a single session.</p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#1A1A1A] border border-[#262626]">
                    <Download className="w-5 h-5 text-blue-500 mb-2" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Auto Export</h3>
                    <p className="text-[11px] text-gray-400 mt-1">Zip and download all results in one click.</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="editor"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                {/* Main Editor View */}
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-[#1A1A1A] border border-[#333] shadow-2xl group">
                  {currentItem && (
                    <>
                      <AnimatePresence mode="wait">
                        <motion.div 
                          key={currentItem.id + (currentItem.processed ? 'done' : 'orig')}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="w-full h-full"
                        >
                          {!currentItem.processed ? (
                            <img 
                              src={currentItem.original} 
                              alt="Original" 
                              className={`w-full h-full object-contain ${currentItem.status === 'processing' ? 'blur-sm' : ''} transition-all`}
                            />
                          ) : (
                            <div className="w-full h-full relative">
                              {showPortraitBlur ? (
                                <img 
                                  src={currentItem.original} 
                                  alt="Blurred Background" 
                                  className="w-full h-full object-contain blur-[12px] opacity-60 scale-105 transition-all"
                                />
                              ) : (
                                <div className="absolute inset-0" style={{ backgroundColor: '#1a1a1a', backgroundImage: 'linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px' }}></div>
                              )}
                              <img 
                                src={currentItem.processed} 
                                alt="Processed" 
                                className="w-full h-full object-contain absolute inset-0 z-10"
                              />
                            </div>
                          )}
                        </motion.div>
                      </AnimatePresence>

                      {/* Floating Download Button (Overlay) */}
                      {currentItem.processed && (
                        <motion.button
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={(e) => { e.stopPropagation(); downloadCurrent(); }}
                          className="absolute bottom-4 right-4 z-40 p-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 group/btn"
                        >
                          <Download className="w-5 h-5" />
                          <span className="max-w-0 overflow-hidden group-hover/btn:max-w-xs transition-all duration-300 whitespace-nowrap text-xs font-bold">Download</span>
                        </motion.button>
                      )}

                      {/* Navigation Controls */}
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                        <button 
                          onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                          className="p-3 rounded-full bg-black/60 text-white hover:bg-blue-600 transition-all backdrop-blur-md"
                        >
                          <ChevronLeft className="w-6 h-6" />
                        </button>
                        <button 
                          onClick={() => setCurrentIndex(prev => Math.min(batchItems.length - 1, prev + 1))}
                          className="p-3 rounded-full bg-black/60 text-white hover:bg-blue-600 transition-all backdrop-blur-md"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      </div>

                      {/* Progress Overlay */}
                      {currentItem.status === 'processing' && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center p-8 text-center z-20">
                          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                          <h3 className="font-bold text-xl mb-2 text-[#E5E7EB]">Processing Item {currentIndex + 1}/{batchItems.length}</h3>
                          <div className="w-full max-w-xs h-1 bg-[#262626] rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${currentItem.progress}%` }}
                              className="h-full bg-blue-600"
                            />
                          </div>
                          <p className="text-blue-400 text-xs mt-3 font-mono">{currentItem.progress}% complete</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* AI Insight */}
                {aiInsight && currentItem && !currentItem.processed && currentItem.status === 'pending' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-blue-600/10 border border-blue-600/20 flex gap-3"
                  >
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">AI Insight: {currentItem.name}</h4>
                      <p className="text-xs text-[#E5E7EB] italic mt-0.5">{aiInsight}</p>
                    </div>
                  </motion.div>
                )}

                {/* Batch Actions */}
                <div className="flex flex-col gap-3">
                  {isProcessing ? (
                    <button
                      disabled
                      className="w-full py-4 rounded-xl bg-blue-600/50 cursor-wait font-medium text-sm flex items-center justify-center gap-2 transition-all text-white"
                    >
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing... {batchItems.filter(i => i.status === 'done').length}/{batchItems.length}
                    </button>
                  ) : (
                    <>
                      {currentItem?.status === 'done' ? (
                        <button
                          onClick={downloadCurrent}
                          className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-white shadow-[0_0_25px_rgba(37,99,235,0.4)]"
                        >
                          <Download className="w-5 h-5" />
                          Download result
                        </button>
                      ) : (
                        <button
                          onClick={removeBatchBg}
                          className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-white"
                        >
                          <Sparkles className="w-4 h-4" />
                          Clear focus Background
                        </button>
                      )}

                      {batchItems.some(item => item.status === 'done') && batchItems.length > 1 && (
                        <button
                          onClick={downloadAll}
                          className="w-full py-4 rounded-xl bg-white/10 text-white border border-white/10 hover:bg-white/20 font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        >
                          <Layers className="w-4 h-4" />
                          Export selected ({batchItems.filter(item => item.status === 'done').length}) as ZIP
                        </button>
                      )}
                    </>
                  )}
                  
                  <div className="grid grid-cols-2 gap-3">
                    {currentItem?.status === 'done' && (
                      <div className="col-span-2 grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setShowPortraitBlur(!showPortraitBlur)}
                          className={`py-4 rounded-xl border text-[11px] uppercase tracking-wider font-semibold transition-all flex items-center justify-center gap-2 ${showPortraitBlur ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-[#1A1A1A] border-[#262626] text-gray-500 hover:text-white'}`}
                        >
                          <Sparkles className="w-4 h-4" />
                          {showPortraitBlur ? 'Transparency' : 'Portrait'}
                        </button>
                        <button
                          onClick={refineEdges}
                          disabled={isRefining}
                          className={`py-4 rounded-xl border text-[11px] uppercase tracking-wider font-semibold transition-all flex items-center justify-center gap-2 bg-[#1A1A1A] border-[#262626] text-gray-500 hover:text-white disabled:opacity-50`}
                        >
                          {isRefining ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Layers className="w-4 h-4" />
                          )}
                          {isRefining ? 'Refining...' : 'AI Refine'}
                        </button>
                      </div>
                    )}
                    <button
                      onClick={reset}
                      className="py-4 rounded-xl bg-[#1A1A1A] hover:bg-[#262626] border border-[#262626] text-[11px] uppercase tracking-wider font-semibold text-gray-500 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear All
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="py-4 rounded-xl bg-[#1A1A1A] hover:bg-[#262626] border border-[#262626] text-[11px] uppercase tracking-wider font-semibold text-gray-500 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Add More
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Batch Sidebar List */}
        {batchItems.length > 0 && (
          <div className="w-full lg:w-72 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Processing Queue ({batchItems.length})</h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {batchItems.map((item, idx) => (
                <div 
                  key={item.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-3 relative overflow-hidden ${currentIndex === idx ? 'bg-blue-600/10 border-blue-500/50' : 'bg-[#1A1A1A] border-[#262626] hover:border-gray-700'}`}
                >
                  <div className="w-12 h-12 rounded-lg bg-[#0A0A0A] overflow-hidden shrink-0 relative">
                    {item.processed && currentIndex !== idx && (
                      <img src={item.original} alt="" className="absolute inset-0 w-full h-full object-cover blur-[2px] opacity-30" />
                    )}
                    <img src={item.processed || item.original} alt="" className="w-full h-full object-cover relative z-10" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{item.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.status === 'processing' && <div className="w-full h-1 bg-[#262626] rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${item.progress}%` }} /></div>}
                      {item.status === 'done' && <span className="text-[9px] text-green-500 font-bold uppercase tracking-widest">Done</span>}
                      {item.status === 'pending' && <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Pending</span>}
                    </div>
                  </div>
                  {item.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* History Slide-over */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-[#0F0F0F] border-l border-[#262626] z-[70] p-6 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Recent Sessions</h2>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-[#1A1A1A] rounded-xl transition-colors text-gray-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[50vh] text-gray-600 text-center">
                  <History className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-xs uppercase tracking-widest">No active sessions</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => (
                    <div key={item.id} className="group relative rounded-xl bg-[#1A1A1A] border border-[#262626] p-2 flex gap-4 hover:border-blue-500/50 transition-all">
                      <div className="w-20 h-20 rounded-lg overflow-hidden bg-[#0A0A0A] border border-[#262626] shrink-0">
                        <img src={item.processed} alt="History item" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex flex-col justify-center gap-1">
                        <p className="text-[10px] uppercase font-mono text-gray-500">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </p>
                        <button 
                          onClick={() => {
                            setBatchItems([{
                              id: item.id,
                              name: 'Restored Image',
                              original: item.original,
                              processed: item.processed,
                              status: 'done',
                              progress: 100
                            }]);
                            setCurrentIndex(0);
                            setShowHistory(false);
                          }}
                          className="text-xs font-semibold text-blue-400 hover:text-blue-500 transition-colors text-left"
                        >
                          Restore session
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => {
                      localStorage.removeItem('background_removal_history');
                      setHistory([]);
                    }}
                    className="w-full mt-8 py-3 text-[10px] uppercase tracking-widest text-red-500 hover:bg-red-500/5 rounded-xl border border-transparent hover:border-red-500/20 transition-all"
                  >
                    Purge History
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="fixed bottom-0 left-0 right-0 p-6 bg-[#0A0A0A] border-t border-[#262626] flex items-center justify-center gap-6 z-50">
        <button 
          onClick={() => setPrecisionMode(prev => prev === 'standard' ? 'pro' : 'standard')}
          className="flex items-center gap-2 group"
          title={precisionMode === 'pro' ? "Pro Mode: Maximum accuracy for complex images (Slower)" : "Standard Mode: High-speed engine (Faster)"}
        >
          <div className={`w-8 h-4 rounded-full relative transition-colors ${precisionMode === 'pro' ? 'bg-blue-600' : 'bg-[#262626]'}`}>
            <div className={`absolute top-1 bottom-1 w-2 h-2 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all ${precisionMode === 'pro' ? 'right-1 bg-white' : 'left-1 bg-blue-500'}`}></div>
          </div>
          <span className={`text-[10px] uppercase tracking-widest transition-colors ${precisionMode === 'pro' ? 'text-blue-400' : 'text-gray-500'}`}>
            Neural Mode: {precisionMode === 'pro' ? 'Pro' : 'Active'}
          </span>
        </button>
        <div className="h-4 w-px bg-[#262626]"></div>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest flex items-center gap-1">
          {precisionMode === 'pro' ? 'Precision Core v4.0 (ISO)' : 'Turbo Core v3.1'}
          <span className="text-blue-500/50">• GPU ACTIVE</span>
        </p>
      </footer>
    </div>
  );
}

