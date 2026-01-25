/**
 * Parse basic markdown formatting and return HTML
 * Supports: **bold**, *italic*, paragraphs, line breaks
 */
export function parseMarkdownToHTML(text: string): string {
  // Split into paragraphs (separated by blank lines)
  const paragraphs = text.split(/\n\s*\n/)

  // Process each paragraph
  const processedParagraphs = paragraphs.map(paragraph => {
    // Within each paragraph, preserve single line breaks
    let html = paragraph.split('\n').join('<br>')

    // Parse bold text (** or __)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')

    // Parse italic text (* or _) - but not if it's part of bold
    // Use negative lookbehind and lookahead to avoid matching * that's part of **
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')

    return html
  })

  // Join paragraphs with proper spacing
  return processedParagraphs.filter(p => p.trim()).join('<br><br>')
}

/**
 * Strip markdown formatting and return plain text for alt text
 */
export function stripMarkdown(text: string): string {
  // Remove bold markers
  let plainText = text.replace(/\*\*(.+?)\*\*/g, '$1')
  plainText = plainText.replace(/__(.+?)__/g, '$1')

  // Remove italic markers
  plainText = plainText.replace(/\*(.+?)\*/g, '$1')
  plainText = plainText.replace(/_(.+?)_/g, '$1')

  return plainText
}

/**
 * Parse markdown for a list of choices
 */
export function parseChoicesMarkdown(choices: string[]): { html: string; plain: string }[] {
  return choices.map(choice => ({
    html: parseMarkdownToHTML(choice),
    plain: stripMarkdown(choice)
  }))
}