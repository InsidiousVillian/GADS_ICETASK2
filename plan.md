# Development Plan

## Overview

This document outlines a **three-day development schedule** for building the “Controls Not Included” prototype.  
It focuses on getting a playable core loop quickly, then layering in rule-breaking mechanics, character expression, and polish that support the **“uhm, nope, what”** theme.

## Features

- **Day-Based Milestones**: Clear goals for Day 1 (core loop), Day 2 (mechanics/content), and Day 3 (polish & submission).
- **Core Mechanics First**: Early focus on player movement, room structure, and the first rule-change.
- **Expandable Rule-Change Library**: Plan to add multiple mechanics that subvert expectations (controls, gravity, doors, UI).
- **Character & Feedback Polish**: Time reserved for visuals, animations, and “Simulation Updated” messaging that reinforce the confused test subject character.
- **Documentation & Logging**: Explicit requirement to keep markdown docs and `refinement-changes.md` in sync with the codebase.

## How It Works

- **Day 1 – Ideation & Core Loop**
  - Set up project folder and (optionally) Git repo.
  - Implement basic player movement in JavaScript (matching the high concept’s character).
  - Create a single test chamber with one working door.
  - Implement the **first rule-change mechanic** (e.g., reversed controls after reaching the door once).
  - Begin tracking all AI-assisted or major design/code decisions in `refinement-changes.md`.

- **Day 2 – Prototype Expansion**
  - Add **3–5 additional rule-change mechanics** (e.g., gravity flips, lying prompts, time-lagged inputs).
  - Add placeholder art (CSS shapes or canvas) representing the character, doors, and room geometry.
  - Integrate simple sound/music (e.g., using Soundraw or similar source).
  - Optionally replace placeholder visuals with higher-fidelity assets (e.g., Meshy exports) if time allows.
  - Continue documenting changes and decisions as systems evolve.

- **Day 3 – Polish & Submission**
  - Refine visuals and character animations so the avatar feels more like a **confused but persistent test subject**.
  - Add UI feedback such as “Simulation Updated” popups or glitchy overlays when rules change.
  - Playtest and adjust difficulty to keep “confusion” fun rather than frustrating.
  - Record a 2–5 minute video demo showcasing the core loop and the best “uhm, nope, what” moments.
  - Finalize repository structure and ensure all documentation (including `HighConcept.md` and `refinement-changes.md`) is current.

## Usage

- **For developers**:
  - Use this plan as a **checklist** during the jam or build period.  
  - Adjust specific tasks as needed, but keep the three-phase structure: **core → expand → polish**.
- **For collaborators**:
  - Use the day breakdown to coordinate roles (e.g., programmer focuses on mechanics Day 1–2, artist/sound handles polish Day 2–3).
- **For future iterations**:
  - Treat this as a baseline sprint template when expanding the prototype into a larger game.

## Controls

Not directly applicable to this planning document; see `HighConcept.md` for the current control scheme and how it is intentionally subverted in-game.

## Files Involved

- `plan.md` – this development schedule.  
- `HighConcept.md` – defines the game’s theme, character, and core experience.  
- `refinement-changes.md` – running log of documentation and feature refinements (to be maintained alongside this plan).

## Notes

- This plan is intentionally **aggressive but focused**; if time becomes tight, prioritize:  
  1. A single polished core loop (one or two excellent rule flips).  
  2. Strong character expression (animations, feedback) that sell the theme.  
  3. Clear documentation and a stable build over additional unpolished mechanics.
- Whenever systems or priorities change during implementation, update `plan.md` and `refinement-changes.md` so they remain accurate.
