/**
 * Beat detection utilities using Web Audio API
 * Based on techniques from web-audio-beat-detector and Joe Sullivan's approach
 */

export interface BeatDetectionResult {
  tempo: number;  // BPM
  confidence: number;  // 0-1, how confident we are in the tempo
  hasStrongBeat: boolean;  // Whether a steady beat was detected
  beatInterval: number;  // Seconds between beats
}

/**
 * Analyze audio buffer to detect tempo/BPM
 * Uses energy-based onset detection across frequency bands
 */
export async function detectBeats(
  audioBuffer: AudioBuffer,
  options: {
    minTempo?: number;  // Default 60 BPM
    maxTempo?: number;  // Default 200 BPM
  } = {}
): Promise<BeatDetectionResult> {
  const minTempo = options.minTempo || 60;
  const maxTempo = options.maxTempo || 200;

  // Calculate energy in different frequency bands
  const lowBand = extractFrequencyBand(audioBuffer, 0, 200);     // Kick drum
  const midBand = extractFrequencyBand(audioBuffer, 200, 2000);  // Snare
  const highBand = extractFrequencyBand(audioBuffer, 2000, 8000); // Hi-hat

  // Combine bands with weights (low frequencies more important for beat)
  const combinedEnergy = new Float32Array(lowBand.length);
  for (let i = 0; i < lowBand.length; i++) {
    combinedEnergy[i] =
      lowBand[i] * 0.5 +    // Kick is most important
      midBand[i] * 0.3 +     // Snare secondary
      highBand[i] * 0.2;     // Hi-hat least important
  }

  // Detect onsets (sudden energy increases)
  const onsets = detectOnsets(combinedEnergy, audioBuffer.sampleRate);

  // Find most likely tempo from onset intervals
  const tempo = findTempo(onsets, minTempo, maxTempo);

  // Calculate confidence based on regularity of beats
  const confidence = calculateConfidence(onsets, tempo.interval);

  return {
    tempo: tempo.bpm,
    confidence,
    hasStrongBeat: confidence > 0.6,  // Threshold for "strong" beat
    beatInterval: tempo.interval
  };
}

/**
 * Extract energy from a specific frequency band
 * NOTE: Simplified implementation - frequency params not yet used
 */
function extractFrequencyBand(
  audioBuffer: AudioBuffer,
  _lowFreq: number,
  _highFreq: number
): Float32Array {
  const channelData = audioBuffer.getChannelData(0);

  // Simplified: Calculate RMS energy in windows
  const windowSize = 2048;
  const hopSize = 512;
  const numWindows = Math.floor((channelData.length - windowSize) / hopSize);
  const energy = new Float32Array(numWindows);

  for (let i = 0; i < numWindows; i++) {
    const start = i * hopSize;
    let sum = 0;

    for (let j = 0; j < windowSize; j++) {
      const sample = channelData[start + j];
      sum += sample * sample;
    }

    energy[i] = Math.sqrt(sum / windowSize);
  }

  return energy;
}

/**
 * Detect onset positions (beat candidates)
 */
function detectOnsets(energy: Float32Array, sampleRate: number): number[] {
  const onsets: number[] = [];
  const threshold = calculateAdaptiveThreshold(energy);

  // Look for peaks above threshold
  for (let i = 1; i < energy.length - 1; i++) {
    if (energy[i] > threshold &&
        energy[i] > energy[i - 1] &&
        energy[i] > energy[i + 1]) {
      // Convert to time in seconds
      const hopSize = 512;
      const time = (i * hopSize) / sampleRate;
      onsets.push(time);
    }
  }

  return onsets;
}

/**
 * Calculate adaptive threshold for onset detection
 */
function calculateAdaptiveThreshold(energy: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < energy.length; i++) {
    sum += energy[i];
  }
  const mean = sum / energy.length;

  // Threshold is mean plus some standard deviations
  let variance = 0;
  for (let i = 0; i < energy.length; i++) {
    variance += Math.pow(energy[i] - mean, 2);
  }
  const stdDev = Math.sqrt(variance / energy.length);

  return mean + stdDev * 1.5;
}

/**
 * Find most likely tempo from onset intervals
 */
function findTempo(onsets: number[], minTempo: number, maxTempo: number): {
  bpm: number;
  interval: number;
} {
  if (onsets.length < 2) {
    return { bpm: 120, interval: 0.5 }; // Default
  }

  // Calculate intervals between consecutive onsets
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i] - onsets[i - 1]);
  }

  // Histogram of intervals (quantized to BPM buckets)
  const minInterval = 60 / maxTempo;
  const maxInterval = 60 / minTempo;
  const bucketCount = 140; // BPM resolution
  const histogram = new Array(bucketCount).fill(0);

  for (const interval of intervals) {
    if (interval >= minInterval && interval <= maxInterval) {
      const bucketIndex = Math.floor(
        ((interval - minInterval) / (maxInterval - minInterval)) * (bucketCount - 1)
      );
      histogram[bucketIndex]++;
    }
  }

  // Find peak in histogram
  let maxCount = 0;
  let peakBucket = 0;
  for (let i = 0; i < bucketCount; i++) {
    if (histogram[i] > maxCount) {
      maxCount = histogram[i];
      peakBucket = i;
    }
  }

  // Convert bucket back to interval
  const interval = minInterval + (peakBucket / (bucketCount - 1)) * (maxInterval - minInterval);
  const bpm = Math.round(60 / interval);

  return { bpm, interval };
}

/**
 * Calculate confidence in detected tempo
 */
function calculateConfidence(onsets: number[], expectedInterval: number): number {
  if (onsets.length < 3) return 0;

  // Calculate how regular the onsets are
  let deviationSum = 0;
  let validCount = 0;

  for (let i = 1; i < onsets.length; i++) {
    const actualInterval = onsets[i] - onsets[i - 1];
    const deviation = Math.abs(actualInterval - expectedInterval);

    // Only count intervals that are close to expected
    if (deviation < expectedInterval * 0.5) {
      deviationSum += deviation;
      validCount++;
    }
  }

  if (validCount === 0) return 0;

  const avgDeviation = deviationSum / validCount;
  const confidence = Math.max(0, 1 - (avgDeviation / expectedInterval) * 2);

  return confidence;
}

/**
 * Simple helper to load audio file and get AudioBuffer
 */
export async function loadAudioBuffer(file: File | Blob): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  return await audioContext.decodeAudioData(arrayBuffer);
}
