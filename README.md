# FounderOS

[![Tests](https://github.com/DigitalMikeyAI/FounderOS/actions/workflows/test.yml/badge.svg)](https://github.com/DigitalMikeyAI/FounderOS/actions/workflows/test.yml)

FounderOS is a local-first mission, reflection, and evidence system designed to help a founder turn real work into clearer next actions and durable learning.

## What FounderOS Is

FounderOS is a browser-based application organized around a "Commander"—the person using the system. It provides mission planning, field reporting, progress review, and an assistant named Archie. The application records what the Commander actually reports, separates those facts from interpretation, and leaves identity decisions with the Commander.

FounderOS currently runs as a static web application: there is no compilation step, application server, or package dependency required to open it.

## Current Status

FounderOS is under active development and is not presented as production-ready software. Phase 6 of the sales capability expansion is complete on the current development branch. The repository has broad automated coverage for mission behavior, persistence, evidence boundaries, and Profile authority.

## Core Principles

- **Commander authority:** FounderOS can recommend and reflect, but the Commander makes mission and identity decisions.
- **Recorded evidence:** Capability evidence must come from recorded interactions, not guesses or persuasive wording.
- **Mission/evidence separation:** Completing or archiving a mission does not manufacture evidence.
- **Explicit identity adoption:** A capability enters the Profile only through an explicit Commander decision.
- **Persistence integrity:** Saved state, migrations, and reload behavior must remain deterministic and truthful.

## Design Philosophy

FounderOS's original product philosophy, Commander experience, and Mission Control principles are preserved in the [FounderOS Design Manifesto](docs/FOUNDEROS_DESIGN_MANIFESTO.md).

## Sales Capability System

The canonical `camping.sales` domain contains six competencies:

- Rapport
- Discovery
- Product Selection
- Presentation
- Objection Handling
- Trial Close

These labels are exact domain vocabulary. FounderOS does not infer them from loose aliases or unrelated prose.

## Product Preview

A documentation-ready screenshot of the running FounderOS interface is not currently stored in the repository. Existing files under `assets/branding/` are logos, backgrounds, and visual references rather than screenshots of the actual application.

TODO: Add a real, current FounderOS interface screenshot to `docs/images/` after it has been captured and explicitly approved for repository use.

## Architecture

FounderOS keeps major responsibilities separated:

- **Mission lifecycle:** Mission selection, preview, acceptance, objective progress, and archive behavior.
- **Field Reports:** Commander-recorded interaction details and structured sales outcomes.
- **Mission Intelligence:** Read-only interpretation of mission and report state.
- **Evidence ladder:** Reviewed signals and recurring patterns built from traceable source records.
- **Profile authority:** Explicit Commander decisions about which supported capabilities belong in the current Profile.
- **Persistence:** Browser storage, normalization, and one-time migration of saved state.

The browser pages load plain JavaScript modules from `js/`, `systems/`, and `modules/`. Automated tests use Node's built-in test runner and lightweight browser-like harnesses.

## Running FounderOS

FounderOS should be served over local HTTP so the browser loads every script and asset consistently.

1. Open the repository folder in Visual Studio Code.
2. Install the Live Server extension if it is not already available.
3. Open `index.html` with Live Server.
4. Visit `http://localhost:5502/` if the browser does not open automatically.

The repository's VS Code settings configure Live Server to use port `5502`. Another static HTTP server may be used, but no build command is required.

## Running Tests

Install Node.js 20 or newer, then run the complete test suite from the repository root:

```powershell
npm test
```

The package script runs the existing canonical command directly:

```powershell
node --test
```

There are no runtime or test package dependencies to install.

## Repository Structure

| Path | Purpose |
| --- | --- |
| `index.html` | Dashboard, Field Report, and read-only mission summary |
| `missions.html` | Full mission-management surface |
| `progress.html` | Progress, review, and mission history |
| `js/` | Browser behavior, controllers, widgets, and application coordination |
| `systems/` | Mission, intelligence, guidance, memory, and communication boundaries |
| `modules/` | Domain modules and module loading |
| `tests/` | Node-based behavioral and regression tests |
| `docs/` | Architecture, capability, schema, and product documentation |
| `assets/branding/` | Logos, backgrounds, and visual reference assets |
| `knowledge/` | Domain knowledge used by FounderOS |

## Development Status and Roadmap

Phase 6 establishes the current sales capability workflow and consolidates mission-objective completion into one authoritative store. Future work should follow the repository's existing architecture and capability documents; this README does not establish new phase commitments.

## Contributing

- Keep each change narrowly scoped and explain the behavior it affects.
- Run `npm test` before requesting review.
- Preserve Commander authority and the boundaries between missions, evidence, and Profile identity.
- Add regression tests for behavior changes.
- Do not commit local-only formatting or line-ending noise.
