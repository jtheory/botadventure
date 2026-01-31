import { getFFmpeg, runConversion, conversionPresets, isFFmpegReady } from './ffmpegCore';

// Re-export for compatibility
export { isFFmpegReady };
export const initFFmpeg = getFFmpeg;

export async function createVideoFromAudio(
  audioFile: File,
  imageFile: File | null = null
): Promise<Blob> {
  console.log('Starting audio to video conversion...', {
    audioFile: audioFile.name,
    audioSize: audioFile.size,
    hasImage: !!imageFile
  });

  // Use the production preset by default
  const audioExt = audioFile.name.split('.').pop()?.toLowerCase() || 'mp3';
  return runConversion(
    conversionPresets.production,
    audioFile,
    imageFile,
    audioExt
  );
}