import { BskyAgent } from '@atproto/api'
import { AuthState } from '../types'
import { StorageService } from './storage'

export class AuthService {
  private agent: BskyAgent
  private authState: AuthState | null = null
  private isAuthenticated = false

  constructor(
    private storage: StorageService,
    private onAuthChange?: (authenticated: boolean, handle?: string) => void
  ) {
    this.agent = new BskyAgent({
      service: 'https://bsky.social',
    })

    // Load saved auth state
    this.authState = this.storage.loadAuthState()
  }

  getAgent(): BskyAgent {
    return this.agent
  }

  getAuthState(): AuthState | null {
    return this.authState
  }

  isUserAuthenticated(): boolean {
    return this.isAuthenticated
  }

  async login(handle: string, appPassword: string): Promise<string> {
    try {
      const response = await this.agent.login({
        identifier: handle,
        password: appPassword,
      })

      // Get the actual handle from the session (in case original was email)
      const actualHandle = this.agent.session?.handle || handle

      // Save auth state
      this.authState = {
        handle: actualHandle,
        appPassword: appPassword,
        session: response,
      }
      this.storage.saveAuthState(this.authState)
      this.isAuthenticated = true

      if (this.onAuthChange) {
        this.onAuthChange(true, actualHandle)
      }

      return actualHandle
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    }
  }

  async restoreSession(): Promise<string | null> {
    if (!this.authState) return null

    try {
      await this.agent.login({
        identifier: this.authState.handle,
        password: this.authState.appPassword,
      })

      // Get the actual handle from the session
      const actualHandle = this.agent.session?.handle || this.authState.handle
      this.authState.handle = actualHandle
      this.storage.saveAuthState(this.authState)
      this.isAuthenticated = true

      if (this.onAuthChange) {
        this.onAuthChange(true, actualHandle)
      }

      return actualHandle
    } catch (error) {
      console.error('Session restoration failed:', error)
      // Clear invalid auth state
      this.logout()
      return null
    }
  }

  logout(): void {
    this.authState = null
    this.isAuthenticated = false
    this.storage.clearAuthState()

    if (this.onAuthChange) {
      this.onAuthChange(false)
    }
  }
}