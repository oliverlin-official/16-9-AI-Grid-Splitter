import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Image as ImageIcon, Settings2, FileArchive, Trash2, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function App() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  
  const [gap, setGap] = useState<number>(0);
  const [baseName, setBaseName] = useState<string>('');
  const [format, setFormat] = useState<'original' | 'image/png' | 'image/jpeg'>('original');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Clean up object URL on unmount or when image changes
  useEffect(() => {
    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  const handleFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File size exceeds 20MB limit.');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    
    // Load image to get dimensions
    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.width, height: img.height });
      setImageFile(file);
      setImageSrc(objectUrl);
      // Reset settings on new upload
      setGap(0);
      setBaseName(file.name.replace(/\.[^/.]+$/, "")); // Default to original filename without extension
    };
    img.onerror = () => {
      setError('Failed to load image.');
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleExport = async () => {
    if (!imageSrc || !imageDimensions || !canvasRef.current) return;
    
    setIsProcessing(true);
    setError(null);

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageSrc;
      });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      const zip = new JSZip();
      
      // Calculate slice dimensions
      // Total width = 3 * sliceWidth + 2 * gap
      // sliceWidth = (Total width - 2 * gap) / 3
      const sliceWidth = (imageDimensions.width - 2 * gap) / 3;
      const sliceHeight = (imageDimensions.height - 2 * gap) / 3;

      if (sliceWidth <= 0 || sliceHeight <= 0) {
        throw new Error('Grid gap is too large for this image.');
      }

      const finalBaseName = baseName.trim() || 'image_slice';
      const outputFormat = format === 'original' ? imageFile?.type || 'image/jpeg' : format;
      const extension = outputFormat === 'image/png' ? 'png' : outputFormat === 'image/webp' ? 'webp' : 'jpg';

      // Set canvas size to slice size
      canvas.width = sliceWidth;
      canvas.height = sliceHeight;

      let count = 1;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          // Calculate source coordinates
          const sx = col * (sliceWidth + gap);
          const sy = row * (sliceHeight + gap);

          // Clear canvas
          ctx.clearRect(0, 0, sliceWidth, sliceHeight);
          
          // Draw slice
          ctx.drawImage(
            img,
            sx, sy, sliceWidth, sliceHeight, // Source
            0, 0, sliceWidth, sliceHeight    // Destination
          );

          // Get blob
          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, outputFormat, 0.95);
          });

          if (blob) {
            zip.file(`${finalBaseName}_${count}.${extension}`, blob);
          }
          count++;
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `${finalBaseName}_slices.zip`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during export.');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImageSrc(null);
    setImageDimensions(null);
    setBaseName('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      <header className="bg-white border-b border-neutral-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">16:9 AI Grid Splitter</h1>
              <p className="text-xs text-neutral-500 font-medium">Slice 3x3 grids into clean 16:9 assets</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {!imageSrc ? (
          <div 
            className="border-2 border-dashed border-neutral-300 rounded-2xl bg-white hover:bg-neutral-50 transition-colors duration-200 ease-in-out cursor-pointer flex flex-col items-center justify-center min-h-[60vh]"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="bg-neutral-100 p-4 rounded-full mb-4 text-neutral-500">
              <Upload className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Upload your 3x3 Grid</h2>
            <p className="text-neutral-500 text-sm mb-6 text-center max-w-sm">
              Drag and drop a 16:9 composite image here, or click to browse. Supports JPG, PNG, and WebP up to 20MB.
            </p>
            <button className="px-6 py-2.5 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors">
              Select File
            </button>
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef}
              accept="image/jpeg, image/png, image/webp"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Preview Panel */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Preview</h2>
                <button 
                  onClick={clearImage}
                  className="text-sm text-neutral-500 hover:text-red-600 flex items-center space-x-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear Image</span>
                </button>
              </div>
              
              <div className="bg-neutral-200 rounded-2xl overflow-hidden relative aspect-video shadow-inner border border-neutral-200">
                <img 
                  src={imageSrc} 
                  alt="Grid Preview" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
                
                {/* Grid Overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col">
                  {/* We need to calculate the percentage of the gap relative to the image dimensions to render the overlay correctly */}
                  {imageDimensions && (
                    <div className="w-full h-full relative">
                      {Array.from({ length: 3 }).map((_, row) => (
                        Array.from({ length: 3 }).map((_, col) => {
                          const sliceWidthPct = ((imageDimensions.width - 2 * gap) / 3) / imageDimensions.width * 100;
                          const sliceHeightPct = ((imageDimensions.height - 2 * gap) / 3) / imageDimensions.height * 100;
                          const gapWidthPct = (gap / imageDimensions.width) * 100;
                          const gapHeightPct = (gap / imageDimensions.height) * 100;

                          const left = col * (sliceWidthPct + gapWidthPct);
                          const top = row * (sliceHeightPct + gapHeightPct);

                          return (
                            <div 
                              key={`${row}-${col}`}
                              className="absolute border-2 border-indigo-500/80 bg-indigo-500/10 transition-all duration-200"
                              style={{
                                left: `${left}%`,
                                top: `${top}%`,
                                width: `${sliceWidthPct}%`,
                                height: `${sliceHeightPct}%`,
                              }}
                            >
                              <div className="absolute top-2 left-2 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                {row * 3 + col + 1}
                              </div>
                            </div>
                          );
                        })
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {imageDimensions && (
                <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
                  <span>Original: {imageDimensions.width} × {imageDimensions.height}px</span>
                  <span>
                    Slice: {Math.floor((imageDimensions.width - 2 * gap) / 3)} × {Math.floor((imageDimensions.height - 2 * gap) / 3)}px
                  </span>
                </div>
              )}
            </div>

            {/* Control Panel */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
                <div className="flex items-center space-x-2 mb-6">
                  <Settings2 className="w-5 h-5 text-neutral-400" />
                  <h2 className="text-lg font-semibold">Settings</h2>
                </div>

                <div className="space-y-6">
                  {/* Gap Slider */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label htmlFor="gap" className="text-sm font-medium text-neutral-700">Grid Gap (px)</label>
                      <span className="text-xs font-mono bg-neutral-100 px-2 py-1 rounded text-neutral-600">{gap}px</span>
                    </div>
                    <input 
                      type="range" 
                      id="gap"
                      min="0" 
                      max="100" 
                      value={gap}
                      onChange={(e) => setGap(parseInt(e.target.value, 10))}
                      className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <p className="text-xs text-neutral-500 mt-2">Adjust to crop out the black separator bars.</p>
                  </div>

                  <hr className="border-neutral-100" />

                  {/* Base Name */}
                  <div>
                    <label htmlFor="baseName" className="block text-sm font-medium text-neutral-700 mb-2">Base File Name</label>
                    <input 
                      type="text" 
                      id="baseName"
                      value={baseName}
                      onChange={(e) => setBaseName(e.target.value)}
                      placeholder="e.g., OfficeConcept"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                    <p className="text-xs text-neutral-500 mt-2">Files will be named {baseName || 'image_slice'}_1, _2, etc.</p>
                  </div>

                  {/* Format */}
                  <div>
                    <label htmlFor="format" className="block text-sm font-medium text-neutral-700 mb-2">Export Format</label>
                    <select 
                      id="format"
                      value={format}
                      onChange={(e) => setFormat(e.target.value as any)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-white"
                    >
                      <option value="original">Original Format</option>
                      <option value="image/jpeg">Force JPG</option>
                      <option value="image/png">Force PNG</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Export Button */}
              <button 
                onClick={handleExport}
                disabled={isProcessing}
                className={`w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center space-x-2 transition-all ${
                  isProcessing 
                    ? 'bg-indigo-400 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg active:scale-[0.98]'
                }`}
              >
                {isProcessing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <FileArchive className="w-5 h-5" />
                    <span>Export All as ZIP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
