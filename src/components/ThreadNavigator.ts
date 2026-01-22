import { Post, ThreadNode } from '../types'

export interface ThreadNavigatorCallbacks {
  onPostSelect: (post: Post) => void
  onReplyTo: (post: Post) => void
  onPathReset: (pathIndex: number, post: Post) => void
}

export class ThreadNavigator {
  private container: HTMLElement | null = null

  constructor(
    private callbacks: ThreadNavigatorCallbacks
  ) {}

  render(threadPath: ThreadNode[], editingReplyTo: Post | null): void {
    const threadView = document.getElementById('thread-view')
    if (!threadView) return

    threadView.innerHTML = ''
    this.container = threadView

    // Show each post in the thread path with inverted tree
    threadPath.forEach((node, index) => {
      const postContainer = this.createPostContainer(
        node,
        index,
        index === threadPath.length - 1,
        threadPath
      )
      threadView.appendChild(postContainer)
    })

    // Update editor context for the last post
    if (threadPath.length > 0 && editingReplyTo) {
      this.updateEditorContext(editingReplyTo)
    }
  }

  private createPostContainer(
    node: ThreadNode,
    index: number,
    isCurrent: boolean,
    threadPath: ThreadNode[]
  ): HTMLElement {
    const postContainer = document.createElement('div')
    postContainer.className = 'thread-post-container'

    // Add the main post
    const postElement = this.createPostElement(node.post, isCurrent, index)
    postContainer.appendChild(postElement)

    // Show replies and editor connection for current post
    if (isCurrent) {
      const treeContainer = this.createCurrentPostTree(node)
      if (treeContainer) {
        postContainer.appendChild(treeContainer)
      }
    } else if (index < threadPath.length - 1) {
      // Show non-selected reply stubs alongside the selected path
      const treeContainer = this.createNonCurrentPostTree(
        node,
        index,
        threadPath[index + 1].post
      )
      if (treeContainer) {
        postContainer.appendChild(treeContainer)
      }
    }

    return postContainer
  }

  private createPostElement(post: Post, isCurrent: boolean, pathIndex: number): HTMLElement {
    const postDiv = document.createElement('div')
    postDiv.className = 'post-item' + (isCurrent ? ' current' : '')

    // Make non-current posts clickable to reset the path
    if (!isCurrent && pathIndex >= 0) {
      postDiv.style.cursor = 'pointer'
      postDiv.addEventListener('click', () => {
        this.callbacks.onPathReset(pathIndex, post)
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

  private createCurrentPostTree(node: ThreadNode): HTMLElement | null {
    if (!node.replies || node.replies.length === 0) {
      return this.createEditorOnlyBranch()
    }

    const treeContainer = document.createElement('div')
    treeContainer.className = 'inverted-tree'

    const branchContainer = document.createElement('div')
    branchContainer.className = 'branch-container'

    // Add existing replies as stubs
    node.replies.forEach((reply) => {
      const replyCard = this.createReplyCard(reply, false)
      branchContainer.appendChild(replyCard)
    })

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

    return treeContainer
  }

  private createNonCurrentPostTree(
    node: ThreadNode,
    nodeIndex: number,
    selectedReply: Post
  ): HTMLElement | null {
    if (!node.replies || node.replies.length === 0) {
      return null
    }

    const treeContainer = document.createElement('div')
    treeContainer.className = 'inverted-tree'

    const branchContainer = document.createElement('div')
    branchContainer.className = 'branch-container'

    // Show all replies
    node.replies.forEach((reply) => {
      const isSelected = reply.uri === selectedReply.uri

      if (!isSelected) {
        // Show as stub
        const replyCard = this.createReplyCard(reply, false, () => {
          // Reset path to this node and select the different reply
          this.callbacks.onPathReset(nodeIndex, node.post)
          setTimeout(() => this.callbacks.onPostSelect(reply), 50)
        })
        branchContainer.appendChild(replyCard)
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

    treeContainer.appendChild(branchContainer)
    return treeContainer
  }

  private createEditorOnlyBranch(): HTMLElement {
    const treeContainer = document.createElement('div')
    treeContainer.className = 'inverted-tree'

    const branchContainer = document.createElement('div')
    branchContainer.className = 'branch-container'

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

    return treeContainer
  }

  private createReplyCard(
    reply: Post,
    isSelected: boolean,
    onClick?: () => void
  ): HTMLElement {
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
    replyCard.addEventListener('click', onClick || (() => this.callbacks.onPostSelect(reply)))

    // Create tree line
    const treeLine = document.createElement('div')
    treeLine.className = 'tree-line' + (isSelected ? ' selected' : '')

    // Create card with line
    const cardWithLine = document.createElement('div')
    cardWithLine.className = 'card-with-line'
    cardWithLine.appendChild(treeLine)
    cardWithLine.appendChild(replyCard)

    return cardWithLine
  }

  private updateEditorContext(post: Post): void {
    const editorTitle = document.getElementById('editor-title')
    const replyingToDiv = document.getElementById('replying-to')
    const replyingToText = document.getElementById('replying-to-text')

    if (editorTitle) editorTitle.textContent = 'Create Reply'
    if (replyingToDiv) replyingToDiv.style.display = 'block'
    if (replyingToText) {
      replyingToText.textContent = post.record.text.substring(0, 100) +
        (post.record.text.length > 100 ? '...' : '')
    }
  }

  clear(): void {
    if (this.container) {
      this.container.innerHTML = ''
    }
  }
}