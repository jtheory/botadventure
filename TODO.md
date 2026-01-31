# Project TODOs

## Post Renderer Improvements
- [ ] Replace basic post renderer with proper library or custom implementation
- [ ] Support embedded posts (quote posts)
- [ ] Support embedded links with preview cards
- [ ] Support video playback
- [ ] Support image galleries
- [ ] Handle facets (mentions, hashtags, links) properly
- [ ] Show thread connections
- [ ] Display reply/repost/like counts

## Audio-to-Video Feature

### Phase 1 - Basic Implementation (Current)
- [ ] Install FFmpeg.wasm dependencies
- [ ] Create basic audio+image to MP4 converter
- [ ] Add simple audio upload UI to post composer
- [ ] Test MP4 upload to Bluesky

### Phase 2 - Browser Recording
- [ ] Add browser audio recording with MediaRecorder API
- [ ] Add record/stop/playback controls
- [ ] Convert WebM audio to compatible format

### Phase 3 - Basic Visualization
- [ ] Create simple waveform visualization
- [ ] Add solid color background options
- [ ] Generate thumbnail frame for video

### Phase 4 - Advanced Visualizations
- [ ] Create scrolling amplitude visualization (bars moving across screen)
- [ ] Add spectrum analyzer visualization
- [ ] Create progress waveform (shows playhead moving)
- [ ] Add visualization selector UI

### Phase 5 - Polish
- [ ] Add audio trimming/editing
- [ ] Multiple audio track support
- [ ] Fade in/out effects
- [ ] Custom image positioning/scaling
- [ ] Export presets (podcast, music, audiobook)
- [ ] Handle long audio files (compression, splitting)
- [ ] Add audio metadata display (title, artist, duration)