import html2canvas from 'html2canvas'
import { ImageGenerationResult } from '../types'

export class ImageGeneratorService {
  async generateSceneImage(
    sceneText: string,
    choices: string[]
  ): Promise<ImageGenerationResult> {
    // Create a temporary container for rendering
    const container = document.createElement('div')
    container.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      width: 800px;
      padding: 60px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: system-ui, -apple-system, sans-serif;
      color: white;
    `

    // Add scene text
    const sceneDiv = document.createElement('div')
    sceneDiv.style.cssText = `
      font-size: 24px;
      line-height: 1.6;
      margin-bottom: ${choices.length > 0 ? '40px' : '0'};
      text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    `
    sceneDiv.textContent = sceneText
    container.appendChild(sceneDiv)

    // Add choices if any
    if (choices.length > 0) {
      const choicesDiv = document.createElement('div')
      choicesDiv.style.cssText = `
        border-top: 2px solid rgba(255,255,255,0.3);
        padding-top: 30px;
      `

      const choicesTitle = document.createElement('div')
      choicesTitle.style.cssText = `
        font-size: 18px;
        margin-bottom: 20px;
        opacity: 0.9;
        font-weight: 600;
      `
      choicesTitle.textContent = 'What do you do?'
      choicesDiv.appendChild(choicesTitle)

      choices.forEach(choice => {
        const choiceItem = document.createElement('div')
        choiceItem.style.cssText = `
          font-size: 20px;
          margin: 12px 0;
          padding: 12px 20px;
          background: rgba(255,255,255,0.1);
          border-radius: 8px;
          backdrop-filter: blur(10px);
        `
        choiceItem.textContent = choice
        choicesDiv.appendChild(choiceItem)
      })

      container.appendChild(choicesDiv)
    }

    // Add to document temporarily
    document.body.appendChild(container)

    try {
      // Generate the image
      const canvas = await html2canvas(container, {
        backgroundColor: null,
        scale: 2,
        logging: false,
      })

      // Get dimensions
      const width = canvas.width
      const height = canvas.height

      // Find the actual content bounds to minimize blank space
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, width, height)
        const bounds = this.findContentBounds(imageData)

        // Create a new canvas with cropped dimensions
        const croppedCanvas = document.createElement('canvas')
        const padding = 40 // Keep some padding
        croppedCanvas.width = bounds.width + (padding * 2)
        croppedCanvas.height = bounds.height + (padding * 2)

        const croppedCtx = croppedCanvas.getContext('2d')
        if (croppedCtx) {
          // Fill background
          croppedCtx.fillStyle = '#667eea'
          croppedCtx.fillRect(0, 0, croppedCanvas.width, croppedCanvas.height)

          // Draw the cropped image
          croppedCtx.drawImage(
            canvas,
            bounds.x - padding,
            bounds.y - padding,
            bounds.width + (padding * 2),
            bounds.height + (padding * 2),
            0,
            0,
            croppedCanvas.width,
            croppedCanvas.height
          )

          // Convert to blob
          return new Promise((resolve, reject) => {
            croppedCanvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve({
                    blob,
                    dimensions: {
                      width: croppedCanvas.width,
                      height: croppedCanvas.height,
                    },
                  })
                } else {
                  reject(new Error('Failed to create image blob'))
                }
              },
              'image/png',
              0.95
            )
          })
        }
      }

      // Fallback to uncropped canvas
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                blob,
                dimensions: { width, height },
              })
            } else {
              reject(new Error('Failed to create image blob'))
            }
          },
          'image/png',
          0.95
        )
      })
    } finally {
      // Clean up
      document.body.removeChild(container)
    }
  }

  private findContentBounds(imageData: ImageData): { x: number; y: number; width: number; height: number } {
    const { width, height, data } = imageData
    let minX = width, minY = height, maxX = 0, maxY = 0

    // Scan for non-transparent pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const alpha = data[idx + 3]

        // Check if pixel is not fully transparent
        if (alpha > 10) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    }
  }

  async generatePreviewElement(sceneText: string, choices: string[]): Promise<HTMLElement> {
    const previewDiv = document.createElement('div')
    previewDiv.className = 'scene-canvas'
    previewDiv.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      border-radius: 4px;
      font-size: 1.1rem;
      line-height: 1.6;
    `

    // Add scene text
    const sceneElement = document.createElement('div')
    sceneElement.textContent = sceneText
    previewDiv.appendChild(sceneElement)

    // Add choices if any
    if (choices.length > 0) {
      const choicesContainer = document.createElement('div')
      choicesContainer.className = 'scene-choices'
      choicesContainer.innerHTML = '<h3>What do you do?</h3>'

      choices.forEach(choice => {
        const choiceElement = document.createElement('div')
        choiceElement.className = 'choice-item'
        choiceElement.textContent = choice
        choicesContainer.appendChild(choiceElement)
      })

      previewDiv.appendChild(choicesContainer)
    }

    return previewDiv
  }
}