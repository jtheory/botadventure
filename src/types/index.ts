export interface AuthState {
  handle: string
  appPassword: string
  session?: any
}

export interface Post {
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

export interface ThreadNode {
  post: Post
  replies?: Post[]
  depth: number
}

export interface SceneData {
  postText: string
  imageText: string
  choices: string
  backgroundImage?: string // Base64 data URL of the background image
  backgroundImageName?: string // Original filename for reference
}

export interface ThreadState {
  rootPost: Post | null
  threadPath: ThreadNode[]
  editingReplyTo: Post | null
  threadUrl?: string
}

export interface ImageGenerationResult {
  blob: Blob
  dimensions: {
    width: number
    height: number
  }
}