# Controls Not Included

## Overview

An experimental puzzle/comedy game where **nothing behaves quite the way you expect**.  
You play as a confused test subject dropped into a sterile simulation chamber run by an overconfident system that keeps “updating” the rules mid‑experiment.  
Rooms, doors, UI prompts, and even your own body controls will regularly flip from “oh, okay” to **“uhm, nope, what?”**.

The player character is intentionally understated visually (simple silhouette or lab jumpsuit), but with **exaggerated, slightly clumsy animations** and delayed reactions, reinforcing that they are constantly one step behind the simulation’s nonsense.

## Features

- **Rule-Breaking Test Chambers**: Each room teaches a mechanic, then undercuts it a moment later.
- **Shifting Controls**: Movement, jump, and interaction bindings may remap, invert, or lie in the UI.
- **Sarcastic Simulation Voice/UI**: Text prompts that confidently explain things… that immediately stop being true.
- **Confused Test Subject Character**: A small, readable avatar that stumbles, double-takes, and visually “hesitates” when rules change.
- **Glitch-Driven Visual Comedy**: UI flickers, fake error messages, and geometry that behaves “almost” correctly.
- **Short, Replayable Runs**: Designed for quick sessions and repeated “did it just do that?” moments.

## How It Works

- The game is organized into **discrete test chambers**.  
  - Each chamber introduces a clear rule (e.g., “WASD to move right/left”).  
  - Once the player starts to rely on that rule, the simulation flips it (e.g., controls invert, or only work when you *don’t* press them).
- The **simulation system** tracks player actions and triggers “updates” after specific events (reaching a door, standing still too long, abusing a mechanic, etc.).
- The **player character** is rendered as a simple, expressive figure:  
  - Idle animations show them fidgeting, looking around like “this seems wrong.”  
  - When rules change, a short “stagger” or head-tilt animation sells the “uhm, nope, what” moment.
- Core loop per chamber:  
  1. Enter chamber and read apparently straightforward instructions.  
  2. Attempt to obey the rules using normal game instincts.  
  3. Experience a rule flip, visual glitch, or UI contradiction.  
  4. Experiment, adapt, and escape the room despite the simulation’s trolling.

## Usage

- **For designers**:  
  - Use this document as the **high-level reference** for tone, theme, and player experience.  
  - When creating a new room, ensure it:  
    - Teaches one expectation clearly.  
    - Breaks that expectation in a way that feels playful, not unfair.
- **For artists**:  
  - Keep the character **simple but expressive**. Big silhouettes, small details.  
  - Prioritize animations that communicate “confusion, doubt, and delayed understanding” over coolness.
- **For programmers**:  
  - Implement mechanics so that they **intentionally subvert familiar patterns** (e.g., fake tutorials, unreliable prompts).  
  - Always ask “where is the ‘uhm, nope, what’ beat in this room?”

## Controls

Baseline control scheme (before the simulation starts lying):

- **Movement**: `WASD` or arrow keys  
- **Jump**: `Space`  
- **Interact / Use**: `E` or `Enter`  
- **Restart Room**: `R`  

Note: In keeping with the theme, **controls may invert, rotate, randomize, or visibly mislabel themselves** in later chambers. Any such change must be:

- Telegraphable (audio/visual cue, character stumble, or UI glitch).  
- Learnable (player can eventually understand and master the new pattern).  
- Reversible or resettable between chambers so confusion remains fun, not frustrating.

## Files Involved

Current design documentation:

- `HighConcept.md` – this document, defining theme, character, and overall experience.  
- `plan.md` – development plan outlining day-by-day implementation.

Gameplay implementation files (planned, names may change as code is added):

- Main game script (JavaScript/TypeScript) handling player movement, controls, and rule changes.  
- Scene/room configuration file(s) defining chamber layouts and triggers.  
- UI script for prompts, “Simulation Updated” messages, and glitches.  
- Art/asset folders for character sprite/mesh, room geometry, and VFX.

## Notes

- **Tone balance**: The game should feel **cleverly annoying**, not cruel. If a mechanic feels like pure trolling, add clearer feedback or a faster reset.  
- **Character readability**: Even though the avatar is stylized and minimal, their reactions (stumbles, hesitations) are key to selling the “uhm, nope, what” moments.  
- **Accessibility**: Do not rely solely on sudden control flips for difficulty; provide visual/audio warnings and consider an option to reduce extreme randomness.  
- **Performance**: Visual “glitches” should be artistically faked, not implemented as real instability that hurts framerate or input responsiveness.
