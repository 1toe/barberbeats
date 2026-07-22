import { useState, useEffect, useRef } from 'react';

interface AudioEngineParams {
  playbackRate: number;
  lowPassFreq: number;
  lowPassEnabled: boolean;
  bassBoost: number;
  bassBoostEnabled: boolean;
  reverbMix: number;
  reverbEnabled: boolean;
  normalizeEnabled: boolean;
}

export function useAudioEngine() {
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const lowShelfRef = useRef<BiquadFilterNode | null>(null);
  const lowPassRef = useRef<BiquadFilterNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);

  // Initialize Audio Context and Nodes
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    // CRITICAL: Disable pitch preservation
    audio.preservesPitch = false;
    // @ts-ignore
    audio.mozPreservesPitch = false;
    // @ts-ignore
    audio.webkitPreservesPitch = false;

    audio.addEventListener('play', () => setIsPlaying(true));
    audio.addEventListener('pause', () => setIsPlaying(false));
    audio.addEventListener('ended', () => setIsPlaying(false));

    setAudioElement(audio);

    return () => {
      audio.pause();
      audio.src = '';
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  const initAudioContext = () => {
    if (!audioElement || audioCtxRef.current) return;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    const source = ctx.createMediaElementSource(audioElement);
    sourceNodeRef.current = source;

    // LowShelf for Bass
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 100;
    lowShelfRef.current = lowShelf;

    // LowPass for Lo-Fi
    const lowPass = ctx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPassRef.current = lowPass;

    // Reverb
    const convolver = ctx.createConvolver();
    convolver.buffer = createSyntheticReverb(ctx);
    convolverRef.current = convolver;

    // Mix nodes
    const dryGain = ctx.createGain();
    dryGainRef.current = dryGain;

    const wetGain = ctx.createGain();
    wetGainRef.current = wetGain;

    const masterGain = ctx.createGain();
    masterGainRef.current = masterGain;

    // Normalization Compressor
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.05;
    compressor.release.value = 0.25;
    compressorRef.current = compressor;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    // Routing
    source.connect(lowShelf);
    lowShelf.connect(lowPass);

    // Split to dry and wet
    lowPass.connect(dryGain);
    lowPass.connect(convolver);
    convolver.connect(wetGain);

    dryGain.connect(masterGain);
    wetGain.connect(masterGain);
    masterGain.connect(compressor);
    
    // Default bypass compressor
    compressor.connect(analyser);
    masterGain.connect(analyser);
    
    analyser.connect(ctx.destination);
  };

  const getAnalyser = () => analyserRef.current;

  const createSyntheticReverb = (ctx: AudioContext) => {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 2.0; // 2 seconds
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (sampleRate * 0.5)); // Exponential decay
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }
    return impulse;
  };

  const loadAudio = (file: File) => {
    if (audioElement) {
      const url = URL.createObjectURL(file);
      audioElement.src = url;
      audioElement.load();
    }
  };

  const updateParams = (params: AudioEngineParams) => {
    if (audioElement) {
      audioElement.playbackRate = params.playbackRate;
    }
    if (lowPassRef.current) {
      lowPassRef.current.frequency.value = params.lowPassEnabled ? params.lowPassFreq : 24000;
    }
    if (lowShelfRef.current) {
      lowShelfRef.current.gain.value = params.bassBoostEnabled ? params.bassBoost : 0;
    }
    if (dryGainRef.current && wetGainRef.current) {
      const actualReverbMix = params.reverbEnabled ? params.reverbMix : 0;
      dryGainRef.current.gain.value = 1 - actualReverbMix;
      wetGainRef.current.gain.value = actualReverbMix;
    }
    if (masterGainRef.current && compressorRef.current && analyserRef.current) {
      try {
        masterGainRef.current.disconnect();
      } catch (e) {
        // Ignore if not connected
      }
      
      if (params.normalizeEnabled) {
        masterGainRef.current.connect(compressorRef.current);
        // Compressor is already connected to analyser
      } else {
        masterGainRef.current.connect(analyserRef.current);
      }
    }
  };

  const togglePlay = async () => {
    if (!audioElement) return;
    
    if (!audioCtxRef.current) {
      initAudioContext();
    }

    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    if (isPlaying) {
      audioElement.pause();
    } else {
      audioElement.play();
    }
  };

  return {
    loadAudio,
    updateParams,
    togglePlay,
    isPlaying,
    audioElement,
    getAnalyser,
  };
}
