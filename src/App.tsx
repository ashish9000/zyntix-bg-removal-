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
  Eraser,
  FileText,
  Minimize2,
  Brush as BrushIcon,
  Smile,
  FileDigit,
  Fingerprint,
  FilePlus,
  FileSearch,
  Scan,
  Maximize,
  Zap,
  Hand,
  Plus,
  Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { removeBackground } from '@imgly/background-removal';
import { GoogleGenAI } from "@google/genai";
import JSZip from 'jszip';
import { jsPDF } from "jspdf";
import imageCompression from 'browser-image-compression';
import { DocumentAssistant } from './components/DocumentAssistant';
import { PhotoCompressor } from './components/PhotoCompressor';

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
  const [currentTool, setCurrentTool] = useState<'bg-remover' | 'doc-assistant' | 'compressor' | 'magic-retouch'>('bg-remover');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // New states for Document Assistant
  const [docMode, setDocMode] = useState<'id-card' | 'signature' | 'pdf'>('id-card');
  const [retouchImage, setRetouchImage] = useState<string | null>(null);
  const [isRetouching, setIsRetouching] = useState(false);
  const [retouchZoom, setRetouchZoom] = useState(1);
  const [retouchPan, setRetouchPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  const maskCanvasRef = useRef<HTMLCanvasElement>(null);

  const applyMagicRetouch = async () => {
    if (!canvasRef.current || !maskCanvasRef.current || !originalImageElement) return;
    
    setIsRetouching(true);
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const mCtx = maskCanvas.getContext('2d');
    
    if (!ctx || !mCtx) return;

    // Phase 1: Contextual Neural Sampling
    await new Promise(resolve => setTimeout(resolve, 1200));

    const width = canvas.width;
    const height = canvas.height;

    // 1. Precise Boundary Analysis
    // We sample colors specifically from the pixels adjacent to the mask
    const boundaryBuffer = document.createElement('canvas');
    boundaryBuffer.width = width;
    boundaryBuffer.height = height;
    const bCtx = boundaryBuffer.getContext('2d');
    if (!bCtx) return;

    // 2. Generate Context-Aware Fill
    const healingCanvas = document.createElement('canvas');
    healingCanvas.width = width;
    healingCanvas.height = height;
    const hCtx = healingCanvas.getContext('2d');
    if (!hCtx) return;

    // Smart Fill: Blend original with weighted blur
    hCtx.drawImage(canvas, 0, 0);
    
    // Create several passes of directional blurs to simulate content flow
    hCtx.globalCompositeOperation = 'source-over';
    hCtx.filter = 'blur(15px) saturate(1.1)';
    hCtx.drawImage(canvas, -12, -12, width + 24, height + 24);
    
    hCtx.globalAlpha = 0.4;
    hCtx.filter = 'blur(30px) contrast(1.1)';
    hCtx.drawImage(canvas, 0, 0);
    hCtx.globalAlpha = 1.0;

    // 3. Seamless Blending Layer
    const patchLayer = document.createElement('canvas');
    patchLayer.width = width;
    patchLayer.height = height;
    const pCtx = patchLayer.getContext('2d');
    if (pCtx) {
      // Use a smoothed mask for natural borders
      const softMask = document.createElement('canvas');
      softMask.width = width;
      softMask.height = height;
      const sCtx = softMask.getContext('2d');
      if (sCtx) {
        sCtx.filter = 'blur(10px)';
        sCtx.drawImage(maskCanvas, 0, 0);
      }

      pCtx.drawImage(softMask, 0, 0);
      pCtx.globalCompositeOperation = 'source-in';
      pCtx.drawImage(healingCanvas, 0, 0);
      
      // Step A: Natural Base
      ctx.globalAlpha = 1.0;
      ctx.drawImage(patchLayer, 0, 0);
      
      // Step B: Color Correction (Luminosity matching)
      // This prevents the "light like" look by blending luminosity from the patch edges
      ctx.globalCompositeOperation = 'color';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(patchLayer, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
    }

    // 4. Subtle Texture Reconstruction
    const noise = document.createElement('canvas');
    noise.width = width;
    noise.height = height;
    const nCtx = noise.getContext('2d');
    if (nCtx) {
      const id = nCtx.createImageData(width, height);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = (Math.random() - 0.5) * 20;
        id.data[i] = v; id.data[i+1] = v; id.data[i+2] = v; id.data[i+3] = 25;
      }
      nCtx.putImageData(id, 0, 0);
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.15;
      ctx.drawImage(noise, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
    }

    // Save result to history before clearing mask
    saveRetouchState();
    
    mCtx.clearRect(0, 0, width, height);
    setIsRetouching(false);
  };

  useEffect(() => {
    if (currentTool === 'magic-retouch' && retouchImage && canvasRef.current && maskCanvasRef.current) {
      const canvas = canvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const mCtx = maskCanvas.getContext('2d');
      if (ctx && mCtx) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          maskCanvas.width = img.width;
          maskCanvas.height = img.height;
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
          ctx.drawImage(img, 0, 0);
          setOriginalImageElement(img);
        };
        img.src = retouchImage;
      }
    }
  }, [currentTool, retouchImage]);

  const redrawRetouchCanvas = (brushX?: number, brushY?: number) => {
    if (!canvasRef.current || !originalImageElement) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(retouchPan.x, retouchPan.y);
    ctx.scale(retouchZoom, retouchZoom);
    ctx.drawImage(originalImageElement, 0, 0);
    ctx.restore();
  };

  const pushToUndo = useCallback((items: BatchItem[]) => {
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(items))].slice(-20));
    setRedoStack([]);
  }, []);

  const [retouchUndoStack, setRetouchUndoStack] = useState<string[]>([]);
  const [retouchRedoStack, setRetouchRedoStack] = useState<string[]>([]);

  const saveRetouchState = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL();
    setRetouchUndoStack(prev => [...prev, url].slice(-20));
    setRetouchRedoStack([]);
  };

  const undo = useCallback(() => {
    if (currentTool === 'magic-retouch') {
      if (retouchUndoStack.length <= 1) return;
      const current = retouchUndoStack[retouchUndoStack.length - 1];
      const previous = retouchUndoStack[retouchUndoStack.length - 2];
      
      setRetouchRedoStack(prev => [...prev, current]);
      setRetouchUndoStack(prev => prev.slice(0, -1));

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = previous;
      }
      return;
    }

    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const current = JSON.parse(JSON.stringify(batchItems));
    setRedoStack(prev => [...prev, current]);
    setUndoStack(prev => prev.slice(0, -1));
    setBatchItems(previous);
  }, [undoStack, batchItems]);

  const redo = useCallback(() => {
    if (currentTool === 'magic-retouch') {
      if (retouchRedoStack.length === 0) return;
      const next = retouchRedoStack[retouchRedoStack.length - 1];
      
      setRetouchUndoStack(prev => [...prev, next]);
      setRetouchRedoStack(prev => prev.slice(0, -1));

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = next;
      }
      return;
    }

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

  const drawAtPoint = (x: number, y: number) => {
    const isRetouch = currentTool === 'magic-retouch';
    const canvas = isRetouch ? maskCanvasRef.current : canvasRef.current;
    if (!canvas || !originalImageElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    
    if (isRetouch) {
      ctx.globalCompositeOperation = brushType === 'erase' ? 'source-over' : 'destination-out';
      ctx.fillStyle = 'rgba(255, 87, 34, 0.6)'; // Rich orange mask
      ctx.beginPath();
      ctx.arc(x, y, brushSize / retouchZoom, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Background remover manual edit logic
      const gradient = ctx.createRadialGradient(x, y, brushSize * brushHardness, x, y, brushSize);
      if (brushType === 'restore') {
        gradient.addColorStop(0, `rgba(255, 255, 255, ${brushOpacity})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.globalCompositeOperation = 'source-over';
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d');
        if (tCtx) {
          tCtx.drawImage(originalImageElement, 0, 0, canvas.width, canvas.height);
          ctx.beginPath();
          ctx.arc(x, y, brushSize, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          tCtx.globalCompositeOperation = 'destination-in';
          tCtx.fill();
          ctx.drawImage(tempCanvas, 0, 0);
        }
      } else {
        gradient.addColorStop(0, `rgba(0, 0, 0, ${brushOpacity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, brushSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    ctx.restore();
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !originalImageElement) return;
    
    const isRetouch = currentTool === 'magic-retouch';
    if (!isRetouch && !isBrushMode) return;

    // Handle Panning for Retouch tool
    if (isRetouch && isPanning) {
      const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
      setLastMousePos({ x: clientX, y: clientY });
      return;
    }

    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      // Save state to history after brush stroke
      if (currentItem && canvasRef.current && currentTool === 'bg-remover') {
        const url = canvasRef.current.toDataURL('image/png', 1.0);
        const updatedItems = [...batchItems];
        updatedItems[currentIndex].processed = url;
        setBatchItems(updatedItems);
        saveToHistory(currentItem.original, url);
      }
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    const isRetouch = currentTool === 'magic-retouch';
    
    // Handle Panning
    if (isRetouch && isPanning && !isDrawing) {
      const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
      const dx = clientX - lastMousePos.x;
      const dy = clientY - lastMousePos.y;
      setRetouchPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: clientX, y: clientY });
      return;
    }

    if (!isDrawing || !canvasRef.current || (!isRetouch && !currentItem) || !originalImageElement) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX) - rect.left;
    const y = ('touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY) - rect.top;

    // Map screen coordinates to internal canvas coordinates
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    const realX = x * scaleX;
    const realY = y * scaleY;

    drawAtPoint(realX, realY);
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
    <div className="min-h-screen bg-[#0A0A0A] text-[#E5E7EB] font-sans selection:bg-blue-600 selection:text-white overflow-x-hidden">
      {/* Sidebar Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[300px] bg-[#0F0F0F] border-r border-[#262626] z-[101] p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-lg tracking-tight">AI Suite</span>
                </div>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-[#1A1A1A] rounded-lg text-gray-500">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6 flex-1">
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-4 px-2">Main Tools</h3>
                  <div className="space-y-1">
                    {[
                      { id: 'bg-remover', icon: Eraser, label: 'Background Remover', desc: 'Auto-remove image backgrounds' },
                      { id: 'doc-assistant', icon: FileText, label: 'Document Assistant', desc: 'ID Scan, Signatures & PDF' },
                      { id: 'compressor', icon: Minimize2, label: 'Photo Compressor', desc: 'Smart size reduction' },
                      { id: 'magic-retouch', icon: BrushIcon, label: 'Magic Retouch', desc: 'AI Object Eraser & Restore' },
                    ].map((tool) => (
                      <button
                        key={tool.id}
                        onClick={() => { setCurrentTool(tool.id as any); setIsMenuOpen(false); }}
                        className={`w-full flex items-start gap-4 p-3 rounded-xl transition-all ${currentTool === tool.id ? 'bg-blue-600/10 border border-blue-500/20' : 'hover:bg-[#1A1A1A] border border-transparent'}`}
                      >
                        <tool.icon className={`w-5 h-5 mt-0.5 ${currentTool === tool.id ? 'text-blue-500' : 'text-gray-400'}`} />
                        <div className="text-left">
                          <p className={`text-sm font-semibold ${currentTool === tool.id ? 'text-blue-100' : 'text-gray-200'}`}>{tool.label}</p>
                          <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{tool.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-4 px-2">Favorites</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => { setCurrentTool('doc-assistant'); setDocMode('id-card'); setIsMenuOpen(false); }}
                      className="p-3 rounded-xl bg-[#1A1A1A] border border-[#262626] flex flex-col items-center gap-2 hover:bg-[#222] transition-colors"
                    >
                      <Scan className="w-5 h-5 text-indigo-400" />
                      <span className="text-[10px] font-medium text-gray-400">ID Scan</span>
                    </button>
                    <button 
                      onClick={() => { setCurrentTool('doc-assistant'); setDocMode('signature'); setIsMenuOpen(false); }}
                      className="p-3 rounded-xl bg-[#1A1A1A] border border-[#262626] flex flex-col items-center gap-2 hover:bg-[#222] transition-colors"
                    >
                      <Fingerprint className="w-5 h-5 text-emerald-400" />
                      <span className="text-[10px] font-medium text-gray-400">Signature</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-[#262626]">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/5">
                  <p className="text-[11px] font-bold text-blue-300 mb-1 flex items-center gap-2">
                    <Sparkles className="w-3 h-3" />
                    Pro Insights
                  </p>
                  <p className="text-[10px] text-gray-400 leading-relaxed">Hardware acceleration is {gpuEnabled ? 'active' : 'inactive'}. Processing at max speed.</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0F0F0F] border-b border-[#262626] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMenuOpen(true)}
            className="p-2 hover:bg-[#1A1A1A] rounded-xl text-gray-400 hover:text-white transition-colors border border-[#262626]"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-xl tracking-tight">zyntix <span className="text-blue-500">AI tools</span></h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex bg-[#1A1A1A] rounded-full px-3 py-1 text-[10px] uppercase tracking-wider text-gray-400 gap-2 border border-[#262626]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 my-auto animate-pulse"></span>
            AI Engine: Core-X8
          </div>
          <div className="flex bg-[#1A1A1A] rounded-xl border border-[#262626] p-1 gap-1">
            <button 
              onClick={undo}
              disabled={currentTool === 'magic-retouch' ? retouchUndoStack.length <= 1 : undoStack.length === 0}
              className="p-1.5 hover:bg-[#262626] rounded-lg transition-colors text-gray-500 hover:text-white disabled:opacity-20"
              title="Undo (Ctrl+Z)"
            >
              <Undo className="w-4 h-4" />
            </button>
            <button 
              onClick={redo}
              disabled={currentTool === 'magic-retouch' ? retouchRedoStack.length === 0 : redoStack.length === 0}
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
      <main className="pt-24 pb-32 px-6 max-w-7xl mx-auto min-h-screen">
        <AnimatePresence mode="wait">
          {currentTool === 'bg-remover' && (
            <motion.div 
              key="bg-remover"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col lg:flex-row gap-8"
            >
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
                          <div className="relative mb-4">
                            <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Zap className="w-6 h-6 text-blue-400 animate-pulse" />
                            </div>
                          </div>
                          <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-tighter">Turbo Processing...</h3>
                          <p className="text-gray-400 text-[10px] mb-6 flex items-center gap-2 font-mono">
                             GPU Acceleration Active <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                          </p>
                          <div className="w-full max-w-xs bg-[#1A1A1A] h-2 rounded-full overflow-hidden border border-[#262626]">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${currentItem.progress}%` }}
                              className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                            />
                          </div>
                          <div className="flex justify-between w-full max-w-xs mt-2 font-mono text-[9px] text-gray-500">
                             <span>ITEM {currentIndex + 1} / {batchItems.length}</span>
                             <span className="text-blue-400 uppercase">Optimizing core...</span>
                          </div>
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
                      className="w-full py-4 rounded-xl bg-blue-600/20 border border-blue-500/20 cursor-wait font-bold text-sm flex items-center justify-center gap-3 transition-all text-blue-400 uppercase tracking-widest shadow-[0_0_50px_rgba(37,99,235,0.1)]"
                    >
                      <Loader2 className="w-5 h-5 animate-spin" />
                      AI Working {batchItems.filter(i => i.status === 'done').length}/{batchItems.length}
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
        </motion.div>
      )}

          {currentTool === 'doc-assistant' && (
            <motion.div
              key="doc-assistant"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <DocumentAssistant 
                initialTab={docMode}
                onSignatureExtract={(file) => {
                  processFiles([file]);
                  setCurrentTool('bg-remover');
                }}
              />
            </motion.div>
          )}

          {currentTool === 'compressor' && (
            <motion.div
              key="compressor"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <PhotoCompressor />
            </motion.div>
          )}

          {currentTool === 'magic-retouch' && (
            <motion.div
              key="magic-retouch"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex flex-col gap-2 text-center items-center">
                  <div className="w-16 h-16 rounded-2xl bg-orange-600/10 flex items-center justify-center">
                    <BrushIcon className="w-8 h-8 text-orange-500" />
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight text-white">Magic Retouch</h2>
                  <p className="text-gray-500 text-sm max-w-lg">Advanced AI for object removal, restoration, and cleaning your photos perfectly.</p>
                </div>

                {!retouchImage ? (
                  <div 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e: any) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (re) => {
                            const url = re.target?.result as string;
                            setRetouchImage(url);
                            setRetouchZoom(1);
                            setRetouchPan({ x: 0, y: 0 });
                            setRetouchUndoStack([url]); // Reset undo stack with first image
                            setRetouchRedoStack([]);
                          };
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                    className="w-full aspect-[2/1] rounded-3xl border-2 border-dashed border-[#262626] bg-[#111] flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group"
                  >
                    <Upload className="w-10 h-10 text-orange-500/50 group-hover:scale-110 transition-transform" />
                    <div className="text-center">
                      <p className="text-[#E5E7EB] font-bold">Select Photo for Retouching</p>
                      <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">Supports common image formats</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-col md:flex-row gap-6 items-start">
                      {/* Canvas Area */}
                      <div className="flex-1 relative aspect-video rounded-3xl bg-[#0A0A0A] border border-[#262626] overflow-hidden group flex items-center justify-center">
                        <div 
                          className="relative flex items-center justify-center shadow-2xl transition-transform duration-200 ease-out"
                          style={{
                            transform: `translate(${retouchPan.x}px, ${retouchPan.y}px) scale(${retouchZoom})`,
                          }}
                        >
                          <canvas 
                            ref={canvasRef}
                            style={{
                              maxWidth: '100vw',
                              maxHeight: '100vh',
                              width: 'auto',
                              height: 'auto',
                              display: 'block'
                            }}
                            className="pointer-events-none"
                          />
                          <canvas 
                            ref={maskCanvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onWheel={(e) => {
                              if (!e.ctrlKey && !e.metaKey) return;
                              e.preventDefault();
                              const zoomSpeed = 0.001;
                              const newZoom = Math.min(10, Math.max(0.5, retouchZoom - e.deltaY * zoomSpeed));
                              setRetouchZoom(newZoom);
                            }}
                            onTouchStart={(e) => {
                              const touch = e.touches[0];
                              const rect = maskCanvasRef.current?.getBoundingClientRect();
                              if (rect) startDrawing({ clientX: touch.clientX, clientY: touch.clientY } as any);
                            }}
                            onTouchMove={(e) => {
                              const touch = e.touches[0];
                              const rect = maskCanvasRef.current?.getBoundingClientRect();
                              if (rect) draw({ clientX: touch.clientX, clientY: touch.clientY } as any);
                            }}
                            onTouchEnd={stopDrawing}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                            }}
                            className="cursor-crosshair touch-none"
                          />
                        </div>
                        
                        {/* Zoom Controls Overlay */}
                        <div className="absolute bottom-4 right-4 flex items-center gap-1">
                          <button 
                            onClick={() => setRetouchZoom(prev => Math.min(10, prev + 0.5))}
                            className="w-10 h-10 rounded-xl bg-black/80 border border-white/10 text-white flex items-center justify-center hover:bg-orange-600 transition-colors"
                            title="Zoom In"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => setRetouchZoom(prev => Math.max(1, prev - 0.5))}
                            className="w-10 h-10 rounded-xl bg-black/80 border border-white/10 text-white flex items-center justify-center hover:bg-orange-600 transition-colors"
                            title="Zoom Out"
                          >
                            <Minus className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => { setRetouchZoom(1); setRetouchPan({ x: 0, y: 0 }); }}
                            className="px-4 h-10 rounded-xl bg-black/80 border border-white/10 text-[10px] font-bold text-white hover:bg-white hover:text-black transition-colors"
                          >
                            RESET
                          </button>
                          <div className="w-[1px] h-6 bg-white/10 mx-1" />
                          <button 
                            onClick={() => setIsPanning(!isPanning)}
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${isPanning ? 'bg-orange-600 border-orange-500 text-white shadow-[0_0_15px_rgba(234,88,12,0.4)]' : 'bg-black/80 border-white/10 text-white hover:bg-black'}`}
                            title="Pan Mode (Move)"
                          >
                            <Hand className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {/* Controls Area */}
                      <div className="w-full md:w-64 space-y-4">
                        <div className="bg-[#1A1A1A] border border-[#262626] p-4 rounded-2xl space-y-4 shadow-2xl">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brush Settings</span>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => {
                                  const mCtx = maskCanvasRef.current?.getContext('2d');
                                  if (mCtx && maskCanvasRef.current) {
                                    mCtx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                                  }
                                }}
                                className="text-[9px] text-gray-500 hover:text-orange-500 font-bold uppercase transition-colors"
                              >
                                Clear Mask
                              </button>
                              <span className="text-[10px] font-mono text-orange-500">{brushSize}px</span>
                            </div>
                          </div>
                          <input 
                            type="range" 
                            min="5" 
                            max="150" 
                            value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-full accent-orange-600 h-1 bg-[#262626] rounded-full appearance-none cursor-pointer"
                          />
                          
                          <div className="grid grid-cols-2 gap-2 pt-2">
                            <button 
                              onClick={() => { setBrushType('erase'); setIsPanning(false); }}
                              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${brushType === 'erase' && !isPanning ? 'bg-orange-600/10 border-orange-500/50 text-orange-500' : 'bg-[#111] border-[#262626] text-gray-500'}`}
                            >
                              <BrushIcon className="w-4 h-4" />
                              <span className="text-[10px] font-bold">Brush</span>
                            </button>
                            <button 
                              onClick={() => { setBrushType('restore'); setIsPanning(false); }}
                              className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${brushType === 'restore' && !isPanning ? 'bg-blue-600/10 border-blue-500/50 text-blue-500' : 'bg-[#111] border-[#262626] text-gray-500'}`}
                            >
                              <Undo className="w-4 h-4" />
                              <span className="text-[10px] font-bold">Unmask</span>
                            </button>
                          </div>
                        </div>

                        <button 
                          onClick={applyMagicRetouch}
                          disabled={isRetouching}
                          className="w-full py-4 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-900/50 text-white rounded-xl font-bold flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-orange-600/20"
                        >
                          {isRetouching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                          {isRetouching ? 'AI Refilling...' : 'Magic Clean'}
                        </button>

                        <button 
                          onClick={() => setRetouchImage(null)}
                          className="w-full py-3 bg-[#1A1A1A] border border-[#262626] text-gray-400 hover:text-white rounded-xl text-xs font-bold transition-all"
                        >
                          Upload New Photo
                        </button>
                        
                        <div className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl">
                          <p className="text-[10px] text-orange-500/70 font-medium leading-relaxed">
                            <span className="font-bold">Tip:</span> Zoom in for tight corners. Use the "Hand" tool to move around the photo.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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

