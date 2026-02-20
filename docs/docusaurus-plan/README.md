# Ash Docusaurus Documentation Plan

This folder contains the plan for building a Docusaurus documentation site for Ash.

## What This Is

A structured plan to turn Ash's existing `docs/` folder into a polished, navigable documentation site. Each file in this folder describes a section of the site: what pages it contains, what content goes on each page, and what source material already exists.

## Plan Files

| File | Section | Description |
|------|---------|-------------|
| [00-site-structure.md](00-site-structure.md) | Site Architecture | Information architecture, navigation, Docusaurus config |
| [01-getting-started.md](01-getting-started.md) | Getting Started | Installation, quickstart, first agent |
| [02-concepts.md](02-concepts.md) | Core Concepts | Agents, sessions, sandboxes, bridge protocol |
| [03-guides.md](03-guides.md) | Guides | Task-oriented how-to guides |
| [04-api-reference.md](04-api-reference.md) | API Reference | REST endpoints, SSE streaming, request/response schemas |
| [05-cli-reference.md](05-cli-reference.md) | CLI Reference | All `ash` commands |
| [06-sdks.md](06-sdks.md) | SDKs | TypeScript and Python SDK documentation |
| [07-architecture.md](07-architecture.md) | Architecture | System design, internals, protocol details |
| [08-self-hosting.md](08-self-hosting.md) | Self-Hosting | Docker, EC2, GCE deployment guides |
| [09-contributing.md](09-contributing.md) | Contributing | Dev setup, testing, project structure |
| [10-docusaurus-setup.md](10-docusaurus-setup.md) | Technical Setup | Docusaurus config, theme, plugins, build |

## Existing Source Material

Most content already exists in `docs/`. The work is restructuring, expanding for a public audience, and filling gaps:

- `docs/getting-started.md` - Quickstart (exists)
- `docs/architecture.md` - Architecture (exists)
- `docs/cli-reference.md` - CLI reference (exists)
- `docs/api-reference.md` - API reference (exists)
- `docs/features/*.md` - 10 feature docs (exist)
- `docs/decisions/*.md` - Design decision records (exist)
- `docs/guides/*.md` - Deployment guides (exist)
- `docs/benchmarks/*.md` - Performance data (exist)
- `README.md` - Project overview (exists)
- `CONTRIBUTING.md` - Dev setup (exists)

## Principles

1. **Don't rewrite what exists.** Migrate existing docs, fill gaps.
2. **User-first navigation.** Organize by what users want to do, not by internal structure.
3. **Progressive disclosure.** Getting Started is simple. Architecture is deep. Users choose their depth.
4. **Keep it maintainable.** Auto-generate what we can (OpenAPI, CLI help, type docs).
