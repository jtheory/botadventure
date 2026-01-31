/**
 * Audio visualization utilities for generating waveforms and other visualizations
 */

export interface VisualizationOptions {
  backgroundColor: string;
  waveformColor: string;
  playheadColor: string;
  fps: number;
  style: 'bars' | 'line' | 'mirror';
  barWidth?: number; // Target width for each bar in pixels
  barGap?: number;   // Gap between bars as percentage of bar width (0-1)
  backgroundImage?: File | Blob | null; // Optional background image
  text?: string; // Optional text overlay
  waveformPosition?: 'full' | 'bottom'; // Position of waveform
  waveformHeight?: number; // Height of waveform area as percentage (0-1)
}

// Fixed dimensions optimized for Bluesky
const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;

const defaultOptions: VisualizationOptions = {
  backgroundColor: '#000000',
  waveformColor: '#00bfff',
  playheadColor: '#ffffff',
  fps: 10, // 10 fps for smooth playhead
  style: 'bars',
  barWidth: 4,  // 4px wide bars
  barGap: 0.2,   // 20% gap between bars
  backgroundImage: null,
  text: '',
  waveformPosition: 'bottom',
  waveformHeight: 0.15  // 15% of canvas height for better visibility
};

/**
 * Analyze audio file and extract waveform data
 */
export async function analyzeAudio(
  audioFile: File | Blob,
  barWidth: number = 4
): Promise<{
  sampleData: Float32Array;
  duration: number;
  sampleRate: number;
}> {
  // Create audio context
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  // Read file as array buffer
  const arrayBuffer = await audioFile.arrayBuffer();

  // Decode audio data
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Get the raw PCM data from the first channel
  const rawData = audioBuffer.getChannelData(0);

  // Downsample for visualization - adjust based on desired bar width
  const targetSamples = Math.floor(VIDEO_WIDTH / barWidth);
  const blockSize = Math.floor(rawData.length / targetSamples);
  const sampleData = new Float32Array(targetSamples);

  for (let i = 0; i < targetSamples; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, rawData.length);

    // Get the peak value in this block (for better visualization)
    let maxValue = 0;
    for (let j = start; j < end; j++) {
      const absValue = Math.abs(rawData[j]);
      if (absValue > maxValue) {
        maxValue = absValue;
      }
    }
    sampleData[i] = maxValue;
  }

  // Normalize the data
  const maxSample = Math.max(...sampleData);
  if (maxSample > 0) {
    for (let i = 0; i < sampleData.length; i++) {
      sampleData[i] = sampleData[i] / maxSample;
    }
  }

  audioContext.close();

  return {
    sampleData,
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate
  };
}

/**
 * Load and prepare background image
 */
async function loadBackgroundImage(imageFile: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(imageFile);
  });
}

/**
 * Draw waveform on canvas
 */
async function drawWaveform(
  ctx: CanvasRenderingContext2D,
  sampleData: Float32Array,
  options: VisualizationOptions,
  progress: number = 0,
  backgroundImg?: HTMLImageElement | null
) {
  const { backgroundColor, waveformColor, playheadColor, style } = options;
  const width = VIDEO_WIDTH;
  const height = VIDEO_HEIGHT;

  // Clear canvas and draw background
  if (backgroundImg && options.backgroundImage) {
    // Draw background image with cover fit
    const imgAspect = backgroundImg.width / backgroundImg.height;
    const canvasAspect = width / height;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (imgAspect > canvasAspect) {
      // Image is wider than canvas
      drawHeight = height;
      drawWidth = height * imgAspect;
      offsetX = (width - drawWidth) / 2;
      offsetY = 0;
    } else {
      // Image is taller than canvas
      drawWidth = width;
      drawHeight = width / imgAspect;
      offsetX = 0;
      offsetY = (height - drawHeight) / 2;
    }

    ctx.drawImage(backgroundImg, offsetX, offsetY, drawWidth, drawHeight);
  } else {
    // Use solid color background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Draw text if provided
  if (options.text && options.text.trim()) {
    // Simple text rendering - could be enhanced with more options
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.floor(height * 0.06)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Add shadow for better readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Position text in upper portion
    ctx.fillText(options.text, width / 2, height * 0.15);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Calculate dimensions based on position setting
  let waveformY, waveformHeight;

  if (options.waveformPosition === 'bottom') {
    // Position waveform at bottom of canvas
    const bottomHeight = height * (options.waveformHeight || 0.1); // Default 10%
    waveformY = height - bottomHeight;
    waveformHeight = bottomHeight;
  } else {
    // Full canvas waveform
    waveformY = 0;
    waveformHeight = height;
  }

  const centerY = waveformY + waveformHeight / 2;
  const maxHeight = waveformHeight * 0.8; // Use 80% of waveform area

  // Draw waveform
  ctx.fillStyle = waveformColor;
  ctx.strokeStyle = waveformColor;
  ctx.lineWidth = 2;

  if (style === 'bars') {
    // Bar style visualization
    const actualBarWidth = width / sampleData.length;
    const gapSize = actualBarWidth * (options.barGap || 0.2);
    const barDrawWidth = actualBarWidth - gapSize;

    for (let i = 0; i < sampleData.length; i++) {
      const x = i * actualBarWidth;
      const barHeight = sampleData[i] * maxHeight * 0.5;

      // Change color for played portion
      if (i / sampleData.length < progress) {
        ctx.fillStyle = waveformColor + '60'; // Add transparency for played portion
      } else {
        ctx.fillStyle = waveformColor;
      }

      // Draw mirrored bars with rounded corners for polish
      const radius = Math.min(2, barDrawWidth * 0.2); // Subtle rounding

      // Top bar
      ctx.beginPath();
      ctx.roundRect(x + gapSize/2, centerY - barHeight, barDrawWidth, barHeight, radius);
      ctx.fill();

      // Bottom bar (mirror)
      ctx.beginPath();
      ctx.roundRect(x + gapSize/2, centerY, barDrawWidth, barHeight, radius);
      ctx.fill();
    }
  } else if (style === 'line') {
    // Line style visualization
    ctx.beginPath();
    ctx.moveTo(0, centerY);

    for (let i = 0; i < sampleData.length; i++) {
      const x = (i / sampleData.length) * width;
      const y = centerY - (sampleData[i] * maxHeight * 0.5);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    // Draw bottom half (mirror)
    for (let i = sampleData.length - 1; i >= 0; i--) {
      const x = (i / sampleData.length) * width;
      const y = centerY + (sampleData[i] * maxHeight * 0.5);
      ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();
  } else if (style === 'mirror') {
    // Smooth mirrored waveform
    ctx.beginPath();

    // Top waveform
    for (let i = 0; i < sampleData.length; i++) {
      const x = (i / sampleData.length) * width;
      const y = centerY - (sampleData[i] * maxHeight * 0.5);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        // Use quadratic curve for smoother lines
        const prevX = ((i - 1) / sampleData.length) * width;
        const midX = (prevX + x) / 2;
        const prevY = centerY - (sampleData[i - 1] * maxHeight * 0.5);
        const midY = (prevY + y) / 2;
        ctx.quadraticCurveTo(prevX, prevY, midX, midY);
      }
    }

    ctx.stroke();

    // Bottom waveform (mirror)
    ctx.beginPath();
    for (let i = 0; i < sampleData.length; i++) {
      const x = (i / sampleData.length) * width;
      const y = centerY + (sampleData[i] * maxHeight * 0.5);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevX = ((i - 1) / sampleData.length) * width;
        const midX = (prevX + x) / 2;
        const prevY = centerY + (sampleData[i - 1] * maxHeight * 0.5);
        const midY = (prevY + y) / 2;
        ctx.quadraticCurveTo(prevX, prevY, midX, midY);
      }
    }

    ctx.stroke();
  }

  // Draw playhead (only in waveform area)
  const playheadX = progress * width;
  ctx.strokeStyle = playheadColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(playheadX, waveformY);
  ctx.lineTo(playheadX, waveformY + waveformHeight);
  ctx.stroke();

  // Draw playhead glow effect
  ctx.strokeStyle = playheadColor + '40'; // Semi-transparent
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(playheadX, waveformY);
  ctx.lineTo(playheadX, waveformY + waveformHeight);
  ctx.stroke();
}

/**
 * Generate video frames for waveform animation
 */
export async function generateWaveformFrames(
  audioFile: File | Blob,
  options: Partial<VisualizationOptions> = {}
): Promise<{
  frames: Blob[];
  duration: number;
  fps: number;
  width: number;
  height: number;
}> {
  const opts = { ...defaultOptions, ...options };

  console.log('Analyzing audio file...');
  const { sampleData, duration } = await analyzeAudio(audioFile, opts.barWidth);
  console.log(`Audio duration: ${duration.toFixed(2)}s`);

  // Load background image if provided
  let backgroundImg: HTMLImageElement | null = null;
  if (opts.backgroundImage) {
    console.log('Loading background image...');
    backgroundImg = await loadBackgroundImage(opts.backgroundImage);
  }

  // Create canvas with fixed dimensions
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // Calculate total frames needed
  const totalFrames = Math.ceil(duration * opts.fps);
  console.log(`Generating ${totalFrames} frames at ${opts.fps} fps...`);

  const frames: Blob[] = [];

  // Generate frames
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    // Make sure last frame shows 100% progress
    const progress = frameIndex === totalFrames - 1 ? 1.0 : frameIndex / (totalFrames - 1);

    // Draw frame
    await drawWaveform(ctx, sampleData, opts, progress, backgroundImg);

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!);
      }, 'image/jpeg', 0.9); // Use JPEG for smaller size
    });

    frames.push(blob);

    // Log progress every 10%
    if (frameIndex % Math.floor(totalFrames / 10) === 0) {
      console.log(`Generated ${frameIndex + 1}/${totalFrames} frames (${((frameIndex + 1) / totalFrames * 100).toFixed(0)}%)`);
    }
  }

  console.log('Frame generation complete');

  return {
    frames,
    duration,
    fps: opts.fps,
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT
  };
}

/**
 * Generate a single preview frame (for thumbnail)
 */
export async function generatePreviewFrame(
  audioFile: File | Blob,
  options: Partial<VisualizationOptions> = {}
): Promise<Blob> {
  const opts = { ...defaultOptions, ...options };

  const { sampleData } = await analyzeAudio(audioFile, opts.barWidth);

  // Load background image if provided
  let backgroundImg: HTMLImageElement | null = null;
  if (opts.backgroundImage) {
    backgroundImg = await loadBackgroundImage(opts.backgroundImage);
  }

  // Create canvas with fixed dimensions
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  // Draw waveform at 0% progress (beginning)
  await drawWaveform(ctx, sampleData, opts, 0, backgroundImg);

  // Convert to blob
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!);
    }, 'image/jpeg', 0.9);
  });
}