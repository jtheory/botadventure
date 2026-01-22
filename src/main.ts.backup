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

interface Post {
  uri: string
  cid: string
  author: {
    did: string
    handle: string
    displayName?: string
  }
  record: {
    text: string
    createdAt: string
    reply?: {
      root: { uri: string; cid: string }
      parent: { uri: string; cid: string }
    }
  }
  embed?: any
  replyCount?: number
  repostCount?: number
  likeCount?: number
  indexedAt: string
}

interface ThreadNode {
  post: Post
  replies?: Post[]
  depth: number
}

class BotAdventureApp {
  private agent: BskyAgent
  private authState: AuthState | null = null
  private isAuthenticated = false
  private lastImageText = ''
  private lastChoicesText = ''
  private lastTextChangeTime = 0
  private previewRefreshTimer: NodeJS.Timeout | null = null
  private isGeneratingPreview = false

  // Thread navigation state
  private threadPath: ThreadNode[] = []
  private currentPost: Post | null = null
  private editingReplyTo: Post | null = null
  private rootPost: Post | null = null

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
        const postUrl = document.getElementById('post-url') as HTMLInputElement

        if (postText) postText.value = data.postText || ''
        if (imageText) imageText.value = data.imageText || ''
        if (choices) choices.value = data.choices || ''
        if (postUrl) postUrl.value = data.postUrl || ''

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

  private saveThreadState() {
    const threadData = {
      rootPost: this.rootPost,
      threadPath: this.threadPath,
      editingReplyTo: this.editingReplyTo,
    }
    localStorage.setItem('botadventure_thread', JSON.stringify(threadData))
  }

  private async loadThreadState() {
    const stored = localStorage.getItem('botadventure_thread')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        this.rootPost = data.rootPost
        this.threadPath = data.threadPath || []
        this.editingReplyTo = data.editingReplyTo

        // If we have a thread state, render it
        if (this.rootPost && this.threadPath.length > 0) {
          // Show thread view
          const threadView = document.getElementById('thread-view')
          if (threadView) threadView.style.display = 'block'

          // Update editor if we have a reply target
          if (this.editingReplyTo) {
            const editorTitle = document.getElementById('editor-title')
            const replyingToDiv = document.getElementById('replying-to')
            const replyingToText = document.getElementById('replying-to-text')

            if (editorTitle) editorTitle.textContent = 'Create Reply'
            if (replyingToDiv) replyingToDiv.style.display = 'block'
            if (replyingToText) {
              replyingToText.textContent = this.editingReplyTo.record.text.substring(0, 100) +
                (this.editingReplyTo.record.text.length > 100 ? '...' : '')
            }
          }

          // Render the thread
          this.renderThreadView()
        }
      } catch (e) {
        console.error('Failed to load thread state:', e)
      }
    }
  }

  private initializeUI() {
    const app = document.querySelector<HTMLDivElement>('#app')!

    app.innerHTML = `
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
              <label for="thread-url">Load Thread (paste URL and press Enter)</label>
              <input type="text" id="thread-url" placeholder="https://bsky.app/profile/user/post/... (press Enter to load)" />
              <small style="opacity: 0.7">Load a new thread anytime - replaces current thread</small>
            </div>
            <div id="load-status"></div>
          </div>

          <!-- Thread view -->
          <div id="thread-view" class="thread-view"></div>

          <!-- Editor section -->
          <div id="editor-section" class="split-layout">
            <div class="editor-panel">
              <h2 id="editor-title">Create Scene</h2>
              <div id="replying-to" style="display: none; margin-bottom: 15px; padding: 10px; background: #f0f0f0; border-radius: 5px;">
                <strong>Replying to:</strong>
                <div id="replying-to-text" style="margin-top: 5px;"></div>
              </div>

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

              <div class="button-group">
                <button id="post-button" class="primary-button">Post to Bluesky</button>
                <button id="cancel-reply" style="display: none; margin-left: 10px;">Cancel Reply</button>
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

    // Logout link
    const logoutButton = document.getElementById('logout-button')
    logoutButton?.addEventListener('click', (e) => {
      e.preventDefault()
      this.handleLogout()
    })

    // Post text input
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    postText.addEventListener('input', () => {
      this.updateCharCounter()
      this.saveSceneData()
      this.schedulePreviewRefresh()
    })

    // Image text input
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    imageText.addEventListener('input', () => {
      this.updateCharCounter()
      this.saveSceneData()
      this.lastTextChangeTime = Date.now()
      this.schedulePreviewRefresh()
    })

    // Choices input
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    choices.addEventListener('input', () => {
      this.updateCharCounter()
      this.saveSceneData()
      this.lastTextChangeTime = Date.now()
      this.schedulePreviewRefresh()
    })

    // Post button
    const postButton = document.getElementById('post-button')
    postButton?.addEventListener('click', () => {
      this.postToBluesky()
    })

    // Cancel reply button
    const cancelReplyButton = document.getElementById('cancel-reply')
    cancelReplyButton?.addEventListener('click', () => {
      this.cancelReply()
    })

    // Thread URL input - load on Enter
    const threadUrlInput = document.getElementById('thread-url') as HTMLInputElement
    threadUrlInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const url = threadUrlInput.value.trim()
        if (url) {
          this.loadExistingThread()
        }
      }
    })

    // Load any saved scene data
    this.loadSceneData()

    // Initial preview if we have content
    setTimeout(() => {
      this.updatePreview()
    }, 100)
  }

  private handleLogout() {
    // Clear auth state
    this.authState = null
    this.isAuthenticated = false
    localStorage.removeItem('botadventure_auth')

    // Clear scene data
    localStorage.removeItem('botadventure_scene')

    // Reset UI
    const authFormContainer = document.getElementById('auth-form-container')
    const authConnected = document.getElementById('auth-connected')
    const postSection = document.getElementById('post-section')
    const replySection = document.getElementById('reply-section')
    const handleInput = document.getElementById('handle') as HTMLInputElement
    const passwordInput = document.getElementById('app-password') as HTMLInputElement

    if (authFormContainer) authFormContainer.style.display = 'block'
    if (authConnected) authConnected.style.display = 'none'
    if (postSection) postSection.style.display = 'none'
    if (replySection) replySection.style.display = 'none'

    // Clear form inputs
    if (handleInput) handleInput.value = ''
    if (passwordInput) passwordInput.value = ''

    // Clear scene data fields
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const postUrl = document.getElementById('post-url') as HTMLInputElement

    if (postText) postText.value = ''
    if (imageText) imageText.value = ''
    if (choices) choices.value = ''
    if (postUrl) postUrl.value = ''

    // Clear preview
    const previewContent = document.getElementById('preview-content')
    if (previewContent) {
      previewContent.innerHTML = '<div style="text-align: center; opacity: 0.5; padding: 40px;">Start typing to see a preview</div>'
    }

    // Clear status
    const statusDiv = document.getElementById('auth-status')!
    statusDiv.innerHTML = ''

    // Reset preview state
    this.lastImageText = ''
    this.lastChoicesText = ''
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
      this.showAuthConnected(actualHandle)
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
      // Don't show status in the form container since we're hiding it
      this.showAuthConnected(actualHandle)
      this.showPostSection()

      // Load saved thread state if any
      await this.loadThreadState()

      // Pre-fill the handle (in case user returns to form)
      const handleInput = document.getElementById('handle') as HTMLInputElement
      handleInput.value = actualHandle
    } catch (error) {
      console.error('Session restore failed:', error)
      this.showStatus(statusDiv, 'Session expired. Please log in again.', 'error')
      this.authState = null
      this.saveAuthState()
    }
  }

  private showAuthConnected(handle: string) {
    const authFormContainer = document.getElementById('auth-form-container')
    const authConnected = document.getElementById('auth-connected')
    const connectedHandle = document.getElementById('connected-handle')

    if (authFormContainer) authFormContainer.style.display = 'none'
    if (authConnected) authConnected.style.display = 'flex'
    if (connectedHandle) {
      connectedHandle.innerHTML = `<a href="https://bsky.app/profile/${handle}" target="_blank" style="color: #00bfff; text-decoration: none;">@${handle}</a>`
    }
  }

  private showPostSection() {
    const mainContent = document.getElementById('main-content')
    if (mainContent) {
      mainContent.style.display = 'block'
    }

    // Trigger initial preview update
    setTimeout(() => {
      this.updatePreview()
    }, 100)
  }

  // Thread rendering methods
  private renderThreadView() {
    const threadView = document.getElementById('thread-view')
    if (!threadView) return

    threadView.innerHTML = ''

    // Show each post in the thread path with inverted tree
    this.threadPath.forEach((node, index) => {
      // Create post container
      const postContainer = document.createElement('div')
      postContainer.className = 'thread-post-container'

      // Add the main post (with link inside)
      const postElement = this.createPostElement(node.post, index === this.threadPath.length - 1, index)
      postContainer.appendChild(postElement)

      // Show replies and editor connection for current post
      if (index === this.threadPath.length - 1) {
        const treeContainer = document.createElement('div')
        treeContainer.className = 'inverted-tree'

        // Create container for both replies and editor connection
        const branchContainer = document.createElement('div')
        branchContainer.className = 'branch-container'

        // Add existing replies as stubs
        if (node.replies && node.replies.length > 0) {
          node.replies.forEach((reply) => {
            // Check if this reply is selected (next in path)
            const isSelected = index < this.threadPath.length - 1 &&
                             this.threadPath[index + 1].post.uri === reply.uri

            // Create minimal reply card
            const replyCard = document.createElement('div')
            replyCard.className = 'reply-card' + (isSelected ? ' selected' : '')

            // Get first few words of reply text
            const previewText = reply.record.text.substring(0, 50)
            const truncatedText = previewText.length < reply.record.text.length ?
                                previewText + '...' : previewText

            replyCard.innerHTML = `
              <div class="reply-card-author">@${reply.author.handle}</div>
              <div class="reply-card-text">${truncatedText}</div>
            `

            // Add click handler
            replyCard.addEventListener('click', () => this.selectPost(reply))

            // Create tree line
            const treeLine = document.createElement('div')
            treeLine.className = 'tree-line' + (isSelected ? ' selected' : '')

            // Create card with line
            const cardWithLine = document.createElement('div')
            cardWithLine.className = 'card-with-line'
            cardWithLine.appendChild(treeLine)
            cardWithLine.appendChild(replyCard)

            branchContainer.appendChild(cardWithLine)
          })
        }

        // Add editor connection as a branch alongside replies
        const editorBranch = document.createElement('div')
        editorBranch.className = 'card-with-line editor-branch'
        editorBranch.innerHTML = `
          <div class="tree-line editor-line-branch"></div>
          <div class="editor-card">
            <div class="editor-card-label">Your draft reply ↓</div>
          </div>
        `

        branchContainer.appendChild(editorBranch)
        treeContainer.appendChild(branchContainer)
        postContainer.appendChild(treeContainer)
      } else if (index < this.threadPath.length - 1) {
        // Show non-selected reply stubs alongside the selected path
        const treeContainer = document.createElement('div')
        treeContainer.className = 'inverted-tree'

        const branchContainer = document.createElement('div')
        branchContainer.className = 'branch-container'

        // Find which reply is selected
        const selectedReply = this.threadPath[index + 1].post

        // Show all replies
        if (node.replies && node.replies.length > 0) {
          node.replies.forEach((reply) => {
            const isSelected = reply.uri === selectedReply.uri

            if (!isSelected) {
              // Show as stub
              const replyCard = document.createElement('div')
              replyCard.className = 'reply-card'

              const previewText = reply.record.text.substring(0, 50)
              const truncatedText = previewText.length < reply.record.text.length ?
                                  previewText + '...' : previewText

              replyCard.innerHTML = `
                <div class="reply-card-author">@${reply.author.handle}</div>
                <div class="reply-card-text">${truncatedText}</div>
              `

              replyCard.addEventListener('click', () => {
                // Replace the selected reply with this one
                this.threadPath = this.threadPath.slice(0, index + 1)
                this.selectPost(reply)
              })

              const treeLine = document.createElement('div')
              treeLine.className = 'tree-line'

              const cardWithLine = document.createElement('div')
              cardWithLine.className = 'card-with-line'
              cardWithLine.appendChild(treeLine)
              cardWithLine.appendChild(replyCard)

              branchContainer.appendChild(cardWithLine)
            }
          })

          // Add a longer line for the selected path
          const selectedBranch = document.createElement('div')
          selectedBranch.className = 'card-with-line selected-branch'
          selectedBranch.innerHTML = `
            <div class="tree-line selected extended"></div>
            <div class="selected-indicator">Selected path ↓</div>
          `
          branchContainer.appendChild(selectedBranch)
        }

        treeContainer.appendChild(branchContainer)
        postContainer.appendChild(treeContainer)
      }

      threadView.appendChild(postContainer)
    })

    // Set the current reply context to the last post in the path
    if (this.threadPath.length > 0) {
      const currentPost = this.threadPath[this.threadPath.length - 1].post
      if (this.editingReplyTo?.uri !== currentPost.uri) {
        this.editingReplyTo = currentPost

        // Update editor title and reply indicator
        const editorTitle = document.getElementById('editor-title')
        const replyingToDiv = document.getElementById('replying-to')
        const replyingToText = document.getElementById('replying-to-text')

        if (editorTitle) editorTitle.textContent = 'Create Reply'
        if (replyingToDiv) replyingToDiv.style.display = 'block'
        if (replyingToText) {
          replyingToText.textContent = currentPost.record.text.substring(0, 100) +
            (currentPost.record.text.length > 100 ? '...' : '')
        }
      }
    }
  }

  private createPostElement(post: Post, isCurrent: boolean, pathIndex: number = -1): HTMLDivElement {
    const postDiv = document.createElement('div')
    postDiv.className = 'post-item' + (isCurrent ? ' current' : '')

    // Make non-current posts clickable to reset the path
    if (!isCurrent && pathIndex >= 0) {
      postDiv.style.cursor = 'pointer'
      postDiv.addEventListener('click', () => {
        // Truncate the thread path to this point
        this.threadPath = this.threadPath.slice(0, pathIndex + 1)
        this.editingReplyTo = post
        this.renderThreadView()
        this.saveThreadState()
      })
    }

    const headerDiv = document.createElement('div')
    headerDiv.className = 'post-header'

    const authorSpan = document.createElement('span')
    authorSpan.className = 'post-author'
    authorSpan.textContent = `@${post.author.handle}`

    const dateAndLinkSpan = document.createElement('span')
    dateAndLinkSpan.className = 'post-date-link'

    const timeSpan = document.createElement('span')
    timeSpan.className = 'post-time'
    timeSpan.textContent = new Date(post.indexedAt).toLocaleString()

    const postLink = document.createElement('a')
    postLink.href = `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`
    postLink.target = '_blank'
    postLink.className = 'post-external-link'
    postLink.title = 'View on Bluesky'
    postLink.innerHTML = ' 🦋'
    postLink.addEventListener('click', (e) => e.stopPropagation())

    dateAndLinkSpan.appendChild(timeSpan)
    dateAndLinkSpan.appendChild(postLink)

    headerDiv.appendChild(authorSpan)
    headerDiv.appendChild(dateAndLinkSpan)

    const textDiv = document.createElement('div')
    textDiv.className = 'post-text'
    textDiv.textContent = post.record.text

    const actionsDiv = document.createElement('div')
    actionsDiv.className = 'post-actions'
    actionsDiv.innerHTML = `
      💬 ${post.replyCount || 0} replies •
      ❤️ ${post.likeCount || 0} likes •
      🔄 ${post.repostCount || 0} reposts
    `

    postDiv.appendChild(headerDiv)
    postDiv.appendChild(textDiv)
    postDiv.appendChild(actionsDiv)

    return postDiv
  }

  private async selectPost(post: Post) {
    // Add the selected post to the thread path
    const newNode: ThreadNode = {
      post: post,
      replies: [],
      depth: this.threadPath.length
    }
    this.threadPath.push(newNode)

    // Fetch replies for this post
    await this.fetchRepliesForPost(post)

    // Set this as the reply target
    this.editingReplyTo = post

    // Update editor title and reply indicator
    const editorTitle = document.getElementById('editor-title')
    const replyingToDiv = document.getElementById('replying-to')
    const replyingToText = document.getElementById('replying-to-text')

    if (editorTitle) editorTitle.textContent = 'Create Reply'
    if (replyingToDiv) replyingToDiv.style.display = 'block'
    if (replyingToText) replyingToText.textContent = post.record.text.substring(0, 100) + (post.record.text.length > 100 ? '...' : '')

    // Re-render the thread view
    this.renderThreadView()

    // Save thread state
    this.saveThreadState()
  }

  private setReplyTo(post: Post) {
    this.editingReplyTo = post

    const editorTitle = document.getElementById('editor-title')
    const replyingToDiv = document.getElementById('replying-to')
    const replyingToText = document.getElementById('replying-to-text')
    const cancelReplyBtn = document.getElementById('cancel-reply')

    if (editorTitle) editorTitle.textContent = 'Create Reply'
    if (replyingToDiv) replyingToDiv.style.display = 'block'
    if (replyingToText) replyingToText.textContent = post.record.text.substring(0, 100) + (post.record.text.length > 100 ? '...' : '')
    if (cancelReplyBtn) cancelReplyBtn.style.display = 'inline-block'

    // Clear the editor fields
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement

    if (postText) postText.value = ''
    if (imageText) imageText.value = ''
    if (choices) choices.value = ''

    // Scroll to editor
    document.getElementById('editor-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  private cancelReply() {
    this.editingReplyTo = null

    const editorTitle = document.getElementById('editor-title')
    const replyingToDiv = document.getElementById('replying-to')
    const cancelReplyBtn = document.getElementById('cancel-reply')

    if (editorTitle) editorTitle.textContent = 'Create Scene'
    if (replyingToDiv) replyingToDiv.style.display = 'none'
    if (cancelReplyBtn) cancelReplyBtn.style.display = 'none'
  }

  private async fetchRepliesForPost(post: Post) {
    try {
      const thread = await this.agent.getPostThread({
        uri: post.uri,
        depth: 1, // Just get immediate replies
      })

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

  private async loadExistingThread() {
    const urlInput = document.getElementById('thread-url') as HTMLInputElement
    const statusDiv = document.getElementById('load-status')!
    const url = urlInput.value.trim()

    if (!url) {
      this.showStatus(statusDiv, 'Please enter a thread URL', 'error')
      return
    }

    this.showStatus(statusDiv, 'Loading thread...', 'info')

    // Parse the URL to get the AT URI
    let atUri: string

    if (url.startsWith('at://')) {
      atUri = url
    } else if (url.includes('bsky.app/profile/')) {
      // Parse https://bsky.app/profile/{handle}/post/{postId}
      const match = url.match(/profile\/([^/]+)\/post\/([^/?]+)/)
      if (match) {
        const [, handle, postId] = match

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
        this.showStatus(statusDiv, 'Invalid URL format', 'error')
        return
      }
    } else {
      this.showStatus(statusDiv, 'Invalid URL format', 'error')
      return
    }

    try {
      // Fetch the post thread
      const thread = await this.agent.getPostThread({
        uri: atUri,
        depth: 100, // Get deep replies
      })

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

      // Show thread view (keep load section visible)
      document.getElementById('thread-view')!.style.display = 'block'

      // Set the root post as the reply target
      this.editingReplyTo = rootPost

      // Update editor to show replying to root
      const editorTitle = document.getElementById('editor-title')
      const replyingToDiv = document.getElementById('replying-to')
      const replyingToText = document.getElementById('replying-to-text')

      if (editorTitle) editorTitle.textContent = 'Create Reply'
      if (replyingToDiv) replyingToDiv.style.display = 'block'
      if (replyingToText) replyingToText.textContent = rootPost.record.text.substring(0, 100) + (rootPost.record.text.length > 100 ? '...' : '')

      // Render the thread
      this.renderThreadView()

      // Save thread state
      this.saveThreadState()

      // Clear the URL input after successful load
      urlInput.value = ''

      this.showStatus(statusDiv, 'Thread loaded successfully!', 'success')
    } catch (error) {
      console.error('Failed to load thread:', error)
      this.showStatus(statusDiv, 'Failed to load thread', 'error')
    }
  }

  private startFreshThread() {
    // Clear any existing thread state
    this.rootPost = null
    this.threadPath = []
    this.editingReplyTo = null

    // Clear thread view
    const threadView = document.getElementById('thread-view')
    if (threadView) {
      threadView.innerHTML = ''
    }

    // Reset editor to create mode
    const editorTitle = document.getElementById('editor-title')
    const replyingToDiv = document.getElementById('replying-to')

    if (editorTitle) editorTitle.textContent = 'Create Scene'
    if (replyingToDiv) replyingToDiv.style.display = 'none'

    // Clear saved thread state
    localStorage.removeItem('botadventure_thread')
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

  private schedulePreviewRefresh() {
    // Clear any existing timer
    if (this.previewRefreshTimer) {
      clearTimeout(this.previewRefreshTimer)
    }

    // Immediately update text preview (cheap)
    this.updatePreview()

    // Schedule image generation after 1 second of no typing
    this.previewRefreshTimer = setTimeout(() => {
      const imageText = document.getElementById('image-text') as HTMLTextAreaElement
      const choices = document.getElementById('choices') as HTMLTextAreaElement

      if (imageText.value.trim()) {
        // Check if image text or choices have changed
        if (imageText.value !== this.lastImageText || choices.value !== this.lastChoicesText) {
          this.regenerateImagePreview()
        }
      }
    }, 1000)
  }

  private async updatePreview() {
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const previewContent = document.getElementById('preview-content')!
    const previewStatus = document.getElementById('preview-status')!

    const choicesList = choices.value
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0)

    // If no content at all
    if (!postText.value.trim() && !imageText.value.trim() && choicesList.length === 0) {
      previewContent.innerHTML = `
        <div style="text-align: center; opacity: 0.5; padding: 40px;">
          Start typing to see a preview
        </div>
      `
      previewStatus.innerHTML = ''
      return
    }

    // If text-only post
    if (!imageText.value.trim()) {
      let fullText = postText.value
      if (choicesList.length > 0) {
        fullText = postText.value + (postText.value ? '\n\n' : '') + choicesList.join('\n')
      }

      previewContent.innerHTML = `
        <div class="text-preview">
          <h4 style="margin-bottom: 10px; opacity: 0.7; font-size: 0.9em;">Text Post:</h4>
          <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; white-space: pre-wrap; font-family: system-ui, -apple-system, sans-serif;">
            ${fullText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </div>
          <div style="margin-top: 10px; font-size: 0.85rem; opacity: 0.5;">
            ${fullText.length} / ${BLUESKY_CHAR_LIMIT} characters
          </div>
        </div>
      `
      previewStatus.innerHTML = ''
      return
    }

    // Has image text - show placeholder if we don't have a generated image yet
    if (!this.lastImageText || imageText.value !== this.lastImageText || choices.value !== this.lastChoicesText) {
      // Show existing preview with "will regenerate" notice
      if (previewContent.querySelector('img')) {
        previewStatus.innerHTML = '<span style="color: orange;">⏱ Image will regenerate...</span>'
      } else {
        previewContent.innerHTML = `
          <div class="text-preview">
            <h4 style="margin-bottom: 10px; opacity: 0.7; font-size: 0.9em;">Image Post:</h4>
            ${postText.value.trim() ? `
              <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                <strong style="font-size: 0.85em; opacity: 0.7;">Post text:</strong><br/>
                <div style="white-space: pre-wrap; font-family: system-ui, -apple-system, sans-serif;">
                  ${postText.value.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                </div>
              </div>
            ` : ''}
            <div style="padding: 20px; background: rgba(255,255,255,0.03); border-radius: 8px; text-align: center; opacity: 0.5;">
              Generating image preview...
            </div>
          </div>
        `
      }
    }
  }

  private async regenerateImagePreview() {
    if (this.isGeneratingPreview) return

    const imageText = document.getElementById('image-text') as HTMLTextAreaElement
    const choices = document.getElementById('choices') as HTMLTextAreaElement
    const postText = document.getElementById('post-text') as HTMLTextAreaElement
    const previewContent = document.getElementById('preview-content')!
    const previewStatus = document.getElementById('preview-status')!

    // Only regenerate if we have image text and it's changed
    if (!imageText.value.trim()) return

    // Check if content actually changed
    if (imageText.value === this.lastImageText && choices.value === this.lastChoicesText) {
      return
    }

    this.isGeneratingPreview = true
    previewStatus.innerHTML = '<span style="color: #00bfff;">🎨 Generating image...</span>'

    const choicesList = choices.value
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0)

    try {
      const imageResult = await this.generateSceneImage(imageText.value, choicesList)
      const imageUrl = URL.createObjectURL(imageResult.blob)
      const altText = this.combineSceneAndChoices(imageText.value, choices.value)

      // Update last values
      this.lastImageText = imageText.value
      this.lastChoicesText = choices.value

      const contentWarning = imageResult.dimensions.height < 400
        ? '<div style="color: orange; margin-top: 10px; font-size: 0.85em;">⚠️ Short content may look sparse. Consider adding more text.</div>'
        : ''

      previewContent.innerHTML = `
        <div class="image-preview">
          <h4 style="margin-bottom: 10px; opacity: 0.7; font-size: 0.9em;">Image Post:</h4>
          ${postText.value.trim() ? `
            <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px;">
              <strong style="font-size: 0.85em; opacity: 0.7;">Post text:</strong><br/>
              <div style="white-space: pre-wrap; font-family: system-ui, -apple-system, sans-serif;">
                ${postText.value.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
              </div>
            </div>
          ` : ''}
          <div>
            <img src="${imageUrl}" style="width: 100%; max-width: ${imageResult.dimensions.width}px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);" />
          </div>
          <div style="margin-top: 10px; display: flex; justify-content: space-between; font-size: 0.8rem; opacity: 0.5;">
            <span>${imageResult.dimensions.width}×${imageResult.dimensions.height}px</span>
            <span>Alt: ${altText.length} chars</span>
          </div>
          ${contentWarning}
        </div>
      `
      previewStatus.innerHTML = '<span style="color: #00ff00;">✓ Preview updated</span>'
      setTimeout(() => {
        previewStatus.innerHTML = ''
      }, 2000)
    } catch (error) {
      previewContent.innerHTML = `
        <div class="text-preview">
          <div class="status error">Failed to generate image preview: ${error}</div>
        </div>
      `
      previewStatus.innerHTML = '<span style="color: red;">❌ Generation failed</span>'
    } finally {
      this.isGeneratingPreview = false
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

        const imageResult = await this.generateSceneImage(imageText.value, choicesList)

        // Upload the image
        this.showStatus(statusDiv, 'Uploading image...', 'info')
        const uploadResponse = await this.agent.uploadBlob(imageResult.blob, {
          encoding: 'image/png',
        })

        // Combine image text and choices for alt text
        const altText = this.combineSceneAndChoices(imageText.value, choices.value)

        // Post with image and optional post text
        const postData: any = {
          text: postText.value.trim(), // Optional post text
          embed: {
            $type: 'app.bsky.embed.images',
            images: [{
              alt: altText, // Full text as alt for accessibility
              image: uploadResponse.data.blob,
              aspectRatio: {
                width: imageResult.dimensions.width,
                height: imageResult.dimensions.height,
              },
            }],
          },
          createdAt: new Date().toISOString(),
        }

        // Add reply parameters if this is a reply
        if (this.editingReplyTo) {
          postData.reply = {
            root: {
              uri: this.rootPost ? this.rootPost.uri : this.editingReplyTo.uri,
              cid: this.rootPost ? this.rootPost.cid : this.editingReplyTo.cid,
            },
            parent: {
              uri: this.editingReplyTo.uri,
              cid: this.editingReplyTo.cid,
            },
          }
        }

        postResponse = await this.agent.post(postData)
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
        const postData: any = {
          text: textToPost,
          createdAt: new Date().toISOString(),
        }

        // Add reply parameters if this is a reply
        if (this.editingReplyTo) {
          postData.reply = {
            root: {
              uri: this.rootPost ? this.rootPost.uri : this.editingReplyTo.uri,
              cid: this.rootPost ? this.rootPost.cid : this.editingReplyTo.cid,
            },
            parent: {
              uri: this.editingReplyTo.uri,
              cid: this.editingReplyTo.cid,
            },
          }
        }

        postResponse = await this.agent.post(postData)
      }

      // Build the post URL
      const handle = this.authState?.handle || 'user'
      const postId = postResponse.uri.split('/').pop()
      const postUrl = `https://bsky.app/profile/${handle}/post/${postId}`

      // Create post object from response
      const newPost: Post = {
        uri: postResponse.uri,
        cid: postResponse.cid,
        author: {
          did: this.agent.session?.did || '',
          handle: handle,
          displayName: handle,
        },
        record: {
          text: postText.value.trim() || imageText.value.trim(),
          createdAt: new Date().toISOString(),
          reply: this.editingReplyTo ? {
            root: {
              uri: this.rootPost ? this.rootPost.uri : this.editingReplyTo.uri,
              cid: this.rootPost ? this.rootPost.cid : this.editingReplyTo.cid,
            },
            parent: {
              uri: this.editingReplyTo.uri,
              cid: this.editingReplyTo.cid,
            },
          } : undefined,
        },
        replyCount: 0,
        repostCount: 0,
        likeCount: 0,
        indexedAt: new Date().toISOString(),
      }

      if (this.editingReplyTo) {
        // This was a reply - add it to the current node's replies and re-render
        const currentNode = this.threadPath[this.threadPath.length - 1]
        if (currentNode) {
          if (!currentNode.replies) currentNode.replies = []
          currentNode.replies.push(newPost)
        }

        // Clear reply mode
        this.cancelReply()

        // Ensure thread view is visible
        const threadView = document.getElementById('thread-view')
        if (threadView) threadView.style.display = 'block'

        // Re-render thread view
        this.renderThreadView()

        // Save thread state
        this.saveThreadState()

        // Show success
        statusDiv.innerHTML = `
          <div class="status success">
            Reply posted successfully!
            <a href="${postUrl}" target="_blank" style="color: #00bfff; text-decoration: underline;">
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

        // Show thread view
        const threadView = document.getElementById('thread-view')
        if (threadView) threadView.style.display = 'block'

        // Now set this post as the reply target for future replies
        this.editingReplyTo = newPost

        // Fetch replies for the new post
        await this.fetchRepliesForPost(newPost)

        // Render the thread view
        this.renderThreadView()

        // Save thread state
        this.saveThreadState()

        // Show success
        statusDiv.innerHTML = `
          <div class="status success">
            Scene posted successfully!
            <a href="${postUrl}" target="_blank" style="color: #00bfff; text-decoration: underline;">
              View on Bluesky →
            </a>
          </div>
        `
      }

      // Clear the form after posting
      postText.value = ''
      imageText.value = ''
      choices.value = ''
      this.updateCharCounter()
      this.saveSceneData() // Save with cleared fields but preserved URL
    } catch (error) {
      console.error('Post error:', error)
      this.showStatus(statusDiv, `Failed to post: ${error}`, 'error')
    } finally {
      postButton.disabled = false
    }
  }

  private async generateSceneImage(sceneText: string, choices: string[]): Promise<{ blob: Blob, dimensions: { width: number, height: number } }> {
    // First, measure content with max width to determine natural height
    const measureContainer = document.createElement('div')
    measureContainer.style.position = 'fixed'
    measureContainer.style.left = '-9999px'
    measureContainer.style.width = '500px' // Max width
    measureContainer.style.backgroundColor = '#1a1a1a'

    measureContainer.innerHTML = `
      <div style="padding: 20px; font-family: system-ui, -apple-system, sans-serif; background: #1a1a1a; color: #ffffff;">
        <div style="font-size: 17px; line-height: 1.8; margin-bottom: ${choices.length > 0 ? '20px' : '0'}; color: #f0f0f0;">
          ${sceneText.replace(/\n/g, '<br>')}
        </div>
        ${choices.length > 0 ? `
          <div style="border-top: 2px solid #444; padding-top: 15px;">
            <div style="font-size: 13px; color: #999; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px;">Your choices:</div>
            ${choices.map(c => `
              <div style="font-size: 16px; margin: 8px 0; font-weight: 500; color: #00bfff;">
                ${c}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `

    document.body.appendChild(measureContainer)

    // Measure the natural height
    const naturalHeight = measureContainer.offsetHeight
    document.body.removeChild(measureContainer)

    // Calculate optimal width to ensure height >= width
    let finalWidth = 500
    let finalHeight = naturalHeight

    // If content is too short, reduce width to make it more square
    if (naturalHeight < 500) {
      finalWidth = Math.max(350, naturalHeight) // Min width of 350px for readability

      // Re-measure with new width
      measureContainer.style.width = finalWidth + 'px'
      document.body.appendChild(measureContainer)
      finalHeight = measureContainer.offsetHeight
      document.body.removeChild(measureContainer)
    }

    // Now create the final container with calculated dimensions
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-9999px'
    container.style.width = finalWidth + 'px'
    container.style.backgroundColor = '#1a1a1a'

    container.innerHTML = measureContainer.innerHTML

    document.body.appendChild(container)

    try {
      const canvas = await html2canvas(container, {
        backgroundColor: '#1a1a1a',
        scale: 2, // Higher quality
        logging: false,
      })

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to create image'))
          }
        }, 'image/png')
      })

      return {
        blob,
        dimensions: { width: finalWidth, height: finalHeight }
      }
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

      const post: any = thread.data.thread

      // Extract post content
      const postAuthor = post.post?.author?.handle || 'unknown'
      const postText = post.post?.record?.text || ''
      const postLikes = post.post?.likeCount || 0
      const postReposts = post.post?.repostCount || 0
      const postTime = post.post?.record?.createdAt ? new Date(post.post.record.createdAt).toLocaleString() : ''
      const postEmbed = post.post?.embed

      const replies: any[] = post.replies || []

      // Count votes (A), B), C) patterns)
      const votes: Record<string, number> = {}
      const voteDetails: Array<{choice: string, author: string, likes: number, text: string}> = []
      let totalReplyCount = 0

      // Recursive function to process all replies
      const processReplies = (replies: any[]) => {
        replies.forEach(reply => {
          if (reply.post) {
            totalReplyCount++
            const text = reply.post.record?.text || ''
            const author = reply.post.author?.handle || 'unknown'
            const likes = reply.post.likeCount || 0

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
      const voteBreakdown = Object.entries(votes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([choice, count]) => `${choice}: ${count}`)
        .join(', ')

      // Check if post has an image
      let imageHtml = ''
      if (postEmbed && postEmbed.images && postEmbed.images.length > 0) {
        const image = postEmbed.images[0]
        imageHtml = `
          <div style="margin-top: 10px;">
            <div style="padding: 10px; background: #1a1a1a; border-radius: 8px; display: inline-block;">
              <div style="font-size: 0.9em; color: #f0f0f0; white-space: pre-wrap;">${image.alt || 'No alt text'}</div>
            </div>
          </div>
        `
      }

      statsDiv.innerHTML = `
        <div style="padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 15px;">
          <h3 style="margin-bottom: 10px;">Original Post</h3>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="opacity: 0.9;">@${postAuthor}</span>
            <span style="opacity: 0.6; font-size: 0.9em;">${postTime}</span>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.03); border-radius: 4px; margin-bottom: 10px;">
            <div style="white-space: pre-wrap;">${postText || '(No text - image post)'}</div>
            ${imageHtml}
          </div>
          <div style="display: flex; gap: 20px; font-size: 0.9em; opacity: 0.8;">
            <span>❤️ ${postLikes}</span>
            <span>🔁 ${postReposts}</span>
            <span>💬 ${totalReplyCount}</span>
          </div>
        </div>

        <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px; margin-bottom: 10px;">
          <strong>Reply Analysis:</strong><br/>
          Total replies found: ${totalReplyCount}<br/>
          Replies with votes: ${voteDetails.length}<br/>
          ${voteBreakdown ? `<strong>Vote counts:</strong> ${voteBreakdown}` : ''}
        </div>
      `

      // Collect ALL replies for debugging
      const allReplies: Array<{author: string, likes: number, text: string}> = []
      const collectAllReplies = (replies: any[]) => {
        replies.forEach(reply => {
          if (reply.post) {
            const text = reply.post.record?.text || ''
            const author = reply.post.author?.handle || 'unknown'
            const likes = reply.post.likeCount || 0
            allReplies.push({ author, likes, text })
            if (reply.replies && reply.replies.length > 0) {
              collectAllReplies(reply.replies)
            }
          }
        })
      }
      collectAllReplies(replies)

      // Display individual replies
      if (totalReplyCount > 0) {
        // Sort all replies by likes
        const sortedReplies = allReplies.sort((a, b) => b.likes - a.likes)

        listDiv.innerHTML = `
          <div style="max-height: 500px; overflow-y: auto; padding: 15px; background: rgba(255,255,255,0.02); border-radius: 4px;">
            <h4 style="margin-bottom: 15px;">Replies (${totalReplyCount} total)</h4>
            ${sortedReplies.map((reply) => `
              <div style="margin: 10px 0; padding: 12px; background: rgba(255,255,255,0.04); border-radius: 6px; border-left: 3px solid ${reply.likes > 0 ? '#00bfff' : 'rgba(255,255,255,0.1)'};">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <span style="opacity: 0.9; font-weight: 500;">@${reply.author}</span>
                  <span style="opacity: 0.7; display: flex; gap: 10px;">
                    ${reply.likes > 0 ? `<span>❤️ ${reply.likes}</span>` : ''}
                  </span>
                </div>
                <div style="font-size: 0.95em; line-height: 1.5; white-space: pre-wrap;">${reply.text}</div>
              </div>
            `).join('')}
          </div>
        `
      } else {
        listDiv.innerHTML = '<div style="opacity: 0.7; padding: 20px; text-align: center;">No replies yet</div>'
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