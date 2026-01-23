export class ThemeService {
  private readonly THEME_KEY = 'botadventure-theme';
  private currentTheme: 'light' | 'dark' = 'dark';

  constructor() {
    this.loadTheme();
    this.setupThemeToggle();
  }

  private loadTheme(): void {
    // Check localStorage first
    const savedTheme = localStorage.getItem(this.THEME_KEY) as 'light' | 'dark' | null;

    if (savedTheme) {
      this.currentTheme = savedTheme;
    } else {
      // Default to system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.currentTheme = prefersDark ? 'dark' : 'light';
    }

    this.applyTheme();
  }

  private applyTheme(): void {
    if (this.currentTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  private setupThemeToggle(): void {
    // Create toggle button
    const toggleButton = document.createElement('button');
    toggleButton.className = 'theme-toggle';
    toggleButton.setAttribute('aria-label', 'Toggle theme');
    toggleButton.textContent = this.getEmojiForTheme(this.currentTheme);

    // Add to DOM
    document.body.appendChild(toggleButton);

    // Add event listener
    toggleButton.addEventListener('click', () => {
      this.toggleTheme();
      toggleButton.textContent = this.getEmojiForTheme(this.currentTheme);
    });
  }

  private toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(this.THEME_KEY, this.currentTheme);
    this.applyTheme();
  }

  private getEmojiForTheme(theme: 'light' | 'dark'): string {
    // Show the opposite emoji to indicate what clicking will switch to
    if (theme === 'dark') {
      return '☀️'; // Sun emoji - click to switch to light mode
    } else {
      return '🌙'; // Moon emoji - click to switch to dark mode
    }
  }

  public getTheme(): 'light' | 'dark' {
    return this.currentTheme;
  }
}