/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// --- Game Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const GROUND_HEIGHT = 60;
const GROUND_Y = CANVAS_HEIGHT - GROUND_HEIGHT;

// Physics
const GRAVITY = 0.6;
const ACCELERATION = 0.4;
const FRICTION = 0.85;
const MAX_SPEED = 7;
const JUMP_FORCE = -14;
const BOUNCE_FORCE = -8;

// Dimensions
const PLAYER_W_SMALL = 30;
const PLAYER_H_SMALL = 40;
const PLAYER_W_BIG = 40;
const PLAYER_H_BIG = 70;

// Generation
const CHUNK_SIZE = 800; // Generate 800px at a time
const THEME_CHANGE_DISTANCE = 3000; // Change theme every 3000px

// --- Themes Configuration ---
const THEMES = [
  {
    name: 'OVERWORLD',
    bg: ['#5c94fc', '#95b8fc'],
    ground: '#74bf2e',
    dirt: '#835f30',
    enemies: ['GOOMBA', 'TURTLE'],
    decor: 'HILL',
    platform: '#B8860B' // Golden bricks
  },
  {
    name: 'UNDERGROUND',
    bg: ['#0d0e15', '#242636'],
    ground: '#005f8c',
    dirt: '#00334d',
    enemies: ['BEETLE', 'GOOMBA_BLUE'],
    decor: 'CRYSTAL',
    platform: '#007AA3' // Blue bricks
  },
  {
    name: 'DESERT',
    bg: ['#ffcc33', '#ff9933'],
    ground: '#e6c288',
    dirt: '#bf9b30',
    enemies: ['CACTUS_MOVING', 'TURTLE_RED'],
    decor: 'PYRAMID',
    platform: '#CD853F' // Sandstone
  },
  {
    name: 'CASTLE',
    bg: ['#2b0808', '#4a1010'],
    ground: '#666666',
    dirt: '#333333',
    enemies: ['GHOST', 'THWOMP'],
    decor: 'CHAIN',
    platform: '#808080' // Grey stone
  }
];

// Types
interface Entity {
  id: number;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number; // Velocity X
  vy: number; // Velocity Y
  frame: number;
  dead?: boolean;
  active: boolean; // Is visible/active
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface GameState {
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    h: number;
    isGrounded: boolean;
    isBig: boolean;
    isInvulnerable: boolean;
    invulnerableTimer: number;
    facingRight: boolean;
    runFrame: number;
  };
  camera: { x: number };
  entities: Entity[];
  particles: Particle[];
  clouds: { x: number; y: number; size: number; speed: number }[];
  decorations: { x: number; y: number; type: string }[];
  
  score: number;
  highScore: number;
  
  // Generation state
  lastGeneratedX: number;
  currentThemeIndex: number;
  
  frameCount: number;
  animationFrameId: number;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // React State for UI
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAME_OVER'>('START');
  const [score, setScore] = useState(0);
  const [currentThemeName, setCurrentThemeName] = useState('OVERWORLD');
  
  // Input State
  const keys = useRef<Set<string>>(new Set());

  // Mutable Game State
  const game = useRef<GameState>({
    player: {
      x: 100, y: 100, vx: 0, vy: 0, 
      w: PLAYER_W_SMALL, h: PLAYER_H_SMALL, 
      isGrounded: false, isBig: false, isInvulnerable: false, invulnerableTimer: 0,
      facingRight: true, runFrame: 0
    },
    camera: { x: 0 },
    entities: [],
    particles: [],
    clouds: [],
    decorations: [],
    score: 0,
    highScore: 0,
    lastGeneratedX: 0,
    currentThemeIndex: 0,
    frameCount: 0,
    animationFrameId: 0
  });

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      // Jump on press (not hold)
      if ((e.code === 'Space' || e.code === 'ArrowUp') && gameState === 'PLAYING') {
        if (game.current.player.isGrounded) {
          game.current.player.vy = JUMP_FORCE;
          game.current.player.isGrounded = false;
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // --- Init Background Elements ---
  useEffect(() => {
    const initClouds = [];
    for(let i=0; i<8; i++) {
        initClouds.push({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * (CANVAS_HEIGHT / 2),
            size: 0.5 + Math.random() * 1,
            speed: 0.1 + Math.random() * 0.3
        });
    }
    game.current.clouds = initClouds;
  }, []);

  // --- Game Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      if (gameState !== 'PLAYING') return;

      const state = game.current;
      state.frameCount++;

      // 1. Update Player Physics
      updatePlayer(state);

      // 2. Camera Follow
      // Camera targets player X minus offset, but doesn't scroll back left (Mario 1 styleish)
      const targetCamX = state.player.x - CANVAS_WIDTH * 0.4;
      if (targetCamX > state.camera.x) {
        state.camera.x = targetCamX;
      }

      // 3. Level Generation
      generateWorld(state);

      // 4. Update Entities (Enemies, Items)
      updateEntities(state);

      // 5. Update Particles
      updateParticles(state);

      // 6. Background Parallax
      state.clouds.forEach(c => {
         c.x -= c.speed; 
         if (c.x + 100 < 0) c.x = CANVAS_WIDTH + 100; // Screen wrap for clouds (simple)
      });

      // 7. Update UI Score
      if (Math.floor(state.player.x / 100) > state.score) {
          state.score = Math.floor(state.player.x / 100);
          setScore(state.score);
      }
      
      // Sync Theme Name
      const theme = THEMES[state.currentThemeIndex];
      if (theme.name !== currentThemeName) setCurrentThemeName(theme.name);

      // 8. Draw
      draw(ctx, state);
      state.animationFrameId = requestAnimationFrame(loop);
    };

    if (gameState === 'PLAYING') {
      // Start/Reset Game
      resetGame();
      game.current.animationFrameId = requestAnimationFrame(loop);
    } else {
        // Draw one frame for menu
        draw(ctx, game.current);
    }

    return () => cancelAnimationFrame(game.current.animationFrameId);
  }, [gameState, currentThemeName]);

  const resetGame = () => {
    const g = game.current;
    g.player = {
      x: 100, y: GROUND_Y - PLAYER_H_SMALL, vx: 0, vy: 0,
      w: PLAYER_W_SMALL, h: PLAYER_H_SMALL,
      isGrounded: false, isBig: false, isInvulnerable: false, invulnerableTimer: 0,
      facingRight: true, runFrame: 0
    };
    g.camera.x = 0;
    g.entities = [];
    g.particles = [];
    g.decorations = [];
    g.score = 0;
    g.lastGeneratedX = 400; // Start generating ahead
    g.currentThemeIndex = 0;
    g.frameCount = 0;
    setScore(0);
    setCurrentThemeName('OVERWORLD');
  };

  // --- Physics & Logic Helpers ---

  const updatePlayer = (state: GameState) => {
    const p = state.player;

    // Horizontal Movement
    if (keys.current.has('ArrowRight')) {
        p.vx += ACCELERATION;
        p.facingRight = true;
    } else if (keys.current.has('ArrowLeft')) {
        p.vx -= ACCELERATION;
        p.facingRight = false;
    } else {
        p.vx *= FRICTION;
    }
    
    // Cap Speed
    if (p.vx > MAX_SPEED) p.vx = MAX_SPEED;
    if (p.vx < -MAX_SPEED) p.vx = -MAX_SPEED;
    
    // Small stop threshold
    if (Math.abs(p.vx) < 0.1) p.vx = 0;

    // Apply Velocity X
    p.x += p.vx;

    // Boundaries
    if (p.x < 0) { p.x = 0; p.vx = 0; } // Level start wall

    // Gravity
    p.vy += GRAVITY;
    p.y += p.vy;

    // Ground Collision
    if (p.y + p.h > GROUND_Y) {
        p.y = GROUND_Y - p.h;
        p.vy = 0;
        p.isGrounded = true;
    } else {
        p.isGrounded = false;
    }

    // Platform Collision (Simple AABB for entities of type 'BLOCK')
    state.entities.forEach(ent => {
        if (ent.type === 'BLOCK' && ent.active) {
            // Check if player lands ON TOP
            if (p.vy > 0 && 
                p.y + p.h - p.vy <= ent.y && // Was above previous frame
                p.x + p.w > ent.x && p.x < ent.x + ent.w &&
                p.y + p.h >= ent.y) {
                    p.y = ent.y - p.h;
                    p.vy = 0;
                    p.isGrounded = true;
            }
        }
    });

    // Invulnerability Blink
    if (p.isInvulnerable) {
        p.invulnerableTimer--;
        if (p.invulnerableTimer <= 0) p.isInvulnerable = false;
    }

    // Animation Frame
    if (Math.abs(p.vx) > 0.5 && p.isGrounded) {
        p.runFrame += Math.abs(p.vx) * 0.05;
    } else if (!p.isGrounded) {
        p.runFrame = 1; // Jump pose
    } else {
        p.runFrame = 0; // Idle
    }
  };

  const generateWorld = (state: GameState) => {
      // Generate chunks ahead of camera
      const generateHorizon = state.camera.x + CANVAS_WIDTH + 200;
      
      while (state.lastGeneratedX < generateHorizon) {
          const theme = THEMES[state.currentThemeIndex];
          const x = state.lastGeneratedX;
          
          // Chance to spawn entities at this X
          if (Math.random() < 0.1) {
              const decor = { x, y: GROUND_Y, type: theme.decor };
              state.decorations.push(decor);
          }

          // Enemy Spawn
          if (x > 600 && Math.random() < 0.05) { // Don't spawn immediately at start
             const type = theme.enemies[Math.floor(Math.random() * theme.enemies.length)];
             let y = GROUND_Y - 40;
             let w = 40, h = 40;
             let vx = -1; // Default walk left
             
             if (type === 'GHOST') {
                 y = GROUND_Y - 100 - Math.random() * 100;
                 vx = -1.5;
             }
             if (type === 'THWOMP') {
                 y = GROUND_Y - 150;
                 w = 60; h = 60;
                 vx = 0;
             }

             state.entities.push({
                 id: Math.random(),
                 type, x, y, w, h, vx, vy: 0, frame: 0, active: true
             });
          }

          // Platform / Item Blocks
          if (x > 600 && Math.random() < 0.08) {
             const height = 120;
             state.entities.push({
                 id: Math.random(),
                 type: 'BLOCK',
                 x, y: GROUND_Y - height, w: 50, h: 50,
                 vx: 0, vy: 0, frame: 0, active: true
             });
             
             // 30% chance for Mushroom on block
             if (Math.random() < 0.3) {
                 state.entities.push({
                     id: Math.random(),
                     type: 'MUSHROOM',
                     x: x + 10, y: GROUND_Y - height - 40,
                     w: 30, h: 30,
                     vx: 0, vy: 0, frame: 0, active: true
                 });
             }
          }

          state.lastGeneratedX += 50 + Math.random() * 50;
      }

      // Check for Theme Change
      if (state.lastGeneratedX > (state.currentThemeIndex + 1) * THEME_CHANGE_DISTANCE) {
          // Switch to random NEXT theme
          let nextIndex = Math.floor(Math.random() * THEMES.length);
          if (nextIndex === state.currentThemeIndex) nextIndex = (nextIndex + 1) % THEMES.length;
          state.currentThemeIndex = nextIndex;
      }
  };

  const updateEntities = (state: GameState) => {
      state.entities.forEach(ent => {
          if (!ent.active) return;

          // Physics for Moving Entities
          if (ent.type !== 'BLOCK' && ent.type !== 'MUSHROOM') { // Mushroom is static for simplicity in this ver
             ent.x += ent.vx;
             ent.frame += 0.1;

             // Reverse direction if too far off screen (simple AI) or hitting bounds?
             // For now simple infinite walk left
          }

          // Collision with Player
          if (checkCollision(state.player, ent)) {
             handleCollision(state, ent);
          }
      });

      // Cleanup entities far behind camera
      state.entities = state.entities.filter(e => e.active && e.x > state.camera.x - 200);
      state.decorations = state.decorations.filter(d => d.x > state.camera.x - 200);
  };

  const checkCollision = (p: GameState['player'], ent: Entity) => {
      return (
          p.x < ent.x + ent.w &&
          p.x + p.w > ent.x &&
          p.y < ent.y + ent.h &&
          p.y + p.h > ent.y
      );
  };

  const handleCollision = (state: GameState, ent: Entity) => {
      const p = state.player;

      if (ent.type === 'MUSHROOM') {
          // Power Up!
          ent.active = false;
          p.isBig = true;
          p.w = PLAYER_W_BIG;
          p.h = PLAYER_H_BIG;
          p.y -= 20; // Pop up so we don't clip ground
          spawnParticles(state, ent.x, ent.y, '#FFD700', 10);
          return;
      }

      if (ent.type === 'BLOCK') {
          // handled in physics update for standing, 
          // but here maybe head bonk?
          if (p.vy < 0 && p.y > ent.y) { // Hitting from bottom
              p.vy = 2; // Bonk down
              // Maybe break block?
          }
          return;
      }

      // Enemy Collision
      if (p.isInvulnerable) return;

      // Check Stomp (Player bottom is roughly at Entity top)
      const hitFromTop = (p.y + p.h) - ent.y < 30 && p.vy > 0;

      if (hitFromTop) {
          // Kill Enemy
          ent.active = false;
          p.vy = BOUNCE_FORCE; // Bounce player up
          state.score += 50;
          spawnParticles(state, ent.x, ent.y, '#fff', 5);
      } else {
          // Player Damage
          if (p.isBig) {
              p.isBig = false;
              p.isInvulnerable = true;
              p.invulnerableTimer = 60; // 1 second @ 60fps
              p.w = PLAYER_W_SMALL;
              p.h = PLAYER_H_SMALL;
              p.y += 20;
          } else {
              gameOver();
          }
      }
  };

  const spawnParticles = (state: GameState, x: number, y: number, color: string, count: number) => {
      for(let i=0; i<count; i++) {
          state.particles.push({
              x, y,
              vx: (Math.random() - 0.5) * 10,
              vy: (Math.random() - 0.5) * 10,
              life: 20 + Math.random() * 20,
              color
          });
      }
  };

  const updateParticles = (state: GameState) => {
      for (let i = state.particles.length - 1; i >= 0; i--) {
          const p = state.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life--;
          if (p.life <= 0) state.particles.splice(i, 1);
      }
  };

  const gameOver = () => {
    setGameState('GAME_OVER');
    const finalScore = game.current.score;
    if (finalScore > game.current.highScore) {
      game.current.highScore = finalScore;
    }
  };

  const handleStart = () => {
      if (gameState === 'START' || gameState === 'GAME_OVER') setGameState('PLAYING');
  };

  // --- Drawing ---

  const draw = (ctx: CanvasRenderingContext2D, state: GameState) => {
    const theme = THEMES[state.currentThemeIndex];
    const camX = state.camera.x;

    // 1. Background
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, theme.bg[0]);
    gradient.addColorStop(1, theme.bg[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Clouds (Parallax 0.5)
    ctx.save();
    // ctx.translate(-camX * 0.5, 0); // Simple parallax
    // Simplified: Clouds have their own coordinate system handled in logic
    state.clouds.forEach(c => drawCloud(ctx, c.x, c.y, c.size, state.currentThemeIndex === 1));
    ctx.restore();

    // 3. World Transform
    ctx.save();
    ctx.translate(-camX, 0);

    // Decorations
    state.decorations.forEach(d => {
        // Simple culling
        if(d.x > camX - 100 && d.x < camX + CANVAS_WIDTH + 100) 
            drawDecoration(ctx, d.x, d.y, d.type);
    });

    // Ground
    // Efficient ground drawing: Only draw visible segment
    const groundStart = Math.floor(camX / 50) * 50;
    const groundEnd = groundStart + CANVAS_WIDTH + 100;
    
    ctx.fillStyle = theme.dirt;
    ctx.fillRect(groundStart, GROUND_Y, CANVAS_WIDTH + 100, GROUND_HEIGHT); // Fill bottom
    ctx.fillStyle = theme.ground;
    ctx.fillRect(groundStart, GROUND_Y, CANVAS_WIDTH + 100, 15); // Top layer
    
    // Grid details
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    for (let x = groundStart; x < groundEnd; x+=50) {
        ctx.fillRect(x, GROUND_Y + 15, 48, GROUND_HEIGHT);
    }

    // Entities
    state.entities.forEach(ent => {
        if (!ent.active) return;
        if (ent.type === 'BLOCK') {
            ctx.fillStyle = theme.platform;
            ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
            ctx.strokeStyle = '#000';
            ctx.strokeRect(ent.x, ent.y, ent.w, ent.h);
            // Brick detail
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.fillRect(ent.x + 5, ent.y + 5, ent.w - 10, ent.h - 10);
        } else if (ent.type === 'MUSHROOM') {
            drawMushroom(ctx, ent.x, ent.y);
        } else {
            drawEnemy(ctx, ent, theme);
        }
    });

    // Particles
    state.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 5, 5);
    });

    // Player
    if (state.player.invulnerableTimer % 4 < 2) { // Blink effect
        drawPlayer(ctx, state.player);
    }

    ctx.restore();
  };

  // --- Entity Drawers ---
  
  const drawPlayer = (ctx: CanvasRenderingContext2D, p: GameState['player']) => {
      const { x, y, w, h, facingRight, runFrame, isBig } = p;
      const isJumping = !p.isGrounded;

      ctx.save();
      // Facing flip
      if (!facingRight) {
          ctx.translate(x + w, 0);
          ctx.scale(-1, 1);
          ctx.translate(-x, 0); // Translate back to draw at origin relative to flip
      } else {
          // Normal, no transform needed beyond coords
      }
      
      const drawX = facingRight ? x : -x - w + (x*2); // Re-adjust x if flipped? No, context flip handles it if we draw at x
      // Actually simpler way to flip: translate to center of sprite, scale, translate back
      const cx = x + w/2;
      const cy = y + h/2;
      
      // Let's use specific draw logic so flip is easier
      ctx.translate(cx, cy);
      if (!facingRight) ctx.scale(-1, 1);
      ctx.translate(-w/2, -h/2);

      // Draw Mario Body (Local 0,0 is Top-Left of player rect)
      const bob = isJumping ? 0 : Math.sin(runFrame) * 3;
      
      // Colors
      const shirt = "#D32F2F";
      const overalls = "#1976D2";
      const skin = "#FFCCB0";
      const hat = isBig ? "#D32F2F" : "#D32F2F";

      // Legs
      ctx.fillStyle = overalls; // Blue pants
      if (isJumping) {
          ctx.fillRect(5, h - 20, 10, 20); // Left
          ctx.fillRect(w - 15, h - 25, 10, 20); // Right higher
      } else {
          // Running
          const stride = Math.sin(runFrame) * 10;
          ctx.fillRect(5 - stride, h - 20, 10, 20);
          ctx.fillRect(w - 15 + stride, h - 20, 10, 20);
      }
      
      // Torso
      ctx.fillStyle = shirt;
      ctx.fillRect(2, h - 45 + bob, w - 4, 25);
      
      // Overalls Bib
      ctx.fillStyle = overalls;
      ctx.fillRect(8, h - 35 + bob, w - 16, 15);
      
      // Head
      ctx.fillStyle = skin;
      const headSize = isBig ? 24 : 18;
      const headY = isBig ? 5 : 0;
      ctx.beginPath();
      ctx.arc(w/2, 15 + bob, headSize/2, 0, Math.PI*2);
      ctx.fill();
      
      // Hat
      ctx.fillStyle = hat;
      ctx.beginPath();
      ctx.rect(w/2 - headSize/2 - 2, 5 + bob, headSize + 4, 5); // Brim
      ctx.arc(w/2, 10 + bob, headSize/2, Math.PI, 0);
      ctx.fill();
      
      // Mustache
      ctx.fillStyle = "#000";
      ctx.fillRect(w/2 + 2, 18 + bob, 8, 3);

      ctx.restore();
  };

  const drawEnemy = (ctx: CanvasRenderingContext2D, ent: Entity, theme: any) => {
     // Simple Enemy Shapes
     if (ent.type.includes('GOOMBA')) {
         ctx.fillStyle = ent.type === 'GOOMBA_BLUE' ? '#004466' : '#8B4513';
         // Mushroom shape
         ctx.beginPath();
         ctx.moveTo(ent.x, ent.y + ent.h);
         ctx.lineTo(ent.x, ent.y + 10);
         ctx.quadraticCurveTo(ent.x + ent.w/2, ent.y - 10, ent.x + ent.w, ent.y + 10);
         ctx.lineTo(ent.x + ent.w, ent.y + ent.h);
         ctx.fill();
         // Eyes
         ctx.fillStyle = '#fff';
         ctx.fillRect(ent.x + 5, ent.y + 10, 8, 10);
         ctx.fillRect(ent.x + 20, ent.y + 10, 8, 10);
         ctx.fillStyle = '#000';
         ctx.fillRect(ent.x + 7, ent.y + 12, 3, 5);
         ctx.fillRect(ent.x + 22, ent.y + 12, 3, 5);
     } else if (ent.type.includes('TURTLE')) {
         ctx.fillStyle = ent.type === 'TURTLE_RED' ? '#D32F2F' : '#32CD32';
         ctx.beginPath();
         ctx.ellipse(ent.x + ent.w/2, ent.y + ent.h/2 + 5, ent.w/2, ent.h/3, 0, 0, Math.PI*2);
         ctx.fill();
         // Head
         ctx.fillStyle = '#FFD700';
         ctx.beginPath(); ctx.arc(ent.x + 5, ent.y + 10, 8, 0, Math.PI*2); ctx.fill();
     } else if (ent.type === 'GHOST') {
         ctx.fillStyle = 'rgba(255,255,255,0.9)';
         ctx.beginPath(); ctx.arc(ent.x + ent.w/2, ent.y + ent.h/2, ent.w/2, 0, Math.PI*2); ctx.fill();
         ctx.fillStyle = '#000';
         ctx.fillText('boo', ent.x + 10, ent.y + 20); // Lazy face
     } else {
         ctx.fillStyle = 'red';
         ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
     }
  };

  const drawMushroom = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      ctx.fillStyle = '#fff'; // Stalk
      ctx.fillRect(x + 5, y + 15, 20, 15);
      ctx.fillStyle = '#E52521'; // Red Cap
      ctx.beginPath();
      ctx.arc(x + 15, y + 15, 16, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#fff'; // Spots
      ctx.beginPath(); ctx.arc(x + 10, y + 8, 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 20, y + 12, 3, 0, Math.PI*2); ctx.fill();
  };

  const drawDecoration = (ctx: CanvasRenderingContext2D, x: number, y: number, type: string) => {
      if (type === 'HILL') {
          ctx.fillStyle = "rgba(46, 139, 87, 0.6)";
          ctx.beginPath(); ctx.arc(x, y, 80, Math.PI, 0); ctx.fill();
      } else if (type === 'PYRAMID') {
          ctx.fillStyle = "rgba(210, 180, 140, 0.6)";
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 100, y); ctx.lineTo(x + 50, y - 80); ctx.fill();
      } else if (type === 'CRYSTAL') {
          ctx.fillStyle = "rgba(100, 200, 255, 0.3)";
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 20, y - 40); ctx.lineTo(x + 40, y); ctx.lineTo(x + 20, y + 10); ctx.fill();
      }
  };

  const drawCloud = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, dark: boolean) => {
    ctx.fillStyle = dark ? "rgba(100,100,110,0.5)" : "rgba(255, 255, 255, 0.7)";
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.arc(40, 0, 40, 0, Math.PI * 2);
    ctx.arc(80, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  return (
    <div className="game-container" onClick={handleStart}>
      <h1 className="title">SUPER JUMP BROS</h1>
      
      <div className="canvas-wrapper">
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT} 
        />
        
        {/* UI Overlay */}
        <div className="hud">
            <span style={{color: '#fff', fontSize: '1rem', marginRight:'auto'}}>WORLD: {currentThemeName}</span>
            <span>SCORE: {score.toString().padStart(5, '0')}</span>
            <span style={{color: '#ffd700'}}>HI: {game.current.highScore}</span>
        </div>

        {gameState !== 'PLAYING' && (
            <div className="overlay">
                {gameState === 'START' ? (
                    <div className="message">
                        <p style={{fontSize: '1.2rem', fontWeight:'bold'}}>CLICK TO START</p>
                        <p style={{fontSize: '0.8rem'}}>ARROWS to Move, SPACE to Jump</p>
                    </div>
                ) : (
                    <div className="message">
                        <p className="game-over-text">GAME OVER</p>
                        <p style={{fontSize: '1.5rem'}}>SCORE: {score}</p>
                        <p className="blink">CLICK TO RETRY</p>
                    </div>
                )}
            </div>
        )}
      </div>
      
      <p className="controls-hint">[ARROWS] Move • [SPACE] Jump • [DOWN] Nothing yet</p>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);