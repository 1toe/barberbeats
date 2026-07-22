import React, { useEffect, useRef } from 'react';

interface SpectrumAnalyzerProps {
  getAnalyser: () => AnalyserNode | null;
  isPlaying: boolean;
}

export function SpectrumAnalyzer({ getAnalyser, isPlaying }: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    let animationId: number;

    const draw = () => {
      const analyser = getAnalyser();
      
      if (!analyser) {
        if (isPlaying) {
          animationId = requestAnimationFrame(draw);
        }
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, rect.width, rect.height);

      // Focus on the lower 60% of frequencies for better visual movement (music usually lives here)
      const drawLength = Math.floor(bufferLength * 0.6); 
      const barWidth = rect.width / drawLength;
      const gap = 1;

      for (let i = 0; i < drawLength; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        
        // Add a small minimum height
        const height = Math.max(1, percent * rect.height);
        const y = rect.height - height;
        
        const gradient = ctx.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0, '#f4f4f5'); // zinc-100
        gradient.addColorStop(1, '#71717a'); // zinc-500
        
        ctx.fillStyle = gradient;
        
        ctx.beginPath();
        ctx.roundRect(i * barWidth, y, barWidth - gap, height, 1);
        ctx.fill();
      }

      if (isPlaying) {
        animationId = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isPlaying, getAnalyser]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-8 opacity-70"
      aria-hidden="true"
    />
  );
}
