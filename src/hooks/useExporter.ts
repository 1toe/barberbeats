import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface ExportParams {
  audioFile: File | null;
  playbackRate: number;
  lowPassFreq: number;
  lowPassEnabled: boolean;
  bassBoost: number;
  bassBoostEnabled: boolean;
  reverbMix: number;
  reverbEnabled: boolean;
  normalizeEnabled: boolean;
}

export function useExporter() {
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const ffmpegRef = useRef(new FFmpeg());

  const loadFFmpeg = async () => {
    if (isReady) return;
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    const ffmpeg = ffmpegRef.current;
    
    ffmpeg.on('log', ({ message }) => {
      setLog((prev) => [...prev, message].slice(-5)); // Keep last 5 logs
    });
    
    ffmpeg.on('progress', ({ progress }) => {
      setProgress(Math.round(progress * 100));
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    setIsReady(true);
  };

  const exportAudio = async (params: ExportParams) => {
    if (!params.audioFile) return;
    setIsProcessing(true);
    setProgress(0);
    setLog([]);

    await loadFFmpeg();
    const ffmpeg = ffmpegRef.current;

    const inputName = 'input_audio' + getExtension(params.audioFile.name);
    await ffmpeg.writeFile(inputName, await fetchFile(params.audioFile));

    // Calculate asetrate based on playbackRate
    const sampleRate = 44100;
    const newRate = Math.round(sampleRate * params.playbackRate);
    
    const filters = [`asetrate=${newRate}`, `aresample=${sampleRate}`];
    
    if (params.lowPassEnabled) {
      filters.push(`lowpass=f=${params.lowPassFreq}`);
    }
    
    if (params.bassBoostEnabled) {
      filters.push(`bass=g=${params.bassBoost}`);
    }
    
    if (params.reverbEnabled && params.reverbMix > 0) {
      const echoDelay = 60;
      const echoDecay = params.reverbMix * 0.8;
      filters.push(`aecho=0.8:0.88:${echoDelay}:${echoDecay}`);
    }

    if (params.normalizeEnabled) {
      filters.push('loudnorm=I=-14:TP=-1.0:LRA=11');
    }

    const filterComplex = filters.join(',');

    await ffmpeg.exec([
      '-i', inputName,
      '-af', filterComplex,
      'output.mp3'
    ]);

    const data = await ffmpeg.readFile('output.mp3');
    downloadBlob(new Blob([(data as Uint8Array).buffer], { type: 'audio/mp3' }), 'processed_audio.mp3');
    
    setIsProcessing(false);
  };

  const getExtension = (filename: string) => {
    const ext = filename.split('.').pop();
    return ext ? `.${ext}` : '';
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return {
    exportAudio,
    isProcessing,
    progress,
    log
  };
}
