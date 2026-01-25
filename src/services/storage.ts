import { AuthState, SceneData, ThreadState } from '../types'

export class StorageService {
  private readonly AUTH_KEY = 'botadventure_auth'
  private readonly SCENE_KEY = 'botadventure_scene'
  private readonly THREAD_KEY = 'botadventure_thread'

  // Auth State
  loadAuthState(): AuthState | null {
    const stored = localStorage.getItem(this.AUTH_KEY)
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch (e) {
        console.error('Failed to load auth state:', e)
      }
    }
    return null
  }

  saveAuthState(authState: AuthState | null): void {
    if (authState) {
      localStorage.setItem(this.AUTH_KEY, JSON.stringify(authState))
    } else {
      localStorage.removeItem(this.AUTH_KEY)
    }
  }

  clearAuthState(): void {
    localStorage.removeItem(this.AUTH_KEY)
  }

  // Scene Data
  loadSceneData(): SceneData | null {
    const stored = localStorage.getItem(this.SCENE_KEY)
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch (e) {
        console.error('Failed to load scene data:', e)
      }
    }
    return null
  }

  saveSceneData(data: SceneData): void {
    localStorage.setItem(this.SCENE_KEY, JSON.stringify(data))
  }

  clearSceneData(): void {
    localStorage.removeItem(this.SCENE_KEY)
  }

  // Thread State
  loadThreadState(): ThreadState | null {
    const stored = localStorage.getItem(this.THREAD_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        return {
          rootPost: data.rootPost || null,
          threadPath: data.threadPath || [],
          editingReplyTo: data.editingReplyTo || null,
          threadUrl: data.threadUrl
        }
      } catch (e) {
        console.error('Failed to load thread state:', e)
      }
    }
    return null
  }

  saveThreadState(state: ThreadState): void {
    localStorage.setItem(this.THREAD_KEY, JSON.stringify(state))
  }

  clearThreadState(): void {
    localStorage.removeItem(this.THREAD_KEY)
  }

  // Clear all data
  clearAll(): void {
    this.clearAuthState()
    this.clearSceneData()
    this.clearThreadState()
  }
}