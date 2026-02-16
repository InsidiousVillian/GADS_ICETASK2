/**
 * Room Escape - Browser game
 * Canvas: 800x600, target ~60fps via requestAnimationFrame
 * WASD movement, R toggles reversed controls, reach the door to win.
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
const PLAYER_SIZE = 24;
const PLAYER_SPEED = 4;
const PLAYER_COLOR = '#4ecdc4';   // Teal (distinct from walls and door)

// Door (exit)
const DOOR_WIDTH = 60;
const DOOR_HEIGHT = 80;
const DOOR_X = ROOM_LEFT + ROOM_WIDTH - DOOR_WIDTH - 20;
const DOOR_Y = ROOM_TOP + (ROOM_HEIGHT - DOOR_HEIGHT) / 2;
const DOOR_COLOR = '#e94560';     // Red accent

// Wall color
const WALL_COLOR = '#0f3460';

// Obstacle (rectangle to move around; color/size distinct from player and door)
const OBSTACLE_X = ROOM_LEFT + ROOM_WIDTH * 0.45;
const OBSTACLE_Y = ROOM_TOP + ROOM_HEIGHT * 0.25;
const OBSTACLE_WIDTH = 120;
const OBSTACLE_HEIGHT = 100;
const OBSTACLE_COLOR = '#ff9f43';  // Orange

// Auto-toggle reversed controls: random interval between 7 and 10 seconds (in ms)
const AUTO_REVERSE_MIN_MS = 7000;
const AUTO_REVERSE_MAX_MS = 10000;

/** Returns a random number of ms between AUTO_REVERSE_MIN_MS and AUTO_REVERSE_MAX_MS */
function getNextAutoReverseDelay() {
  return AUTO_REVERSE_MIN_MS + Math.random() * (AUTO_REVERSE_MAX_MS - AUTO_REVERSE_MIN_MS);
}

// ========== Game state ==========
// Player starts on the far left so they have to cross more of the room to reach the door
let playerX = ROOM_LEFT + 25;
let playerY = ROOM_TOP + (ROOM_HEIGHT - PLAYER_SIZE) / 2;
let reversedControls = false;
let gameWon = false;

// Auto-toggle timer: when we last auto-toggled, and delay until next auto-toggle
let lastAutoReverseTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
let nextAutoReverseDelay = getNextAutoReverseDelay();

// Keys currently held (for smooth movement)
const keys = { w: false, a: false, s: false, d: false };

// ========== Input (keyboard) ==========
function handleKeyDown(e) {
  const key = e.key.toLowerCase();
  if (key === 'r') {
    e.preventDefault();
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
  if (gameWon) return;

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

  const prevX = playerX;
  const prevY = playerY;
  playerX += dx;
  playerY += dy;

  // If new position overlaps obstacle, revert to previous position (player must go around)
  if (overlapsObstacle(playerX, playerY)) {
    playerX = prevX;
    playerY = prevY;
  }

  // Clamp player inside room (with padding for player size)
  const minX = ROOM_LEFT;
  const minY = ROOM_TOP;
  const maxX = ROOM_LEFT + ROOM_WIDTH - PLAYER_SIZE;
  const maxY = ROOM_TOP + ROOM_HEIGHT - PLAYER_SIZE;

  playerX = Math.max(minX, Math.min(maxX, playerX));
  playerY = Math.max(minY, Math.min(maxY, playerY));
}

// ========== Collision: player vs obstacle (AABB) ==========
/** Returns true if a box at (x, y) with size PLAYER_SIZE overlaps the obstacle. */
function overlapsObstacle(x, y) {
  const ps = PLAYER_SIZE;
  return x + ps > OBSTACLE_X && x < OBSTACLE_X + OBSTACLE_WIDTH &&
         y + ps > OBSTACLE_Y && y < OBSTACLE_Y + OBSTACLE_HEIGHT;
}

// ========== Collision: player vs door (AABB) ==========
function checkDoorCollision() {
  if (gameWon) return;
  const px = playerX;
  const py = playerY;
  const ps = PLAYER_SIZE;
  // AABB overlap
  if (px + ps > DOOR_X && px < DOOR_X + DOOR_WIDTH &&
      py + ps > DOOR_Y && py < DOOR_Y + DOOR_HEIGHT) {
    gameWon = true;
  }
}

// ========== Auto-toggle reversed controls (every 7–10 s, random) ==========
function updateAutoReverse() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = now - lastAutoReverseTime;
  if (elapsed >= nextAutoReverseDelay) {
    reversedControls = !reversedControls;
    lastAutoReverseTime = now;
    nextAutoReverseDelay = getNextAutoReverseDelay();
  }
}

// ========== Drawing (room, door, player, UI) ==========
function drawRoom() {
  // Background (room floor)
  ctx.fillStyle = '#16213e';
  ctx.fillRect(ROOM_LEFT, ROOM_TOP, ROOM_WIDTH, ROOM_HEIGHT);

  // Walls (thick border = 4 rects)
  ctx.fillStyle = WALL_COLOR;
  const W = 20; // wall thickness
  ctx.fillRect(0, 0, CANVAS_WIDTH, ROOM_TOP + W);
  ctx.fillRect(0, 0, ROOM_LEFT + W, CANVAS_HEIGHT);
  ctx.fillRect(CANVAS_WIDTH - ROOM_PADDING - W, 0, ROOM_PADDING + W, CANVAS_HEIGHT);
  ctx.fillRect(0, CANVAS_HEIGHT - ROOM_PADDING - W, CANVAS_WIDTH, ROOM_PADDING + W);
}

function drawDoor() {
  ctx.fillStyle = DOOR_COLOR;
  ctx.fillRect(DOOR_X, DOOR_Y, DOOR_WIDTH, DOOR_HEIGHT);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(DOOR_X, DOOR_Y, DOOR_WIDTH, DOOR_HEIGHT);
}

/** Draw the obstacle rectangle (player must move around it). */
function drawObstacle() {
  ctx.fillStyle = OBSTACLE_COLOR;
  ctx.fillRect(OBSTACLE_X, OBSTACLE_Y, OBSTACLE_WIDTH, OBSTACLE_HEIGHT);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(OBSTACLE_X, OBSTACLE_Y, OBSTACLE_WIDTH, OBSTACLE_HEIGHT);
}

function drawPlayer() {
  ctx.fillStyle = PLAYER_COLOR;
  ctx.fillRect(playerX, playerY, PLAYER_SIZE, PLAYER_SIZE);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(playerX, playerY, PLAYER_SIZE, PLAYER_SIZE);
}

function drawUI() {
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';

  if (reversedControls) {
    ctx.fillStyle = '#ffc107';
    ctx.fillText('Reversed controls ON!', 20, CANVAS_HEIGHT - 20);
  }

  if (gameWon) {
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillStyle = '#4ecdc4';
    ctx.textAlign = 'center';
    ctx.fillText('You Win!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  }
}

// ========== Main game loop (~60fps via requestAnimationFrame) ==========
function gameLoop() {
  updateAutoReverse();
  updatePlayer();
  checkDoorCollision();

  drawRoom();
  drawObstacle();
  drawDoor();
  drawPlayer();
  drawUI();

  requestAnimationFrame(gameLoop);
}

// Start the game
requestAnimationFrame(gameLoop);
