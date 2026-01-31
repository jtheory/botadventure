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

### ✅ Completed
- [x] Install FFmpeg.wasm dependencies
- [x] Create basic audio+image to MP4 converter
- [x] Add simple audio upload UI to post composer
- [x] Test MP4 upload to Bluesky
- [x] Create waveform visualization with animated playhead
- [x] Add background image support
- [x] Add visualization toggle (waveform vs simple)
- [x] Text overlay on video frames
- [x] Alt text for video accessibility

### Next Phase - Browser Recording
- [ ] Add browser audio recording with MediaRecorder API
- [ ] Add record/stop/playback controls
- [ ] Convert WebM audio to compatible format

### Future Enhancements
- [ ] Create scrolling amplitude visualization (bars moving across screen)
- [ ] Add spectrum analyzer visualization
- [ ] Generate thumbnail frame for video preview
- [ ] Add audio trimming/editing
- [ ] Multiple audio track support
- [ ] Fade in/out effects
- [ ] Custom image positioning/scaling
- [ ] Export presets (podcast, music, audiobook)
- [ ] Handle long audio files (compression, splitting)
- [ ] Add audio metadata display (title, artist, duration)