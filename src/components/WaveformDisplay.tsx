import React, { useEffect, useRef, useState } from 'react';

interface WaveformDisplayProps {
  file: File | null;
  audioElement: HTMLAudioElement | null;
}

export function WaveformDisplay({ file, audioElement }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [isDecoding, setIsDecoding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    if (!file) {
      setPeaks([]);
      setProgress(0);
      return;
    }

    let isCancelled = false;
    setIsDecoding(true);

    const decode = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (isCancelled) return;

        const channelData = audioBuffer.getChannelData(0);
        const samples = 120; // Number of bars to render
        const step = Math.ceil(channelData.length / samples);
        const newPeaks = [];

        for (let i = 0; i < samples; i++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            if (i * step + j < channelData.length) {
              const val = Math.abs(channelData[i * step + j]);
              if (val > max) max = val;
            }
          }
          newPeaks.push(max);
        }
        setPeaks(newPeaks);
      } catch (e) {
        console.error('Error decoding audio', e);
      } finally {
        if (!isCancelled) setIsDecoding(false);
      }
    };

    decode();
    return () => { isCancelled = true; };
  }, [file]);

  useEffect(() => {
    if (!peaks.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);
    
    const barWidth = rect.width / peaks.length;
    const gap = 1;

    peaks.forEach((peak, i) => {
      const height = Math.max(2, peak * (rect.height * 0.8)); // 80% height max
      const y = (rect.height - height) / 2;
      const x = i * barWidth;
      
      const isPlayed = (x / rect.width) <= progress;
      
      if (isPlayed) {
        const gradient = ctx.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0, '#f4f4f5'); // zinc-100
        gradient.addColorStop(1, '#a1a1aa'); // zinc-400
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = '#3f3f46'; // zinc-700
      }
      
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth - gap, height, 2);
      ctx.fill();
    });
  }, [peaks, progress]);

  useEffect(() => {
    if (!audioElement) return;
    let animationId: number;
    
    const updateProgress = () => {
      if (audioElement.duration && !audioElement.paused) {
        setProgress(audioElement.currentTime / audioElement.duration);
      }
      animationId = requestAnimationFrame(updateProgress);
    };
    
    updateProgress();
    return () => cancelAnimationFrame(animationId);
  }, [audioElement]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioElement || !audioElement.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    audioElement.currentTime = percentage * audioElement.duration;
    setProgress(percentage);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverX(e.clientX - rect.left);
  };

  const handleMouseLeave = () => {
    setHoverX(null);
  };

  if (!file) return null;

  return (
    <div className="mt-8 space-y-3" aria-label="Audio waveform visualization">
      <div className="flex justify-between items-center text-xs font-medium text-zinc-400 px-1">
        <span>Waveform Overview</span>
        {isDecoding && <span className="animate-pulse">Decoding audio...</span>}
      </div>
      <div 
        ref={containerRef}
        className="relative h-32 w-full bg-zinc-900/60 rounded-xl border border-zinc-800/80 cursor-pointer overflow-hidden group transition-all hover:bg-zinc-900 hover:border-zinc-700 shadow-inner"
        onClick={handleSeek}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full"
        />
        {/* Progress overlay glow */}
        <div 
          className="absolute top-0 bottom-0 left-0 bg-white/5 border-r border-white/20 shadow-[4px_0_24px_rgba(255,255,255,0.15)] pointer-events-none transition-all duration-75"
          style={{ width: `${progress * 100}%` }}
        />
        
        {/* Hover scrubber indicator */}
        {hoverX !== null && (
          <div 
            className="absolute top-0 bottom-0 w-px bg-zinc-300 shadow-[0_0_8px_rgba(255,255,255,0.5)] pointer-events-none"
            style={{ left: hoverX }}
          />
        )}
      </div>
    </div>
  );
}
