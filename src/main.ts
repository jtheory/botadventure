import './style.css'
import { BskyAgent } from '@atproto/api'

// Character limits
const BLUESKY_CHAR_LIMIT = 300  // Bluesky's current limit

interface AuthState {
  handle: string
  appPassword: string
  session?: any
}

interface SceneData {
  text: string
  choices: string[]
  useImage: boolean
}

class BotAdventureApp {
  private agent: BskyAgent
  private authState: AuthState | null = null
  private isAuthenticated = false

  constructor() {
    this.agent = new BskyAgent({
      service: 'https://bsky.social',
    })

    this.loadAuthState()
    this.initializeUI()
  }

  private loadAuthState() {
    const stored = localStorage.getItem('botadventure_auth')
    if (stored) {
      try {
        this.authState = JSON.parse(stored)
      } catch (e) {
        console.error('Failed to load auth state:', e)
      }
    }
  }

  private saveAuthState() {
    if (this.authState) {
      localStorage.setItem('botadventure_auth', JSON.stringify(this.authState))
    } else {
      localStorage.removeItem('botadventure_auth')
    }
  }

  private initializeUI() {
    const app = document.querySelector<HTMLDivElement>('#app')!

    app.innerHTML = `
      <div class="container">
        <h1>🎮 BotAdventure Author</h1>

        <div class="auth-section">
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

        <div id="post-section" style="display: none;">
          <h2>Create Scene</h2>

          <div class="form-group">
            <label for="post-mode">Post Mode</label>
            <select id="post-mode">
              <option value="text">Text Only (${BLUESKY_CHAR_LIMIT} chars)</option>
              <option value="image">Image with Alt Text (no char limit)</option>
            </select>
          </div>

          <div class="form-group">
            <label for="scene-text">Scene Text</label>
            <textarea id="scene-text" placeholder="You stand at a crossroads..."></textarea>
            <div id="char-counter" class="char-counter">0 / ${BLUESKY_CHAR_LIMIT}</div>
          </div>

          <div class="form-group">
            <label for="choices">Choices (one per line, e.g., "A) Go left")</label>
            <textarea id="choices" placeholder="A) Go left&#10;B) Go right&#10;C) Turn back" rows="4"></textarea>
          </div>

          <button id="preview-button">Preview Scene</button>
          <button id="post-button">Post to Bluesky</button>

          <div id="scene-preview" class="scene-preview" style="display: none;">
            <h3>Preview:</h3>
            <div id="preview-content"></div>
          </div>

          <div id="post-status"></div>
        </div>
      </div>
    `

    this.attachEventListeners()

    // If we have stored auth, try to restore session
    if (this.authState) {
      this.restoreSession()
    }
  }

  private attachEventListeners() {
    // Auth form
    const authForm = document.getElementById('auth-form') as HTMLFormElement
    authForm.addEventListener('submit', (e) => {
      e.preventDefault()
      this.handleAuth()
    })

    // Post mode change
    const postMode = document.getElementById('post-mode') as HTMLSelectElement
    postMode.addEventListener('change', () => {
      this.updateCharCounter()
    })

    // Scene text input
    const sceneText = document.getElementById('scene-text') as HTMLTextAreaElement
    sceneText.addEventListener('input', () => {
      this.updateCharCounter()
    })

    // Preview button
    const previewButton = document.getElementById('preview-button')
    previewButton?.addEventListener('click', () => {
      this.previewScene()
    })

    // Post button
    const postButton = document.getElementById('post-button')
    postButton?.addEventListener('click', () => {
      this.postToBluesky()
    })
  }

  private async handleAuth() {
    const handleInput = document.getElementById('handle') as HTMLInputElement
    const passwordInput = document.getElementById('app-password') as HTMLInputElement
    const statusDiv = document.getElementById('auth-status')!
    const authButton = document.getElementById('auth-button') as HTMLButtonElement

    const handle = handleInput.value.trim()
    const appPassword = passwordInput.value.trim()

    if (!handle || !appPassword) {
      this.showStatus(statusDiv, 'Please enter both handle and app password', 'error')
      return
    }

    authButton.disabled = true
    this.showStatus(statusDiv, 'Connecting...', 'info')

    try {
      await this.agent.login({
        identifier: handle,
        password: appPassword,
      })

      this.authState = { handle, appPassword, session: this.agent.session }
      this.saveAuthState()
      this.isAuthenticated = true

      this.showStatus(statusDiv, `Connected as @${handle}`, 'success')
      this.showPostSection()

      // Clear password field for security
      passwordInput.value = ''
    } catch (error) {
      console.error('Auth error:', error)
      this.showStatus(statusDiv, `Failed to connect: ${error}`, 'error')
    } finally {
      authButton.disabled = false
    }
  }

  private async restoreSession() {
    if (!this.authState) return

    const statusDiv = document.getElementById('auth-status')!

    try {
      await this.agent.login({
        identifier: this.authState.handle,
        password: this.authState.appPassword,
      })

      this.isAuthenticated = true
      this.showStatus(statusDiv, `Connected as @${this.authState.handle}`, 'success')
      this.showPostSection()

      // Pre-fill the handle
      const handleInput = document.getElementById('handle') as HTMLInputElement
      handleInput.value = this.authState.handle
    } catch (error) {
      console.error('Session restore failed:', error)
      this.showStatus(statusDiv, 'Session expired. Please log in again.', 'error')
      this.authState = null
      this.saveAuthState()
    }
  }

  private showPostSection() {
    const postSection = document.getElementById('post-section')
    if (postSection) {
      postSection.style.display = 'block'
    }
  }

  private updateCharCounter() {
    const sceneText = document.getElementById('scene-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const counter = document.getElementById('char-counter')!
    const postMode = document.getElementById('post-mode') as HTMLSelectElement

    const fullText = this.combineSceneAndChoices(sceneText.value, choices.value)
    const charCount = fullText.length

    if (postMode.value === 'text') {
      counter.textContent = `${charCount} / ${BLUESKY_CHAR_LIMIT}`

      if (charCount > BLUESKY_CHAR_LIMIT) {
        counter.classList.add('error')
        counter.classList.remove('warning')
      } else if (charCount > BLUESKY_CHAR_LIMIT * 0.9) {
        counter.classList.add('warning')
        counter.classList.remove('error')
      } else {
        counter.classList.remove('warning', 'error')
      }
    } else {
      counter.textContent = `${charCount} characters (no limit in image mode)`
      counter.classList.remove('warning', 'error')
    }
  }

  private combineSceneAndChoices(sceneText: string, choicesText: string): string {
    const choices = choicesText
      .split('\\n')
      .map(c => c.trim())
      .filter(c => c.length > 0)

    if (choices.length === 0) {
      return sceneText
    }

    return `${sceneText}\\n\\n${choices.join('\\n')}`
  }

  private previewScene() {
    const sceneText = document.getElementById('scene-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const previewDiv = document.getElementById('scene-preview')!
    const previewContent = document.getElementById('preview-content')!

    const fullText = this.combineSceneAndChoices(sceneText.value, choicesText.value)

    // Create a preview that shows what will be rendered
    const choicesList = choicesText.value
      .split('\\n')
      .map(c => c.trim())
      .filter(c => c.length > 0)

    previewContent.innerHTML = `
      <div class="scene-canvas">
        <div>${sceneText.value.replace(/\\n/g, '<br>')}</div>
        ${choicesList.length > 0 ? `
          <div class="scene-choices">
            <h3>Your choices:</h3>
            ${choicesList.map(c => `<div class="choice-item">${c}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `

    previewDiv.style.display = 'block'
  }

  private async postToBluesky() {
    if (!this.isAuthenticated) {
      alert('Please connect to Bluesky first')
      return
    }

    const sceneText = document.getElementById('scene-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const postMode = document.getElementById('post-mode') as HTMLSelectElement
    const statusDiv = document.getElementById('post-status')!
    const postButton = document.getElementById('post-button') as HTMLButtonElement

    const fullText = this.combineSceneAndChoices(sceneText.value, choices.value)

    if (!fullText.trim()) {
      this.showStatus(statusDiv, 'Please enter some text', 'error')
      return
    }

    if (postMode.value === 'text' && fullText.length > BLUESKY_CHAR_LIMIT) {
      this.showStatus(statusDiv, `Text is too long (${fullText.length} chars). Use image mode or shorten text.`, 'error')
      return
    }

    postButton.disabled = true
    this.showStatus(statusDiv, 'Posting...', 'info')

    try {
      if (postMode.value === 'text') {
        // Simple text post
        await this.agent.post({
          text: fullText,
          createdAt: new Date().toISOString(),
        })
      } else {
        // TODO: Implement image generation and posting
        this.showStatus(statusDiv, 'Image posting coming soon! Use text mode for now.', 'error')
        return
      }

      this.showStatus(statusDiv, 'Posted successfully!', 'success')

      // Clear the form
      sceneText.value = ''
      choices.value = ''
      this.updateCharCounter()
    } catch (error) {
      console.error('Post error:', error)
      this.showStatus(statusDiv, `Failed to post: ${error}`, 'error')
    } finally {
      postButton.disabled = false
    }
  }

  private showStatus(element: HTMLElement, message: string, type: 'success' | 'error' | 'info') {
    element.className = `status ${type}`
    element.textContent = message
    element.style.display = 'block'
  }
}

// Initialize app
new BotAdventureApp()