import './style.css'
import { BskyAgent } from '@atproto/api'
import html2canvas from 'html2canvas'

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

  private loadSceneData() {
    const stored = localStorage.getItem('botadventure_scene')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        const postText = document.getElementById('post-text') as HTMLTextAreaElement
        const imageText = document.getElementById('image-text') as HTMLTextAreaElement
        const choices = document.getElementById('choices') as HTMLTextAreaElement

        if (postText) postText.value = data.postText || ''
        if (imageText) imageText.value = data.imageText || ''
        if (choices) choices.value = data.choices || ''

        this.updateCharCounter()
      } catch (e) {
        console.error('Failed to load scene data:', e)
      }
    }
  }

  private saveSceneData() {
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement

    const data = {
      postText: postText?.value || '',
      imageText: imageText?.value || '',
      choices: choices?.value || '',
    }

    localStorage.setItem('botadventure_scene', JSON.stringify(data))
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
            <label for="post-text">Post Text (optional, ${BLUESKY_CHAR_LIMIT} chars)</label>
            <textarea id="post-text" placeholder="Optional text for the post..." rows="3"></textarea>
            <div id="char-counter" class="char-counter">0 / ${BLUESKY_CHAR_LIMIT}</div>
          </div>

          <div class="form-group">
            <label for="image-text">Image Text (optional, creates an image if filled)</label>
            <textarea id="image-text" placeholder="Text that will be rendered as an image..." rows="5"></textarea>
          </div>

          <div class="form-group">
            <label for="choices">Choices (optional, one per line)</label>
            <textarea id="choices" placeholder="A) Go left&#10;B) Go right&#10;C) Turn back" rows="4"></textarea>
            <small style="opacity: 0.7">Choices go in the image if image text exists, otherwise in post text</small>
          </div>

          <button id="preview-button">Preview Scene</button>
          <button id="post-button">Post to Bluesky</button>

          <div id="scene-preview" class="scene-preview" style="display: none;">
            <h3>Preview:</h3>
            <div id="preview-content"></div>
          </div>

          <div id="post-status"></div>
        </div>

        <div id="reply-section" style="display: none;">
          <h2>Analyze Replies</h2>

          <div class="form-group">
            <label for="post-url">Post URL or URI</label>
            <input type="text" id="post-url" placeholder="https://bsky.app/profile/user/post/... or at://..." />
            <small style="opacity: 0.7">Paste a Bluesky post URL to fetch its replies</small>
          </div>

          <button id="fetch-replies-button">Fetch Replies</button>

          <div id="reply-results" style="display: none; margin-top: 20px;">
            <h3>Results</h3>
            <div id="reply-stats"></div>
            <div id="reply-list"></div>
          </div>
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

    // Post text input
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    postText.addEventListener('input', () => {
      this.updateCharCounter()
      this.saveSceneData()
    })

    // Image text input
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    imageText.addEventListener('input', () => {
      this.updateCharCounter()
      this.saveSceneData()
    })

    // Choices input
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    choices.addEventListener('input', () => {
      this.updateCharCounter()
      this.saveSceneData()
    })

    // Preview button
    const previewButton = document.getElementById('preview-button')
    previewButton?.addEventListener('click', async () => {
      await this.previewScene()
    })

    // Post button
    const postButton = document.getElementById('post-button')
    postButton?.addEventListener('click', () => {
      this.postToBluesky()
    })

    // Fetch replies button
    const fetchRepliesButton = document.getElementById('fetch-replies-button')
    fetchRepliesButton?.addEventListener('click', () => {
      this.fetchReplies()
    })

    // Load any saved scene data
    this.loadSceneData()
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

      // Get the actual handle from the session (in case user logged in with email)
      const actualHandle = this.agent.session?.handle || handle

      this.authState = { handle: actualHandle, appPassword, session: this.agent.session }
      this.saveAuthState()
      this.isAuthenticated = true

      this.showStatus(statusDiv, `Connected as @${actualHandle}`, 'success')
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

      // Get the actual handle from the session (in case original was email)
      const actualHandle = this.agent.session?.handle || this.authState.handle
      this.authState.handle = actualHandle
      this.saveAuthState()

      this.isAuthenticated = true
      this.showStatus(statusDiv, `Connected as @${actualHandle}`, 'success')
      this.showPostSection()

      // Pre-fill the handle
      const handleInput = document.getElementById('handle') as HTMLInputElement
      handleInput.value = actualHandle
    } catch (error) {
      console.error('Session restore failed:', error)
      this.showStatus(statusDiv, 'Session expired. Please log in again.', 'error')
      this.authState = null
      this.saveAuthState()
    }
  }

  private showPostSection() {
    const postSection = document.getElementById('post-section')
    const replySection = document.getElementById('reply-section')
    if (postSection) {
      postSection.style.display = 'block'
    }
    if (replySection) {
      replySection.style.display = 'block'
    }
  }

  private updateCharCounter() {
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const counter = document.getElementById('char-counter')!

    // If there's image text, choices go in the image, not the post
    // If there's no image text, choices go in the post
    let textToCount = postText.value
    if (!imageText.value.trim() && choices.value.trim()) {
      // No image, so choices would go in the post text
      const choicesList = choices.value
        .split('\n')
        .map(c => c.trim())
        .filter(c => c.length > 0)

      if (choicesList.length > 0) {
        textToCount = postText.value + (postText.value ? '\n\n' : '') + choicesList.join('\n')
      }
    }

    const charCount = textToCount.length
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
  }

  private combineSceneAndChoices(sceneText: string, choicesText: string): string {
    const choices = choicesText
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0)

    if (choices.length === 0) {
      return sceneText
    }

    // Only add separator if there's scene text
    if (!sceneText.trim()) {
      return choices.join('\n')
    }

    return `${sceneText}\n\n${choices.join('\n')}`
  }

  private async previewScene() {
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const previewDiv = document.getElementById('scene-preview')!
    const previewContent = document.getElementById('preview-content')!

    const choicesList = choices.value
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0)

    previewDiv.style.display = 'block'

    // Determine what will be posted
    if (imageText.value.trim()) {
      // Image post - generate and show the image
      previewContent.innerHTML = `
        <div class="scene-canvas">
          <h4 style="margin-bottom: 10px; opacity: 0.7;">Generating image preview...</h4>
        </div>
      `

      try {
        const imageBlob = await this.generateSceneImage(imageText.value, choicesList)
        const imageUrl = URL.createObjectURL(imageBlob)
        const altText = this.combineSceneAndChoices(imageText.value, choices.value)

        previewContent.innerHTML = `
          <div class="scene-canvas">
            <h4 style="margin-bottom: 10px; opacity: 0.7;">Post Preview:</h4>
            ${postText.value.trim() ? `
              <div style="margin-bottom: 10px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                <strong>Post text:</strong><br/>
                <div style="white-space: pre-wrap; font-family: system-ui, -apple-system, sans-serif;">
                  ${postText.value.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                </div>
              </div>
            ` : ''}
            <div>
              <strong>Image (400px mobile width):</strong><br/>
              <img src="${imageUrl}" style="width: 400px; margin-top: 10px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);" />
            </div>
            <div style="margin-top: 10px; font-size: 0.85rem; opacity: 0.7;">
              Alt text: ${altText.length} characters
            </div>
          </div>
        `
      } catch (error) {
        previewContent.innerHTML = `
          <div class="scene-canvas">
            <div class="status error">Failed to generate image preview: ${error}</div>
          </div>
        `
      }
    } else {
      // Text-only post
      let fullText = postText.value
      if (choicesList.length > 0) {
        fullText = postText.value + (postText.value ? '\n\n' : '') + choicesList.join('\n')
      }

      previewContent.innerHTML = `
        <div class="scene-canvas">
          <h4 style="margin-bottom: 10px; opacity: 0.7;">Text Post Preview:</h4>
          <div style="white-space: pre-wrap; font-family: system-ui, -apple-system, sans-serif;">
            ${fullText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </div>
          <div style="margin-top: 10px; font-size: 0.85rem; opacity: 0.7;">
            ${fullText.length} / ${BLUESKY_CHAR_LIMIT} characters
          </div>
        </div>
      `
    }
  }

  private async postToBluesky() {
    if (!this.isAuthenticated) {
      alert('Please connect to Bluesky first')
      return
    }

    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const statusDiv = document.getElementById('post-status')!
    const postButton = document.getElementById('post-button') as HTMLButtonElement

    const choicesList = choices.value
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0)

    // Validate that we have something to post
    if (!postText.value.trim() && !imageText.value.trim()) {
      this.showStatus(statusDiv, 'Please enter either post text or image text', 'error')
      return
    }

    postButton.disabled = true
    this.showStatus(statusDiv, 'Posting...', 'info')

    try {
      let postResponse

      if (imageText.value.trim()) {
        // We have image text, so create an image post
        this.showStatus(statusDiv, 'Generating image...', 'info')

        const imageBlob = await this.generateSceneImage(imageText.value, choicesList)

        // Upload the image
        this.showStatus(statusDiv, 'Uploading image...', 'info')
        const uploadResponse = await this.agent.uploadBlob(imageBlob, {
          encoding: 'image/png',
        })

        // Combine image text and choices for alt text
        const altText = this.combineSceneAndChoices(imageText.value, choices.value)

        // Post with image and optional post text
        postResponse = await this.agent.post({
          text: postText.value.trim(), // Optional post text
          embed: {
            $type: 'app.bsky.embed.images',
            images: [{
              alt: altText, // Full text as alt for accessibility
              image: uploadResponse.data.blob,
              aspectRatio: {
                width: 400,
                height: 400, // Will be dynamic based on content
              },
            }],
          },
          createdAt: new Date().toISOString(),
        })
      } else {
        // Text-only post (no image)
        let textToPost = postText.value

        // If no image, choices go in the text
        if (choicesList.length > 0) {
          textToPost = postText.value + (postText.value ? '\n\n' : '') + choicesList.join('\n')
        }

        // Validate length
        if (textToPost.length > BLUESKY_CHAR_LIMIT) {
          this.showStatus(statusDiv, `Text is too long (${textToPost.length} chars). Add image text or shorten.`, 'error')
          postButton.disabled = false
          return
        }

        // Post text only
        postResponse = await this.agent.post({
          text: textToPost,
          createdAt: new Date().toISOString(),
        })
      }

      // Build the post URL
      const handle = this.authState?.handle || 'user'
      const postId = postResponse.uri.split('/').pop()
      const postUrl = `https://bsky.app/profile/${handle}/post/${postId}`

      // Show success with link
      statusDiv.innerHTML = `
        <div class="status success">
          Posted successfully!
          <a href="${postUrl}" target="_blank" style="color: #00bfff; text-decoration: underline;">
            View on Bluesky →
          </a>
          <br/>
          <small style="opacity: 0.7;">Replies analyzer auto-populated below ↓</small>
        </div>
      `
      statusDiv.style.display = 'block'

      // Auto-populate the reply analyzer with the new post URL
      const postUrlInput = document.getElementById('post-url') as HTMLInputElement
      if (postUrlInput) {
        postUrlInput.value = postUrl
        // Scroll to the reply section to show it was populated
        document.getElementById('reply-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      // Clear the form and saved data
      postText.value = ''
      imageText.value = ''
      choices.value = ''
      this.updateCharCounter()
      localStorage.removeItem('botadventure_scene')
    } catch (error) {
      console.error('Post error:', error)
      this.showStatus(statusDiv, `Failed to post: ${error}`, 'error')
    } finally {
      postButton.disabled = false
    }
  }

  private async generateSceneImage(sceneText: string, choices: string[]): Promise<Blob> {
    // Create a temporary container for rendering (mobile-optimized width)
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-9999px'
    container.style.width = '400px' // Mobile-optimized width
    container.style.backgroundColor = '#1a1a1a'

    container.innerHTML = `
      <div style="padding: 30px; font-family: system-ui, -apple-system, sans-serif; background: #1a1a1a; color: #ffffff;">
        <div style="font-size: 16px; line-height: 1.7; margin-bottom: 24px; color: #f0f0f0;">
          ${sceneText.replace(/\n/g, '<br>')}
        </div>
        ${choices.length > 0 ? `
          <div style="border-top: 2px solid #444; padding-top: 16px;">
            <div style="font-size: 12px; color: #999; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px;">Your choices:</div>
            ${choices.map(c => `
              <div style="font-size: 15px; margin: 8px 0; font-weight: 500; color: #00bfff;">
                ${c}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `

    document.body.appendChild(container)

    try {
      const canvas = await html2canvas(container, {
        backgroundColor: '#1a1a1a',
        scale: 2, // Higher quality
        logging: false,
      })

      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to create image'))
          }
        }, 'image/png')
      })
    } finally {
      document.body.removeChild(container)
    }
  }

  private async fetchReplies() {
    const urlInput = document.getElementById('post-url') as HTMLInputElement
    const resultsDiv = document.getElementById('reply-results')!
    const statsDiv = document.getElementById('reply-stats')!
    const listDiv = document.getElementById('reply-list')!

    const url = urlInput.value.trim()
    if (!url) {
      alert('Please enter a post URL')
      return
    }

    // Parse the URL to get the AT URI
    let atUri: string
    if (url.startsWith('at://')) {
      atUri = url
    } else if (url.includes('bsky.app/profile/')) {
      // Parse https://bsky.app/profile/{handle}/post/{postId}
      const match = url.match(/profile\/([^/]+)\/post\/([^/?]+)/)
      if (match) {
        const [, handle, postId] = match
        atUri = `at://did:plc:${handle}/app.bsky.feed.post/${postId}`

        // We need to resolve the handle to a DID first
        try {
          const profile = await this.agent.getProfile({ actor: handle })
          const did = profile.data.did
          atUri = `at://${did}/app.bsky.feed.post/${postId}`
        } catch (e) {
          // If handle resolution fails, try using the handle directly
          atUri = `at://${handle}/app.bsky.feed.post/${postId}`
        }
      } else {
        alert('Invalid Bluesky post URL format')
        return
      }
    } else {
      alert('Please enter a valid Bluesky post URL or AT URI')
      return
    }

    // Show loading state
    resultsDiv.style.display = 'block'
    statsDiv.innerHTML = '<div class="status info">Fetching replies...</div>'
    listDiv.innerHTML = ''

    try {
      // Fetch the post thread
      const thread = await this.agent.getPostThread({
        uri: atUri,
        depth: 100, // Get deep replies
      })

      if (!thread.data.thread) {
        statsDiv.innerHTML = '<div class="status error">Post not found</div>'
        return
      }

      const post = thread.data.thread
      const replies = post.replies || []

      // Count votes (A), B), C) patterns)
      const votes: Record<string, number> = {}
      const voteDetails: Array<{choice: string, author: string, likes: number, text: string}> = []

      // Recursive function to process all replies
      const processReplies = (replies: any[]) => {
        replies.forEach(reply => {
          if (reply.post) {
            const text = reply.post.record?.text || ''
            const author = reply.post.author?.handle || 'unknown'
            const likes = reply.post.likeCount || 0
            const reposts = reply.post.repostCount || 0

            // Check for vote patterns: A), (A), A:, A., or just A at start
            const voteMatch = text.match(/^([A-Z])[\)\:\.]|^\(([A-Z])\)|^([A-Z])(?:\s|$)/i)
            if (voteMatch) {
              const choice = (voteMatch[1] || voteMatch[2] || voteMatch[3]).toUpperCase()
              votes[choice] = (votes[choice] || 0) + 1
              voteDetails.push({ choice, author, likes, text })
            }

            // Process nested replies
            if (reply.replies && reply.replies.length > 0) {
              processReplies(reply.replies)
            }
          }
        })
      }

      processReplies(replies)

      // Display statistics
      const totalReplies = voteDetails.length
      const voteBreakdown = Object.entries(votes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([choice, count]) => `${choice}: ${count}`)
        .join(', ')

      statsDiv.innerHTML = `
        <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px; margin-bottom: 10px;">
          <strong>Post Stats:</strong><br/>
          Likes: ${post.post?.likeCount || 0} | Reposts: ${post.post?.repostCount || 0}<br/>
          Total replies: ${totalReplies}<br/>
          ${voteBreakdown ? `<strong>Vote counts:</strong> ${voteBreakdown}` : 'No votes detected'}
        </div>
      `

      // Display individual replies
      if (voteDetails.length > 0) {
        const sortedVotes = voteDetails.sort((a, b) => b.likes - a.likes)
        listDiv.innerHTML = `
          <div style="max-height: 400px; overflow-y: auto; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 4px;">
            <h4>Votes (sorted by likes):</h4>
            ${sortedVotes.map(vote => `
              <div style="margin: 10px 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <strong>Choice ${vote.choice}</strong>
                  <span style="opacity: 0.7;">❤️ ${vote.likes}</span>
                </div>
                <div style="font-size: 0.9em; opacity: 0.8;">@${vote.author}</div>
                <div style="margin-top: 5px; font-size: 0.9em;">${vote.text.substring(0, 100)}${vote.text.length > 100 ? '...' : ''}</div>
              </div>
            `).join('')}
          </div>
        `
      } else {
        listDiv.innerHTML = '<div style="opacity: 0.7;">No votes found in replies</div>'
      }
    } catch (error) {
      console.error('Error fetching replies:', error)
      statsDiv.innerHTML = `<div class="status error">Error: ${error}</div>`
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