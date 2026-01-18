# Claude Code Instructions

This project uses **bd** (beads) for issue tracking. Please use it to track development tasks.

## Beads Commands

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
bd add                # Create a new issue
bd list               # List all issues
```

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

## Development Workflow

1. Use `bd add` to create issues for new tasks
2. Mark issues as in_progress when starting work
3. Close issues when completing tasks
4. Keep git and beads in sync with `bd sync`

## Current Focus

Building the minimal viable author tool for manually posting CYOA scenes to Bluesky.