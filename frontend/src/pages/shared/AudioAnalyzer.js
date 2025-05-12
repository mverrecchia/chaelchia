const NUM_LOW_BINS = 5;
const NUM_MID_BINS = 5; 
const NUM_HIGH_BINS = 5;
const NUM_TOTAL_BINS = NUM_LOW_BINS + NUM_MID_BINS + NUM_HIGH_BINS;

const LOW_BIN_INDICES = [1, 2, 3, 4, 5];  // Maps to 46.875Hz, 93.75Hz, etc.
const MID_BIN_INDICES = [20, 30, 40, 50, 60];  // Maps to 937.5Hz, 1406.25Hz, etc.
const HIGH_BIN_INDICES = [80, 90, 100, 110, 120];  // Maps to 3750Hz, 4218.75Hz, etc.

const DEFAULT_LOW_WEIGHTS = [0.4, 0.4, 0.1, 0.1, 0.0];
const DEFAULT_MID_WEIGHTS = [0.2, 0.2, 0.2, 0.2, 0.2];
const DEFAULT_HIGH_WEIGHTS = [0.5, 0.5, 0.0, 0.0, 0.0];

const AUDIO_FILE_PATH = '/audio/makeitup.wav';

class AudioAnalyzer {
  constructor() {
    this.audioContext = null;
    this.analyzerNode = null;
    this.sourceNode = null;
    this.gainNode = null;
    
    this.fftSize = 1024;
    this.sampleRate = 48000;

    this.magnitudes = new Float32Array(NUM_TOTAL_BINS);
    this.prevMagnitudes = new Float32Array(NUM_TOTAL_BINS);
    this.weightedMagnitudes = new Float32Array(NUM_TOTAL_BINS);

    this.weightedLowMagnitude = 0.0;
    this.weightedMidMagnitude = 0.0;
    this.weightedHighMagnitude = 0.0;
    
    // hardcoding these for now
    this.fastAlpha = 0.9;
    this.slowAlpha = 0.2;
    
    this.lowWeights = [...DEFAULT_LOW_WEIGHTS];
    this.midWeights = [...DEFAULT_MID_WEIGHTS];
    this.highWeights = [...DEFAULT_HIGH_WEIGHTS];
    
    this.frequencyData = null;
    
    this.isPlaying = false;
    this.autoPlay = false;
    this.loopAudio = true;
    this.startTime = 0;
    this.pausedAt = 0;
    this.volume = 1.0;
  }
  
  async initialize() {
    try {
      this.audioContext = new (window.AudioContext)({ 
        sampleRate: this.sampleRate 
      });

      this.analyzerNode = this.audioContext.createAnalyser();
      this.analyzerNode.fftSize = this.fftSize;
      this.analyzerNode.smoothingTimeConstant = 0.3;
      
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.volume;
      
      this.gainNode.connect(this.audioContext.destination);
      this.frequencyData = new Uint8Array(this.analyzerNode.frequencyBinCount);

      await this.loadAudioFile(AUDIO_FILE_PATH);
      
      return true;
    } catch (error) {
      console.error("Failed to initialize audio analyzer:", error);
      return false;
    }
  }
  
  async loadAudioFile(filePath) {
    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to load audio file: ${response.statusText}`);
      }
      
      const audioData = await response.arrayBuffer();
      this.audioBuffer = await this.audioContext.decodeAudioData(audioData);
      
      if (this.autoPlay) {
        this.play();
      }
      
      return true;
    } catch (error) {
      console.error('Error loading audio file:', error);
      return false;
    }
  }
  
  play() {
    if (!this.audioContext || !this.audioBuffer) {
      console.error('Cannot play: Audio not loaded');
      return false;
    }
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    this.stop();
    
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.loop = this.loopAudio;
    
    this.sourceNode.connect(this.analyzerNode);
    this.analyzerNode.connect(this.gainNode);
    
    this.sourceNode.onended = () => {
      this.isPlaying = false;
      
      if (!this.loopAudio) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
    };
    
    let offset = 0;
    if (this.pausedAt > 0) {
      offset = this.pausedAt;
      this.pausedAt = 0;
    }
    
    this.startTime = this.audioContext.currentTime - offset;
    this.sourceNode.start(0, offset);
    this.isPlaying = true;
    
    return true;
  }
  
  stop() {
    if (this.sourceNode && this.isPlaying) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
        this.sourceNode = null;
        this.isPlaying = false;
        
        this.resetMagnitudes();
        return true;
      } catch (error) {
        console.error('Error stopping audio:', error);
        this.isPlaying = false;
        return false;
      }
    }
    return false;
  }
  
  resetMagnitudes() {
    for (let i = 0; i < this.magnitudes.length; i++) {
      this.magnitudes[i] = 0;
      this.prevMagnitudes[i] = 0;
      this.weightedMagnitudes[i] = 0;
    }
    
    this.weightedLowMagnitude = 0;
    this.weightedMidMagnitude = 0;
    this.weightedHighMagnitude = 0;
  }

  applyConfiguration(config) {    
    if (config.fastAlpha !== undefined) this.fastAlpha = config.fastAlpha;
    if (config.slowAlpha !== undefined) this.slowAlpha = config.slowAlpha;
    
    if (config.weights) {
      if (config.weights.low) this.lowWeights = [...config.weights.low];
      if (config.weights.mid) this.midWeights = [...config.weights.mid];
      if (config.weights.high) this.highWeights = [...config.weights.high];
    }
  }
  
  update() {
    if (this.isPlaying) {
      // run the sampling and get the magnitudes - this comes with the AudioContext
      this.analyzerNode.getByteFrequencyData(this.frequencyData);
      this.getMagnitudes();
      this.calculateWeightedMagnitudes();
      
      return this.weightedMagnitudes;
    }
  }
  
  getMagnitudes() {
    let lowIdx = 0;
    let midIdx = NUM_LOW_BINS;
    let highIdx = NUM_LOW_BINS + NUM_MID_BINS;
    
    for (let i = 0; i < NUM_LOW_BINS; i++) {
      const binIndex = LOW_BIN_INDICES[i];
      if (binIndex < this.frequencyData.length) {
        this.magnitudes[lowIdx + i] = this.frequencyData[binIndex] / 255.0;
      }
    }
    
    for (let i = 0; i < NUM_MID_BINS; i++) {
      const binIndex = MID_BIN_INDICES[i];
      if (binIndex < this.frequencyData.length) {
        this.magnitudes[midIdx + i] = this.frequencyData[binIndex] / 255.0;
      }
    }
    
    for (let i = 0; i < NUM_HIGH_BINS; i++) {
      const binIndex = HIGH_BIN_INDICES[i];
      if (binIndex < this.frequencyData.length) {
        this.magnitudes[highIdx + i] = this.frequencyData[binIndex] / 255.0;
      }
    }
    
    for (let i = 0; i < NUM_TOTAL_BINS; i++) {
      const magnitude = this.magnitudes[i];
      const alpha = (magnitude > this.prevMagnitudes[i]) ? this.fastAlpha : this.slowAlpha;
      this.magnitudes[i] = alpha * magnitude + (1.0 - alpha) * this.prevMagnitudes[i];
      this.prevMagnitudes[i] = this.magnitudes[i];
    }
    
    for (let i = 0; i < NUM_TOTAL_BINS; i++) {
      this.magnitudes[i] = Math.max(0, Math.min(this.magnitudes[i], 1.0));
    }
  }
  
  calculateWeightedMagnitudes() {
    for (let i = 0; i < NUM_LOW_BINS; i++) {
      this.weightedMagnitudes[i] = this.magnitudes[i] * this.lowWeights[i];
    }
    
    for (let i = 0; i < NUM_MID_BINS; i++) {
      this.weightedMagnitudes[NUM_LOW_BINS + i] = this.magnitudes[NUM_LOW_BINS + i] * this.midWeights[i];
    }
    
    for (let i = 0; i < NUM_HIGH_BINS; i++) {
      this.weightedMagnitudes[NUM_LOW_BINS + NUM_MID_BINS + i] = this.magnitudes[NUM_LOW_BINS + NUM_MID_BINS + i] * this.highWeights[i];
    }
  }
  
  cleanup() {
    this.stop();
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(err => {
        console.error('Error closing audio context:', err);
      });
    }
  }
}

export default AudioAnalyzer;