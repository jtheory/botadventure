import { ImageGeneratorService } from '../services/imageGenerator'
import { Post, SceneData } from '../types'

export interface SceneEditorCallbacks {
  onPost: (text: string, imageText: string, choices: string) => void
  onSceneDataChange: (data: SceneData) => void
  onCancelReply?: () => void
}

export class SceneEditor {
  private imageGenerator: ImageGeneratorService
  private lastImageText = ''
  private lastChoicesText = ''
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
        this.callbacks.onPost(data.postText, data.imageText, data.choices)
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

    this.updateCharCounter()
  }

  private loadSceneData(data: SceneData): void {
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement

    if (postText) postText.value = data.postText || ''
    if (imageText) imageText.value = data.imageText || ''
    if (choices) choices.value = data.choices || ''

    this.updateCharCounter()
  }

  private getSceneData(): SceneData {
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement

    return {
      postText: postText?.value || '',
      imageText: imageText?.value || '',
      choices: choices?.value || '',
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

    if (imageValue &&
        (imageValue !== this.lastImageText || choicesValue !== this.lastChoicesText)) {
      // Generate new image preview
      await this.regenerateImagePreview(imageValue, choicesList)
      this.lastImageText = imageValue
      this.lastChoicesText = choicesValue
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
        choices
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