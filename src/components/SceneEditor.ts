import { ImageGeneratorService } from '../services/imageGenerator'
import { Post, SceneData } from '../types'
import { stripMarkdown } from '../utils/markdown'

export interface SceneEditorCallbacks {
  onPost: (text: string, imageText: string, choices: string, backgroundImage?: string) => void
  onSceneDataChange: (data: SceneData) => void
  onCancelReply?: () => void
}

export class SceneEditor {
  private imageGenerator: ImageGeneratorService
  private lastImageText = ''
  private lastChoicesText = ''
  private lastBackgroundImage = ''
  private lastRenderedBackground = '' // Track what was actually rendered in preview
  private previewRefreshTimer: NodeJS.Timeout | null = null
  private isGeneratingPreview = false
  private audioFile: File | null = null
  private convertedVideoBlob: Blob | null = null
  private isConvertingAudio = false
  private videoPreviewOutdated = false
  private lastVideoSettings = {
    imageText: '',
    choices: '',
    backgroundImage: '',
    useWaveform: true
  }

  constructor(
    private callbacks: SceneEditorCallbacks,
    private charLimit: number = 300
  ) {
    this.imageGenerator = new ImageGeneratorService()
  }

  initialize(editingReplyTo: Post | null, savedData?: SceneData | null): void {
    this.attachEventListeners()

    // Load saved data if available
    if (savedData) {
      this.loadSceneData(savedData)
    }

    // Set up reply context if editing a reply
    if (editingReplyTo) {
      this.setReplyContext(editingReplyTo)
    }

    // Initial preview
    setTimeout(() => this.updatePreview(), 100)
  }

  private attachEventListeners(): void {
    // Post text input
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    if (postText) {
      postText.addEventListener('input', () => {
        this.updateCharCounter()
        this.callbacks.onSceneDataChange(this.getSceneData())
        this.schedulePreviewRefresh()
      })
    }

    // Image text input
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    if (imageText) {
      imageText.addEventListener('input', () => {
        this.updateCharCounter()
        this.callbacks.onSceneDataChange(this.getSceneData())
        this.schedulePreviewRefresh()
      })
    }

    // Choices input
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    if (choices) {
      choices.addEventListener('input', () => {
        this.updateCharCounter()
        this.callbacks.onSceneDataChange(this.getSceneData())
        this.schedulePreviewRefresh()
      })
    }

    // Post button
    const postButton = document.getElementById('post-button')
    if (postButton) {
      postButton.addEventListener('click', () => {
        const data = this.getSceneData()
        this.callbacks.onPost(data.postText, data.imageText, data.choices, data.backgroundImage)
      })
    }

    // Clear editor button
    const clearEditorBtn = document.getElementById('clear-editor')
    if (clearEditorBtn) {
      clearEditorBtn.addEventListener('click', () => {
        this.clearForm()
      })
    }

    // Background image upload
    const bgImageInput = document.getElementById('background-image-input') as HTMLInputElement
    const bgImageButton = document.getElementById('background-image-button')
    const removeBtn = document.getElementById('remove-background-button')

    if (bgImageButton) {
      bgImageButton.addEventListener('click', () => {
        bgImageInput?.click()
      })
    }

    if (bgImageInput) {
      bgImageInput.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
          this.handleBackgroundImageUpload(file)
        }
      })
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        this.removeBackgroundImage()
      })
    }

    // Audio file upload
    const audioInput = document.getElementById('audio-file-input') as HTMLInputElement
    const audioButton = document.getElementById('audio-file-button')
    const removeAudioBtn = document.getElementById('remove-audio-button')

    if (audioButton) {
      audioButton.addEventListener('click', () => {
        audioInput?.click()
      })
    }

    if (audioInput) {
      audioInput.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
          this.handleAudioFileUpload(file)
        }
      })
    }

    if (removeAudioBtn) {
      removeAudioBtn.addEventListener('click', () => {
        this.removeAudioFile()
      })
    }

    // Waveform visualization toggle
    const waveformCheckbox = document.getElementById('use-waveform-viz') as HTMLInputElement
    if (waveformCheckbox) {
      waveformCheckbox.addEventListener('change', () => {
        if (this.audioFile) {
          this.videoPreviewOutdated = true
          this.schedulePreviewRefresh()
        }
      })
    }
  }

  setReplyContext(_post: Post): void {
    const editorTitle = document.getElementById('editor-title')
    if (editorTitle) editorTitle.textContent = 'Create Reply'
  }

  clearReplyContext(): void {
    const editorTitle = document.getElementById('editor-title')
    if (editorTitle) editorTitle.textContent = 'Create Scene'
  }

  clearForm(): void {
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement

    if (postText) postText.value = ''
    if (imageText) imageText.value = ''
    if (choices) choices.value = ''

    // Clear background image
    this.removeBackgroundImage()

    // Clear audio file
    this.removeAudioFile()

    // Reset preview tracking
    this.lastImageText = ''
    this.lastChoicesText = ''
    this.lastRenderedBackground = ''

    this.updateCharCounter()
  }

  private loadSceneData(data: SceneData): void {
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement

    if (postText) postText.value = data.postText || ''
    if (imageText) imageText.value = data.imageText || ''
    if (choices) choices.value = data.choices || ''

    // Load background image if present
    if (data.backgroundImage) {
      this.lastBackgroundImage = data.backgroundImage
      this.lastRenderedBackground = '' // Force preview to regenerate with loaded background

      const nameSpan = document.getElementById('background-image-name')
      const preview = document.getElementById('background-image-preview')
      const thumbnail = document.getElementById('background-image-thumbnail') as HTMLImageElement
      const removeBtn = document.getElementById('remove-background-button')

      if (nameSpan) nameSpan.textContent = data.backgroundImageName || 'Saved background'
      if (preview) preview.style.display = 'block'
      if (thumbnail) thumbnail.src = data.backgroundImage
      if (removeBtn) removeBtn.style.display = 'inline-block'
    }

    this.updateCharCounter()
  }

  private getSceneData(): SceneData {
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const nameSpan = document.getElementById('background-image-name')

    return {
      postText: postText?.value || '',
      imageText: imageText?.value || '',
      choices: choices?.value || '',
      backgroundImage: this.lastBackgroundImage || undefined,
      backgroundImageName: nameSpan?.textContent !== 'No image selected' ? nameSpan?.textContent || undefined : undefined,
    }
  }

  private updateCharCounter(): void {
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const counter = document.getElementById('char-counter')

    if (postText && counter) {
      const postLength = postText.value.length
      counter.textContent = `${postLength} / ${this.charLimit}`

      // Remove previous classes
      counter.classList.remove('warning', 'error')

      // Add appropriate class based on length
      if (postLength > this.charLimit) {
        counter.classList.add('error')
      } else if (postLength > this.charLimit * 0.9) {
        counter.classList.add('warning')
      }
    }

    // Update post count if needed for text-only posts
    if (postText && imageText && choices) {
      const postCharCount = document.getElementById('post-char-count')
      if (postCharCount) {
        postCharCount.textContent = String(postText.value.length)
      }
    }
  }

  private combineSceneAndChoices(sceneText: string, choicesText: string): string {
    // Strip markdown for plain text (alt text preview)
    const trimmedScene = stripMarkdown(sceneText.trim())
    const trimmedChoices = stripMarkdown(choicesText.trim())

    if (!trimmedChoices) {
      return trimmedScene
    }

    return `${trimmedScene}\n\nWhat do you do?\n${trimmedChoices}`
  }

  private schedulePreviewRefresh(): void {
    // Clear existing timer
    if (this.previewRefreshTimer) {
      clearTimeout(this.previewRefreshTimer)
    }

    // Check if video settings have changed
    if (this.audioFile && this.convertedVideoBlob) {
      const imageText = (document.getElementById('image-text') as HTMLTextAreaElement)?.value || ''
      const choices = (document.getElementById('choices') as HTMLTextAreaElement)?.value || ''
      const useWaveform = (document.getElementById('use-waveform-viz') as HTMLInputElement)?.checked ?? true

      if (
        imageText !== this.lastVideoSettings.imageText ||
        choices !== this.lastVideoSettings.choices ||
        this.lastBackgroundImage !== this.lastVideoSettings.backgroundImage ||
        useWaveform !== this.lastVideoSettings.useWaveform
      ) {
        this.videoPreviewOutdated = true
      }
    }

    // Set status to indicate preview is updating
    const statusDiv = document.getElementById('preview-status')
    if (statusDiv) {
      statusDiv.textContent = 'Updating...'
      statusDiv.style.color = '#888'
    }

    // Schedule new refresh
    this.previewRefreshTimer = setTimeout(() => {
      this.updatePreview()
    }, 500) // Wait 500ms after user stops typing
  }

  private async updatePreview(): Promise<void> {
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const previewContent = document.getElementById('preview-content')
    const statusDiv = document.getElementById('preview-status')

    if (!previewContent) return

    const imageValue = imageText?.value || ''
    const postValue = postText?.value || ''
    const choicesValue = choices?.value || ''

    // Check if we have audio file and should show video preview/generate button
    if (this.audioFile) {
      previewContent.innerHTML = ''

      // Add post text if present
      if (postValue) {
        const textDiv = document.createElement('div')
        textDiv.style.cssText = 'white-space: pre-wrap; font-family: system-ui; line-height: 1.5; margin-bottom: 1rem;'
        textDiv.textContent = postValue
        previewContent.appendChild(textDiv)
      }

      // Show video if we have one and it's not outdated
      if (this.convertedVideoBlob && !this.videoPreviewOutdated) {
        const videoUrl = URL.createObjectURL(this.convertedVideoBlob)

        // Add video element
        const video = document.createElement('video')
        video.src = videoUrl
        video.controls = true
        video.style.cssText = 'max-width: 100%; border-radius: 8px; display: block;'
        previewContent.appendChild(video)

        // Add stats
        const statsDiv = document.createElement('div')
        statsDiv.style.cssText = `
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--color-border);
          font-size: 0.85rem;
          color: var(--color-text-secondary);
        `
        const sizeMB = (this.convertedVideoBlob.size / (1024 * 1024)).toFixed(2)
        statsDiv.innerHTML = `
          <div>🎥 Video: ${sizeMB}MB</div>
          <div style="margin-top: 0.25rem;">🎵 Audio converted to video with ${this.lastBackgroundImage ? 'custom' : 'black'} background</div>
        `
        previewContent.appendChild(statsDiv)

        if (statusDiv) {
          statusDiv.textContent = '✓ Video ready'
          statusDiv.style.color = '#4CAF50'
        }
      } else {
        // Show "Generate video" button overlay
        const overlayDiv = document.createElement('div')
        overlayDiv.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 300px;
          padding: 3rem 2rem;
          background: var(--color-bg-secondary);
          border: 2px dashed var(--color-border);
          border-radius: 8px;
          text-align: center;
          gap: 1.5rem;
        `

        const messageDiv = document.createElement('div')
        messageDiv.style.cssText = 'font-size: 1rem; color: var(--color-text-secondary); line-height: 1.6;'
        messageDiv.innerHTML = `
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎬</div>
          <div><strong>Video preview not generated</strong></div>
          <div style="margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.8;">
            ${this.convertedVideoBlob ? 'Settings have changed. Click below to regenerate.' : 'Click below to generate video from audio.'}
          </div>
        `
        overlayDiv.appendChild(messageDiv)

        const generateBtn = document.createElement('button')
        generateBtn.textContent = '🎥 Generate Video Preview'
        generateBtn.className = 'primary-button'
        generateBtn.style.cssText = 'padding: 0.75rem 1.5rem; font-size: 1rem;'
        generateBtn.id = 'generate-video-preview-btn'
        generateBtn.addEventListener('click', () => this.convertAudioToVideo())
        overlayDiv.appendChild(generateBtn)

        const hintDiv = document.createElement('div')
        hintDiv.style.cssText = 'font-size: 0.85rem; color: var(--color-text-muted);'
        hintDiv.textContent = 'Generating may take 10-30 seconds depending on audio length'
        overlayDiv.appendChild(hintDiv)

        previewContent.appendChild(overlayDiv)

        if (statusDiv) {
          statusDiv.textContent = ''
        }
      }
      return
    }

    // Check if there's any content to preview
    if (!imageValue && !postValue) {
      previewContent.innerHTML = `
        <div style="text-align: center; opacity: 0.5; padding: 40px;">
          Start typing to see a preview
        </div>
      `
      if (statusDiv) {
        statusDiv.textContent = ''
      }
      return
    }

    // Build preview with both post text and image
    let previewHtml = ''

    // Add post text if present
    if (postValue) {
      const combinedText = this.combineSceneAndChoices(postValue, choicesValue)
      previewHtml += `<div style="white-space: pre-wrap; font-family: system-ui; line-height: 1.5; margin-bottom: 1rem;">${this.escapeHtml(combinedText)}</div>`

      // Add stats for text-only posts
      if (!imageValue) {
        const charWarn = combinedText.length > 300 ? ' ⚠️ Over limit!' :
                        combinedText.length > 270 ? ' ⚠️' : ''
        previewHtml += `
          <div style="
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid var(--color-border);
            font-size: 0.85rem;
            color: var(--color-text-secondary);
          ">
            <div>📝 Text post: <strong>${combinedText.length} chars${charWarn}</strong></div>
          </div>
        `
      }
    }

    // Check if we need to regenerate the image preview
    const choicesList = choicesValue
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0)

    const backgroundImage = this.lastBackgroundImage

    // Check if any image-related content has changed
    const needsImageRegeneration = imageValue && (
      imageValue !== this.lastImageText ||
      choicesValue !== this.lastChoicesText ||
      backgroundImage !== this.lastRenderedBackground
    )

    if (needsImageRegeneration) {
      // Generate new image preview
      await this.regenerateImagePreview(imageValue, choicesList)
      this.lastImageText = imageValue
      this.lastChoicesText = choicesValue
      this.lastRenderedBackground = backgroundImage
    } else if (!imageValue && previewHtml) {
      // Text-only preview
      previewContent.innerHTML = previewHtml
    }

    if (statusDiv) {
      statusDiv.textContent = '✓ Updated'
      statusDiv.style.color = '#4CAF50'
      setTimeout(() => {
        statusDiv.textContent = ''
      }, 2000)
    }
  }

  private async regenerateImagePreview(imageText: string, choices: string[]): Promise<void> {
    if (this.isGeneratingPreview) return
    this.isGeneratingPreview = true

    const previewContent = document.getElementById('preview-content')
    const statusDiv = document.getElementById('preview-status')
    const postText = document.getElementById('post-text') as HTMLTextAreaElement

    if (!previewContent) {
      this.isGeneratingPreview = false
      return
    }

    try {
      if (statusDiv) {
        statusDiv.textContent = 'Generating preview...'
        statusDiv.style.color = '#1976D2'
      }

      // Use the same image generation as posting to ensure consistency
      const imageResult = await this.imageGenerator.generateSceneImage(
        imageText,
        choices,
        this.lastBackgroundImage || undefined
      )

      // Convert blob to data URL for preview
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(imageResult.blob)
      })

      const previewElement = document.createElement('img')
      previewElement.src = dataUrl
      previewElement.style.cssText = 'max-width: 100%; border-radius: 8px; display: block;'

      // Clear and rebuild preview with both text and image
      previewContent.innerHTML = ''

      // Add post text first if present
      if (postText?.value) {
        const textDiv = document.createElement('div')
        textDiv.style.cssText = 'white-space: pre-wrap; font-family: system-ui; line-height: 1.5; margin-bottom: 1rem;'
        textDiv.textContent = postText.value
        previewContent.appendChild(textDiv)
      }

      // Then add the image
      previewContent.appendChild(previewElement)

      // Add stats below the preview
      const statsDiv = document.createElement('div')
      statsDiv.style.cssText = `
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border);
        font-size: 0.85rem;
        color: var(--color-text-secondary);
      `

      // Calculate stats
      const imageSizeMB = (imageResult.blob.size / (1024 * 1024)).toFixed(2)
      const imageSizeKB = (imageResult.blob.size / 1024).toFixed(0)
      const sizeDisplay = imageResult.blob.size > 1024 * 1024
        ? `${imageSizeMB} MB`
        : `${imageSizeKB} KB`

      const altText = this.combineSceneAndChoices(imageText, choices.join('\n'))
      const plainTextChars = postText?.value.length || 0
      const altTextChars = altText.length

      // Check if sizes are concerning
      const sizeWarning = imageResult.blob.size > 900 * 1024 ? ' ⚠️' : ''
      const textWarning = plainTextChars > 300 ? ' ⚠️ Over limit!' :
                         plainTextChars > 270 ? ' ⚠️' : ''

      statsDiv.innerHTML = `
        <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
          <div>📸 Image: <strong>JPEG, ${sizeDisplay}${sizeWarning}</strong></div>
          <div>📝 Post text: <strong>${plainTextChars} chars${textWarning}</strong></div>
          <div>🔤 Alt text: <strong>${altTextChars} chars</strong></div>
        </div>
      `

      previewContent.appendChild(statsDiv)

      if (statusDiv) {
        statusDiv.textContent = '✓ Preview ready'
        statusDiv.style.color = '#4CAF50'
      }
    } catch (error) {
      console.error('Failed to generate preview:', error)
      if (statusDiv) {
        statusDiv.textContent = '⚠ Preview failed'
        statusDiv.style.color = '#f44336'
      }
    } finally {
      this.isGeneratingPreview = false
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  private async handleBackgroundImageUpload(file: File): Promise<void> {
    // Check file size (recommend max 1MB)
    const maxSize = 1024 * 1024 // 1MB
    if (file.size > maxSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
      if (!confirm(`This image is ${sizeMB}MB. Large images may slow down the app. Continue?`)) {
        return
      }
    }

    // Read file as data URL
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string

      // Update UI
      const nameSpan = document.getElementById('background-image-name')
      const preview = document.getElementById('background-image-preview')
      const thumbnail = document.getElementById('background-image-thumbnail') as HTMLImageElement
      const removeBtn = document.getElementById('remove-background-button')

      if (nameSpan) nameSpan.textContent = file.name
      if (preview) preview.style.display = 'block'
      if (thumbnail) thumbnail.src = dataUrl
      if (removeBtn) removeBtn.style.display = 'inline-block'

      // Store and trigger updates
      this.lastBackgroundImage = dataUrl
      this.lastRenderedBackground = '' // Force preview to regenerate
      this.callbacks.onSceneDataChange(this.getSceneData())

      // If we have audio, mark video as outdated (don't auto-generate)
      if (this.audioFile) {
        this.videoPreviewOutdated = true
      }

      this.schedulePreviewRefresh()
    }

    reader.readAsDataURL(file)
  }

  private removeBackgroundImage(): void {
    // Clear UI
    const nameSpan = document.getElementById('background-image-name')
    const preview = document.getElementById('background-image-preview')
    const removeBtn = document.getElementById('remove-background-button')
    const input = document.getElementById('background-image-input') as HTMLInputElement

    if (nameSpan) nameSpan.textContent = 'No image selected'
    if (preview) preview.style.display = 'none'
    if (removeBtn) removeBtn.style.display = 'none'
    if (input) input.value = ''

    // Clear stored image and force preview update
    this.lastBackgroundImage = ''
    this.lastRenderedBackground = 'force-refresh' // Force different value to trigger update
    this.callbacks.onSceneDataChange(this.getSceneData())
    this.schedulePreviewRefresh()
  }

  setPostButtonState(disabled: boolean): void {
    const postButton = document.getElementById('post-button') as HTMLButtonElement
    if (postButton) {
      postButton.disabled = disabled
    }
  }

  showStatus(message: string, type: 'success' | 'error' | 'info'): void {
    const statusDiv = document.getElementById('post-status')
    if (statusDiv) {
      statusDiv.className = 'status ' + type
      statusDiv.textContent = message
      statusDiv.style.display = 'block'

      if (type === 'success') {
        setTimeout(() => {
          statusDiv.style.display = 'none'
        }, 5000)
      }
    }
  }

  private async handleAudioFileUpload(file: File): Promise<void> {
    // Check file size (recommend max 10MB for audio)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
      alert(`Audio file is ${sizeMB}MB. Maximum size is 10MB.`)
      return
    }

    // Update UI
    const nameSpan = document.getElementById('audio-file-name')
    const removeBtn = document.getElementById('remove-audio-button')
    const vizOptions = document.getElementById('audio-viz-options')

    if (nameSpan) nameSpan.textContent = file.name
    if (removeBtn) removeBtn.style.display = 'inline-block'
    if (vizOptions) vizOptions.style.display = 'block'

    // Store the audio file and mark video as outdated
    this.audioFile = file
    this.convertedVideoBlob = null
    this.videoPreviewOutdated = true

    // Update preview to show "Generate video" button
    this.schedulePreviewRefresh()

    this.callbacks.onSceneDataChange(this.getSceneData())
  }

  private removeAudioFile(): void {
    // Clear UI
    const nameSpan = document.getElementById('audio-file-name')
    const removeBtn = document.getElementById('remove-audio-button')
    const input = document.getElementById('audio-file-input') as HTMLInputElement

    if (nameSpan) nameSpan.textContent = 'No audio selected'
    if (removeBtn) removeBtn.style.display = 'none'
    if (input) input.value = ''

    // Clear stored file and conversion
    this.audioFile = null
    this.convertedVideoBlob = null

    // Update preview
    this.schedulePreviewRefresh()
    this.callbacks.onSceneDataChange(this.getSceneData())
  }

  getAudioFile(): File | null {
    return this.audioFile
  }

  getConvertedVideoBlob(): Blob | null {
    return this.convertedVideoBlob
  }

  private async convertAudioToVideo(): Promise<void> {
    if (!this.audioFile || this.isConvertingAudio) {
      console.log('Skipping conversion:', { hasAudio: !!this.audioFile, isConverting: this.isConvertingAudio })
      return
    }

    console.log('Starting audio conversion in SceneEditor...')
    this.isConvertingAudio = true

    // Show progress in preview pane instead of status area
    const previewContent = document.getElementById('preview-content')
    if (previewContent) {
      previewContent.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 300px;
          padding: 3rem 2rem;
          background: var(--color-bg-secondary);
          border: 2px solid var(--color-accent);
          border-radius: 8px;
          text-align: center;
          gap: 2rem;
        ">
          <div style="font-size: 1rem; color: var(--color-text-primary); line-height: 1.6;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">⏳</div>
            <div style="font-weight: 500; font-size: 1.1rem;">Converting audio to video...</div>
          </div>

          <div style="width: 100%; max-width: 400px;">
            <div style="margin-bottom: 1.5rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 6px; color: var(--color-text-secondary);">
                <span id="frame-progress-label">Generating frames</span>
                <span id="frame-progress-percent">0%</span>
              </div>
              <div style="height: 8px; background: var(--color-bg-tertiary); border-radius: 4px; overflow: hidden;">
                <div id="frame-progress-bar" style="height: 100%; width: 0%; background: var(--color-accent); transition: width 0.3s;"></div>
              </div>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 6px; color: var(--color-text-secondary);">
                <span id="encode-progress-label">Encoding video</span>
                <span id="encode-progress-percent">0%</span>
              </div>
              <div style="height: 8px; background: var(--color-bg-tertiary); border-radius: 4px; overflow: hidden;">
                <div id="encode-progress-bar" style="height: 100%; width: 0%; background: var(--color-accent); transition: width 0.3s;"></div>
              </div>
            </div>
          </div>

          <div style="font-size: 0.85rem; color: var(--color-text-muted);">
            This may take 10-30 seconds
          </div>
        </div>
      `
    }

    try {

      // Progress callback function
      const updateProgress = (current: number, total: number, stage: string) => {
        const percent = Math.round((current / total) * 100)

        if (stage === 'Generating frames') {
          const barEl = document.getElementById('frame-progress-bar')
          const percentEl = document.getElementById('frame-progress-percent')
          if (barEl) barEl.style.width = `${percent}%`
          if (percentEl) percentEl.textContent = `${percent}%`
        } else if (stage === 'Encoding video') {
          const barEl = document.getElementById('encode-progress-bar')
          const percentEl = document.getElementById('encode-progress-percent')
          if (barEl) barEl.style.width = `${percent}%`
          if (percentEl) percentEl.textContent = `${percent}%`
        }
      }

      // Check if waveform visualization is enabled
      const useWaveformViz = (document.getElementById('use-waveform-viz') as HTMLInputElement)?.checked ?? false

      if (useWaveformViz) {
        console.log('Using waveform visualization...')

        // Import visualization modules
        const { generateWaveformFrames } = await import('../utils/audioVisualizer')
        const { createVideoFromFrames } = await import('../utils/ffmpegCore')

        // Get scene text and choices for overlay
        const imageText = document.getElementById('image-text') as HTMLTextAreaElement
        const choices = document.getElementById('choices') as HTMLTextAreaElement
        const sceneText = imageText?.value || ''
        const choicesText = choices?.value || ''

        // Combine scene and choices for overlay text
        const overlayText = this.combineSceneAndChoices(sceneText, choicesText)

        // Convert background image data URL to Blob if present
        let backgroundImageBlob: Blob | null = null
        if (this.lastBackgroundImage) {
          const response = await fetch(this.lastBackgroundImage)
          backgroundImageBlob = await response.blob()
        }

        // Generate waveform frames with text overlay and background image
        const { frames, duration, fps } = await generateWaveformFrames(
          this.audioFile,
          {
            backgroundImage: backgroundImageBlob,
            text: overlayText || undefined
            // Uses default colors from WAVEFORM_SETTINGS
          },
          updateProgress // Pass progress callback
        )

        console.log(`Generated ${frames.length} frames at ${fps} FPS for ${duration}s`)

        // Get audio extension from file name
        const audioExt = this.audioFile.name.split('.').pop()?.toLowerCase() || 'mp3'

        // Convert frames to video
        this.convertedVideoBlob = await createVideoFromFrames(
          frames,
          this.audioFile,
          fps,
          audioExt,
          updateProgress // Pass progress callback
        )
      } else {
        console.log('Using simple audio + image conversion...')
        // Import and convert using simple method
        const { createVideoFromAudio } = await import('../utils/audioToVideo')

        // Get background image file if available
        let backgroundImageFile: File | null = null
        if (this.lastBackgroundImage) {
          console.log('Converting background image from data URL...')
          const response = await fetch(this.lastBackgroundImage)
          const blob = await response.blob()
          backgroundImageFile = new File([blob], 'background.jpg', { type: 'image/jpeg' })
        }

        console.log('Calling createVideoFromAudio...')
        // Convert audio to video
        this.convertedVideoBlob = await createVideoFromAudio(this.audioFile, backgroundImageFile)
      }

      console.log('Video conversion complete, size:', this.convertedVideoBlob.size)

      // Save current settings as last video settings
      const imageText = (document.getElementById('image-text') as HTMLTextAreaElement)?.value || ''
      const choices = (document.getElementById('choices') as HTMLTextAreaElement)?.value || ''
      const useWaveform = (document.getElementById('use-waveform-viz') as HTMLInputElement)?.checked ?? true

      this.lastVideoSettings = {
        imageText,
        choices,
        backgroundImage: this.lastBackgroundImage,
        useWaveform
      }
      this.videoPreviewOutdated = false

      // Update preview
      this.schedulePreviewRefresh()

    } catch (error: any) {
      console.error('Failed to convert audio to video:', error)
      const errorMessage = error?.message || 'Unknown error'

      // Show error in preview pane
      if (previewContent) {
        previewContent.innerHTML = `
          <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            padding: 3rem 2rem;
            background: var(--color-error-bg);
            border: 2px solid var(--color-error-border);
            border-radius: 8px;
            text-align: center;
            gap: 1rem;
          ">
            <div style="font-size: 2rem;">❌</div>
            <div style="font-weight: 500; font-size: 1.1rem; color: var(--color-error);">Conversion failed</div>
            <div style="font-size: 0.9rem; color: var(--color-text-secondary); max-width: 400px;">
              ${errorMessage}
            </div>
            <button id="retry-video-generation" class="secondary-button" style="margin-top: 1rem;">
              Try Again
            </button>
          </div>
        `

        // Add retry button listener
        const retryBtn = document.getElementById('retry-video-generation')
        if (retryBtn) {
          retryBtn.addEventListener('click', () => this.convertAudioToVideo())
        }
      }
    } finally {
      this.isConvertingAudio = false
    }
  }
}