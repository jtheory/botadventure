import './style.css'
import { Post, ThreadNode } from './types'
import { StorageService } from './services/storage'
import { AuthService } from './services/auth'
import { BlueskyService } from './services/bluesky'
import { ImageGeneratorService } from './services/imageGenerator'
import { ThreadNavigator } from './components/ThreadNavigator'
import { SceneEditor } from './components/SceneEditor'
import { ThemeService } from './services/theme'
import { stripMarkdown } from './utils/markdown'

// Character limits
const BLUESKY_CHAR_LIMIT = 300

class BotAdventureApp {
  // Services
  private storage: StorageService
  private auth: AuthService
  private bluesky: BlueskyService
  private imageGenerator: ImageGeneratorService

  // Components
  private threadNavigator: ThreadNavigator
  private sceneEditor: SceneEditor

  // Thread navigation state
  private threadPath: ThreadNode[] = []
  private editingReplyTo: Post | null = null
  private rootPost: Post | null = null

  constructor() {
    // Initialize theme service first to apply theme early
    new ThemeService() // Creates theme toggle button

    // Initialize services
    this.storage = new StorageService()
    this.auth = new AuthService(this.storage, (authenticated, handle) => {
      this.onAuthChange(authenticated, handle)
    })
    this.bluesky = new BlueskyService(() => this.auth.getAgent())
    this.imageGenerator = new ImageGeneratorService()

    // Initialize components
    this.threadNavigator = new ThreadNavigator({
      onPostSelect: (post) => this.selectPost(post),
      onReplyTo: (post) => this.setReplyTo(post),
      onPathReset: (index, post) => this.resetThreadPath(index, post),
    })

    this.sceneEditor = new SceneEditor({
      onPost: (text, imageText, choices, backgroundImage) => this.postToBluesky(text, imageText, choices, backgroundImage),
      onSceneDataChange: (data) => this.storage.saveSceneData(data),
      onCancelReply: () => this.cancelReply(),
    }, BLUESKY_CHAR_LIMIT)

    // Initialize UI and restore session
    this.initializeUI()
  }

  private initializeUI(): void {
    const app = document.querySelector<HTMLDivElement>('#app')!
    app.innerHTML = this.getInitialHTML()

    this.attachEventListeners()

    // Restore auth session if available
    const authState = this.auth.getAuthState()
    if (authState) {
      this.auth.restoreSession().then(async (handle) => {
        if (handle) {
          // Load saved thread state
          await this.loadThreadState()
        }
      })
    }
  }

  private getInitialHTML(): string {
    return `
      <div class="container">
        <h1 class="main-title">🎮 BotAdventure Author</h1>

        <div id="auth-section" class="auth-section">
          <div id="auth-form-container">
            <h2>Bluesky Authentication</h2>
            <form id="auth-form" class="auth-form">
              <div class="form-group">
                <label for="handle">Handle (e.g., user.bsky.social)</label>
                <input type="text" id="handle" placeholder="your-handle.bsky.social" required />
              </div>

              <div class="form-group">
                <label for="app-password">App Password</label>
                <input type="password" id="app-password" placeholder="xxxx-xxxx-xxxx-xxxx" required />
                <small style="opacity: 0.7">Create at Settings → Advanced → App passwords</small>
              </div>

              <button type="submit" id="auth-button">Connect</button>
            </form>

            <div id="auth-status"></div>
          </div>

          <div id="auth-connected" class="auth-connected" style="display: none;">
            <span class="auth-handle">
              <span style="opacity: 0.7;">Connected as</span>
              <strong id="connected-handle">@handle</strong>
            </span>
            <a href="#" id="logout-button" class="logout-link">Logout</a>
          </div>
        </div>

        <div id="main-content" style="display: none;">
          <!-- Load existing thread section -->
          <div id="load-thread-section" class="load-thread-section">
            <div class="form-group">
              <label for="thread-url">Thread URL</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <div style="flex: 1; position: relative;">
                  <input type="text" id="thread-url" placeholder="https://bsky.app/profile/user/post/..." style="width: 100%; padding-right: 35px;" />
                  <span style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); opacity: 0.5; pointer-events: none; font-size: 1.1em;">↩</span>
                </div>
                <button id="reload-thread" class="icon-button" style="display: none; padding: 6px 10px; font-size: 1.2em;" title="Reload thread">🔄</button>
                <button id="clear-thread" class="secondary-button" style="display: none;">Clear</button>
              </div>
              <small style="opacity: 0.7">Enter a Bluesky thread URL to load and continue authoring</small>
            </div>
            <div id="load-status"></div>
          </div>

          <!-- Thread view -->
          <div id="thread-view" class="thread-view"></div>

          <!-- Editor section -->
          <div id="editor-section" class="split-layout">
            <div class="editor-panel">
              <h2 id="editor-title">Create Scene</h2>

              <div class="form-group">
                <label for="post-text">Post Text (optional, ${BLUESKY_CHAR_LIMIT} chars)</label>
                <textarea id="post-text" placeholder="Optional text for the post..." rows="3"></textarea>
                <div id="char-counter" class="char-counter">0 / ${BLUESKY_CHAR_LIMIT}</div>
              </div>

              <div class="form-group">
                <label for="image-text">Image Text (optional, creates an image if filled)</label>
                <textarea id="image-text" placeholder="Text that will be rendered as an image..." rows="5"></textarea>
              </div>

              <div class="form-group">
                <label for="background-image">Background Image (optional)</label>
                <input type="file" id="background-image-input" accept="image/jpeg,image/jpg,image/png,image/webp" style="display: none;">
                <div id="background-image-controls" style="display: flex; gap: 10px; align-items: center;">
                  <button type="button" id="background-image-button" class="secondary-button" style="flex: 0 0 auto;">Choose Image</button>
                  <span id="background-image-name" style="flex: 1; opacity: 0.7; font-size: 0.9rem;">No image selected</span>
                  <button type="button" id="remove-background-button" class="secondary-button" style="display: none; flex: 0 0 auto;">Remove</button>
                </div>
                <div id="background-image-preview" style="margin-top: 10px; display: none;">
                  <img id="background-image-thumbnail" style="max-width: 200px; max-height: 150px; border-radius: 4px; border: 1px solid var(--color-border);">
                </div>
                <small style="opacity: 0.7">JPG, PNG, or WebP. Max recommended size: 1MB</small>
              </div>

              <div class="form-group">
                <label for="audio-file">Audio (optional - converts to video)</label>
                <input type="file" id="audio-file-input" accept="audio/mp3,audio/wav,audio/m4a,audio/mp4,audio/mpeg,audio/x-m4a" style="display: none;">
                <div id="audio-controls" style="display: flex; gap: 10px; align-items: center;">
                  <button type="button" id="audio-file-button" class="secondary-button" style="flex: 0 0 auto;">🎵 Choose Audio</button>
                  <span id="audio-file-name" style="flex: 1; opacity: 0.7; font-size: 0.9rem;">No audio selected</span>
                  <button type="button" id="remove-audio-button" class="secondary-button" style="display: none; flex: 0 0 auto;">Remove</button>
                </div>
                <div id="audio-conversion-status" style="margin-top: 10px; display: none; padding: 10px; background: var(--color-bg-secondary); border-radius: 4px;">
                  <span style="opacity: 0.8;">⏳ Converting audio to video...</span>
                </div>
                <div id="audio-viz-options" style="margin-top: 10px; padding: 10px; background: var(--color-bg-secondary); border-radius: 4px; display: none;">
                  <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer;">
                    <input type="checkbox" id="use-waveform-viz" checked style="cursor: pointer;">
                    <span>🎵 Use waveform visualization</span>
                  </label>
                </div>
                <small style="opacity: 0.7">MP3, M4A, or WAV. Will create a video with the background image (or black background)</small>
              </div>

              <div class="form-group">
                <label for="choices">Choices (optional, one per line)</label>
                <textarea id="choices" placeholder="A) Go left&#10;B) Go right&#10;C) Turn back" rows="4"></textarea>
                <small style="opacity: 0.7">Choices go in the image if image text exists, otherwise in post text</small>
              </div>

              <div class="button-group">
                <button id="post-button" class="primary-button">Post to Bluesky</button>
                <button id="clear-editor" class="secondary-button" style="margin-left: 10px;">Clear</button>
              </div>

              <div id="post-status"></div>
            </div>

            <div class="preview-panel">
              <div class="preview-header">
                <h3>Live Preview</h3>
                <div id="preview-status" class="preview-status"></div>
              </div>
              <div id="scene-preview" class="scene-preview">
                <div id="preview-content">
                  <div style="text-align: center; opacity: 0.5; padding: 40px;">
                    Start typing to see a preview
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  private attachEventListeners(): void {
    // Auth form
    const authForm = document.getElementById('auth-form') as HTMLFormElement
    authForm?.addEventListener('submit', (e) => {
      e.preventDefault()
      this.handleAuth()
    })

    // Logout link
    const logoutButton = document.getElementById('logout-button')
    logoutButton?.addEventListener('click', (e) => {
      e.preventDefault()
      this.handleLogout()
    })

    // Thread URL input - load on Enter
    const threadUrlInput = document.getElementById('thread-url') as HTMLInputElement
    threadUrlInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const url = threadUrlInput.value.trim()
        if (url) {
          this.loadExistingThread(url)
        }
      }
    })


    // Reload thread button
    const reloadThreadBtn = document.getElementById('reload-thread') as HTMLButtonElement
    reloadThreadBtn?.addEventListener('click', () => {
      if (this.rootPost) {
        const postUri = this.rootPost.uri
        // Convert URI to URL for reloading
        const parts = postUri.split('/')
        const postId = parts[parts.length - 1]
        // Get handle from root post
        const handle = this.rootPost.author.handle
        const url = `https://bsky.app/profile/${handle}/post/${postId}`
        this.loadExistingThread(url, true) // true = reload mode
      }
    })

    // Clear thread button
    const clearThreadBtn = document.getElementById('clear-thread') as HTMLButtonElement
    clearThreadBtn?.addEventListener('click', () => {
      this.clearThread()
    })

    // Initialize scene editor
    const savedSceneData = this.storage.loadSceneData()
    this.sceneEditor.initialize(this.editingReplyTo, savedSceneData)
  }

  private async handleAuth(): Promise<void> {
    const handleInput = document.getElementById('handle') as HTMLInputElement
    const passwordInput = document.getElementById('app-password') as HTMLInputElement
    const authButton = document.getElementById('auth-button') as HTMLButtonElement
    const statusDiv = document.getElementById('auth-status')!

    const handle = handleInput.value.trim()
    const appPassword = passwordInput.value.trim()

    if (!handle || !appPassword) {
      this.showStatus(statusDiv, 'Please enter both handle and app password', 'error')
      return
    }

    authButton.disabled = true
    this.showStatus(statusDiv, 'Connecting...', 'info')

    try {
      await this.auth.login(handle, appPassword)

      // Clear password from input
      passwordInput.value = ''

      // Show success
      this.showStatus(statusDiv, 'Connected successfully!', 'success')

      // Load saved thread state
      await this.loadThreadState()
    } catch (error: any) {
      console.error('Auth error:', error)

      let errorMessage = 'Authentication failed'
      if (error.message?.includes('Invalid identifier or password')) {
        errorMessage = 'Invalid handle or app password. Please check your credentials.'
      } else if (error.message) {
        errorMessage = error.message
      }

      this.showStatus(statusDiv, errorMessage, 'error')
    } finally {
      authButton.disabled = false
    }
  }

  private handleLogout(): void {
    // Clear all data
    this.storage.clearAll()
    this.auth.logout()

    // Reset state
    this.threadPath = []
    this.editingReplyTo = null
    this.rootPost = null

    // Clear UI
    this.threadNavigator.clear()
    this.sceneEditor.clearForm()

    // Reset UI visibility
    const authFormContainer = document.getElementById('auth-form-container')
    const authConnected = document.getElementById('auth-connected')
    const mainContent = document.getElementById('main-content')

    if (authFormContainer) authFormContainer.style.display = 'block'
    if (authConnected) authConnected.style.display = 'none'
    if (mainContent) mainContent.style.display = 'none'

    // Clear form inputs
    const handleInput = document.getElementById('handle') as HTMLInputElement
    const passwordInput = document.getElementById('app-password') as HTMLInputElement

    if (handleInput) handleInput.value = ''
    if (passwordInput) passwordInput.value = ''
  }

  private onAuthChange(authenticated: boolean, handle?: string): void {
    const authFormContainer = document.getElementById('auth-form-container')
    const authConnected = document.getElementById('auth-connected')
    const connectedHandle = document.getElementById('connected-handle')
    const mainContent = document.getElementById('main-content')

    if (authenticated && handle) {
      if (authFormContainer) authFormContainer.style.display = 'none'
      if (authConnected) authConnected.style.display = 'flex'
      if (connectedHandle) {
        connectedHandle.innerHTML = `<a href="https://bsky.app/profile/${handle}" target="_blank" style="color: #00bfff; text-decoration: none;">@${handle}</a>`
      }
      if (mainContent) mainContent.style.display = 'block'
    } else {
      if (authFormContainer) authFormContainer.style.display = 'block'
      if (authConnected) authConnected.style.display = 'none'
      if (mainContent) mainContent.style.display = 'none'
    }
  }

  private async selectPost(post: Post): Promise<void> {
    // Add the selected post to the thread path
    const newNode: ThreadNode = {
      post: post,
      replies: [],
      depth: this.threadPath.length
    }
    this.threadPath.push(newNode)

    // Fetch replies for this post
    await this.fetchRepliesForPost(post)

    // Set as reply target
    this.editingReplyTo = post
    this.sceneEditor.setReplyContext(post)

    // Re-render the thread view
    this.renderThread()

    // Save state
    this.saveThreadState()
  }

  private setReplyTo(post: Post): void {
    this.editingReplyTo = post
    this.sceneEditor.setReplyContext(post)

    // Clear the editor fields
    this.sceneEditor.clearForm()

    // Scroll to editor
    document.getElementById('editor-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  private resetThreadPath(index: number, post: Post): void {
    // Truncate the thread path to this point
    this.threadPath = this.threadPath.slice(0, index + 1)
    this.editingReplyTo = post
    this.sceneEditor.setReplyContext(post)
    this.renderThread()
    this.saveThreadState()
  }

  private async fetchRepliesForPost(post: Post): Promise<void> {
    try {
      const thread = await this.bluesky.getPostThread(post.uri, 1)

      if (thread.data.thread && 'replies' in thread.data.thread) {
        const replies = (thread.data.thread as any).replies || []

        // Update the node in threadPath with replies
        const currentNode = this.threadPath[this.threadPath.length - 1]
        currentNode.replies = replies.map((r: any) => r.post).filter(Boolean)
      }
    } catch (error) {
      console.error('Failed to fetch replies:', error)
    }
  }

  private async loadExistingThread(url: string, isReload: boolean = false): Promise<void> {
    const statusDiv = document.getElementById('load-status')!
    const urlInput = document.getElementById('thread-url') as HTMLInputElement
    const reloadBtn = document.getElementById('reload-thread') as HTMLButtonElement
    const clearBtn = document.getElementById('clear-thread') as HTMLButtonElement

    this.showStatus(statusDiv, isReload ? 'Reloading thread...' : 'Loading thread...', 'info')

    try {
      const atUri = await this.bluesky.resolveUrlToUri(url)
      if (!atUri) {
        this.showStatus(statusDiv, 'Invalid URL format', 'error')
        return
      }

      // Fetch the post thread
      const thread = await this.bluesky.getPostThread(atUri, 100)

      if (!thread.data.thread || !('post' in thread.data.thread)) {
        this.showStatus(statusDiv, 'Post not found', 'error')
        return
      }

      const threadData = thread.data.thread as any
      const rootPost = threadData.post

      // Set as root
      this.rootPost = rootPost
      this.threadPath = [{
        post: rootPost,
        replies: threadData.replies?.map((r: any) => r.post).filter(Boolean) || [],
        depth: 0,
      }]

      // Set the root post as the reply target
      this.editingReplyTo = rootPost
      this.sceneEditor.setReplyContext(rootPost)

      // Keep the URL in the input field to show what's loaded
      urlInput.value = url

      // Render the thread
      this.renderThread()
      this.saveThreadState()

      // Show the reload and clear buttons
      if (reloadBtn) reloadBtn.style.display = 'inline-block'
      if (clearBtn) clearBtn.style.display = 'inline-block'

      this.showStatus(statusDiv, isReload ? 'Thread reloaded!' : 'Thread loaded successfully!', 'success')
    } catch (error) {
      console.error('Failed to load thread:', error)
      this.showStatus(statusDiv, 'Failed to load thread', 'error')
    }
  }

  private clearThread(): void {
    // Clear thread state
    this.rootPost = null
    this.threadPath = []
    this.editingReplyTo = null

    // Clear UI
    this.threadNavigator.clear()
    this.sceneEditor.clearReplyContext()

    // Clear the URL input field
    const urlInput = document.getElementById('thread-url') as HTMLInputElement
    if (urlInput) urlInput.value = ''

    // Clear saved state
    this.storage.clearThreadState()

    // Hide clear and reload buttons
    const clearBtn = document.getElementById('clear-thread') as HTMLButtonElement
    const reloadBtn = document.getElementById('reload-thread') as HTMLButtonElement
    if (clearBtn) clearBtn.style.display = 'none'
    if (reloadBtn) reloadBtn.style.display = 'none'

    // Clear status
    const statusDiv = document.getElementById('load-status')!
    this.showStatus(statusDiv, 'Thread cleared - ready to create top-level post', 'success')
  }

  private cancelReply(): void {
    // Clear reply state but keep the thread
    this.editingReplyTo = null

    // Re-render the thread view without the reply context
    this.renderThread()

    // Save the updated state
    this.saveThreadState()
  }

  private async postToBluesky(postText: string, imageText: string, choices: string, backgroundImage?: string): Promise<void> {
    if (!this.auth.isUserAuthenticated()) {
      alert('Please connect to Bluesky first')
      return
    }

    const statusDiv = document.getElementById('post-status')!
    const audioConversionStatus = document.getElementById('audio-conversion-status')!
    const choicesList = choices
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0)

    // Get audio file if present
    const audioFile = this.sceneEditor.getAudioFile()

    // Validate that we have something to post
    if (!postText.trim() && !imageText.trim() && !audioFile) {
      this.showStatus(statusDiv, 'Please enter post text, image text, or attach audio', 'error')
      return
    }

    this.sceneEditor.setPostButtonState(true)
    this.showStatus(statusDiv, 'Posting...', 'info')

    try {
      let postResponse

      // Check if we have audio to convert to video
      if (audioFile) {
        let videoBlob: Blob

        // Check if we already have a converted video
        const convertedVideo = this.sceneEditor.getConvertedVideoBlob()
        if (convertedVideo) {
          // Use the pre-converted video
          videoBlob = convertedVideo
          this.showStatus(statusDiv, 'Using pre-converted video...', 'info')
        } else {
          // Import the conversion function
          const { createVideoFromAudio } = await import('./utils/audioToVideo')

          // Show conversion status
          if (audioConversionStatus) {
            audioConversionStatus.style.display = 'block'
          }
          this.showStatus(statusDiv, 'Converting audio to video...', 'info')

          // Get background image file if available
          let backgroundImageFile: File | null = null
          if (backgroundImage) {
            // Convert data URL to File
            const response = await fetch(backgroundImage)
            const blob = await response.blob()
            backgroundImageFile = new File([blob], 'background.jpg', { type: 'image/jpeg' })
          }

          // Convert audio to video
          videoBlob = await createVideoFromAudio(audioFile, backgroundImageFile)

          // Hide conversion status
          if (audioConversionStatus) {
            audioConversionStatus.style.display = 'none'
          }
        }

        this.showStatus(statusDiv, 'Uploading video...', 'info')

        // Upload video to Bluesky
        const uploadResponse = await this.bluesky.uploadVideo(videoBlob)

        // Use the same alt text as we would for images
        const altText = this.combineSceneAndChoices(imageText, choices)

        postResponse = await this.bluesky.createPost({
          text: postText.trim() || `🎵 Audio Post`,
          videoBlob: uploadResponse,
          videoAlt: altText,
          replyTo: this.editingReplyTo ? {
            root: {
              uri: this.rootPost ? this.rootPost.uri : this.editingReplyTo.uri,
              cid: this.rootPost ? this.rootPost.cid : this.editingReplyTo.cid,
            },
            parent: {
              uri: this.editingReplyTo.uri,
              cid: this.editingReplyTo.cid,
            },
          } : undefined,
        })
      } else if (imageText.trim()) {
        // Generate and post with image
        this.showStatus(statusDiv, 'Generating image...', 'info')
        const imageResult = await this.imageGenerator.generateSceneImage(imageText, choicesList, backgroundImage)

        this.showStatus(statusDiv, 'Uploading image...', 'info')
        const imageBlob = await this.bluesky.uploadImage(imageResult.blob)

        const altText = this.combineSceneAndChoices(imageText, choices)

        postResponse = await this.bluesky.createPost({
          text: postText.trim(),
          imageBlob,
          imageAlt: altText,
          imageDimensions: imageResult.dimensions,
          replyTo: this.editingReplyTo ? {
            root: {
              uri: this.rootPost ? this.rootPost.uri : this.editingReplyTo.uri,
              cid: this.rootPost ? this.rootPost.cid : this.editingReplyTo.cid,
            },
            parent: {
              uri: this.editingReplyTo.uri,
              cid: this.editingReplyTo.cid,
            },
          } : undefined,
        })
      } else {
        // Text-only post
        let textToPost = postText.trim()

        // If we have choices but no image, append them to the post text
        if (choicesList.length > 0) {
          const choicesText = choices.trim()
          if (choicesText) {
            textToPost = `${textToPost}\n\nWhat do you do?\n${choicesText}`
          }
        }

        // Check character limit
        if (textToPost.length > BLUESKY_CHAR_LIMIT) {
          this.showStatus(statusDiv, `Text exceeds ${BLUESKY_CHAR_LIMIT} character limit. Consider using image text for longer content.`, 'error')
          this.sceneEditor.setPostButtonState(false)
          return
        }

        postResponse = await this.bluesky.createPost({
          text: textToPost,
          replyTo: this.editingReplyTo ? {
            root: {
              uri: this.rootPost ? this.rootPost.uri : this.editingReplyTo.uri,
              cid: this.rootPost ? this.rootPost.cid : this.editingReplyTo.cid,
            },
            parent: {
              uri: this.editingReplyTo.uri,
              cid: this.editingReplyTo.cid,
            },
          } : undefined,
        })
      }

      // Fetch the actual post from Bluesky to get the complete data including embed
      const threadResponse = await this.bluesky.getPostThread(postResponse.uri, 1)
      const newPost = threadResponse.data.thread.post as Post

      if (this.editingReplyTo) {
        // This was a reply - add it to the current node's replies
        const currentNode = this.threadPath[this.threadPath.length - 1]
        if (currentNode) {
          if (!currentNode.replies) currentNode.replies = []
          currentNode.replies.push(newPost)
        }

        // Clear reply mode
        this.sceneEditor.clearReplyContext()

        // Select the new post to make it the current post
        this.selectPost(newPost)

        // Render and show success
        this.renderThread()
        statusDiv.innerHTML = `
          <div class="status success">
            Reply posted successfully!
            <a href="${postResponse.url}" target="_blank" style="color: #00bfff; text-decoration: underline;">
              View on Bluesky →
            </a>
          </div>
        `
      } else {
        // This was a new top-level post - make it the root
        this.rootPost = newPost
        this.threadPath = [{
          post: newPost,
          replies: [],
          depth: 0,
        }]

        // Now set this post as the reply target
        this.editingReplyTo = newPost
        this.sceneEditor.setReplyContext(newPost)

        // Fetch replies for the new post
        await this.fetchRepliesForPost(newPost)

        // Render the thread view
        this.renderThread()

        // Show success
        statusDiv.innerHTML = `
          <div class="status success">
            Scene posted successfully!
            <a href="${postResponse.url}" target="_blank" style="color: #00bfff; text-decoration: underline;">
              View on Bluesky →
            </a>
          </div>
        `
      }

      // Save state and clear form
      this.saveThreadState()
      this.sceneEditor.clearForm()

    } catch (error: any) {
      console.error('Post failed:', error)
      const errorMessage = error.message || 'Failed to post. Please try again.'
      this.showStatus(statusDiv, errorMessage, 'error')
    } finally {
      this.sceneEditor.setPostButtonState(false)
    }
  }

  private combineSceneAndChoices(sceneText: string, choicesText: string): string {
    // Strip markdown for plain text (alt text and text posts)
    const trimmedScene = stripMarkdown(sceneText.trim())
    const trimmedChoices = stripMarkdown(choicesText.trim())

    if (!trimmedChoices) {
      return trimmedScene
    }

    return `${trimmedScene}\n\nWhat do you do?\n${trimmedChoices}`
  }

  private renderThread(): void {
    const threadView = document.getElementById('thread-view')
    if (threadView && this.threadPath.length > 0) {
      threadView.style.display = 'block'
      this.threadNavigator.render(this.threadPath, this.editingReplyTo)
    }
  }

  private saveThreadState(): void {
    const threadUrl = (document.getElementById('thread-url') as HTMLInputElement)?.value || undefined
    this.storage.saveThreadState({
      rootPost: this.rootPost,
      threadPath: this.threadPath,
      editingReplyTo: this.editingReplyTo,
      threadUrl: threadUrl,
    })
  }

  private async loadThreadState(): Promise<void> {
    const state = this.storage.loadThreadState()
    if (state && state.rootPost && state.threadPath.length > 0) {
      this.rootPost = state.rootPost
      this.threadPath = state.threadPath
      this.editingReplyTo = state.editingReplyTo

      // Restore the thread URL to the input field
      if (state.threadUrl) {
        const urlInput = document.getElementById('thread-url') as HTMLInputElement
        if (urlInput) {
          urlInput.value = state.threadUrl
        }
      }

      // Update UI
      if (this.editingReplyTo) {
        this.sceneEditor.setReplyContext(this.editingReplyTo)
      }

      // Show the reload and clear thread buttons since we have a loaded thread
      const reloadBtn = document.getElementById('reload-thread') as HTMLButtonElement
      const clearBtn = document.getElementById('clear-thread') as HTMLButtonElement
      if (reloadBtn) reloadBtn.style.display = 'block'
      if (clearBtn) clearBtn.style.display = 'block'

      this.renderThread()
    }
  }

  private showStatus(element: HTMLElement, message: string, type: 'success' | 'error' | 'info'): void {
    element.className = 'status ' + type
    element.textContent = message
    element.style.display = 'block'

    if (type === 'success') {
      setTimeout(() => {
        element.style.display = 'none'
      }, 5000)
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new BotAdventureApp()
})