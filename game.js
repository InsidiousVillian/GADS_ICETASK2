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

// Room (play area) - inner rectangle; walls are the border
const ROOM_PADDING = 40;
const ROOM_LEFT = ROOM_PADDING;
const ROOM_TOP = ROOM_PADDING;
const ROOM_WIDTH = CANVAS_WIDTH - ROOM_PADDING * 2;
const ROOM_HEIGHT = CANVAS_HEIGHT - ROOM_PADDING * 2;

// Player
const PLAYER_SIZE = 32;  // Updated to match sprite size
const PLAYER_SPEED = 4;

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
let obstacles = [];  // Array of {x, y, width, height} objects
let reversedControls = false;
let gameWon = false;
let gameLost = false;
let doorUnlocked = false;  // Door only opens after survival time requirement

// Round start time: tracks when current round began (for survival requirement)
let roundStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
let requiredSurvivalTime = MIN_SURVIVAL_TIME_MS + Math.random() * (MAX_SURVIVAL_TIME_MS - MIN_SURVIVAL_TIME_MS);

// Auto-toggle timer: when we last auto-toggled, and delay until next auto-toggle
let lastAutoReverseTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
let nextAutoReverseDelay = getNextAutoReverseDelay();

// Keys currently held (for smooth movement)
const keys = { w: false, a: false, s: false, d: false };

// ========== Random room generation ==========
/**
 * Generates a new random room layout:
 * - Places door much further from start (creates longer path/corridor effect)
 * - Gradually scales obstacles: starts with 1-2, adds more each round
 * - Ensures obstacles are at least 100px away from player start and each other
 * - Randomizes obstacle positions and sizes
 */
function generateRandomRoom() {
  // Reset game state
  gameWon = false;
  gameLost = false;
  doorUnlocked = false;
  reversedControls = false;
  roundStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  requiredSurvivalTime = MIN_SURVIVAL_TIME_MS + Math.random() * (MAX_SURVIVAL_TIME_MS - MIN_SURVIVAL_TIME_MS);
  lastAutoReverseTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  nextAutoReverseDelay = getNextAutoReverseDelay();

  // Player starts on the far left (much further left to create longer path)
  // Increased distance: start at very left edge, door at very right edge
  const startOffsetX = 20;  // Very close to left wall
  playerX = ROOM_LEFT + startOffsetX;
  playerY = ROOM_TOP + (ROOM_HEIGHT - PLAYER_SIZE) / 2;

  // Door position: far right, creating a corridor-like path
  // Door is always on the right side, but vertical position varies
  const doorOffsetX = 15;  // Very close to right wall
  const doorOffsetY = Math.random() * (ROOM_HEIGHT - DOOR_HEIGHT - 40) + 20;  // Random vertical
  doorX = ROOM_LEFT + ROOM_WIDTH - DOOR_WIDTH - doorOffsetX;
  doorY = ROOM_TOP + doorOffsetY;

  // Generate obstacles: gradual scaling - starts with 1-2, adds more each round
  obstacles = [];
  // Round 1: 1-2 obstacles, Round 2: 2-3, Round 3: 3-4, etc. (max 6)
  const baseObstacles = Math.min(1 + Math.floor((currentRound - 1) / 2), 2);  // Base: 1-2
  const extraObstacles = Math.min(Math.floor((currentRound - 1) / 3), 4);  // Extra per round
  const numObstacles = Math.min(baseObstacles + extraObstacles, 6);  // Max 6 obstacles

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
      obstacles.push({ x: obsX, y: obsY, width: obsW, height: obsH });
    }
  }
}

// ========== Input (keyboard) ==========
function handleKeyDown(e) {
  const key = e.key.toLowerCase();
  if (key === 'r') {
    e.preventDefault();
    // If game is lost, restart; otherwise toggle reversed controls
    if (gameLost) {
      currentRound = 1;
      generateRandomRoom();
      return;
    }
    reversedControls = !reversedControls;
    return;
  }
  if (key in keys) keys[key] = true;
}

function handleKeyUp(e) {
  const key = e.key.toLowerCase();
  if (key in keys) keys[key] = false;
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);

// ========== Movement: apply WASD, with optional reversed controls ==========
function updatePlayer() {
  if (gameWon || gameLost) return;

  let dx = 0;
  let dy = 0;

  if (reversedControls) {
    // Reversed: W=down, S=up, A=right, D=left
    if (keys.w) dy += PLAYER_SPEED;
    if (keys.s) dy -= PLAYER_SPEED;
    if (keys.a) dx += PLAYER_SPEED;
    if (keys.d) dx -= PLAYER_SPEED;
  } else {
    // Normal: W=up, S=down, A=left, D=right
    if (keys.w) dy -= PLAYER_SPEED;
    if (keys.s) dy += PLAYER_SPEED;
    if (keys.a) dx -= PLAYER_SPEED;
    if (keys.d) dx += PLAYER_SPEED;
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
  if (gameLost || gameWon) return false;
  const px = playerX;
  const py = playerY;
  const ps = PLAYER_SIZE;

  for (const obs of obstacles) {
    // AABB overlap check
    if (px + ps > obs.x && px < obs.x + obs.width &&
        py + ps > obs.y && py < obs.y + obs.height) {
      gameLost = true;
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
  if (doorUnlocked || gameLost || gameWon) return;
  
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
  if (gameWon || gameLost || !doorUnlocked) return;
  
  const px = playerX;
  const py = playerY;
  const ps = PLAYER_SIZE;
  // AABB overlap
  if (px + ps > doorX && px < doorX + DOOR_WIDTH &&
      py + ps > doorY && py < doorY + DOOR_HEIGHT) {
    gameWon = true;
    // After a short delay, advance to next round
    setTimeout(() => {
      currentRound++;
      generateRandomRoom();
    }, 1500);
  }
}

// ========== Auto-toggle reversed controls (every 7–10 s, random) ==========
function updateAutoReverse() {
  if (gameWon || gameLost) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = now - lastAutoReverseTime;
  if (elapsed >= nextAutoReverseDelay) {
    reversedControls = !reversedControls;
    lastAutoReverseTime = now;
    nextAutoReverseDelay = getNextAutoReverseDelay();
  }
}

// ========== Drawing (room, door, player, UI) ==========
/**
 * Draws the room floor using AI-generated floor sprite (tiled).
 * Falls back to solid color if sprites aren't loaded.
 */
function drawRoom() {
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
      ctx.drawImage(sprites.wall, CANVAS_WIDTH - ROOM_PADDING - W, y, ROOM_PADDING + W, wallTileSize);
    }
    
    // Bottom wall
    for (let x = 0; x < CANVAS_WIDTH; x += wallTileSize) {
      ctx.drawImage(sprites.wall, x, CANVAS_HEIGHT - ROOM_PADDING - W, wallTileSize, ROOM_PADDING + W);
    }
  } else {
    // Fallback: solid color walls
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(0, 0, CANVAS_WIDTH, ROOM_TOP + W);
    ctx.fillRect(0, 0, ROOM_LEFT + W, CANVAS_HEIGHT);
    ctx.fillRect(CANVAS_WIDTH - ROOM_PADDING - W, 0, ROOM_PADDING + W, CANVAS_HEIGHT);
    ctx.fillRect(0, CANVAS_HEIGHT - ROOM_PADDING - W, CANVAS_WIDTH, ROOM_PADDING + W);
  }
}

/**
 * Draws the door using AI-generated door sprite.
 * Falls back to colored rectangle if sprite isn't loaded.
 * Door appears locked (gray) until survival time requirement is met.
 */
function drawDoor() {
  // Draw door with visual feedback: gray when locked, red when unlocked
  const doorColor = doorUnlocked ? '#e94560' : '#666666';
  
  if (spritesReady && sprites.door.complete && sprites.door.naturalWidth > 0) {
    // Apply tint effect for locked door (darken sprite)
    ctx.save();
    if (!doorUnlocked) {
      ctx.globalAlpha = 0.6;
    }
    ctx.drawImage(sprites.door, doorX, doorY, DOOR_WIDTH, DOOR_HEIGHT);
    ctx.restore();
  } else {
    // Fallback: colored rectangle (gray when locked, red when unlocked)
    ctx.fillStyle = doorColor;
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
 * Draws all obstacles using AI-generated obstacle sprite.
 * Falls back to gray rectangles if sprite isn't loaded.
 */
function drawObstacles() {
  for (const obs of obstacles) {
    if (spritesReady && sprites.obstacle.complete && sprites.obstacle.naturalWidth > 0) {
      ctx.drawImage(sprites.obstacle, obs.x, obs.y, obs.width, obs.height);
    } else {
      // Fallback: gray rectangle
      ctx.fillStyle = '#888888';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    }
  }
}

/**
 * Draws the player using AI-generated player sprite.
 * Falls back to teal square if sprite isn't loaded.
 */
function drawPlayer() {
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
}

function drawUI() {
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';

  // Round display
  ctx.fillText(`Round ${currentRound}`, 20, 30);

  // Survival time indicator: show progress toward door unlock
  if (!doorUnlocked && !gameLost && !gameWon) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = now - roundStartTime;
    const progress = Math.min(elapsed / requiredSurvivalTime, 1);
    const remaining = Math.max(0, (requiredSurvivalTime - elapsed) / 1000);
    
    ctx.fillStyle = '#888';
    ctx.fillText(`Door unlocks in: ${remaining.toFixed(1)}s`, 20, 55);
    
    // Progress bar
    const barWidth = 200;
    const barHeight = 8;
    const barX = 20;
    const barY = 65;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = '#4ecdc4';
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);
  } else if (doorUnlocked && !gameLost && !gameWon) {
    ctx.fillStyle = '#4ecdc4';
    ctx.fillText('Door unlocked!', 20, 55);
  }

  if (reversedControls) {
    ctx.fillStyle = '#ffc107';
    ctx.fillText('Reversed controls ON!', 20, CANVAS_HEIGHT - 20);
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
    ctx.fillText('Press R to restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
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
  updateAutoReverse();
  checkSurvivalTime();  // Check if door should unlock
  updatePlayer();
  checkObstacleCollision();
  checkDoorCollision();

  drawRoom();
  drawObstacles();
  drawDoor();
  drawPlayer();
  drawUI();

  requestAnimationFrame(gameLoop);
}

// Start the game once sprites are loaded (or immediately if already loaded)
if (spritesLoaded === totalSprites) {
  initGame();
}
