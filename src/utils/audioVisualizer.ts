/**
 * Audio visualization utilities for generating waveforms and other visualizations
 */

import html2canvas from 'html2canvas';
import { parseMarkdownToHTML, parseChoicesMarkdown } from './markdown';
import { WAVEFORM_SETTINGS, VIDEO_DIMENSIONS } from '../config/ffmpegSettings';

export interface VisualizationOptions {
  backgroundColor: string;
  waveformColor: string;  // Unplayed portion
  waveformPlayedColor?: string;  // Played portion (defaults to darker version)
  playheadColor: string;  // Deprecated - keeping for compatibility
  fps: number;
  style: 'bars' | 'line' | 'mirror';
  barWidth?: number; // Target width for each bar in pixels
  barGap?: number;   // Gap between bars as percentage of bar width (0-1)
  backgroundImage?: File | Blob | null; // Optional background image
  text?: string; // Optional text overlay
  waveformPosition?: 'full' | 'bottom'; // Position of waveform
  waveformHeight?: number; // Height of waveform area as percentage (0-1)
  waveformOverlayOpacity?: number; // Opacity of dark overlay on waveform area (0-1)
  playAreaGlow?: boolean; // Use glow effect instead of playhead line
  playAreaWidth?: number; // Width of play area glow in pixels
  playAreaBrightness?: number; // Max brightness boost for glow (0-255)
}

// Use centralized video dimensions
const VIDEO_WIDTH = VIDEO_DIMENSIONS.width;
const VIDEO_HEIGHT = VIDEO_DIMENSIONS.height;

// Default options use centralized WAVEFORM_SETTINGS
const defaultOptions: VisualizationOptions = {
  backgroundColor: WAVEFORM_SETTINGS.backgroundColor,
  waveformColor: '#e6e6ff',  // Light blue-white (230,230,255) for unplayed
  waveformPlayedColor: '#7777bb',  // Darker blue for played
  playheadColor: WAVEFORM_SETTINGS.playheadColor,  // Kept for compatibility
  fps: WAVEFORM_SETTINGS.fps,
  style: 'bars',
  barWidth: WAVEFORM_SETTINGS.barWidth,
  barGap: WAVEFORM_SETTINGS.barGap,
  backgroundImage: null,
  text: '',
  waveformPosition: WAVEFORM_SETTINGS.waveformPosition,
  waveformHeight: WAVEFORM_SETTINGS.waveformHeight,
  waveformOverlayOpacity: 0.3,  // 30% dark overlay on waveform area
  playAreaGlow: true,  // Use glow instead of playhead line
  playAreaWidth: 50,  // Width of glow area in pixels (narrower)
  playAreaBrightness: 100  // Max brightness boost
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

  // Note: Text overlay is now handled via html2canvas and composited separately
  // This allows for markdown/HTML rendering

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

  // Add dark overlay on waveform area
  if (options.waveformOverlayOpacity && options.waveformOverlayOpacity > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${options.waveformOverlayOpacity})`;
    ctx.fillRect(0, waveformY, width, waveformHeight);
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
      const barProgress = i / sampleData.length;

      // Determine color based on playback position
      let barColor;
      if (barProgress < progress) {
        // Played portion - use medium blue
        barColor = options.waveformPlayedColor || '#3399cc';
      } else {
        // Unplayed portion - use light blue
        barColor = waveformColor;
      }

      // Add glow effect near current play position
      if (options.playAreaGlow && options.playAreaWidth) {
        const distanceFromPlayhead = Math.abs(barProgress - progress);
        const glowRange = (options.playAreaWidth / width);

        if (distanceFromPlayhead < glowRange) {
          // Calculate brightness based on distance
          const glowStrength = 1 - (distanceFromPlayhead / glowRange);
          const maxBrightness = options.playAreaBrightness || 100;
          const brighten = Math.floor(glowStrength * maxBrightness);

          // Parse hex color and brighten it
          const r = Math.min(255, parseInt(barColor.slice(1,3), 16) + brighten);
          const g = Math.min(255, parseInt(barColor.slice(3,5), 16) + brighten);
          const b = Math.min(255, parseInt(barColor.slice(5,7), 16) + brighten);
          barColor = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
        }
      }

      ctx.fillStyle = barColor;

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

  // Optional: Draw traditional playhead line (disabled by default with playAreaGlow)
  if (!options.playAreaGlow) {
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
}

/**
 * Render text overlay using html2canvas for markdown/HTML support
 */
async function renderTextOverlay(text: string): Promise<HTMLCanvasElement> {
  // Split text into scene and choices
  const parts = text.split('What do you do?');
  const sceneText = parts[0].trim();
  const choicesText = parts[1]?.trim() || '';
  const choices = choicesText ? choicesText.split('\n').filter(c => c.trim()) : [];

  // Create a temporary container for rendering
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: -9999px;
    left: -9999px;
    width: ${VIDEO_WIDTH}px;
    height: ${VIDEO_HEIGHT}px;
    font-family: system-ui, -apple-system, sans-serif;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Create content wrapper with padding
  const contentWrapper = document.createElement('div');
  contentWrapper.style.cssText = `
    max-width: ${VIDEO_WIDTH - 80}px;
    padding: 40px;
    position: relative;
    z-index: 1;
  `;
  container.appendChild(contentWrapper);

  // Add scene text with markdown parsing
  if (sceneText) {
    const sceneDiv = document.createElement('div');
    sceneDiv.style.cssText = `
      font-size: 24px;
      line-height: 1.6;
      margin-bottom: ${choices.length > 0 ? '30px' : '0'};
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      white-space: pre-wrap;
    `;
    sceneDiv.innerHTML = parseMarkdownToHTML(sceneText);
    contentWrapper.appendChild(sceneDiv);
  }

  // Add choices if any
  if (choices.length > 0) {
    const choicesDiv = document.createElement('div');
    choicesDiv.style.cssText = `
      border-top: 2px solid rgba(255,255,255,0.4);
      padding-top: 30px;
    `;

    const choicesTitle = document.createElement('div');
    choicesTitle.style.cssText = `
      font-size: 18px;
      margin-bottom: 15px;
      opacity: 0.9;
      font-weight: 600;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    `;
    choicesTitle.textContent = 'What do you do?';
    choicesDiv.appendChild(choicesTitle);

    const parsedChoices = parseChoicesMarkdown(choices);
    parsedChoices.forEach(choice => {
      const choiceItem = document.createElement('div');
      choiceItem.style.cssText = `
        font-size: 20px;
        margin: 10px 0;
        padding: 12px 15px;
        background: rgba(0,0,0,0.5);
        border-radius: 8px;
        backdrop-filter: blur(10px);
        text-shadow: 1px 1px 3px rgba(0,0,0,0.8);
      `;
      choiceItem.innerHTML = choice.html;
      choicesDiv.appendChild(choiceItem);
    });

    contentWrapper.appendChild(choicesDiv);
  }

  // Add to document temporarily
  document.body.appendChild(container);

  try {
    // Generate the overlay canvas
    const canvas = await html2canvas(container, {
      backgroundColor: null, // Transparent background
      scale: 1,
      logging: false,
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
    });

    return canvas;
  } finally {
    // Clean up
    document.body.removeChild(container);
  }
}

/**
 * Generate video frames for waveform animation
 */
export async function generateWaveformFrames(
  audioFile: File | Blob,
  options: Partial<VisualizationOptions> = {},
  onProgress?: (current: number, total: number, stage: string) => void
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

  // Render text overlay if provided
  let textOverlayCanvas: HTMLCanvasElement | null = null;
  if (opts.text && opts.text.trim()) {
    console.log('Rendering text overlay with markdown/HTML...');
    textOverlayCanvas = await renderTextOverlay(opts.text);
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

    // Composite text overlay on top if present
    if (textOverlayCanvas) {
      ctx.drawImage(textOverlayCanvas, 0, 0);
    }

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!);
      }, 'image/jpeg', 0.9); // Use JPEG for smaller size
    });

    frames.push(blob);

    // Report progress
    if (onProgress) {
      onProgress(frameIndex + 1, totalFrames, 'Generating frames');
    }

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