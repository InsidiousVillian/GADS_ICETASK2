/**
 * Room Escape - Browser game with rounds, random rooms, and lethal obstacles
 * Canvas: 800x600, target ~60fps via requestAnimationFrame
 * WASD movement, R toggles reversed controls, reach the door to win.
 * AI-generated sprites used for player, door, floor, wall, and obstacle.
 */

// ========== Canvas and context ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ========== Constants (room, player, door) ==========
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Room (play area) - inner rectangle; walls + HUD are outside this.
// Performance/UI note:
// We intentionally reserve a taller TOP padding so tutorial speech bubbles and
// other UI can live OUTSIDE the arena (no overlap with tiles or gameplay).
const ROOM_PADDING_X = 40;
const ROOM_PADDING_TOP = 120;     // HUD area (tutorial bubble lives here)
const ROOM_PADDING_BOTTOM = 40;

const ROOM_LEFT = ROOM_PADDING_X;
const ROOM_TOP = ROOM_PADDING_TOP;
const ROOM_WIDTH = CANVAS_WIDTH - ROOM_PADDING_X * 2;
const ROOM_HEIGHT = CANVAS_HEIGHT - ROOM_PADDING_TOP - ROOM_PADDING_BOTTOM;

// Door appearance delay to prevent camping at the starting position.
// The door will NOT be drawn for the first 3 seconds of each round.
const DOOR_APPEAR_DELAY_MS = 3000;

// Player
const PLAYER_SIZE = 32;  // Updated to match sprite size
const PLAYER_SPEED = 4;
// Speed modifier applied by round-specific rule changes (e.g. slow-mo / hyper-speed).
// Always multiplied into PLAYER_SPEED when computing movement.
let playerSpeedMultiplier = 1;

// Door (exit) - size will match sprite
const DOOR_WIDTH = 60;
const DOOR_HEIGHT = 80;

// Wall thickness
const WALL_THICKNESS = 20;

// Obstacle size range (for random generation)
const OBSTACLE_MIN_WIDTH = 80;
const OBSTACLE_MAX_WIDTH = 140;
const OBSTACLE_MIN_HEIGHT = 80;
const OBSTACLE_MAX_HEIGHT = 120;

// Obstacle movement speed (slow drift to gently force player movement).
// Each obstacle gets a random speed in the range [OBSTACLE_BASE_SPEED, OBSTACLE_BASE_SPEED + OBSTACLE_SPEED_VARIATION].
const OBSTACLE_BASE_SPEED = 0.4;
const OBSTACLE_SPEED_VARIATION = 0.4;
// Occasional obstacle "teleport" to amplify the "Uhm… nope" chaos.
// Each frame, each obstacle has a small chance to blink to a new position.
const OBSTACLE_TELEPORT_CHANCE_PER_SECOND = 0.08; // ~8% chance per second

// Auto-toggle reversed controls: random interval between 3 and 6 seconds (in ms)
// Faster toggling ensures players experience reversed controls more frequently
const AUTO_REVERSE_MIN_MS = 3000;
const AUTO_REVERSE_MAX_MS = 6000;

/** Returns a random number of ms between AUTO_REVERSE_MIN_MS and AUTO_REVERSE_MAX_MS */
function getNextAutoReverseDelay() {
  return AUTO_REVERSE_MIN_MS + Math.random() * (AUTO_REVERSE_MAX_MS - AUTO_REVERSE_MIN_MS);
}

// Round completion: player must survive at least 5-10 seconds before door opens
// This ensures reversed controls toggle at least once per round
const MIN_SURVIVAL_TIME_MS = 5000;
const MAX_SURVIVAL_TIME_MS = 10000;

// ========== AI-generated sprite images ==========
// These sprites are AI-generated 2D minimalist game sprites with transparent backgrounds
const sprites = {
  player: new Image(),
  door: new Image(),
  floor: new Image(),
  wall: new Image(),
  obstacle: new Image()
};

// Load AI-generated sprites
sprites.player.src = 'assets/player.png';
sprites.door.src = 'assets/door.png';
sprites.floor.src = 'assets/floor.png';
sprites.wall.src = 'assets/wall.png';
sprites.obstacle.src = 'assets/obstacle.png';

// Track sprite loading
let spritesLoaded = 0;
let spritesReady = false;
const totalSprites = Object.keys(sprites).length;

function onSpriteLoad() {
  spritesLoaded++;
  if (spritesLoaded === totalSprites) {
    spritesReady = true;
    // All sprites loaded, start game
    initGame();
  }
}

// Set up load handlers for all sprites
Object.values(sprites).forEach(img => {
  img.onload = onSpriteLoad;
  img.onerror = () => {
    console.warn('Sprite failed to load, using fallback rendering');
    onSpriteLoad(); // Continue anyway, will use fallback rendering
  };
});

// ========== Game state ==========
let currentRound = 1;
let playerX = 0;
let playerY = 0;
let doorX = 0;
let doorY = 0;
// Obstacles now include movement and behavior flags:
// { x, y, width, height, vx, vy, zigzagPhase }
let obstacles = [];
// Fake doors / decoy exits that visually resemble exits but simply reset the player.
// Each decoy portal is a simple AABB with an effect type:
// { x, y, width, height, effect: 'teleport' | 'shield' }.
let fakeDoors = [];
// Remember the player's spawn position so fake doors can reset the player cleanly.
let playerStartX = 0;
let playerStartY = 0;
let reversedControls = false;
let gameWon = false;
let gameLost = false;
let doorUnlocked = false;  // Door only opens after survival time requirement

// Shield buff granted by some Decoy Portals.
// When active: the next obstacle collision destroys that obstacle and removes the shield.
let shieldActive = false;

// Pause state: when true, gameplay updates freeze but the current frame is still drawn.
let paused = false;
// Tracks when we entered pause so we can compensate timers on resume.
let pauseStartTime = 0;

// Round start time: tracks when current round began (for survival requirement)
let roundStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
let requiredSurvivalTime = MIN_SURVIVAL_TIME_MS + Math.random() * (MAX_SURVIVAL_TIME_MS - MIN_SURVIVAL_TIME_MS);

// Auto-toggle timer: when we last auto-toggled, and delay until next auto-toggle
let lastAutoReverseTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
let nextAutoReverseDelay = getNextAutoReverseDelay();

// Round rule variant: allows each round to briefly flip a core rule for the "Uhm… nope" vibe.
// Example rules:
//  - "none"        → normal play
//  - "flipY"       → vertically flips the world visually
//  - "slowPlayer"  → slows the player
//  - "fastPlayer"  → speeds the player up
let currentRoundRule = 'none';

// Tutorial flags for the early rounds.
//  - showingTutorial: whether the large speech-bubble style overlay should be drawn.
//  - tutorialMessage: the main line of text to show inside that bubble.
// These are only used for rounds 1 and 2 and are explicitly disabled afterwards.
let showingTutorial = true;
let tutorialMessage = '';

// Screen shake effect when hitting obstacles.
let screenShakeTime = 0;
let screenShakeIntensity = 0;

// Keys currently held (for smooth movement)
const keys = { w: false, a: false, s: false, d: false };

// ========== Round transition cleanup / timer safety ==========
// We keep a handle to the "advance to next round" timeout so we can cancel it
// if the player restarts quickly (or if the round is regenerated for any reason).
let nextRoundTimeoutId = null;

/**
 * Clears any pending "advance to next round" timer.
 * This prevents multiple timeouts from stacking up (memory + logic leak).
 */
function clearPendingRoundTransition() {
  if (nextRoundTimeoutId !== null) {
    clearTimeout(nextRoundTimeoutId);
    nextRoundTimeoutId = null;
  }
}

// ========== Simple audio feedback (optional) ==========
// Lightweight Web Audio beep used when reversed controls toggle (manual + auto).
let audioCtx = null;

/**
 * Plays a short beep to signal that reversed controls have toggled.
 * This is optional and will silently fail if the browser blocks audio.
 */
function playReverseToggleSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return; // Audio API not available

    if (!audioCtx) {
      // Lazy-init the audio context after first user interaction.
      audioCtx = new AudioContext();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    // Slightly harsh, game-y beep.
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);

    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
    gain.gain.linearRampToValueAtTime(0.0, now + 0.15);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  } catch (e) {
    // If anything goes wrong (autoplay restrictions, etc.), just skip the audio.
  }
}

/**
 * Plays a short beep for shield activation/deactivation.
 * Uses different pitches so the player can tell ON vs OFF.
 */
function playShieldSound(isActivating) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isActivating ? 660 : 220, now);

    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    gain.gain.linearRampToValueAtTime(0.0, now + (isActivating ? 0.22 : 0.14));

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + (isActivating ? 0.26 : 0.18));
  } catch (e) {
    // Audio is optional; silently ignore failures.
  }
}

// ========== Random room generation ==========
/**
 * Generates a new random room layout:
 * - Places door much further from start (creates longer path/corridor effect)
 * - Gradually scales obstacles: starts with 3, adds +1 obstacle every round
 * - Ensures obstacles are at least 100px away from player start and each other
 * - Randomizes obstacle positions and sizes
 */
function generateRandomRoom() {
  // ---- Memory / state cleanup for new rounds ----
  // Clear any pending timers from the previous round (e.g. win transition).
  clearPendingRoundTransition();

  // Reset game state
  gameWon = false;
  gameLost = false;
  doorUnlocked = false;
  reversedControls = false;
  shieldActive = false; // Shield never carries across rounds.
  paused = false;       // Ensure new rounds always start unpaused
  pauseStartTime = 0;   // Reset pause timing helper
  roundStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  requiredSurvivalTime = MIN_SURVIVAL_TIME_MS + Math.random() * (MAX_SURVIVAL_TIME_MS - MIN_SURVIVAL_TIME_MS);
  lastAutoReverseTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  nextAutoReverseDelay = getNextAutoReverseDelay();

  // Pick a round rule variant to subtly change expectations.
  // Rounds 1–2 are reserved for tutorial and stay mostly normal.
  if (currentRound === 1) {
    currentRoundRule = 'none';
    // Enable tutorial bubble for the very first round: explain basic movement.
    showingTutorial = true;
    tutorialMessage = 'Round 1: Use W A S D to move.';
  } else if (currentRound === 2) {
    currentRoundRule = 'none';
    // Enable tutorial bubble for the second round: explain the R key.
    showingTutorial = true;
    tutorialMessage = 'Round 2: Press R to toggle reversed controls.';
  } else {
    // From round 3 onward, the tutorial bubble is *never* shown.
    showingTutorial = false;
    tutorialMessage = '';
    // Randomly pick a playful rule tweak from round 3 onwards.
    const variants = ['none', 'flipY', 'slowPlayer', 'fastPlayer'];
    currentRoundRule = variants[Math.floor(Math.random() * variants.length)];
  }

  // Adjust player speed multiplier based on the rule.
  if (currentRoundRule === 'slowPlayer') {
    playerSpeedMultiplier = 0.6;
  } else if (currentRoundRule === 'fastPlayer') {
    playerSpeedMultiplier = 1.4;
  } else {
    playerSpeedMultiplier = 1;
  }

  // Player starts on the far left (much further left to create longer path)
  // Increased distance: start at very left edge, door at very right edge
  const startOffsetX = 20;  // Very close to left wall
  playerX = ROOM_LEFT + startOffsetX;
  playerY = ROOM_TOP + (ROOM_HEIGHT - PLAYER_SIZE) / 2;
  // Cache spawn so fake doors can snap the player back without side effects.
  playerStartX = playerX;
  playerStartY = playerY;

  // Door position: far right, creating a corridor-like path
  // Door is always on the right side, but vertical position varies
  const doorOffsetX = 15;  // Very close to right wall
  const doorOffsetY = Math.random() * (ROOM_HEIGHT - DOOR_HEIGHT - 40) + 20;  // Random vertical
  doorX = ROOM_LEFT + ROOM_WIDTH - DOOR_WIDTH - doorOffsetX;
  doorY = ROOM_TOP + doorOffsetY;

  // Clear any previous decoy exits; they will be regenerated each round.
  // Reuse the same array to reduce allocations / GC churn.
  fakeDoors.length = 0;

  // Generate obstacles: gradual scaling - starts with fewer during tutorials
  // Reuse the same array to reduce allocations / GC churn.
  obstacles.length = 0;
  // Round 1: 1 obstacle, Round 2: 2 obstacles, Round 3: 3, etc. (capped)
  const maxObstacles = 10;
  const baseForRound = currentRound === 1 ? 1 : currentRound === 2 ? 2 : 3 + (currentRound - 3);
  const numObstacles = Math.min(baseForRound, maxObstacles);

  // Minimum spacing between obstacles and from player start (100px requirement)
  const OBSTACLE_SPACING = 100;

  for (let i = 0; i < numObstacles; i++) {
    let attempts = 0;
    let valid = false;
    let obsX, obsY, obsW, obsH;

    // Try to place obstacle with proper spacing
    while (!valid && attempts < 100) {
      obsW = OBSTACLE_MIN_WIDTH + Math.random() * (OBSTACLE_MAX_WIDTH - OBSTACLE_MIN_WIDTH);
      obsH = OBSTACLE_MIN_HEIGHT + Math.random() * (OBSTACLE_MAX_HEIGHT - OBSTACLE_MIN_HEIGHT);
      obsX = ROOM_LEFT + Math.random() * (ROOM_WIDTH - obsW);
      obsY = ROOM_TOP + Math.random() * (ROOM_HEIGHT - obsH);

      // Check if obstacle overlaps player start area (100px margin)
      const playerStartMargin = OBSTACLE_SPACING;
      const overlapsPlayerStart = obsX + obsW > playerX - playerStartMargin &&
                                  obsX < playerX + PLAYER_SIZE + playerStartMargin &&
                                  obsY + obsH > playerY - playerStartMargin &&
                                  obsY < playerY + PLAYER_SIZE + playerStartMargin;

      // Check if obstacle overlaps door (keep some margin)
      const doorMargin = 50;
      const overlapsDoor = obsX + obsW > doorX - doorMargin &&
                          obsX < doorX + DOOR_WIDTH + doorMargin &&
                          obsY + obsH > doorY - doorMargin &&
                          obsY < doorY + DOOR_HEIGHT + doorMargin;

      // Check if obstacle overlaps other obstacles (100px spacing requirement)
      let overlapsOtherObstacle = false;
      for (const existingObs of obstacles) {
        // Calculate distance between obstacle centers
        const centerX1 = obsX + obsW / 2;
        const centerY1 = obsY + obsH / 2;
        const centerX2 = existingObs.x + existingObs.width / 2;
        const centerY2 = existingObs.y + existingObs.height / 2;
        const distance = Math.sqrt((centerX1 - centerX2) ** 2 + (centerY1 - centerY2) ** 2);
        
        // Check if too close (less than 100px between edges)
        const minDistance = OBSTACLE_SPACING + (obsW + obsH) / 4 + (existingObs.width + existingObs.height) / 4;
        if (distance < minDistance) {
          overlapsOtherObstacle = true;
          break;
        }
      }

      if (!overlapsPlayerStart && !overlapsDoor && !overlapsOtherObstacle) {
        valid = true;
      }
      attempts++;
    }

    if (valid) {
      // Give each obstacle a movement vector and an initial zigzag phase.
      // Direction is random; speed is low so the room remains readable.
      const speed = OBSTACLE_BASE_SPEED + Math.random() * OBSTACLE_SPEED_VARIATION;
      const angle = Math.random() * Math.PI * 2;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      // Zigzag phase adds subtle sinusoidal wobble to horizontal/vertical motion.
      const zigzagPhase = Math.random() * Math.PI * 2;

      obstacles.push({ x: obsX, y: obsY, width: obsW, height: obsH, vx, vy, zigzagPhase });
    }
  }

  // Generate fake doors / decoy exits from round 2 onward to support the "Uhm… nope" theme.
  // These look like doors but simply reset the player back to spawn when touched.
  if (currentRound >= 2) {
    const numFakeDoors = currentRound === 2 ? 1 : 1 + Math.min(2, Math.floor((currentRound - 2) / 2));
    const FAKE_DOOR_MARGIN = 40;

    for (let i = 0; i < numFakeDoors; i++) {
      let attempts = 0;
      let valid = false;
      let fx = 0;
      let fy = 0;

      while (!valid && attempts < 80) {
        // Place fake doors near the right half of the room to mimic real exits.
        const width = DOOR_WIDTH * 0.85;
        const height = DOOR_HEIGHT * 0.85;
        fx = ROOM_LEFT + ROOM_WIDTH / 2 + Math.random() * (ROOM_WIDTH / 2 - width - FAKE_DOOR_MARGIN);
        fy = ROOM_TOP + Math.random() * (ROOM_HEIGHT - height - FAKE_DOOR_MARGIN);

        // Avoid overlapping the true door.
        const overlapsRealDoor =
          fx + width > doorX - FAKE_DOOR_MARGIN &&
          fx < doorX + DOOR_WIDTH + FAKE_DOOR_MARGIN &&
          fy + height > doorY - FAKE_DOOR_MARGIN &&
          fy < doorY + DOOR_HEIGHT + FAKE_DOOR_MARGIN;

        // Avoid sitting directly on top of obstacles.
        let overlapsObstacle = false;
        for (const obs of obstacles) {
          if (
            fx + width > obs.x - 20 &&
            fx < obs.x + obs.width + 20 &&
            fy + height > obs.y - 20 &&
            fy < obs.y + obs.height + 20
          ) {
            overlapsObstacle = true;
            break;
          }
        }

        if (!overlapsRealDoor && !overlapsObstacle) {
          valid = true;
        }
        attempts++;
      }

      if (valid) {
        // Randomized portal effect:
        // - teleport: snaps player back to spawn (original behavior)
        // - shield: grants a one-hit shield that destroys an obstacle on contact
        const effect = Math.random() < 0.5 ? 'teleport' : 'shield';
        fakeDoors.push({ x: fx, y: fy, width: DOOR_WIDTH * 0.85, height: DOOR_HEIGHT * 0.85, effect });
      }
    }
  }
}

// ========== Input (keyboard) ==========
function handleKeyDown(e) {
  const key = e.key.toLowerCase();

  // Ignore auto-repeat to avoid rapidly toggling pause / reverse on held keys.
  if (e.repeat) return;

  // ESC: toggle pause screen (only when the round is active).
  if (key === 'escape') {
    e.preventDefault();
    if (!gameWon && !gameLost) {
      if (!paused) {
        // Entering pause: remember when we paused to compensate timers later.
        paused = true;
        pauseStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      } else {
        // Leaving pause: shift time-based references forward so timers ignore paused duration.
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const pausedDuration = now - pauseStartTime;
        roundStartTime += pausedDuration;
        lastAutoReverseTime += pausedDuration;
        paused = false;
        pauseStartTime = 0;
      }
    }
    return;
  }

  // While paused we ignore all other gameplay keys (including movement and R),
  // so the game state truly freezes until ESC is pressed again.
  if (paused) return;

  if (key === 'r') {
    e.preventDefault();
    // If game is lost, restart; otherwise toggle reversed controls
    if (gameLost) {
      // Cancel any pending "next round" timer and fully regenerate state.
      clearPendingRoundTransition();
      currentRound = 1;
      generateRandomRoom();
      return;
    }
    reversedControls = !reversedControls;
    // Optional audio cue when reversed controls toggle manually.
    playReverseToggleSound();
    return;
  }
  if (key in keys) keys[key] = true;
}

function handleKeyUp(e) {
  const key = e.key.toLowerCase();
  // When paused, we don't track key-up changes for movement, since movement is frozen.
  if (paused) return;
  if (key in keys) keys[key] = false;
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);

// ========== Movement: apply WASD, with optional reversed controls ==========
function updatePlayer() {
  if (paused || gameWon || gameLost) return;

  let dx = 0;
  let dy = 0;

  // Apply round-based speed modifier.
  const effectiveSpeed = PLAYER_SPEED * playerSpeedMultiplier;

  if (reversedControls) {
    // Reversed: W=down, S=up, A=right, D=left
    if (keys.w) dy += effectiveSpeed;
    if (keys.s) dy -= effectiveSpeed;
    if (keys.a) dx += effectiveSpeed;
    if (keys.d) dx -= effectiveSpeed;
  } else {
    // Normal: W=up, S=down, A=left, D=right
    if (keys.w) dy -= effectiveSpeed;
    if (keys.s) dy += effectiveSpeed;
    if (keys.a) dx -= effectiveSpeed;
    if (keys.d) dx += effectiveSpeed;
  }

  playerX += dx;
  playerY += dy;

  // Clamp player inside room (with padding for player size)
  const minX = ROOM_LEFT;
  const minY = ROOM_TOP;
  const maxX = ROOM_LEFT + ROOM_WIDTH - PLAYER_SIZE;
  const maxY = ROOM_TOP + ROOM_HEIGHT - PLAYER_SIZE;

  playerX = Math.max(minX, Math.min(maxX, playerX));
  playerY = Math.max(minY, Math.min(maxY, playerY));
}

// ========== Collision: player vs obstacles (lethal) ==========
/**
 * Checks if player overlaps any obstacle. Obstacles are lethal - touching them kills the player.
 * Returns true if player is touching an obstacle.
 */
function checkObstacleCollision() {
  if (paused || gameLost || gameWon) return false;
  const px = playerX;
  const py = playerY;
  const ps = PLAYER_SIZE;

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    // AABB overlap check
    if (px + ps > obs.x && px < obs.x + obs.width &&
        py + ps > obs.y && py < obs.y + obs.height) {
      // If shield is active, consume it to destroy ONE obstacle instead of dying.
      if (shieldActive) {
        // Remove the obstacle from the round immediately.
        obstacles.splice(i, 1);
        shieldActive = false;

        // Feedback: lighter shake + shield OFF sound.
        screenShakeTime = 220;
        screenShakeIntensity = 7;
        playShieldSound(false);
        return true;
      }

      gameLost = true;
      // Tutorial tips should disappear as soon as a round is failed.
      // This guarantees that when the next attempt/round starts, only the
      // intended messages for that round (if any) will be re-enabled.
      showingTutorial = false;
      tutorialMessage = '';
      // Trigger a short, punchy screen shake and a humorous message.
      screenShakeTime = 300;      // ms
      screenShakeIntensity = 10;  // pixels
      return true;
    }
  }
  return false;
}

// ========== Survival time check: door unlocks after required survival time ==========
/**
 * Checks if player has survived long enough for door to unlock.
 * Door only becomes accessible after 5-10 seconds, ensuring reversed controls toggle at least once.
 */
function checkSurvivalTime() {
  if (paused || doorUnlocked || gameLost || gameWon) return;
  
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = now - roundStartTime;
  
  if (elapsed >= requiredSurvivalTime) {
    doorUnlocked = true;
  }
}

// ========== Collision: player vs door (AABB) ==========
/**
 * Checks if player reaches the door. Door only works if unlocked (survival time met).
 */
function checkDoorCollision() {
  if (paused || gameWon || gameLost || !doorUnlocked) return;
  
  const px = playerX;
  const py = playerY;
  const ps = PLAYER_SIZE;
  // AABB overlap
  if (px + ps > doorX && px < doorX + DOOR_WIDTH &&
      py + ps > doorY && py < doorY + DOOR_HEIGHT) {
    gameWon = true;
    // As soon as the player finishes a tutorial round, clear tutorial text
    // so it does not linger into the transition to the next round.
    // This, combined with the `currentRound <= 2` guard in `drawUI`, ensures
    // the speech bubble *never* appears in round 3+.
    showingTutorial = false;
    tutorialMessage = '';
    // After a short delay, advance to next round
    clearPendingRoundTransition();
    nextRoundTimeoutId = setTimeout(() => {
      // We are now transitioning for real, so clear the handle.
      nextRoundTimeoutId = null;
      currentRound++;
      generateRandomRoom();
    }, 1500);
  }
}

// ========== Auto-toggle reversed controls (every 7–10 s, random) ==========
function updateAutoReverse() {
  if (paused || gameWon || gameLost) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = now - lastAutoReverseTime;
  if (elapsed >= nextAutoReverseDelay) {
    reversedControls = !reversedControls;
    // Optional audio cue when reversed controls toggle automatically.
    playReverseToggleSound();
    lastAutoReverseTime = now;
    nextAutoReverseDelay = getNextAutoReverseDelay();
  }
}

// ========== Obstacle movement (slow drift with wall bouncing) ==========
/**
 * Updates obstacle positions with slow movement.
 * Obstacles bounce off the room boundaries to create gentle back-and-forth motion.
 */
function updateObstaclesMovement() {
  if (paused || gameWon || gameLost) return;

  // Estimate delta time for effects like teleport chance and zigzag wobble.
  // Use a fixed dt to avoid huge jumps when tab is unfocused.
  const dt = 1 / 60; // assuming ~60fps; enough for per-second probability approximations

  for (const obs of obstacles) {
    // If this obstacle was created before movement existed, default its velocity.
    if (typeof obs.vx !== 'number' || typeof obs.vy !== 'number') {
      const speed = OBSTACLE_BASE_SPEED + Math.random() * OBSTACLE_SPEED_VARIATION;
      const angle = Math.random() * Math.PI * 2;
      obs.vx = Math.cos(angle) * speed;
      obs.vy = Math.sin(angle) * speed;
      obs.zigzagPhase = Math.random() * Math.PI * 2;
    }

    // Slight zig-zag wobble: periodically nudge perpendicular to main velocity.
    obs.zigzagPhase += dt * 3; // zigzag speed multiplier
    const wobbleStrength = 0.3;
    const wobbleX = -obs.vy * wobbleStrength * Math.sin(obs.zigzagPhase);
    const wobbleY = obs.vx * wobbleStrength * Math.sin(obs.zigzagPhase);

    obs.x += obs.vx + wobbleX;
    obs.y += obs.vy + wobbleY;

    // Compute bounds the obstacle must stay within (inside the room rectangle).
    const minX = ROOM_LEFT;
    const minY = ROOM_TOP;
    const maxX = ROOM_LEFT + ROOM_WIDTH - obs.width;
    const maxY = ROOM_TOP + ROOM_HEIGHT - obs.height;

    // Horizontal bounce
    if (obs.x < minX) {
      obs.x = minX;
      obs.vx = Math.abs(obs.vx);
    } else if (obs.x > maxX) {
      obs.x = maxX;
      obs.vx = -Math.abs(obs.vx);
    }

    // Vertical bounce
    if (obs.y < minY) {
      obs.y = minY;
      obs.vy = Math.abs(obs.vy);
    } else if (obs.y > maxY) {
      obs.y = maxY;
      obs.vy = -Math.abs(obs.vy);
    }
    // Occasionally teleport an obstacle to a new random location inside the room.
    // This keeps players on their toes and enhances the "Uhm… nope" theme.
    const teleportChanceThisFrame = OBSTACLE_TELEPORT_CHANCE_PER_SECOND * dt;
    if (Math.random() < teleportChanceThisFrame) {
      const obsW = obs.width;
      const obsH = obs.height;
      obs.x = ROOM_LEFT + Math.random() * (ROOM_WIDTH - obsW);
      obs.y = ROOM_TOP + Math.random() * (ROOM_HEIGHT - obsH);
      // Small random velocity tweak after teleport so paths keep changing.
      const speed = OBSTACLE_BASE_SPEED + Math.random() * OBSTACLE_SPEED_VARIATION;
      const angle = Math.random() * Math.PI * 2;
      obs.vx = Math.cos(angle) * speed;
      obs.vy = Math.sin(angle) * speed;
    }
  }
}

// ========== Fake door collision handling ==========
/**
 * Checks collision against fake doors / decoy exits.
 * Touching a fake door does NOT kill the player; instead it snaps them back
 * to their spawn location for the current round, reinforcing the "Uhm… nope"
 * theme without being overly punishing.
 */
function checkFakeDoorCollision() {
  if (paused || gameWon || gameLost) return;

  const px = playerX;
  const py = playerY;
  const ps = PLAYER_SIZE;

  for (const fd of fakeDoors) {
    if (
      px + ps > fd.x &&
      px < fd.x + fd.width &&
      py + ps > fd.y &&
      py < fd.y + fd.height
    ) {
      if (fd.effect === 'shield') {
        // Grant shield buff: lasts until the player collides with an obstacle.
        shieldActive = true;
        // Feedback: shield ON sound + distinct glow is drawn on the player.
        playShieldSound(true);
        screenShakeTime = 140;
        screenShakeIntensity = 4;
      } else {
        // Teleport effect (original behavior): snap player back to spawn.
        playerX = playerStartX;
        playerY = playerStartY;
        // Tiny shake so the player feels something happened, but less intense
        // than a lethal obstacle collision.
        screenShakeTime = 160;
        screenShakeIntensity = 5;
      }
      return;
    }
  }
}

// ========== Drawing (room, door, player, UI) ==========
/**
 * Draws the room floor using AI-generated floor sprite (tiled).
 * Falls back to solid color if sprites aren't loaded.
 */
function drawRoom() {
  // Screen shake: apply a tiny offset to the whole scene when active.
  let shakeOffsetX = 0;
  let shakeOffsetY = 0;
  if (screenShakeTime > 0) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const intensity = screenShakeIntensity * (screenShakeTime / 300);
    shakeOffsetX = (Math.random() - 0.5) * intensity;
    shakeOffsetY = (Math.random() - 0.5) * intensity;
  }

  ctx.save();

  // Optional vertical flip rule: the world is rendered upside-down for this round.
  if (currentRoundRule === 'flipY') {
    ctx.translate(0, CANVAS_HEIGHT);
    ctx.scale(1, -1);
  }

  ctx.translate(shakeOffsetX, shakeOffsetY);
  if (spritesReady && sprites.floor.complete && sprites.floor.naturalWidth > 0) {
    // Draw tiled floor using AI-generated floor sprite
    const tileSize = 64;
    for (let y = ROOM_TOP; y < ROOM_TOP + ROOM_HEIGHT; y += tileSize) {
      for (let x = ROOM_LEFT; x < ROOM_LEFT + ROOM_WIDTH; x += tileSize) {
        ctx.drawImage(sprites.floor, x, y, tileSize, tileSize);
      }
    }
  } else {
    // Fallback: solid color floor
    ctx.fillStyle = '#16213e';
    ctx.fillRect(ROOM_LEFT, ROOM_TOP, ROOM_WIDTH, ROOM_HEIGHT);
  }

  const W = WALL_THICKNESS;
  
  if (spritesReady && sprites.wall.complete && sprites.wall.naturalWidth > 0) {
    // Draw walls using AI-generated wall sprite (tiled)
    const wallTileSize = 64;
    
    // Top wall
    for (let x = 0; x < CANVAS_WIDTH; x += wallTileSize) {
      ctx.drawImage(sprites.wall, x, 0, wallTileSize, ROOM_TOP + W);
    }
    
    // Left wall
    for (let y = 0; y < CANVAS_HEIGHT; y += wallTileSize) {
      ctx.drawImage(sprites.wall, 0, y, ROOM_LEFT + W, wallTileSize);
    }
    
    // Right wall
    for (let y = 0; y < CANVAS_HEIGHT; y += wallTileSize) {
      ctx.drawImage(
        sprites.wall,
        CANVAS_WIDTH - ROOM_PADDING_X - W,
        y,
        ROOM_PADDING_X + W,
        wallTileSize
      );
    }
    
    // Bottom wall
    for (let x = 0; x < CANVAS_WIDTH; x += wallTileSize) {
      ctx.drawImage(
        sprites.wall,
        x,
        CANVAS_HEIGHT - ROOM_PADDING_BOTTOM - W,
        wallTileSize,
        ROOM_PADDING_BOTTOM + W
      );
    }
  } else {
    // Fallback: solid color walls
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(0, 0, CANVAS_WIDTH, ROOM_TOP + W);
    ctx.fillRect(0, 0, ROOM_LEFT + W, CANVAS_HEIGHT);
    ctx.fillRect(CANVAS_WIDTH - ROOM_PADDING_X - W, 0, ROOM_PADDING_X + W, CANVAS_HEIGHT);
    ctx.fillRect(0, CANVAS_HEIGHT - ROOM_PADDING_BOTTOM - W, CANVAS_WIDTH, ROOM_PADDING_BOTTOM + W);
  }

  ctx.restore();
}

/**
 * Draws the door using AI-generated door sprite.
 * Falls back to colored rectangle if sprite isn't loaded.
 * Door appears locked (gray) until survival time requirement is met.
 */
function drawDoor() {
  // Prevent camping at the starting position by hiding the door for the first few seconds.
  // The door will only be drawn after DOOR_APPEAR_DELAY_MS has elapsed this round.
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const timeSinceRoundStart = now - roundStartTime;
  if (timeSinceRoundStart < DOOR_APPEAR_DELAY_MS) {
    return;
  }

  // Draw door with visual feedback: gradient glow when unlocked, muted when locked
  const doorColor = doorUnlocked ? '#e94560' : '#666666';
  
  if (spritesReady && sprites.door.complete && sprites.door.naturalWidth > 0) {
    // Apply tint effect for locked door (darken sprite)
    ctx.save();
    if (!doorUnlocked) {
      ctx.globalAlpha = 0.6;
    }
    // Underlying sprite
    ctx.drawImage(sprites.door, doorX, doorY, DOOR_WIDTH, DOOR_HEIGHT);

    // Subtle vertical gradient overlay for extra depth.
    const grad = ctx.createLinearGradient(doorX, doorY, doorX, doorY + DOOR_HEIGHT);
    grad.addColorStop(0, 'rgba(255,255,255,0.15)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(doorX, doorY, DOOR_WIDTH, DOOR_HEIGHT);

    // Soft outer glow when the door is ready.
    if (doorUnlocked) {
      ctx.save();
      ctx.shadowColor = 'rgba(78,205,196,0.8)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(78,205,196,0.9)';
      ctx.lineWidth = 3;
      ctx.strokeRect(doorX - 2, doorY - 2, DOOR_WIDTH + 4, DOOR_HEIGHT + 4);
      ctx.restore();
    }
    ctx.restore();
  } else {
    // Fallback: colored rectangle (gray when locked, red when unlocked)
    // Base rectangle
    const grad = ctx.createLinearGradient(doorX, doorY, doorX, doorY + DOOR_HEIGHT);
    grad.addColorStop(0, doorUnlocked ? '#ff7b9a' : '#777777');
    grad.addColorStop(1, doorColor);
    ctx.fillStyle = grad;
    ctx.fillRect(doorX, doorY, DOOR_WIDTH, DOOR_HEIGHT);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(doorX, doorY, DOOR_WIDTH, DOOR_HEIGHT);
    
    // Show lock indicator when locked
    if (!doorUnlocked) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔒', doorX + DOOR_WIDTH / 2, doorY + DOOR_HEIGHT / 2 + 8);
    }
  }
}

/**
 * Draws fake doors / decoy exits.
 * These use a distinct color and subtle "?" mark to hint that they're suspicious.
 */
function drawFakeDoors() {
  for (const fd of fakeDoors) {
    // Visual language:
    // - teleport portals are teal/blue with a ↩ icon
    // - shield portals are green with a 🛡 icon
    const isShield = fd.effect === 'shield';
    const grad = ctx.createLinearGradient(fd.x, fd.y, fd.x, fd.y + fd.height);
    if (isShield) {
      grad.addColorStop(0, '#6dff7a');
      grad.addColorStop(1, '#0a5a2a');
    } else {
      // Simple gradient block with teal-ish hue so they feel tempting.
      grad.addColorStop(0, '#26c6da');
      grad.addColorStop(1, '#004d60');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(fd.x, fd.y, fd.width, fd.height);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(fd.x, fd.y, fd.width, fd.height);

    // A small icon to teach portal effects without extra UI.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isShield ? '🛡' : '↩', fd.x + fd.width / 2, fd.y + fd.height / 2 + 7);
  }
}

/**
 * Draws all obstacles using AI-generated obstacle sprite.
 * Falls back to gray rectangles if sprite isn't loaded.
 */
function drawObstacles() {
  // Compute tint once per frame (instead of once per obstacle) to reduce allocations.
  const maxTintRounds = 10;
  const roundFactor = Math.min(currentRound - 1, maxTintRounds) / maxTintRounds;
  const tintAlpha = 0.15 + 0.25 * roundFactor; // 0.15 on early rounds, up to ~0.4 later
  const tintColor = `rgba(233, 69, 96, ${tintAlpha})`; // Soft reddish tint

  for (const obs of obstacles) {

    if (spritesReady && sprites.obstacle.complete && sprites.obstacle.naturalWidth > 0) {
      // Base sprite
      ctx.drawImage(sprites.obstacle, obs.x, obs.y, obs.width, obs.height);

      // Subtle gradient overlay to give depth.
      const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.width, obs.y + obs.height);
      grad.addColorStop(0, 'rgba(0,0,0,0.25)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.0)');
      grad.addColorStop(1, 'rgba(255,255,255,0.1)');
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = grad;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.restore();

      // Color overlay to visually scale difficulty as rounds increase.
      ctx.save();
      ctx.fillStyle = tintColor;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.restore();
    } else {
      // Fallback: colored rectangle that shifts as rounds increase.
      ctx.fillStyle = '#888888';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      // Apply the same tint on top of the base rectangle.
      ctx.save();
      ctx.fillStyle = tintColor;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.restore();
    }
  }
}

/**
 * Draws the player using AI-generated player sprite.
 * Falls back to teal square if sprite isn't loaded.
 */
function drawPlayer() {
  // Add a soft glow around the player sprite for readability.
  ctx.save();
  // Shield visual: brighter green glow + a ring around the player.
  ctx.shadowColor = shieldActive ? 'rgba(109,255,122,0.95)' : 'rgba(78,205,196,0.9)';
  ctx.shadowBlur = shieldActive ? 26 : 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  if (spritesReady && sprites.player.complete && sprites.player.naturalWidth > 0) {
    ctx.drawImage(sprites.player, playerX, playerY, PLAYER_SIZE, PLAYER_SIZE);
  } else {
    // Fallback: teal square
    ctx.fillStyle = '#4ecdc4';
    ctx.fillRect(playerX, playerY, PLAYER_SIZE, PLAYER_SIZE);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(playerX, playerY, PLAYER_SIZE, PLAYER_SIZE);
  }

  ctx.restore();

  // Extra shield indicator ring so it's unmistakable even on bright backgrounds.
  if (shieldActive) {
    ctx.save();
    ctx.strokeStyle = 'rgba(109,255,122,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(playerX + PLAYER_SIZE / 2, playerY + PLAYER_SIZE / 2, PLAYER_SIZE * 0.75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawUI() {
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';

  // Round display in a styled box for better readability.
  const roundBoxX = 18;
  const roundBoxY = 18;
  const roundBoxWidth = 150;
  const roundBoxHeight = 40;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 25, 0.85)';
  ctx.strokeStyle = '#4ecdc4';
  ctx.lineWidth = 2;
  ctx.roundRect(roundBoxX, roundBoxY, roundBoxWidth, roundBoxHeight, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`Round ${currentRound}`, roundBoxX + 12, roundBoxY + 24);

  // Show current round rule under the round label (for extra weirdness).
  if (currentRoundRule === 'flipY') {
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#9f7bff';
    ctx.fillText('World is upside down', roundBoxX + 12, roundBoxY + 38);
  } else if (currentRoundRule === 'slowPlayer') {
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#ffb347';
    ctx.fillText('Slow-mo walk', roundBoxX + 12, roundBoxY + 38);
  } else if (currentRoundRule === 'fastPlayer') {
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText('Hyper-speed!', roundBoxX + 12, roundBoxY + 38);
  }
  ctx.restore();

  // Survival time indicator: show progress toward door unlock
  if (!doorUnlocked && !gameLost && !gameWon) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = now - roundStartTime;
    const progress = Math.min(elapsed / requiredSurvivalTime, 1);
    const remaining = Math.max(0, (requiredSurvivalTime - elapsed) / 1000);
    
    ctx.fillStyle = '#888';
    ctx.fillText(`Door unlocks in: ${remaining.toFixed(1)}s`, 20, 75);
    
    // Progress bar
    const barWidth = 200;
    const barHeight = 8;
    const barX = 20;
    const barY = 85;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#4ecdc4';
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);
  } else if (doorUnlocked && !gameLost && !gameWon) {
    ctx.fillStyle = '#4ecdc4';
    ctx.fillText('Door unlocked!', 20, 75);
  }

  if (reversedControls) {
    // Highlighted badge for reversed controls so players notice the change.
    const text = 'Reversed controls ON!';
    ctx.font = 'bold 16px system-ui, sans-serif';
    const paddingX = 10;
    const paddingY = 6;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;

    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = 26;
    const boxX = 20;
    const boxY = CANVAS_HEIGHT - 40;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeStyle = '#ffc107';
    ctx.lineWidth = 2;
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffeb3b';
    ctx.textAlign = 'left';
    ctx.fillText(text, boxX + paddingX, boxY + boxHeight - paddingY);
    ctx.restore();
  }

  // Shield status badge (HUD): shows clearly when shield is active.
  if (shieldActive && !gameWon && !gameLost) {
    const text = 'Shield ACTIVE';
    ctx.save();
    ctx.font = 'bold 14px system-ui, sans-serif';
    const paddingX = 10;
    const paddingY = 6;
    const w = ctx.measureText(text).width + paddingX * 2;
    const h = 24;
    const x = 20;
    const y = ROOM_TOP + 10; // just inside the arena edge so it's always visible

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeStyle = 'rgba(109,255,122,0.95)';
    ctx.lineWidth = 2;
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#b9ffbf';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + paddingX, y + h - paddingY);
    ctx.restore();
  }

  if (gameWon) {
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillStyle = '#4ecdc4';
    ctx.textAlign = 'center';
    ctx.fillText('You Win!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(`Round ${currentRound} Complete!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
  }

  if (gameLost) {
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillStyle = '#e94560';
    ctx.textAlign = 'center';
    ctx.fillText('You Lose!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('Uhm… nope! Press R to restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
  }

  // Tutorial speech bubble overlay for the *first two rounds only*.
  // IMPORTANT: This bubble is intentionally drawn OUTSIDE the arena bounds
  // (inside the reserved top HUD strip) so it never overlaps tiles, the player,
  // obstacles, or door interactions.
  //
  // Guarded by both `showingTutorial` and `currentRound <= 2` so that:
  //  - Round 1: shows movement instructions.
  //  - Round 2: shows reversed-controls instructions.
  //  - Round 3+: this block never runs, even if flags were accidentally left on.
  if (showingTutorial && currentRound <= 2 && !gameWon && !gameLost) {
    ctx.save();

    // Bubble geometry: right-aligned in the HUD strip so it won't overlap the round box.
    const boxWidth = 520;
    const boxHeight = 70;
    const hudPadding = 18;
    const boxX = CANVAS_WIDTH - boxWidth - hudPadding;
    // Keep bubble fully above the arena: y + h <= ROOM_TOP - 6
    const boxY = Math.max(hudPadding, ROOM_TOP - boxHeight - 6);

    // Bubble styling
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.strokeStyle = 'rgba(78,205,196,0.9)';
    ctx.lineWidth = 2;
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12);
    ctx.fill();
    ctx.stroke();

    // Pointer/arrow: points from the bubble down toward the relevant in-arena object.
    // For both tutorial rounds, the relevant object is the player (movement / control feel).
    const playerCenterX = playerX + PLAYER_SIZE / 2;
    const playerCenterY = playerY + PLAYER_SIZE / 2;

    // Clamp pointer X so it stays on the bubble bottom edge.
    const pointerBaseX = Math.max(boxX + 30, Math.min(boxX + boxWidth - 30, playerCenterX));
    const pointerBaseY = boxY + boxHeight;
    // Clamp pointer tip so it lands inside the arena (not on HUD).
    const pointerTipX = Math.max(ROOM_LEFT + 10, Math.min(ROOM_LEFT + ROOM_WIDTH - 10, playerCenterX));
    const pointerTipY = Math.max(ROOM_TOP + 10, Math.min(ROOM_TOP + ROOM_HEIGHT - 10, playerCenterY));

    ctx.beginPath();
    ctx.moveTo(pointerBaseX - 14, pointerBaseY - 1);
    ctx.lineTo(pointerBaseX + 14, pointerBaseY - 1);
    ctx.lineTo(pointerTipX, pointerTipY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(78,205,196,0.6)';
    ctx.stroke();

    // Tutorial text
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(tutorialMessage, boxX + boxWidth / 2, boxY + 28);

    if (currentRound === 2) {
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = '#ffeb3b';
      ctx.fillText(
        'Tip: The game will sometimes flip the rules… on purpose.',
        boxX + boxWidth / 2,
        boxY + 50
      );
    }

    ctx.restore();
  }

  // Pause overlay: shown on top of the current frame when ESC is pressed.
  if (paused && !gameWon && !gameLost) {
    ctx.save();
    // Dim the play area with a soft vignette.
    ctx.fillStyle = 'rgba(5, 5, 15, 0.75)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Pause card
    const cardWidth = 420;
    const cardHeight = 160;
    const cardX = (CANVAS_WIDTH - cardWidth) / 2;
    const cardY = (CANVAS_HEIGHT - cardHeight) / 2;

    ctx.fillStyle = 'rgba(15, 20, 40, 0.95)';
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 3;
    ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 20);
    ctx.fill();
    ctx.stroke();

    // Pause text.
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Paused', CANVAS_WIDTH / 2, cardY + 55);

    ctx.font = '18px system-ui, sans-serif';
    ctx.fillStyle = '#cccccc';
    ctx.fillText('Uhm… nope… not moving.', CANVAS_WIDTH / 2, cardY + 90);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('Press ESC to resume the confusion.', CANVAS_WIDTH / 2, cardY + 115);
    ctx.restore();
  }
}

// ========== Game initialization ==========
function initGame() {
  currentRound = 1;
  generateRandomRoom();
  gameLoop();
}

// ========== Main game loop (~60fps via requestAnimationFrame) ==========
function gameLoop() {
  // When not paused, advance all gameplay systems.
  if (!paused) {
    updateAutoReverse();
    checkSurvivalTime();  // Check if door should unlock
    updatePlayer();
    updateObstaclesMovement();
    checkObstacleCollision();
    checkFakeDoorCollision();
    checkDoorCollision();

    // Decay screen shake over time for smooth damping.
    if (screenShakeTime > 0) {
      // Simple linear decay tied loosely to frame updates (~60fps).
      screenShakeTime -= 16;
      if (screenShakeTime < 0) screenShakeTime = 0;
    }
  }

  drawRoom();
  drawObstacles();
  drawFakeDoors();
  drawDoor();
  drawPlayer();
  drawUI();

  requestAnimationFrame(gameLoop);
}

// Start the game once sprites are loaded (or immediately if already loaded)
if (spritesLoaded === totalSprites) {
  initGame();
}
