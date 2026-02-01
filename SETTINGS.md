# Production FFmpeg Settings

All production FFmpeg settings are now centralized in `/src/config/ffmpegSettings.ts`.

## Settings Files

### `/src/config/ffmpegSettings.ts`
**The single source of truth for all production encoding settings.**

Contains three exported constants:
- `STILL_IMAGE_SETTINGS` - Settings for still image + audio videos
- `WAVEFORM_SETTINGS` - Settings for waveform visualization videos
- `VIDEO_DIMENSIONS` - Canvas/video dimensions (1280x720)

## Used By

### Production Code
- `/src/utils/ffmpegCore.ts` - Uses `STILL_IMAGE_SETTINGS` for production preset and `WAVEFORM_SETTINGS` for frame-to-video encoding
- `/src/utils/audioVisualizer.ts` - Uses `WAVEFORM_SETTINGS` for default visualization options
- `/src/utils/audioToVideo.ts` - Indirectly uses settings via ffmpegCore

### Test Pages
- `/test-ffmpeg-presets.html` - Imports settings, initializes controls with production defaults, shows visual indicator when using non-production settings
- `/test-waveform-viz.html` - Could be updated to use centralized settings (TODO)

## How to Update Production Settings

1. **Edit** `/src/config/ffmpegSettings.ts`
2. **Test** using the test pages - they will automatically use the new defaults
3. **Verify** the green "✓ Using Production Settings" indicator appears
4. **Commit** when satisfied

## Test Page Indicators

### test-ffmpeg-presets.html
- **Green checkmark** (✓ Using Production Settings) = All settings match production
- **Orange warning** (⚠ Custom Settings) = At least one setting differs from production

This makes it obvious when testing experimental settings vs. production configuration.
