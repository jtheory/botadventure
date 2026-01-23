import { ImageGeneratorService } from '../services/imageGenerator'
import { Post, SceneData } from '../types'

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

    // Cancel reply button
    const cancelReplyBtn = document.getElementById('cancel-reply')
    if (cancelReplyBtn) {
      cancelReplyBtn.addEventListener('click', () => {
        this.clearReplyContext()
        // Notify the main app to clear reply state
        if (this.callbacks.onCancelReply) {
          this.callbacks.onCancelReply()
        }
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
  }

  setReplyContext(_post: Post): void {
    const editorTitle = document.getElementById('editor-title')
    const cancelReplyBtn = document.getElementById('cancel-reply')

    if (editorTitle) editorTitle.textContent = 'Create Reply'
    if (cancelReplyBtn) cancelReplyBtn.style.display = 'inline-block'
  }

  clearReplyContext(): void {
    const editorTitle = document.getElementById('editor-title')
    const cancelReplyBtn = document.getElementById('cancel-reply')

    if (editorTitle) editorTitle.textContent = 'Create Scene'
    if (cancelReplyBtn) cancelReplyBtn.style.display = 'none'
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
    const trimmedScene = sceneText.trim()
    const trimmedChoices = choicesText.trim()

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
      previewHtml += `
        <div style="white-space: pre-wrap; font-family: system-ui; line-height: 1.5; margin-bottom: 1rem;">
          ${this.escapeHtml(combinedText)}
        </div>
      `
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
      previewElement.style.cssText = 'max-width: 100%; border-radius: 8px;'

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
}