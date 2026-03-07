#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ASH HACKATHON DEMO — 5 minutes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Cue card. Run each command manually. Comments = talking points.
#
# PREP:
#   - ash start (pre-running before you go on stage)
#   - Terminal font 18+, dark theme
#   - Close Slack, email, notifications
#   - Have demo/hackathon/presentation.html open in browser
#   - ANTHROPIC_API_KEY exported
#   - GEMINI_API_KEY exported (for image generation)
#   - npm install -g @ash-ai/cli
#   - npm install @ash-ai/sdk (for SDK demo)
#   - Browser ready to open files from sandbox
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ┌─────────────────────────────────────────────────────────┐
# │ SLIDES (45s) — 3 slides then "Demo"                    │
# │                                                         │
# │ Open demo/hackathon/presentation.html in browser.       │
# │ Arrow keys to navigate. 3 content slides + demo slide.  │
# └─────────────────────────────────────────────────────────┘

# ┌─────────────────────────────────────────────────────────┐
# │ 1. SHOW THE AGENT (30s)                                 │
# │                                                         │
# │ "An agent is just a folder. Let me show you what's      │
# │  inside."                                               │
# └─────────────────────────────────────────────────────────┘

# "An agent is just a folder with a CLAUDE.md — the system prompt."
cat ~/Projects/demo-agent/CLAUDE.md

# ┌─────────────────────────────────────────────────────────┐
# │ 2. DEPLOY + CREATE SESSION (30s)                        │
# │                                                         │
# │ "One command to deploy, one to create a session. The     │
# │  agent gets its own isolated sandbox — filesystem, code  │
# │  execution, web access, image generation. Every session  │
# │  is its own machine."                                    │
# └─────────────────────────────────────────────────────────┘

ash deploy ~/Projects/demo-agent --name assistant

ash session create assistant
# ^^^ Copy SESSION ID → $A

# ┌─────────────────────────────────────────────────────────┐
# │ 3. THE BIG TASK — research + presentation + images (2m) │
# │                                                         │
# │ "Let's give it a real task. Research a topic, generate   │
# │  images, and build a slide deck — all in one prompt."    │
# └─────────────────────────────────────────────────────────┘

ash session send $A "Research the latest breakthroughs in space exploration. Create a 4-slide HTML presentation about it with a dark theme and generated images for each slide. Make it a single self-contained file. Save it as presentation.html"

# ┌─────────────────────────────────────────────────────────┐
# │ 4. SHOW THE RESULT (30s)                                │
# │                                                         │
# │ "Let's see what it built."                               │
# └─────────────────────────────────────────────────────────┘

# List all files in the sandbox
ash session files $A

# Download and open the presentation
ash session exec $A "cat presentation.html" > /tmp/ash-demo-presentation.html
open /tmp/ash-demo-presentation.html

# "It searched the web, generated images, wrote code, and
#  produced a complete presentation — all in a sandbox."

# ┌─────────────────────────────────────────────────────────┐
# │ 5. TYPESCRIPT SDK WEB APP + CLOUD SWITCH (1 min)        │
# │                                                         │
# │ "Everything I did in the CLI, you can build into your    │
# │  own app. Here's a web app — single TypeScript file —    │
# │  that connects to Ash with the SDK."                     │
# └─────────────────────────────────────────────────────────┘

# Show the code (scroll through key parts: SDK init, send message, list files)
cat demo/hackathon/demo-app.ts

# Run it — opens a web UI at localhost:3000
npx tsx demo/hackathon/demo-app.ts
# Open http://localhost:3000 in browser
# The web app has: chat input, streaming responses, file browser with download buttons

# "See the URL at the top? localhost:4100 — that's local Ash.
#  To point at Ash Cloud instead:"

# Cloud:
#   ASH_URL=https://api.ash.computer npx tsx demo/hackathon/demo-app.ts

# "Same app. Same agent. One environment variable."

# ┌─────────────────────────────────────────────────────────┐
# │ 6. CLOSE (15s)                                          │
# │                                                         │
# │ "That's Ash. In one prompt, it searched the web,         │
# │  generated images with AI, wrote code, and built a       │
# │  presentation — all in an isolated sandbox.              │
# │                                                          │
# │  npm install @ash-ai/sdk. Open source. Come find me if   │
# │  you want help setting up for your project."             │
# └─────────────────────────────────────────────────────────┘

ash session end $A
# ash stop  (optional, leave running if people want to try it)
