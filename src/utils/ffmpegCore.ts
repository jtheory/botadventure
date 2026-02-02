import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { STILL_IMAGE_SETTINGS, WAVEFORM_SETTINGS, VIDEO_DIMENSIONS } from '../config/ffmpegSettings';

// Re-export settings for test pages and other modules
export { STILL_IMAGE_SETTINGS, WAVEFORM_SETTINGS, VIDEO_DIMENSIONS };

// Singleton FFmpeg instance management
let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;
let loadingPromise: Promise<FFmpeg> | null = null;

// Track last error for debugging
export let lastFFmpegError = '';

// Track encoding progress callback
let currentProgressCallback: ((current: number, total: number, stage: string) => void) | null = null;
let currentTotalFrames: number = 0;

// Configuration for different conversion presets
export interface ConversionPreset {
  name: string;
  description: string;
  getCommand: (inputs: ConversionInputs) => string[];
}

export interface ConversionInputs {
  audioFile: string;
  audioExt: string;
  imageFile: string;
  outputFile: string;
}

// Different conversion strategies we want to test
export const conversionPresets: Record<string, ConversionPreset> = {
  // Current production preset - uses centralized settings
  production: {
    name: 'Production (Ultrafast)',
    description: 'Fastest encoding, optimized for Bluesky (uses STILL_IMAGE_SETTINGS)',
    getCommand: ({ audioFile, imageFile, outputFile }) => [
      '-i', audioFile,      // Audio first
      '-loop', '1',
      '-framerate', String(STILL_IMAGE_SETTINGS.framerate),
      '-i', imageFile,      // Image second
      '-map', '1:v',        // Map video from second input (image)
      '-map', '0:a',        // Map audio from first input
      '-c:v', 'libx264',
      '-preset', STILL_IMAGE_SETTINGS.preset,
      '-crf', String(STILL_IMAGE_SETTINGS.crf),
      '-c:a', STILL_IMAGE_SETTINGS.audioCodec,
      '-b:a', STILL_IMAGE_SETTINGS.audioBitrate,
      '-ar', STILL_IMAGE_SETTINGS.audioSampleRate,
      '-ac', String(STILL_IMAGE_SETTINGS.audioChannels),
      '-vf', `pad=ceil(iw/2)*2:ceil(ih/2)*2,format=${STILL_IMAGE_SETTINGS.pixelFormat}`,
      '-shortest',
      '-fflags', STILL_IMAGE_SETTINGS.fflags,
      '-max_interleave_delta', STILL_IMAGE_SETTINGS.maxInterleaveDelta,
      '-movflags', STILL_IMAGE_SETTINGS.movFlags,
      outputFile
    ]
  },

  // Balanced speed/quality
  balanced: {
    name: 'Balanced',
    description: 'Better quality, still fast',
    getCommand: ({ audioFile, imageFile, outputFile }) => [
      '-i', audioFile,
      '-loop', '1',
      '-framerate', '1',
      '-i', imageFile,
      '-map', '1:v',
      '-map', '0:a',
      '-c:v', 'libx264',
      '-preset', 'veryfast',  // Slightly slower but better quality
      '-crf', '20',           // Better quality
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-ac', '2',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p',
      '-shortest',
      '-fflags', '+shortest',
      '-max_interleave_delta', '0',
      '-movflags', '+faststart',
      outputFile
    ]
  },

  // Simple approach - minimal parameters
  simple: {
    name: 'Simple',
    description: 'Minimal parameters for basic conversion',
    getCommand: ({ audioFile, imageFile, outputFile }) => [
      '-loop', '1',
      '-i', imageFile,
      '-i', audioFile,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',  // Ensure even dimensions
      '-shortest',
      outputFile
    ]
  },

  // Copy audio stream (no re-encode)
  copyAudio: {
    name: 'Copy Audio',
    description: 'Copy audio stream without re-encoding',
    getCommand: ({ audioFile, imageFile, outputFile }) => [
      '-loop', '1',
      '-i', imageFile,
      '-i', audioFile,
      '-c:v', 'libx264',
      '-c:a', 'copy',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',  // Ensure even dimensions
      '-shortest',
      outputFile
    ]
  },

  // Explicit stream mapping
  explicitMap: {
    name: 'Explicit Mapping',
    description: 'Explicitly map video and audio streams',
    getCommand: ({ audioFile, imageFile, outputFile }) => [
      '-loop', '1',
      '-i', imageFile,
      '-i', audioFile,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',  // Ensure even dimensions
      '-shortest',
      outputFile
    ]
  },

  // Two-pass method
  twoPass: {
    name: 'Two-Pass',
    description: 'Create silent video first, then add audio',
    getCommand: () => {
      throw new Error('Two-pass requires special handling - use runTwoPassConversion');
    }
  },

  // Smaller file size preset
  compressed: {
    name: 'Compressed',
    description: 'Smaller file size - lower quality audio/video',
    getCommand: ({ audioFile, imageFile, outputFile }) => [
      '-i', audioFile,
      '-loop', '1',
      '-framerate', '1',
      '-i', imageFile,
      '-map', '1:v',
      '-map', '0:a',
      '-c:v', 'libx264',
      '-preset', 'fast',   // Changed from veryslow for speed
      '-crf', '28',        // Lower quality for size
      '-c:a', 'aac',
      '-b:a', '64k',       // Lower bitrate
      '-ar', '22050',      // Lower sample rate
      '-ac', '1',          // Mono
      '-vf', 'scale=640:360,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p',
      '-shortest',
      '-fflags', '+shortest',
      '-max_interleave_delta', '0',
      '-movflags', '+faststart',
      outputFile
    ]
  }
};

/**
 * Initialize or get the FFmpeg instance
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  // Return existing instance if loaded
  if (ffmpeg && ffmpegLoaded) {
    console.log('FFmpeg already loaded, returning cached instance');
    return ffmpeg;
  }

  // Return existing loading promise if in progress
  if (loadingPromise) {
    console.log('FFmpeg already loading, waiting for existing load...');
    return loadingPromise;
  }

  // Start loading
  loadingPromise = loadFFmpeg();
  return loadingPromise;
}

async function loadFFmpeg(): Promise<FFmpeg> {
  console.log('Initializing FFmpeg...');

  // Check for SharedArrayBuffer support
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  console.log('SharedArrayBuffer available:', hasSharedArrayBuffer);

  ffmpeg = new FFmpeg();

  // Enable logging and capture errors
  ffmpeg.on('log', ({ message }) => {
    console.log('FFmpeg:', message);
    // Capture error messages
    if (message.includes('Error') || message.includes('failed')) {
      lastFFmpegError = message;
    }
  });

  ffmpeg.on('progress', ({ progress, time }) => {
    console.log(`FFmpeg progress: ${(progress * 100).toFixed(1)}% (time: ${time})`);

    // Report encoding progress if callback is set
    if (currentProgressCallback && progress >= 0) {
      // Progress is 0-1, convert to percentage
      const percent = Math.round(progress * 100);
      currentProgressCallback(percent, 100, 'Encoding video');
    }
  });

  try {
    console.log('Loading FFmpeg from local files...');

    // For Vite dev server, we need absolute URLs
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseURL = isDev
      ? `${window.location.origin}/ffmpeg`
      : '/ffmpeg';

    // Load in single-threaded mode
    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
    console.log('FFmpeg loaded successfully');

    ffmpegLoaded = true;
    loadingPromise = null;
    return ffmpeg;

  } catch (error) {
    console.error('Failed to load FFmpeg:', error);
    loadingPromise = null;
    throw new Error(`Failed to load FFmpeg: ${error}`);
  }
}

/**
 * Run a conversion with a specific preset
 */
export async function runConversion(
  preset: ConversionPreset,
  audioFile: File | Uint8Array,
  imageFile: File | Uint8Array | null,
  audioExt = 'mp3'
): Promise<Blob> {
  const ff = await getFFmpeg();
  lastFFmpegError = '';

  try {
    // Clean up any existing files first
    const filesToClean = [`audio.${audioExt}`, 'image.jpg', 'output.mp4'];
    for (const file of filesToClean) {
      try {
        await ff.deleteFile(file);
      } catch {
        // File might not exist, that's ok
      }
    }

    // Write audio file
    console.log('Writing audio file...');
    const audioData = audioFile instanceof File ? await fetchFile(audioFile) : audioFile;
    await ff.writeFile(`audio.${audioExt}`, audioData);

    // Handle image - use provided or create black background
    if (imageFile) {
      console.log('Writing image file...');
      const imageData = imageFile instanceof File ? await fetchFile(imageFile) : imageFile;
      await ff.writeFile('image.jpg', imageData);
    } else {
      console.log('Creating black background...');
      await ff.exec([
        '-f', 'lavfi',
        '-i', 'color=c=black:s=1920x1080:d=1',
        '-frames:v', '1',
        'image.jpg'
      ]);
    }

    // Get the command for this preset
    const inputs: ConversionInputs = {
      audioFile: `audio.${audioExt}`,
      audioExt,
      imageFile: 'image.jpg',
      outputFile: 'output.mp4'
    };

    const command = preset.getCommand(inputs);
    console.log(`Running ${preset.name} conversion...`);
    console.log('Command:', command.join(' '));

    const result = await ff.exec(command);

    if (result !== 0) {
      const errorDetail = lastFFmpegError || 'Unknown error during conversion';
      throw new Error(`FFmpeg conversion failed with code ${result}: ${errorDetail}`);
    }

    // Read the output
    const data = await ff.readFile('output.mp4');
    const blobData = data instanceof Uint8Array ? data : new Uint8Array(data as any);
    return new Blob([blobData], { type: 'video/mp4' });

  } catch (error) {
    // Better error handling
    console.error('Conversion error:', error);
    throw error;
  } finally {
    // Cleanup
    try {
      const files = [`audio.${audioExt}`, 'image.jpg', 'output.mp4'];
      for (const file of files) {
        try {
          await ff.deleteFile(file);
        } catch {
          // File might not exist
        }
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
  }
}

/**
 * Special handling for two-pass conversion
 */
export async function runTwoPassConversion(
  audioFile: File | Uint8Array,
  imageFile: File | Uint8Array | null,
  audioExt = 'mp3'
): Promise<Blob> {
  const ff = await getFFmpeg();
  lastFFmpegError = '';

  try {
    // Clean up any existing files first
    const filesToClean = [`audio.${audioExt}`, 'image.jpg', 'silent.mp4', 'output.mp4'];
    for (const file of filesToClean) {
      try {
        await ff.deleteFile(file);
      } catch {
        // File might not exist, that's ok
      }
    }

    // Write audio file
    const audioData = audioFile instanceof File ? await fetchFile(audioFile) : audioFile;
    await ff.writeFile(`audio.${audioExt}`, audioData);

    // Create or write image
    if (imageFile) {
      const imageData = imageFile instanceof File ? await fetchFile(imageFile) : imageFile;
      await ff.writeFile('image.jpg', imageData);
    } else {
      await ff.exec([
        '-f', 'lavfi',
        '-i', 'color=c=black:s=1920x1080:d=1',
        '-frames:v', '1',
        'image.jpg'
      ]);
    }

    // Pass 1: Create silent video
    console.log('Pass 1: Creating silent video...');
    let result = await ff.exec([
      '-loop', '1',
      '-framerate', '1',
      '-i', 'image.jpg',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',  // Ensure even dimensions
      '-t', '60',
      '-an',  // No audio
      'silent.mp4'
    ]);

    if (result !== 0) {
      throw new Error(`Pass 1 failed: ${lastFFmpegError || 'Unknown error'}`);
    }

    // Pass 2: Add audio
    console.log('Pass 2: Adding audio...');
    result = await ff.exec([
      '-i', 'silent.mp4',
      '-i', `audio.${audioExt}`,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest',
      'output.mp4'
    ]);

    if (result !== 0) {
      throw new Error(`Pass 2 failed: ${lastFFmpegError || 'Unknown error'}`);
    }

    const data = await ff.readFile('output.mp4');
    const blobData = data instanceof Uint8Array ? data : new Uint8Array(data as any);
    return new Blob([blobData], { type: 'video/mp4' });

  } finally {
    // Cleanup
    try {
      const files = [`audio.${audioExt}`, 'image.jpg', 'silent.mp4', 'output.mp4'];
      for (const file of files) {
        try {
          await ff.deleteFile(file);
        } catch {
          // File might not exist
        }
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
  }
}

/**
 * Get information about a media file
 */
export async function probeFile(file: File | Uint8Array, filename: string): Promise<string> {
  const ff = await getFFmpeg();

  try {
    const data = file instanceof File ? await fetchFile(file) : file;
    await ff.writeFile(filename, data);

    // Probe will return non-zero but logs will contain info
    await ff.exec([
      '-i', filename,
      '-hide_banner'
    ]);

    return lastFFmpegError || 'File probed successfully';
  } finally {
    try {
      await ff.deleteFile(filename);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Helper to check if FFmpeg is ready
export function isFFmpegReady(): boolean {
  return ffmpegLoaded;
}

/**
 * Create video from frame sequence and audio
 */
export async function createVideoFromFrames(
  frames: Blob[],
  audioFile: File | Uint8Array,
  fps: number = 10,
  audioExt: string = 'mp3',
  onProgress?: (current: number, total: number, stage: string) => void
): Promise<Blob> {
  const ff = await getFFmpeg();
  lastFFmpegError = '';

  console.log(`Creating video from ${frames.length} frames at ${fps} fps...`);

  try {
    // Clean up any existing files
    for (let i = 0; i < frames.length; i++) {
      try {
        await ff.deleteFile(`frame_${i.toString().padStart(5, '0')}.jpg`);
      } catch {}
    }
    try {
      await ff.deleteFile(`audio.${audioExt}`);
      await ff.deleteFile('output.mp4');
    } catch {}

    // Write frames to FFmpeg filesystem
    console.log('Writing frames to FFmpeg...');
    for (let i = 0; i < frames.length; i++) {
      const frameData = await fetchFile(frames[i]);
      const frameFileName = `frame_${i.toString().padStart(5, '0')}.jpg`;
      await ff.writeFile(frameFileName, frameData);

      // Log progress every 25%
      if (i % Math.floor(frames.length / 4) === 0) {
        console.log(`Wrote ${i + 1}/${frames.length} frames`);
      }
    }

    // Write audio file
    console.log('Writing audio file...');
    const audioData = audioFile instanceof File ? await fetchFile(audioFile) : audioFile;
    await ff.writeFile(`audio.${audioExt}`, audioData);

    // Create video from frames and audio (uses WAVEFORM_SETTINGS)
    console.log('Combining frames and audio...');

    // Set up progress callback for FFmpeg
    currentProgressCallback = onProgress || null;
    currentTotalFrames = frames.length;

    // Report encoding start
    if (onProgress) {
      onProgress(0, 100, 'Encoding video');
    }

    const result = await ff.exec([
      '-framerate', fps.toString(),
      '-i', 'frame_%05d.jpg',  // Input pattern for frame sequence
      '-i', `audio.${audioExt}`,
      '-c:v', 'libx264',
      '-preset', WAVEFORM_SETTINGS.videoPreset,
      '-crf', String(WAVEFORM_SETTINGS.videoCrf),
      '-c:a', WAVEFORM_SETTINGS.audioCodec,
      '-b:a', WAVEFORM_SETTINGS.audioBitrate,
      '-ar', WAVEFORM_SETTINGS.audioSampleRate,
      '-ac', String(WAVEFORM_SETTINGS.audioChannels),
      '-pix_fmt', WAVEFORM_SETTINGS.pixelFormat,
      '-shortest',              // Stop when audio ends
      '-movflags', WAVEFORM_SETTINGS.movFlags,
      'output.mp4'
    ]);

    // Clear progress callback
    currentProgressCallback = null;
    currentTotalFrames = 0;

    // Report encoding complete
    if (onProgress) {
      onProgress(100, 100, 'Encoding video');
    }

    if (result !== 0) {
      const errorDetail = lastFFmpegError || 'Unknown error during frame video creation';
      throw new Error(`FFmpeg frame video failed with code ${result}: ${errorDetail}`);
    }

    // Read output
    const data = await ff.readFile('output.mp4');
    const blobData = data instanceof Uint8Array ? data : new Uint8Array(data as any);

    console.log('Video created successfully from frames');
    return new Blob([blobData], { type: 'video/mp4' });

  } catch (error) {
    console.error('Frame video creation error:', error);
    throw error;
  } finally {
    // Cleanup
    console.log('Cleaning up temporary files...');
    try {
      // Clean up frames
      for (let i = 0; i < frames.length; i++) {
        try {
          await ff.deleteFile(`frame_${i.toString().padStart(5, '0')}.jpg`);
        } catch {}
      }
      // Clean up audio and output
      await ff.deleteFile(`audio.${audioExt}`);
      await ff.deleteFile('output.mp4');
    } catch {
      // Ignore cleanup errors
    }
  }
}