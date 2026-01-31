import { BskyAgent } from '@atproto/api'
import { Post } from '../types'

export interface PostOptions {
  text: string
  imageBlob?: any
  imageAlt?: string
  imageDimensions?: { width: number; height: number }
  videoBlob?: any
  replyTo?: {
    root: { uri: string; cid: string }
    parent: { uri: string; cid: string }
  }
}

export interface PostResponse {
  uri: string
  cid: string
  url: string
}

export class BlueskyService {
  constructor(private getAgent: () => BskyAgent) {}

  async createPost(options: PostOptions): Promise<PostResponse> {
    const agent = this.getAgent()

    const postData: any = {
      text: options.text,
      createdAt: new Date().toISOString(),
    }

    // Add reply parameters if provided
    if (options.replyTo) {
      postData.reply = options.replyTo
    }

    // Add image or video embed if provided
    if (options.videoBlob) {
      postData.embed = {
        $type: 'app.bsky.embed.video',
        video: options.videoBlob,
      }
    } else if (options.imageBlob) {
      postData.embed = {
        $type: 'app.bsky.embed.images',
        images: [{
          alt: options.imageAlt || '',
          image: options.imageBlob,
          aspectRatio: options.imageDimensions || { width: 1, height: 1 },
        }],
      }
    }

    const response = await agent.post(postData)

    // Build the post URL
    const handle = agent.session?.handle || 'user'
    const postId = response.uri.split('/').pop()
    const url = `https://bsky.app/profile/${handle}/post/${postId}`

    return {
      uri: response.uri,
      cid: response.cid,
      url,
    }
  }

  async uploadImage(blob: Blob): Promise<any> {
    const agent = this.getAgent()
    const response = await agent.uploadBlob(blob, {
      encoding: blob.type || 'image/png',
    })
    return response.data.blob
  }

  async uploadVideo(blob: Blob): Promise<any> {
    const agent = this.getAgent()
    const response = await agent.uploadBlob(blob, {
      encoding: 'video/mp4',
    })
    return response.data.blob
  }

  async getPostThread(uri: string, depth: number = 1): Promise<any> {
    const agent = this.getAgent()
    return await agent.getPostThread({
      uri,
      depth,
    })
  }

  async getProfile(actor: string): Promise<any> {
    const agent = this.getAgent()
    return await agent.getProfile({ actor })
  }

  parsePostUrl(url: string): { handle: string; postId: string } | null {
    if (url.includes('bsky.app/profile/')) {
      const match = url.match(/profile\/([^/]+)\/post\/([^/?]+)/)
      if (match) {
        const [, handle, postId] = match
        return { handle, postId }
      }
    }
    return null
  }

  async resolveUrlToUri(url: string): Promise<string | null> {
    if (url.startsWith('at://')) {
      return url
    }

    const parsed = this.parsePostUrl(url)
    if (!parsed) return null

    try {
      const profile = await this.getProfile(parsed.handle)
      const did = profile.data.did
      return `at://${did}/app.bsky.feed.post/${parsed.postId}`
    } catch (e) {
      // Fallback to using handle directly
      return `at://${parsed.handle}/app.bsky.feed.post/${parsed.postId}`
    }
  }

  createPostFromResponse(response: PostResponse, text: string, author: any, replyTo?: any): Post {
    return {
      uri: response.uri,
      cid: response.cid,
      author: {
        did: author.did || '',
        handle: author.handle || '',
        displayName: author.displayName || author.handle || '',
      },
      record: {
        text,
        createdAt: new Date().toISOString(),
        reply: replyTo,
      },
      replyCount: 0,
      repostCount: 0,
      likeCount: 0,
      indexedAt: new Date().toISOString(),
    }
  }
}