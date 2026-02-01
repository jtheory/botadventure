# Claude Code Instructions

## Project Overview

Building a Bluesky-based CYOA (Choose Your Own Adventure) game interface.

### First Iteration Goals
- Author sign-in with Bluesky credentials (localStorage)
- Post single text posts (with char limit enforcement)
- Post text as images with alt text for longer content
- Basic scene authoring UI

### Architecture
- Client-side tool initially (Vite + TypeScript)
- Text-to-image conversion for scene posts
- Direct Bluesky API integration
- Future: Netlify Functions for automation

## Important Rules

- **NEVER commit changes unless explicitly asked** - Always let the user test first before committing
- Only create git commits when the user specifically requests it

## Current Focus

Building the minimal viable author tool for manually posting CYOA scenes to Bluesky.