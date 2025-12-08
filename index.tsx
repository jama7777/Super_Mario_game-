
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// --- Game Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const GROUND_HEIGHT = 60;
const GROUND_Y = CANVAS_HEIGHT - GROUND_HEIGHT;

// Physics
const GRAVITY = 0.6;
const ACCELERATION = 0.5;
const FRICTION = 0.82;
const MAX_SPEED = 8;
const JUMP_FORCE = -15;
const BOUNCE_FORCE = -8;

// Dimensions
const PLAYER_W_SMALL = 30;
const PLAYER_H_SMALL = 40;
const PLAYER_W_BIG = 40;
const PLAYER_H_BIG = 70;

// Generation
const THEME_CHANGE_DISTANCE = 3000;

// --- Camera Modes ---
const CAMERA_MODES = [
  { name: '2D Flat', dx: 0, dy: 0 },
  { name: 'Classic Right', dx: 10, dy: -10 },
  { name: 'Classic Left', dx: -10, dy: -10 },
  { name: 'Isometric Right', dx: 25, dy: -15 },
  { name: 'Isometric Left', dx: -25, dy: -15 },
  { name: 'Top Down', dx: 0, dy: -40 },
  { name: 'Deep Right', dx: 40, dy: -20 },
  { name: 'Deep Left', dx: -40, dy: -20 },
  { name: 'Shallow Right', dx: 15, dy: -5 },
  { name: 'Shallow Left', dx: -15, dy: -5 },
  { name: 'Extreme Right', dx: 60, dy: -10 },
  { name: 'Extreme Left', dx: -60, dy: -10 },
  { name: 'Tall Perspective', dx: 5, dy: -35 },
  { name: 'Wide Perspective', dx: 50, dy: -5 },
];

// --- Themes Configuration ---
const THEMES = [
  {
    name: 'OVERWORLD',
    bg: ['#5c94fc', '#95b8fc'],
    ground: '#74bf2e',
    dirt: '#835f30',
    enemies: ['GOOMBA', 'TURTLE'],
    decor: 'HILL',
    platform: '#B8860B'
  },
  {
    name: 'UNDERGROUND',
    bg: ['#0d0e15', '#242636'],
    ground: '#005f8c',
    dirt: '#00334d',
    enemies: ['BEETLE', 'GOOMBA_BLUE'],
    decor: 'CRYSTAL',
    platform: '#007AA3'
  },
  {
    name: 'DESERT',
    bg: ['#ffcc33', '#ff9933'],
    ground: '#e6c288',
    dirt: '#bf9b30',
    enemies: ['CACTUS_MOVING', 'TURTLE_RED'],
    decor: 'PYRAMID',
    platform: '#CD853F'
  },
  {
    name: 'CASTLE',
    bg: ['#2b0808', '#4a1010'],
    ground: '#666666',
    dirt: '#333333',
    enemies: ['GHOST', 'THWOMP'],
    decor: 'CHAIN',
    platform: '#808080'
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
  vx: number;
  vy: number;
  frame: number;
  active: boolean;
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
  
  lastGeneratedX: number;
  currentThemeIndex: number;
  
  frameCount: number;
  animationFrameId: number;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAME_OVER'>('START');
  const [score, setScore] = useState(0);
  const [currentThemeName, setCurrentThemeName] = useState('OVERWORLD');
  const [cameraIndex, setCameraIndex] = useState(0);
  
  const currentCamera = CAMERA_MODES[cameraIndex];

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

  // Focus helper
  const focusGame = () => {
    if(containerRef.current) containerRef.current.focus();
  };

  // Input Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if ((e.code === 'Space' || e.code === 'ArrowUp') && gameState === 'PLAYING') {
        performJump();
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

  // Jump Logic
  const performJump = () => {
    const p = game.current.player;
    if (p.isGrounded) {
      p.vy = JUMP_FORCE;
      p.isGrounded = false;
    }
  };

  // Init Background
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

      updatePlayer(state);
      
      // Camera Follow
      const targetCamX = state.player.x - CANVAS_WIDTH * 0.4;
      if (targetCamX > state.camera.x) {
        state.camera.x = targetCamX;
      }

      generateWorld(state);
      updateEntities(state);
      updateParticles(state);

      // Background Parallax
      state.clouds.forEach(c => {
         c.x -= c.speed; 
         if (c.x + 100 < 0) c.x = CANVAS_WIDTH + 100;
      });

      // Update UI Score
      const distScore = Math.floor(state.player.x / 100);
      if (distScore > state.score) {
          state.score = distScore;
          setScore(state.score);
      }
      
      // Sync Theme Name
      const theme = THEMES[state.currentThemeIndex];
      if (theme.name !== currentThemeName) {
         setCurrentThemeName(theme.name); 
      }

      draw(ctx, state);
      state.animationFrameId = requestAnimationFrame(loop);
    };

    if (gameState === 'PLAYING') {
      resetGame();
      focusGame();
      game.current.animationFrameId = requestAnimationFrame(loop);
    } else {
      draw(ctx, game.current);
    }

    return () => cancelAnimationFrame(game.current.animationFrameId);
  }, [gameState, cameraIndex]); // Re-bind loop if camera changes

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
    g.lastGeneratedX = 400;
    g.currentThemeIndex = 0;
    g.frameCount = 0;
    setScore(0);
    setCurrentThemeName('OVERWORLD');
  };

  const updatePlayer = (state: GameState) => {
    const p = state.player;

    if (keys.current.has('ArrowRight')) {
        p.vx += ACCELERATION;
        p.facingRight = true;
    } else if (keys.current.has('ArrowLeft')) {
        p.vx -= ACCELERATION;
        p.facingRight = false;
    } else {
        p.vx *= FRICTION;
    }
    
    if (p.vx > MAX_SPEED) p.vx = MAX_SPEED;
    if (p.vx < -MAX_SPEED) p.vx = -MAX_SPEED;
    if (Math.abs(p.vx) < 0.1) p.vx = 0;

    p.x += p.vx;
    if (p.x < 0) { p.x = 0; p.vx = 0; }

    p.vy += GRAVITY;
    p.y += p.vy;

    // Ground
    if (p.y + p.h > GROUND_Y) {
        p.y = GROUND_Y - p.h;
        p.vy = 0;
        p.isGrounded = true;
    } else {
        p.isGrounded = false;
    }

    // Platforms
    state.entities.forEach(ent => {
        if (ent.type === 'BLOCK' && ent.active) {
            // Precise landing
            if (p.vy >= 0 && 
                p.y + p.h - p.vy <= ent.y + 10 &&
                p.x + p.w > ent.x + 5 && p.x < ent.x + ent.w - 5 &&
                p.y + p.h >= ent.y) {
                    p.y = ent.y - p.h;
                    p.vy = 0;
                    p.isGrounded = true;
            }
        }
    });

    if (p.isInvulnerable) {
        p.invulnerableTimer--;
        if (p.invulnerableTimer <= 0) p.isInvulnerable = false;
    }

    if (Math.abs(p.vx) > 0.5 && p.isGrounded) {
        p.runFrame += Math.abs(p.vx) * 0.05;
    } else if (!p.isGrounded) {
        p.runFrame = 1;
    } else {
        p.runFrame = 0;
    }
  };

  const generateWorld = (state: GameState) => {
      const generateHorizon = state.camera.x + CANVAS_WIDTH + 200;
      
      while (state.lastGeneratedX < generateHorizon) {
          const theme = THEMES[state.currentThemeIndex];
          const x = state.lastGeneratedX;
          
          if (Math.random() < 0.15) {
              const decor = { x, y: GROUND_Y, type: theme.decor };
              state.decorations.push(decor);
          }

          if (x > 600 && Math.random() < 0.06) {
             const type = theme.enemies[Math.floor(Math.random() * theme.enemies.length)];
             let y = GROUND_Y - 40;
             let w = 40, h = 40;
             let vx = -1;
             
             if (type === 'GHOST') {
                 y = GROUND_Y - 100 - Math.random() * 100;
                 vx = -1.5;
             }
             if (type === 'THWOMP') {
                 y = GROUND_Y - 150;
                 w = 60; h = 60;
                 vx = 0;
             }
             if (type === 'CACTUS_MOVING') {
                 vx = 0;
                 w = 50; h = 60;
                 y = GROUND_Y - 60;
             }

             state.entities.push({
                 id: Math.random(),
                 type, x, y, w, h, vx, vy: 0, frame: 0, active: true
             });
          }

          if (x > 600 && Math.random() < 0.1) {
             const height = 120 + (Math.random() * 50);
             state.entities.push({
                 id: Math.random(),
                 type: 'BLOCK',
                 x, y: GROUND_Y - height, w: 50, h: 50,
                 vx: 0, vy: 0, frame: 0, active: true
             });
             
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

          state.lastGeneratedX += 60 + Math.random() * 60;
      }

      if (state.lastGeneratedX > (state.currentThemeIndex + 1) * THEME_CHANGE_DISTANCE) {
          let nextIndex = Math.floor(Math.random() * THEMES.length);
          if (nextIndex === state.currentThemeIndex) nextIndex = (nextIndex + 1) % THEMES.length;
          state.currentThemeIndex = nextIndex;
      }
  };

  const updateEntities = (state: GameState) => {
      state.entities.forEach(ent => {
          if (!ent.active) return;
          if (ent.type !== 'BLOCK' && ent.type !== 'MUSHROOM') { 
             ent.x += ent.vx;
             ent.frame += 0.1;
          }

          if (checkCollision(state.player, ent)) {
             handleCollision(state, ent);
          }
      });

      state.entities = state.entities.filter(e => e.active && e.x > state.camera.x - 200);
      state.decorations = state.decorations.filter(d => d.x > state.camera.x - 200);
  };

  const checkCollision = (p: GameState['player'], ent: Entity) => {
      const px = p.x + 5;
      const pw = p.w - 10;
      const py = p.y;
      const ph = p.h;
      
      return (
          px < ent.x + ent.w &&
          px + pw > ent.x &&
          py < ent.y + ent.h &&
          py + ph > ent.y
      );
  };

  const handleCollision = (state: GameState, ent: Entity) => {
      const p = state.player;

      if (ent.type === 'MUSHROOM') {
          ent.active = false;
          p.isBig = true;
          p.w = PLAYER_W_BIG;
          p.h = PLAYER_H_BIG;
          p.y -= 20;
          spawnParticles(state, ent.x, ent.y, '#FFD700', 10);
          return;
      }

      if (ent.type === 'BLOCK') {
          if (p.vy < 0 && p.y > ent.y) {
              p.vy = 2; // Head bonk
          }
          return;
      }

      if (p.isInvulnerable) return;

      const hitFromTop = (p.y + p.h) - ent.y < 35 && p.vy > 0;

      if (hitFromTop && ent.type !== 'THWOMP' && ent.type !== 'CACTUS_MOVING') {
          ent.active = false;
          p.vy = BOUNCE_FORCE;
          state.score += 50;
          spawnParticles(state, ent.x, ent.y, '#fff', 5);
      } else {
          if (p.isBig) {
              p.isBig = false;
              p.isInvulnerable = true;
              p.invulnerableTimer = 90;
              p.w = PLAYER_W_SMALL;
              p.h = PLAYER_H_SMALL;
              p.y += 10;
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
      if (gameState === 'START' || gameState === 'GAME_OVER') {
          setGameState('PLAYING');
      }
      focusGame();
  };

  // --- Drawing System ---

  const draw = (ctx: CanvasRenderingContext2D, state: GameState) => {
    const theme = THEMES[state.currentThemeIndex];
    const camX = state.camera.x;
    
    // De-structure current camera
    const { dx, dy } = CAMERA_MODES[cameraIndex];
    const is3D = cameraIndex !== 0; // 0 is Flat 2D

    // Sky
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, theme.bg[0]);
    gradient.addColorStop(1, theme.bg[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Clouds
    ctx.save();
    state.clouds.forEach(c => drawCloud(ctx, c.x, c.y, c.size, state.currentThemeIndex === 1, dx, dy));
    ctx.restore();

    ctx.save();
    ctx.translate(-camX, 0);

    // Decorations
    state.decorations.forEach(d => {
        if(d.x > camX - 100 && d.x < camX + CANVAS_WIDTH + 100) 
            drawDecoration(ctx, d.x, d.y, d.type, dx, dy);
    });

    // Ground
    const groundStart = Math.floor(camX / 50) * 50;
    const groundEnd = groundStart + CANVAS_WIDTH + 100;
    
    // 3D Top Face of Ground (Only if looking down/up)
    if (dy !== 0) {
        ctx.fillStyle = "#5a9c20"; // Darker green
        if (theme.name === 'UNDERGROUND') ctx.fillStyle = "#004d70";
        if (theme.name === 'DESERT') ctx.fillStyle = "#c2a370";
        if (theme.name === 'CASTLE') ctx.fillStyle = "#555";
        
        ctx.beginPath();
        // Just extrude the top line of the ground
        ctx.moveTo(groundStart, GROUND_Y);
        ctx.lineTo(groundStart + dx, GROUND_Y + dy);
        ctx.lineTo(groundEnd + dx, GROUND_Y + dy);
        ctx.lineTo(groundEnd, GROUND_Y);
        ctx.fill();
    }

    // Ground Front Face
    ctx.fillStyle = theme.dirt;
    ctx.fillRect(groundStart, GROUND_Y, CANVAS_WIDTH + 100, GROUND_HEIGHT);
    ctx.fillStyle = theme.ground;
    ctx.fillRect(groundStart, GROUND_Y, CANVAS_WIDTH + 100, 15);
    
    // Grid Details
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    for (let x = groundStart; x < groundEnd; x+=50) {
        ctx.fillRect(x, GROUND_Y + 15, 48, GROUND_HEIGHT);
    }

    // Entities
    state.entities.forEach(ent => {
        if (!ent.active) return;
        if (ent.type === 'BLOCK') {
            drawBlock(ctx, ent.x, ent.y, ent.w, ent.h, theme.platform, dx, dy);
        } else if (ent.type === 'MUSHROOM') {
            drawMushroom(ctx, ent.x, ent.y, dx, dy);
        } else {
            drawEnemy(ctx, ent, theme, dx, dy);
        }
    });

    // Particles
    state.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 5, 5);
    });

    // Player
    if (state.player.invulnerableTimer % 4 < 2) {
        drawPlayer(ctx, state.player, dx, dy);
    }

    ctx.restore();
  };

  // --- 3D Helpers ---
  const drawCube = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, dx: number, dy: number) => {
      // 1. Draw Extrusions (Back/Sides)
      ctx.fillStyle = "rgba(0,0,0,0.3)"; // Shadow color for sides
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.2)";

      if (dx !== 0 || dy !== 0) {
           // Side Face
           ctx.beginPath();
           if (dx > 0) { // Right face visible
               ctx.moveTo(x + w, y);
               ctx.lineTo(x + w + dx, y + dy);
               ctx.lineTo(x + w + dx, y + h + dy);
               ctx.lineTo(x + w, y + h);
           } else { // Left face visible
               ctx.moveTo(x, y);
               ctx.lineTo(x + dx, y + dy);
               ctx.lineTo(x + dx, y + h + dy);
               ctx.lineTo(x, y + h);
           }
           ctx.fill();
           ctx.stroke();

           // Top/Bottom Face
           ctx.fillStyle = "rgba(255,255,255,0.2)"; // Top highlight
           ctx.beginPath();
           if (dy < 0) { // Top face visible
               ctx.moveTo(x, y);
               ctx.lineTo(x + dx, y + dy);
               ctx.lineTo(x + w + dx, y + dy);
               ctx.lineTo(x + w, y);
           } else { // Bottom face visible
               ctx.moveTo(x, y + h);
               ctx.lineTo(x + dx, y + h + dy);
               ctx.lineTo(x + w + dx, y + h + dy);
               ctx.lineTo(x + w, y + h);
           }
           ctx.fill();
           ctx.stroke();
      }
      
      // 2. Front Face
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.strokeRect(x, y, w, h);
  };

  const drawBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, dx: number, dy: number) => {
      if (dx !== 0 || dy !== 0) {
          drawCube(ctx, x, y, w, h, color, dx, dy);
      } else {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = '#000';
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = "rgba(0,0,0,0.2)";
          ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
      }
  };

  // --- Entity Drawers ---

  const drawPlayer = (ctx: CanvasRenderingContext2D, p: GameState['player'], dx: number, dy: number) => {
      const { x, y, w, h, facingRight, runFrame, isBig } = p;
      const isJumping = !p.isGrounded;

      const drawSprite = (offsetX: number, offsetY: number, brightness: number) => {
        ctx.save();
        const cx = x + w/2 + offsetX;
        const cy = y + h/2 + offsetY;
        ctx.translate(cx, cy);
        if (!facingRight) ctx.scale(-1, 1);
        ctx.translate(-w/2, -h/2);

        // Filter for "3D shadow"
        if (brightness < 1) {
            ctx.filter = `brightness(${brightness})`;
        }

        const bob = isJumping ? 0 : Math.sin(runFrame) * 3;
        
        const shirt = "#D32F2F";
        const overalls = "#1976D2";
        const skin = "#FFCCB0";
        const hatColor = "#D32F2F";

        ctx.fillStyle = overalls;
        if (isJumping) {
            ctx.fillRect(5, h - 20, 10, 20);
            ctx.fillRect(w - 15, h - 25, 10, 20);
        } else {
            const stride = Math.sin(runFrame) * 10;
            ctx.fillRect(5 - stride, h - 20, 10, 20);
            ctx.fillRect(w - 15 + stride, h - 20, 10, 20);
        }
        
        ctx.fillStyle = shirt;
        ctx.fillRect(2, h - 45 + bob, w - 4, 25);
        
        ctx.fillStyle = overalls;
        ctx.fillRect(8, h - 35 + bob, w - 16, 15);
        
        ctx.fillStyle = skin;
        const headSize = isBig ? 24 : 18;
        ctx.beginPath();
        ctx.arc(w/2, 15 + bob, headSize/2, 0, Math.PI*2);
        ctx.fill();
        
        ctx.fillStyle = hatColor;
        ctx.beginPath();
        ctx.rect(w/2 - headSize/2 - 2, 5 + bob, headSize + 4, 5);
        ctx.arc(w/2, 10 + bob, headSize/2, Math.PI, 0);
        ctx.fill();
        
        ctx.fillStyle = "#000";
        ctx.fillRect(w/2 + 2, 18 + bob, 8, 3);

        ctx.restore();
      };

      if (dx !== 0 || dy !== 0) {
          // Draw "thickness" layers
          // Scale down the extrusion for characters so it's not as extreme as blocks
          const ex = dx * 0.3;
          const ey = dy * 0.3;
          drawSprite(ex, ey, 0.5); // Shadow layer
          drawSprite(ex * 0.5, ey * 0.5, 0.7); // Middle layer
          drawSprite(0, 0, 1);    // Front layer
      } else {
          drawSprite(0, 0, 1);
      }
  };

  const drawEnemy = (ctx: CanvasRenderingContext2D, ent: Entity, theme: any, dx: number, dy: number) => {
     const drawSprite = (offsetX: number, offsetY: number, brightness: number) => {
        ctx.save();
        ctx.translate(offsetX, offsetY);
        if (brightness < 1) ctx.filter = `brightness(${brightness})`;

        if (ent.type.includes('GOOMBA')) {
            ctx.fillStyle = ent.type === 'GOOMBA_BLUE' ? '#004466' : '#8B4513';
            ctx.beginPath();
            ctx.moveTo(ent.x, ent.y + ent.h);
            ctx.lineTo(ent.x, ent.y + 10);
            ctx.quadraticCurveTo(ent.x + ent.w/2, ent.y - 10, ent.x + ent.w, ent.y + 10);
            ctx.lineTo(ent.x + ent.w, ent.y + ent.h);
            ctx.fill();
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
            ctx.fillStyle = '#FFD700';
            ctx.beginPath(); ctx.arc(ent.x + 5, ent.y + 10, 8, 0, Math.PI*2); ctx.fill();
        } else if (ent.type === 'GHOST') {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath(); ctx.arc(ent.x + ent.w/2, ent.y + ent.h/2, ent.w/2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.fillText('boo', ent.x + 10, ent.y + 20);
        } else if (ent.type === 'CACTUS_MOVING') {
            ctx.fillStyle = '#228B22';
            ctx.fillRect(ent.x + 10, ent.y, 30, ent.h);
            ctx.fillRect(ent.x, ent.y + 20, 10, 10);
            ctx.fillRect(ent.x + 40, ent.y + 10, 10, 10);
        } else {
            ctx.fillStyle = 'red';
            ctx.fillRect(ent.x, ent.y, ent.w, ent.h);
        }
        ctx.restore();
     }

     if (dx !== 0 || dy !== 0) {
         const ex = dx * 0.3;
         const ey = dy * 0.3;
         drawSprite(ex, ey, 0.5);
         drawSprite(0, 0, 1);
     } else {
         drawSprite(0, 0, 1);
     }
  };

  const drawMushroom = (ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number) => {
      const drawSprite = (ox: number, oy: number) => {
          ctx.save();
          ctx.translate(ox, oy);
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + 5, y + 15, 20, 15);
          ctx.fillStyle = '#E52521';
          ctx.beginPath();
          ctx.arc(x + 15, y + 15, 16, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x + 10, y + 8, 3, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(x + 20, y + 12, 3, 0, Math.PI*2); ctx.fill();
          ctx.restore();
      }
      if (dx !== 0 || dy !== 0) {
          const ex = dx * 0.3;
          const ey = dy * 0.3;
          ctx.filter = "brightness(0.5)";
          drawSprite(ex, ey);
          ctx.filter = "none";
          drawSprite(0, 0);
      } else {
          drawSprite(0, 0);
      }
  };

  const drawDecoration = (ctx: CanvasRenderingContext2D, x: number, y: number, type: string, dx: number, dy: number) => {
      const draw = (ox: number, oy: number) => {
          ctx.save();
          ctx.translate(ox, oy);
          if (type === 'HILL') {
              ctx.fillStyle = "rgba(46, 139, 87, 0.6)";
              ctx.beginPath(); ctx.arc(x, y, 80, Math.PI, 0); ctx.fill();
          } else if (type === 'PYRAMID') {
              ctx.fillStyle = "rgba(210, 180, 140, 0.6)";
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 100, y); ctx.lineTo(x + 50, y - 80); ctx.fill();
          } else if (type === 'CRYSTAL') {
              ctx.fillStyle = "rgba(100, 200, 255, 0.3)";
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 20, y - 40); ctx.lineTo(x + 40, y); ctx.lineTo(x + 20, y + 10); ctx.fill();
          } else if (type === 'CHAIN') {
              ctx.strokeStyle = '#555';
              ctx.lineWidth = 4;
              ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y - 100); ctx.stroke();
          }
          ctx.restore();
      }
      
      if (dx !== 0 || dy !== 0) {
          const ex = dx * 0.4;
          const ey = dy * 0.4;
          ctx.filter = "brightness(0.7)";
          draw(ex, ey);
          ctx.filter = "none";
          draw(0,0);
      } else {
          draw(0,0);
      }
  };

  const drawCloud = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, dark: boolean, dx: number, dy: number) => {
    ctx.fillStyle = dark ? "rgba(100,100,110,0.5)" : "rgba(255, 255, 255, 0.7)";
    
    const d = (ox: number, oy: number) => {
        ctx.save();
        ctx.translate(x + ox, y + oy);
        ctx.scale(size, size);
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.arc(40, 0, 40, 0, Math.PI * 2);
        ctx.arc(80, 0, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    if(dx !== 0 || dy !== 0) {
        ctx.fillStyle = "rgba(0,0,0,0.1)"; // Deep shadow
        // Clouds are high up, so shadow is far
        d(dx * 0.5, dy * 0.5 + 40);
        ctx.fillStyle = dark ? "rgba(100,100,110,0.5)" : "rgba(255, 255, 255, 0.7)";
        d(0,0);
    } else {
        d(0,0);
    }
  };

  // Mobile Handlers
  const handleTouchStart = (key: string) => (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      if(key === 'Space') performJump();
      else keys.current.add(key);
  };
  const handleTouchEnd = (key: string) => (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      keys.current.delete(key);
  };

  const nextCamera = (e: React.MouseEvent) => {
      e.stopPropagation();
      setCameraIndex(prev => (prev + 1) % CAMERA_MODES.length);
  };

  const prevCamera = (e: React.MouseEvent) => {
      e.stopPropagation();
      setCameraIndex(prev => (prev - 1 + CAMERA_MODES.length) % CAMERA_MODES.length);
  };

  return (
    <div 
      className="game-container" 
      ref={containerRef} 
      tabIndex={0} 
      onKeyDown={(e) => {
          if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
              e.preventDefault();
          }
      }}
      style={{outline: 'none'}}
    >
      <div style={{display:'flex', alignItems:'center', gap: '20px', flexWrap:'wrap', justifyContent:'center'}}>
        <h1 className="title">SUPER JUMP BROS</h1>
        <div className="camera-controls">
            <button className="cam-btn" onClick={prevCamera}>◀</button>
            <span className="cam-label">{currentCamera.name}</span>
            <button className="cam-btn" onClick={nextCamera}>▶</button>
        </div>
      </div>
      
      <div className="canvas-wrapper">
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT} 
        />
        
        <div className="hud">
            <span style={{color: '#fff', fontSize: '1rem', marginRight:'auto'}}>WORLD: {currentThemeName}</span>
            <span>SCORE: {score.toString().padStart(5, '0')}</span>
            <span style={{color: '#ffd700'}}>HI: {game.current.highScore}</span>
        </div>

        {gameState !== 'PLAYING' && (
            <div className="overlay" onClick={handleStart}>
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

      {/* On-screen controls for Touch/Mouse */}
      {gameState === 'PLAYING' && (
          <div className="mobile-controls">
              <div className="dpad">
                  <button 
                    onMouseDown={handleTouchStart('ArrowLeft')} 
                    onMouseUp={handleTouchEnd('ArrowLeft')} 
                    onTouchStart={handleTouchStart('ArrowLeft')} 
                    onTouchEnd={handleTouchEnd('ArrowLeft')}
                  >◀</button>
                  <button 
                    onMouseDown={handleTouchStart('ArrowRight')} 
                    onMouseUp={handleTouchEnd('ArrowRight')} 
                    onTouchStart={handleTouchStart('ArrowRight')} 
                    onTouchEnd={handleTouchEnd('ArrowRight')}
                  >▶</button>
              </div>
              <div className="action-btn">
                  <button 
                    onMouseDown={handleTouchStart('Space')} 
                    onMouseUp={handleTouchEnd('Space')}
                    onTouchStart={handleTouchStart('Space')} 
                    onTouchEnd={handleTouchEnd('Space')}
                  >A</button>
              </div>
          </div>
      )}
      
      <p className="controls-hint" style={{display: 'none'}}>[ARROWS] Move • [SPACE] Jump</p>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
