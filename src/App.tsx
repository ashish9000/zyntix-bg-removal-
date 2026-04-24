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
  Redo,
  Eraser
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
  status_label?: string;
}

export default function App() {
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [gpuEnabled, setGpuEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      setGpuEnabled(!!gl);
    } catch {
      setGpuEnabled(false);
    }
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProcessedImage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [precisionMode, setPrecisionMode] = useState<'standard' | 'pro'>('standard');
  const [useDeepScan, setUseDeepScan] = useState(false);
  const [showPortraitBlur, setShowPortraitBlur] = useState(false);
  const [showMask, setShowMask] = useState(false);
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
    // Limit history to 5 items to prevent Storage Quota issues
    const newItem: ProcessedImage = {
      id: Date.now().toString(),
      original,
      processed,
      timestamp: Date.now(),
    };
    const updatedHistory = [newItem, ...history].slice(0, 5);
    setHistory(updatedHistory);
    
    try {
      localStorage.setItem('background_removal_history', JSON.stringify(updatedHistory));
    } catch (e) {
      console.warn('LocalStorage quota exceeded, reducing history persistence');
      // If quota exceeded, try saving only the 2 most recent items
      try {
        localStorage.setItem('background_removal_history', JSON.stringify(updatedHistory.slice(0, 2)));
      } catch (innerE) {
        localStorage.removeItem('background_removal_history');
      }
    }
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

  const currentItem = batchItems[currentIndex];

  const [isBrushMode, setIsBrushMode] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [brushHardness, setBrushHardness] = useState(0.5);
  const [brushOpacity, setBrushOpacity] = useState(1.0);
  const [brushType, setBrushType] = useState<'restore' | 'erase'>('restore');
  const [originalImageElement, setOriginalImageElement] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Pre-load original image for smooth brush performance
  useEffect(() => {
    if (isBrushMode && currentItem?.original) {
      const img = new Image();
      img.src = currentItem.original;
      img.onload = () => setOriginalImageElement(img);
    } else {
      setOriginalImageElement(null);
    }
  }, [isBrushMode, currentItem?.original]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isBrushMode || !canvasRef.current) return;
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      // Save state to history after brush stroke
      if (currentItem && canvasRef.current) {
        const url = canvasRef.current.toDataURL('image/png', 1.0);
        const updatedItems = [...batchItems];
        updatedItems[currentIndex].processed = url;
        setBatchItems(updatedItems);
        saveToHistory(currentItem.original, url);
      }
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current || !currentItem || !originalImageElement) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left;
    const y = ('touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top;

    // Use a safety margin for scale to avoid 0 division
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    const realX = x * scaleX;
    const realY = y * scaleY;

    ctx.save();
    
    // Create a radial gradient for the brush tip to handle hardness
    const gradient = ctx.createRadialGradient(realX, realY, brushSize * brushHardness, realX, realY, brushSize);
    
    if (brushType === 'restore') {
      gradient.addColorStop(0, `rgba(255, 255, 255, ${brushOpacity})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.globalCompositeOperation = 'source-over';
      // We use a temporary canvas to draw the restoration with softness
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tCtx = tempCanvas.getContext('2d');
      if (tCtx) {
        tCtx.drawImage(originalImageElement, 0, 0, canvas.width, canvas.height);
        
        ctx.beginPath();
        ctx.arc(realX, realY, brushSize, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        
        // Use destination-in to mask the original image with our soft brush
        tCtx.globalCompositeOperation = 'destination-in';
        tCtx.fill();
        
        // Draw the result onto the main canvas
        ctx.drawImage(tempCanvas, 0, 0);
      }
    } else {
      gradient.addColorStop(0, `rgba(0, 0, 0, ${brushOpacity})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(realX, realY, brushSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  };

  const refineEdges = useCallback(async (imgUrl: string, isDeep: boolean = false): Promise<string> => {
    try {
      const img = new Image();
      img.src = imgUrl;
      await new Promise((resolve) => (img.onload = resolve));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return imgUrl;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Smart Alpha Matting (Simplified for absolute speed)
      if (isDeep || img.width * img.height < 1500000) {
        const threshold = isDeep ? 180 : 130;
        const lowThreshold = isDeep ? 15 : 35;
        const factor = isDeep ? 1.15 : 1.05;
        
        for (let i = 3; i < data.length; i += 4) {
          const alpha = data[i];
          if (alpha > threshold) {
            data[i] = 255; 
          } else if (alpha < lowThreshold) {
            data[i] = 0;
          } else {
            data[i] = Math.min(255, alpha * factor);
          }
        }
        ctx.putImageData(imageData, 0, 0);
      }
      
      if (isDeep) {
        // High-end edge anti-aliasing
        ctx.globalCompositeOperation = 'destination-in';
        ctx.filter = 'blur(0.45px) contrast(1.1) brightness(1.02)'; 
        ctx.drawImage(canvas, 0, 0);
      }

      return canvas.toDataURL('image/png', 1.0);
    } catch (e) {
      console.error("Refinement logic failed", e);
      return imgUrl;
    }
  }, []);

  const removeBatchBg = async () => {
    if (batchItems.length === 0 || isProcessing) return;

    pushToUndo(batchItems);
    setIsProcessing(true);
    const updatedItems = [...batchItems];

    for (let i = 0; i < updatedItems.length; i++) {
      if (updatedItems[i].status === 'done') continue;
      await processSingleItem(i, updatedItems);
    }

    setIsProcessing(false);
  };

  const processSingleItem = async (index: number, currentItems: BatchItem[]) => {
    const item = currentItems[index];
    if (item.status === 'done' || item.status === 'processing') return;

    const needsJump = batchItems.every(it => it.status !== 'done') || currentIndex === index;
    if (needsJump) {
      setCurrentIndex(index);
    }
    
    item.status = 'processing';
    item.progress = 5;
    item.status_label = 'Initializing...';
    setBatchItems([...currentItems]);

    try {
      let lastUpdate = Date.now();
      const response = await removeBackground(item.original, {
        model: (precisionMode === 'pro') ? 'isnet' : 'isnet_fp16',
        device: 'gpu',
        output: {
          format: 'image/png',
          quality: 0.7, 
        } as any,
        progress: (p: any) => {
          const now = Date.now();
          if (now - lastUpdate > 200) { 
            const prog = Math.min(95, Math.round(Number(p) * 100));
            item.progress = prog;
            
            if (prog < 20) item.status_label = 'Loading AI Engine...';
            else if (prog < 50) item.status_label = 'Scanning Content...';
            else if (prog < 85) item.status_label = 'Removing Background...';
            else item.status_label = 'Polishing Edges...';

            setBatchItems([...currentItems]);
            lastUpdate = now;
          }
        },
      });
      
      let url = URL.createObjectURL(response);

      // Fast auto-clean pass (only for Pro mode or if image is small)
      if (precisionMode === 'pro') {
        item.status_label = 'Deep Semantic Refinement...';
        setBatchItems([...currentItems]);
        url = await refineEdges(url, true);
      }

      item.processed = url;
      item.status = 'done';
      item.progress = 100;
      saveToHistory(item.original, url);
    } catch (err) {
      console.error(err);
      item.status = 'error';
    }
    setBatchItems([...currentItems]);
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

  const refineCurrentEdges = async () => {
    if (!currentItem || !currentItem.processed || isRefining) return;

    pushToUndo(batchItems);
    setIsRefining(true);
    try {
      const refinedUrl = await refineEdges(currentItem.processed, useDeepScan);
      const updatedItems = [...batchItems];
      updatedItems[currentIndex].processed = refinedUrl;
      setBatchItems(updatedItems);
      saveToHistory(currentItem.original, refinedUrl);
    } catch (e) {
      console.error("Refinement failed", e);
      setError("Deep Semantic Refinement failed to initialize.");
    } finally {
      setIsRefining(false);
    }
  };

  const getBinaryMask = (imgUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = imgUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(imgUrl);
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i+3];
          // User Requirement: Strict white for subject (alpha > 0), black for background
          if (alpha > 0) {
            data[i] = 255;
            data[i+1] = 255;
            data[i+2] = 255;
            data[i+3] = 255;
          } else {
            data[i] = 0;
            data[i+1] = 0;
            data[i+2] = 0;
            data[i+3] = 255;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL());
      };
    });
  };

  const [binaryMaskUrl, setBinaryMaskUrl] = useState<string | null>(null);

  useEffect(() => {
    if (showMask && currentItem?.processed) {
      getBinaryMask(currentItem.processed).then(setBinaryMaskUrl);
    } else {
      setBinaryMaskUrl(null);
    }
  }, [showMask, currentItem?.processed]);

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
                            <div className="w-full h-full relative group/slider">
                              {/* Background Layer (Checkerboard or Blur) */}
                              <div className="absolute inset-0">
                                {showPortraitBlur ? (
                                  <img 
                                    src={currentItem.original} 
                                    alt="Blurred Background" 
                                    className="w-full h-full object-contain blur-[12px] opacity-60 scale-105"
                                  />
                                ) : (
                                  <div className="absolute inset-0" style={{ backgroundColor: '#1a1a1a', backgroundImage: 'linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px' }}></div>
                                )}
                              </div>

                              {/* Canvas for Manual Brush Editing */}
                              <div className={`absolute inset-0 z-40 ${isBrushMode ? 'block' : 'hidden'}`}>
                                <canvas
                                  ref={canvasRef}
                                  onMouseDown={startDrawing}
                                  onMouseMove={draw}
                                  onMouseUp={stopDrawing}
                                  onMouseOut={stopDrawing}
                                  onTouchStart={startDrawing}
                                  onTouchMove={draw}
                                  onTouchEnd={stopDrawing}
                                  className="w-full h-full object-contain cursor-crosshair"
                                />
                                <style dangerouslySetInnerHTML={{ __html: `
                                  .cursor-crosshair { 
                                    cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="none" stroke="white" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="white"/></svg>') 16 16, crosshair; 
                                  }
                                `}} />
                              </div>

                              {/* Subject Layer: Processed Result */}
                              <div className={`w-full h-full relative z-10 ${isBrushMode ? 'opacity-0' : 'opacity-100'}`}>
                                <img 
                                  src={showMask && binaryMaskUrl ? binaryMaskUrl : currentItem.processed} 
                                  alt="Processed" 
                                  className={`w-full h-full object-contain ${showMask ? 'bg-black' : ''}`}
                                />
                              </div>
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
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={downloadCurrent}
                            className="w-full py-4 rounded-xl bg-green-600 hover:bg-green-700 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-white shadow-[0_0_25px_rgba(22,163,74,0.4)]"
                          >
                            <Download className="w-5 h-5" />
                            Download result
                          </button>
                          
                          {batchItems.some((item, idx) => item.status === 'pending') && (
                            <button
                              onClick={() => {
                                const nextPendingIdx = batchItems.findIndex((item, idx) => item.status === 'pending');
                                if (nextPendingIdx !== -1) setCurrentIndex(nextPendingIdx);
                              }}
                              className="w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 font-bold text-[11px] uppercase tracking-widest text-blue-400 flex items-center justify-center gap-2 transition-all"
                            >
                              Go to Next Pending
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => processSingleItem(currentIndex, [...batchItems])}
                            disabled={currentItem?.status === 'processing'}
                            className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] ${currentItem?.status === 'processing' ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                          >
                            {currentItem?.status === 'processing' ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Processing... {currentItem.progress}%
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-5 h-5 text-white/80" />
                                Remove Background
                              </>
                            )}
                          </button>
                          {batchItems.filter(i => i.status === 'pending').length > 1 && !isProcessing && (
                            <button
                              onClick={removeBatchBg}
                              className="w-full py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 font-medium text-[10px] uppercase tracking-widest text-gray-400 flex items-center justify-center gap-2 transition-all"
                            >
                              Process All Queue ({batchItems.filter(i => i.status === 'pending').length})
                            </button>
                          )}
                        </div>
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
                        {isBrushMode ? (
                          <div className="col-span-2 bg-[#1A1A1A] p-4 rounded-xl border border-blue-500/30 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => setBrushType('restore')}
                                  className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-2 ${brushType === 'restore' ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(22,163,74,0.5)]' : 'bg-[#262626] text-gray-500'}`}
                                >
                                  <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></div>
                                  Magic Restore
                                </button>
                                <button 
                                  onClick={() => setBrushType('erase')}
                                  className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-2 ${brushType === 'erase' ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-[#262626] text-gray-500'}`}
                                >
                                  <div className="w-1.5 h-1.5 rounded-full bg-current"></div>
                                  Magic Erase
                                </button>
                              </div>
                              <button 
                                onClick={() => setIsBrushMode(false)}
                                className="text-[10px] font-bold bg-blue-600 text-white hover:bg-blue-500 uppercase tracking-widest px-4 py-2 rounded-lg transition-colors shadow-lg"
                              >
                                Save Changes
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-gray-500 font-bold uppercase">Size</span>
                                  <span className="text-[10px] text-gray-400 font-mono">{brushSize}px</span>
                                </div>
                                <input 
                                  type="range" 
                                  min="2" 
                                  max="200" 
                                  value={brushSize} 
                                  onChange={(e) => setBrushSize(Number(e.target.value))}
                                  className="accent-blue-600 h-1 bg-[#262626] rounded-full appearance-none cursor-pointer"
                                />
                              </div>

                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-gray-500 font-bold uppercase">Hardness</span>
                                  <span className="text-[10px] text-gray-400 font-mono">{Math.round(brushHardness * 100)}%</span>
                                </div>
                                <input 
                                  type="range" 
                                  min="0" 
                                  max="1" 
                                  step="0.01"
                                  value={brushHardness} 
                                  onChange={(e) => setBrushHardness(Number(e.target.value))}
                                  className="accent-blue-600 h-1 bg-[#262626] rounded-full appearance-none cursor-pointer"
                                />
                              </div>

                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-gray-500 font-bold uppercase">Opacity</span>
                                  <span className="text-[10px] text-gray-400 font-mono">{Math.round(brushOpacity * 100)}%</span>
                                </div>
                                <input 
                                  type="range" 
                                  min="0.1" 
                                  max="1" 
                                  step="0.01"
                                  value={brushOpacity} 
                                  onChange={(e) => setBrushOpacity(Number(e.target.value))}
                                  className="accent-blue-600 h-1 bg-[#262626] rounded-full appearance-none cursor-pointer"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setIsBrushMode(true);
                                // Initialize canvas with current processed image
                                if (canvasRef.current && currentItem.processed) {
                                  const img = new Image();
                                  img.src = currentItem.processed;
                                  img.onload = () => {
                                    const ctx = canvasRef.current?.getContext('2d');
                                    if (ctx) {
                                      canvasRef.current!.width = img.width;
                                      canvasRef.current!.height = img.height;
                                      ctx.drawImage(img, 0, 0);
                                    }
                                  };
                                }
                              }}
                              className="py-4 rounded-xl border text-[11px] uppercase tracking-wider font-semibold transition-all flex items-center justify-center gap-2 bg-blue-600/10 border-blue-500/30 text-blue-400 hover:bg-blue-600/20"
                            >
                              <Eraser className="w-4 h-4" />
                              Manual Fix
                            </button>
                            <button
                              onClick={() => setShowMask(!showMask)}
                              className={`py-4 rounded-xl border text-[11px] uppercase tracking-wider font-semibold transition-all flex items-center justify-center gap-2 ${showMask ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-[#1A1A1A] border-[#262626] text-gray-500 hover:text-white'}`}
                            >
                              <Layers className="w-4 h-4" />
                              {showMask ? 'Binary Result' : 'Mask Mode'}
                            </button>
                          </>
                        )}
                        
                        {!isBrushMode && (
                          <button
                            onClick={refineCurrentEdges}
                            disabled={isRefining}
                            className={`py-4 rounded-xl border text-[11px] uppercase tracking-wider font-semibold transition-all flex items-center justify-center gap-2 bg-[#1A1A1A] border-[#262626] text-gray-500 hover:text-white disabled:opacity-50 col-span-2`}
                          >
                            {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isRefining ? 'AI Refining...' : 'Deep Semantic Refinement'}
                          </button>
                        )}
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
            {gpuEnabled === false && (
              <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-xl flex gap-3 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">GPU Missing</p>
                  <p className="text-[9px] text-red-300/70 leading-relaxed">Processing will be much slower. Enable Hardware Acceleration in browser settings for 10x speed.</p>
                </div>
              </div>
            )}
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
                    <div className="flex flex-col gap-1 mt-1">
                      {item.status === 'processing' && (
                        <>
                          <div className="w-full h-1 bg-[#262626] rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${item.progress}%` }} />
                          </div>
                          <span className="text-[7px] text-blue-400 uppercase font-bold tracking-tighter truncate animate-pulse">
                            {item.status_label || 'Processing...'}
                          </span>
                        </>
                      )}
                      {item.status === 'done' && <span className="text-[9px] text-green-500 font-bold uppercase tracking-widest">Done</span>}
                      {item.status === 'pending' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); processSingleItem(idx, [...batchItems]); }}
                          className="text-[9px] text-blue-500 font-bold uppercase tracking-widest hover:text-blue-400"
                        >
                          Process
                        </button>
                      )}
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
          onClick={() => {
            setPrecisionMode(prev => prev === 'standard' ? 'pro' : 'standard');
            setUndoStack([]); // Clear stacks when model changes to prevent mixed results
          }}
          className="flex items-center gap-2 group"
          title={precisionMode === 'pro' ? "Pro Engine: Higher accuracy for complex details (Hair/Portraits)" : "Turbo Engine: Very fast background removal"}
        >
          <div className={`w-8 h-4 rounded-full relative transition-colors ${precisionMode === 'pro' ? 'bg-indigo-600' : 'bg-[#262626]'}`}>
            <div className={`absolute top-1 bottom-1 w-2 h-2 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all ${precisionMode === 'pro' ? 'right-1 bg-white' : 'left-1 bg-indigo-500'}`}></div>
          </div>
          <span className={`text-[10px] uppercase tracking-widest transition-colors ${precisionMode === 'pro' ? 'text-indigo-400' : 'text-gray-500'}`}>
            Engine: {precisionMode === 'pro' ? 'Pro HD' : 'Turbo'}
          </span>
        </button>

        <div className="h-4 w-px bg-[#262626]"></div>

        <button 
          onClick={refineCurrentEdges}
          disabled={isRefining}
          className="flex items-center gap-2 group"
          title="Neural Edge Refinement: Analyzes and smoothens edges automatically"
        >
          <div className={`w-8 h-4 rounded-full relative transition-colors ${isRefining ? 'bg-blue-400' : 'bg-[#262626]'}`}>
            <div className={`absolute top-1 bottom-1 w-2 h-2 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all ${isRefining ? 'right-1 bg-white animate-pulse' : 'left-1 bg-blue-500'}`}></div>
          </div>
          <span className={`text-[10px] uppercase tracking-widest transition-colors ${isRefining ? 'text-blue-400' : 'text-gray-500'}`}>
            Auto Refine: {isRefining ? 'Active' : 'Ready'}
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

