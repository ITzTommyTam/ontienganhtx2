import React, { useEffect, useRef } from 'react';
import {
  ActiveEnemy,
  calculateAccuracy,
  calculateWordScore,
  calculateWpm,
  createSeededRng,
  estimateEnemyBoxWidth,
  findNonOverlappingSpawnX,
  formatUntypedMask,
  getVocabPool,
  getWordLengthHint,
  GuessDisplayMode,
  normalizeForTyping,
  processKeystroke,
  resolveEnemyOverlaps,
  selectArchetype,
} from '../game/rules';
import { Unit2Section, VocabItem } from '../data/unit2Vocab';
import { soundEngine } from '../services/sound';

export type GameStateMode = 'title' | 'playing' | 'paused' | 'gameover';

export interface HudSnapshot {
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  wpm: number;
  wave: number;
  hp: number;
  maxHp: number;
  wordsCleared: number;
  targetWordsForWave: number;
  lockedVocab: VocabItem | null;
  lockedTyped: string;
  lockedRemainingMask: string;
  lockedLengthHint: string;
  lastMistypeHint: string | null;
  correctKeys: number;
  totalKeys: number;
}

export interface EndRunSummary {
  victory: boolean;
  score: number;
  accuracy: number;
  wpm: number;
  wave: number;
  wordsCleared: number;
  maxCombo: number;
  missedInRun: { vocab: VocabItem; reason: 'MISTYPED' | 'BREACHED' }[];
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface LaserBeam {
  active: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  life: number;
  maxLife: number;
  isKillShot: boolean;
}

interface Star {
  x: number;
  y: number;
  z: number; // 0.3 (far) to 1.8 (near)
  size: number;
  twinklePhase: number;
}

interface SpaceShooterCanvasProps {
  gameState: GameStateMode;
  sectionFilter: Unit2Section | 'ALL';
  reviewOnlyIds?: string[];
  displayMode: GuessDisplayMode;
  challengeSeed?: number;
  runId: number;
  onHudUpdate: (hud: HudSnapshot) => void;
  onMistake: (vocab: VocabItem, reason: 'MISTYPED' | 'BREACHED') => void;
  onGameEnd: (summary: EndRunSummary) => void;
  virtualInputRef: React.MutableRefObject<((char: string) => void) | null>;
  triggerHintRef: React.MutableRefObject<(() => void) | null>;
  cycleTargetRef: React.MutableRefObject<(() => void) | null>;
}

const MAX_PARTICLES = 260;
const MAX_LASERS = 32;
const NUM_STARS = 150;

export const SpaceShooterCanvas: React.FC<SpaceShooterCanvasProps> = ({
  gameState,
  sectionFilter,
  reviewOnlyIds,
  displayMode,
  challengeSeed,
  runId,
  onHudUpdate,
  onMistake,
  onGameEnd,
  virtualInputRef,
  triggerHintRef,
  cycleTargetRef,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Store latest props/callbacks in refs so the 60fps loop never tears down on React state changes
  const stateRef = useRef({
    gameState,
    sectionFilter,
    reviewOnlyIds,
    displayMode,
    challengeSeed,
    onHudUpdate,
    onMistake,
    onGameEnd,
  });

  useEffect(() => {
    stateRef.current = {
      gameState,
      sectionFilter,
      reviewOnlyIds,
      displayMode,
      challengeSeed,
      onHudUpdate,
      onMistake,
      onGameEnd,
    };
  }, [
    gameState,
    sectionFilter,
    reviewOnlyIds,
    displayMode,
    challengeSeed,
    onHudUpdate,
    onMistake,
    onGameEnd,
  ]);

  // Simulation mutable state ref
  const simRef = useRef({
    width: 1280,
    height: 800,
    score: 0,
    combo: 0,
    maxCombo: 0,
    correctKeys: 0,
    totalKeys: 0,
    wave: 1,
    hp: 5,
    maxHp: 5,
    wordsCleared: 0,
    wordsClearedInWave: 0,
    targetWordsForWave: 8,
    elapsedPlayTime: 0,
    spawnTimer: 0.4,
    lockedUid: null as string | null,
    lastMistypeHint: null as string | null,
    enemies: [] as ActiveEnemy[],
    missedInRun: [] as { vocab: VocabItem; reason: 'MISTYPED' | 'BREACHED' }[],
    rng: Math.random as () => number,
    vocabDeck: [] as VocabItem[],
    deckIndex: 0,
    hitstopTimer: 0,
    cameraTrauma: 0,
    shipAngle: -Math.PI / 2,
    targetShipAngle: -Math.PI / 2,
    shipRecoil: 0,
    shipScaleX: 1,
    shipScaleY: 1,
    hurtFlashTimer: 0,
    endingTimer: 0,
    pendingVictory: false,
    pointerX: 640,
    pointerY: 300,
    particleHead: 0,
    particles: Array.from({ length: MAX_PARTICLES }, (): Particle => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 2,
      color: '#FFFFFF',
    })),
    laserHead: 0,
    lasers: Array.from({ length: MAX_LASERS }, (): LaserBeam => ({
      active: false,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      life: 0,
      maxLife: 0.16,
      isKillShot: false,
    })),
    stars: Array.from({ length: NUM_STARS }, (): Star => ({
      x: Math.random() * 1600,
      y: Math.random() * 1000,
      z: 0.3 + Math.random() * 1.5,
      size: Math.random() > 0.82 ? 2.2 : 1.2,
      twinklePhase: Math.random() * Math.PI * 2,
    })),
  });

  // Reset simulation when starting a new run
  useEffect(() => {
    const sim = simRef.current;
    const { sectionFilter: sec, reviewOnlyIds: revIds, challengeSeed: seed } = stateRef.current;
    const rng = seed ? createSeededRng(seed) : Math.random;
    sim.rng = rng;

    const pool = [...getVocabPool(sec, revIds)];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    sim.vocabDeck = pool;
    sim.deckIndex = 0;
    sim.score = 0;
    sim.combo = 0;
    sim.maxCombo = 0;
    sim.correctKeys = 0;
    sim.totalKeys = 0;
    sim.wave = 1;
    sim.hp = 5;
    sim.maxHp = 5;
    sim.wordsCleared = 0;
    sim.wordsClearedInWave = 0;
    sim.targetWordsForWave = revIds && revIds.length > 0 ? Math.min(12, Math.max(5, revIds.length)) : 8;
    sim.elapsedPlayTime = 0;
    sim.spawnTimer = 0.25;
    sim.lockedUid = null;
    sim.lastMistypeHint = null;
    sim.enemies = [];
    sim.missedInRun = [];
    sim.hitstopTimer = 0;
    sim.cameraTrauma = 0;
    sim.shipRecoil = 0;
    sim.hurtFlashTimer = 0;
    sim.endingTimer = 0;

    stateRef.current.onHudUpdate({
      score: 0,
      combo: 0,
      maxCombo: 0,
      accuracy: 100,
      wpm: 0,
      wave: 1,
      hp: 5,
      maxHp: 5,
      wordsCleared: 0,
      targetWordsForWave: sim.targetWordsForWave,
      lockedVocab: null,
      lockedTyped: '',
      lockedRemainingMask: '',
      lockedLengthHint: '',
      lastMistypeHint: null,
      correctKeys: 0,
      totalKeys: 0,
    });
  }, [runId]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sim = simRef.current;

    const updateBounds = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(480, Math.floor(rect.height));
      sim.width = w;
      sim.height = h;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateBounds();
    const ro = new ResizeObserver(updateBounds);
    ro.observe(container);

    const spawnParticles = (x: number, y: number, count: number, color: string, speedScale: number = 1) => {
      for (let i = 0; i < count; i++) {
        const p = sim.particles[sim.particleHead];
        sim.particleHead = (sim.particleHead + 1) % MAX_PARTICLES;
        const angle = Math.random() * Math.PI * 2;
        const spd = (35 + Math.random() * 165) * speedScale;
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd;
        p.maxLife = 0.25 + Math.random() * 0.45;
        p.life = p.maxLife;
        p.size = 1.5 + Math.random() * 3.0;
        p.color = color;
      }
    };

    const spawnLaser = (startX: number, startY: number, endX: number, endY: number, isKillShot: boolean) => {
      const l = sim.lasers[sim.laserHead];
      sim.laserHead = (sim.laserHead + 1) % MAX_LASERS;
      l.active = true;
      l.startX = startX;
      l.startY = startY;
      l.endX = endX;
      l.endY = endY;
      l.maxLife = isKillShot ? 0.24 : 0.13;
      l.life = l.maxLife;
      l.isKillShot = isKillShot;
    };

    const ensureActiveTarget = () => {
      const alive = sim.enemies.filter((e) => e.koTimer === 0);
      if (alive.length === 0) {
        sim.lockedUid = null;
        return null;
      }
      if (sim.lockedUid) {
        const found = alive.find((e) => e.uid === sim.lockedUid);
        if (found) return found;
      }
      // Auto-select closest falling asteroid so player always sees which Vietnamese meaning to guess
      const closest = [...alive].sort((a, b) => b.y - a.y)[0];
      sim.lockedUid = closest.uid;
      return closest;
    };

    const emitHudSnapshot = () => {
      const locked = ensureActiveTarget();
      const accuracy = calculateAccuracy(sim.correctKeys, sim.totalKeys);
      const wpm = calculateWpm(sim.correctKeys, sim.elapsedPlayTime);
      const mode = stateRef.current.displayMode;
      stateRef.current.onHudUpdate({
        score: sim.score,
        combo: sim.combo,
        maxCombo: sim.maxCombo,
        accuracy,
        wpm,
        wave: sim.wave,
        hp: sim.hp,
        maxHp: sim.maxHp,
        wordsCleared: sim.wordsCleared,
        targetWordsForWave: sim.targetWordsForWave,
        lockedVocab: locked ? locked.vocab : null,
        lockedTyped: locked ? locked.normalizedTarget.slice(0, locked.typedIndex) : '',
        lockedRemainingMask: locked
          ? formatUntypedMask(locked.normalizedTarget, locked.typedIndex, mode)
          : '',
        lockedLengthHint: locked ? getWordLengthHint(locked.normalizedTarget) : '',
        lastMistypeHint: sim.lastMistypeHint,
        correctKeys: sim.correctKeys,
        totalKeys: sim.totalKeys,
      });
    };

    const spawnEnemy = (): boolean => {
      if (sim.vocabDeck.length === 0) return false;
      const activeFirstLetters = new Set(
        sim.enemies.filter((e) => e.koTimer === 0).map((e) => e.normalizedTarget[0])
      );

      let chosen: VocabItem = sim.vocabDeck[sim.deckIndex % sim.vocabDeck.length];
      let chosenOffset = 0;
      for (let attempt = 0; attempt < sim.vocabDeck.length; attempt++) {
        const candidate = sim.vocabDeck[(sim.deckIndex + attempt) % sim.vocabDeck.length];
        const firstChar = normalizeForTyping(candidate.word)[0];
        if (!activeFirstLetters.has(firstChar)) {
          chosen = candidate;
          chosenOffset = attempt + 1;
          break;
        }
      }

      const norm = normalizeForTyping(chosen.word);
      const estBoxW = estimateEnemyBoxWidth(chosen, norm);
      const spawnY = 162; // Safely below the Top HUD bar so plaques never touch the HUD
      const safeX = findNonOverlappingSpawnX(sim.width, estBoxW, sim.enemies, sim.rng, spawnY);
      if (safeX === null) {
        // Top band is currently occupied; wait briefly so cards never spawn on top of each other
        return false;
      }

      sim.deckIndex = (sim.deckIndex + Math.max(1, chosenOffset)) % sim.vocabDeck.length;
      const archetype = selectArchetype(norm, sim.wave, sim.rng());
      const baseSpeed = 22 + sim.wave * 4.0 + sim.rng() * 8;
      const vy = archetype === 'ARMORED_CHARGER' ? baseSpeed * 0.8 : baseSpeed;

      sim.enemies.push({
        uid: `en_${Date.now()}_${Math.floor(sim.rng() * 100000)}`,
        vocab: chosen,
        normalizedTarget: norm,
        typedIndex: 0,
        x: safeX,
        y: spawnY,
        vx: 0,
        vy,
        baseX: safeX,
        phase: sim.rng() * Math.PI * 2,
        archetype,
        hitFlash: 0,
        missFlash: 0,
        windupTimer: archetype === 'ARMORED_CHARGER' ? 3.2 : 0,
        koTimer: 0,
        mistypedOnThis: false,
        boxW: estBoxW,
        boxH: 86,
      });

      resolveEnemyOverlaps(sim.enemies, sim.width);
      ensureActiveTarget();
      emitHudSnapshot();
      return true;
    };

    const handleCharInput = (char: string) => {
      if (stateRef.current.gameState !== 'playing' || sim.endingTimer > 0) return;
      if (!/^[a-zA-Z\s-]$/.test(char)) return;

      ensureActiveTarget();
      sim.totalKeys += 1;
      const res = processKeystroke(char, sim.enemies, sim.lockedUid);
      const shipX = sim.width / 2;
      const shipY = sim.height - 96;

      if (res.hit) {
        sim.correctKeys += 1;
        sim.combo += 1;
        if (sim.combo > sim.maxCombo) sim.maxCombo = sim.combo;
        sim.lockedUid = res.lockedUid;
        sim.lastMistypeHint = null;

        const targetEnemy =
          res.completedEnemy || sim.enemies.find((e) => e.uid === res.lockedUid);

        if (targetEnemy) {
          const dx = targetEnemy.x - shipX;
          const dy = targetEnemy.y - shipY;
          sim.targetShipAngle = Math.atan2(dy, dx);
          sim.shipRecoil = 7;
          sim.shipScaleX = 0.86;
          sim.shipScaleY = 1.16;

          const isKill = Boolean(res.completedEnemy);
          spawnLaser(shipX, shipY - 12, targetEnemy.x, targetEnemy.y, isKill);
          spawnParticles(targetEnemy.x, targetEnemy.y, isKill ? 24 : 6, '#FFFFFF', isKill ? 1.3 : 0.7);
          if (isKill) {
            spawnParticles(targetEnemy.x, targetEnemy.y, 12, '#D71921', 1.4);
          }
        }

        if (res.completedEnemy) {
          const killed = res.completedEnemy;
          const isArmored = killed.archetype === 'ARMORED_CHARGER';
          soundEngine.playWordDestroy(isArmored);
          soundEngine.speakWord(killed.vocab.word);

          const gained = calculateWordScore(
            killed.normalizedTarget.length,
            sim.combo,
            !killed.mistypedOnThis,
            killed.archetype,
            stateRef.current.displayMode
          );
          sim.score += gained;
          sim.wordsCleared += 1;
          sim.wordsClearedInWave += 1;
          killed.koTimer = 0.42; // Show completed English word for 0.42s as it dissolves
          sim.hitstopTimer = isArmored ? 0.065 : 0.04;
          sim.cameraTrauma = Math.min(1, sim.cameraTrauma + (isArmored ? 0.55 : 0.32));

          if (sim.wordsClearedInWave >= sim.targetWordsForWave) {
            if (stateRef.current.reviewOnlyIds && stateRef.current.reviewOnlyIds.length > 0 && sim.wave >= 1) {
              sim.endingTimer = 0.55;
              sim.pendingVictory = true;
            } else if (sim.wave >= 5) {
              sim.endingTimer = 0.55;
              sim.pendingVictory = true;
            } else {
              sim.wave += 1;
              sim.wordsClearedInWave = 0;
              sim.targetWordsForWave = 8 + sim.wave * 2;
              if (sim.hp < sim.maxHp) sim.hp += 1;
            }
          }
        } else {
          soundEngine.playLaserHit(sim.combo);
        }
      } else {
        // Mistyped key while guessing English word
        sim.combo = 0;
        sim.cameraTrauma = Math.min(1, sim.cameraTrauma + 0.22);
        soundEngine.playMistype();

        if (res.expectedChar) {
          const displayExp = res.expectedChar === ' ' ? 'DẤU CÁCH [SPACE]' : res.expectedChar.toUpperCase();
          sim.lastMistypeHint = `Sai chữ '${char.toUpperCase()}'! Gợi ý chữ tiếp theo: [${displayExp}] (Đã lưu vào Sổ Tay Từ Sai)`;
        }

        if (res.missedVocab) {
          stateRef.current.onMistake(res.missedVocab, 'MISTYPED');
          if (!sim.missedInRun.some((m) => m.vocab.id === res.missedVocab!.id)) {
            sim.missedInRun.push({ vocab: res.missedVocab, reason: 'MISTYPED' });
          }
        }
      }

      emitHudSnapshot();
    };

    const handleTriggerHint = () => {
      if (stateRef.current.gameState !== 'playing') return;
      const target = ensureActiveTarget();
      if (!target) return;
      const nextChar = target.normalizedTarget[target.typedIndex];
      if (nextChar) {
        handleCharInput(nextChar);
      }
    };

    const handleCycleTarget = () => {
      if (stateRef.current.gameState !== 'playing') return;
      const alive = sim.enemies.filter((e) => e.koTimer === 0).sort((a, b) => b.y - a.y);
      if (alive.length === 0) return;

      // Reset typed progress on current target if switching
      if (sim.lockedUid) {
        const curr = alive.find((e) => e.uid === sim.lockedUid);
        if (curr) curr.typedIndex = 0;
      }

      const idx = alive.findIndex((e) => e.uid === sim.lockedUid);
      const next = alive[(idx + 1) % alive.length];
      sim.lockedUid = next.uid;
      sim.lastMistypeHint = null;
      soundEngine.playUiClick();
      emitHudSnapshot();
    };

    virtualInputRef.current = handleCharInput;
    triggerHintRef.current = handleTriggerHint;
    cycleTargetRef.current = handleCycleTarget;

    const onKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current.gameState !== 'playing') return;
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        handleTriggerHint();
        return;
      }

      if (e.key === 'Backspace' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleCycleTarget();
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (/^[a-zA-Z\s-]$/.test(e.key)) {
          e.preventDefault();
          handleCharInput(e.key);
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      sim.pointerX = e.clientX - rect.left;
      sim.pointerY = e.clientY - rect.top;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (stateRef.current.gameState !== 'playing') return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Check if player clicked on an asteroid to target that Vietnamese meaning
      const alive = sim.enemies.filter((en) => en.koTimer === 0);
      for (const en of alive) {
        const halfW = (en.boxW || 240) / 2 + 10;
        if (Math.abs(mx - en.x) <= halfW && my >= en.y - 46 && my <= en.y + 72) {
          if (sim.lockedUid && sim.lockedUid !== en.uid) {
            const prev = alive.find((p) => p.uid === sim.lockedUid);
            if (prev) prev.typedIndex = 0;
          }
          sim.lockedUid = en.uid;
          sim.lastMistypeHint = null;
          soundEngine.playUiClick();
          emitHudSnapshot();
          break;
        }
      }
    };

    const onBlur = () => {
      sim.shipRecoil = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('blur', onBlur);

    let lastTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const mode = stateRef.current.gameState;
      const w = sim.width;
      const h = sim.height;
      const shipX = w / 2;
      const shipY = h - 96;

      // Update starfield
      const starSpeedMult = mode === 'playing' ? 18 + sim.wave * 4 : 9;
      for (let i = 0; i < NUM_STARS; i++) {
        const s = sim.stars[i];
        s.y += s.z * starSpeedMult * dt;
        s.twinklePhase += dt * 2.5;
        if (s.y > h) {
          s.y = -4;
          s.x = Math.random() * w;
        }
        if (s.x > w) s.x = Math.random() * w;
      }

      sim.cameraTrauma = Math.max(0, sim.cameraTrauma - dt * 2.4);
      sim.shipRecoil = Math.max(0, sim.shipRecoil - dt * 32);
      sim.shipScaleX += (1 - sim.shipScaleX) * Math.min(1, dt * 14);
      sim.shipScaleY += (1 - sim.shipScaleY) * Math.min(1, dt * 14);
      if (sim.hurtFlashTimer > 0) sim.hurtFlashTimer = Math.max(0, sim.hurtFlashTimer - dt);

      if (mode === 'title') {
        const dx = sim.pointerX - shipX;
        const dy = Math.min(sim.pointerY, shipY - 40) - shipY;
        sim.targetShipAngle = Math.atan2(dy, dx);
      } else if (mode === 'playing' && sim.lockedUid) {
        const locked = sim.enemies.find((e) => e.uid === sim.lockedUid && e.koTimer === 0);
        if (locked) {
          sim.targetShipAngle = Math.atan2(locked.y - shipY, locked.x - shipX);
        }
      }

      const angleDiff = sim.targetShipAngle - sim.shipAngle;
      sim.shipAngle += angleDiff * Math.min(1, dt * 18);

      // Update particles
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = sim.particles[i];
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
      }

      // Update laser beams
      for (let i = 0; i < MAX_LASERS; i++) {
        const l = sim.lasers[i];
        if (!l.active) continue;
        l.life -= dt;
        if (l.life <= 0) l.active = false;
      }

      // Active gameplay simulation step
      if (mode === 'playing') {
        if (sim.endingTimer > 0) {
          sim.endingTimer -= dt;
          if (sim.endingTimer <= 0) {
            const victory = sim.pendingVictory;
            soundEngine.playGameEnd(victory);
            stateRef.current.onGameEnd({
              victory,
              score: sim.score,
              accuracy: calculateAccuracy(sim.correctKeys, sim.totalKeys),
              wpm: calculateWpm(sim.correctKeys, sim.elapsedPlayTime),
              wave: sim.wave,
              wordsCleared: sim.wordsCleared,
              maxCombo: sim.maxCombo,
              missedInRun: sim.missedInRun,
            });
          }
        } else if (sim.hitstopTimer > 0) {
          sim.hitstopTimer = Math.max(0, sim.hitstopTimer - dt);
        } else {
          sim.elapsedPlayTime += dt;
          sim.spawnTimer -= dt;

          const aliveCount = sim.enemies.filter((e) => e.koTimer === 0).length;
          const maxConcurrent = Math.min(4, 2 + Math.floor(sim.wave / 2));

          if (sim.spawnTimer <= 0 && aliveCount < maxConcurrent) {
            const didSpawn = spawnEnemy();
            sim.spawnTimer = didSpawn ? Math.max(1.5, 2.8 - sim.wave * 0.2) : 0.35;
          } else if (aliveCount === 0 && sim.spawnTimer > 0.25) {
            sim.spawnTimer = 0.15;
          }

          const defenseLineY = h - 122;

          for (let i = sim.enemies.length - 1; i >= 0; i--) {
            const e = sim.enemies[i];
            if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
            if (e.missFlash > 0) e.missFlash = Math.max(0, e.missFlash - dt * 3);

            if (e.koTimer > 0) {
              e.koTimer -= dt;
              e.y -= 15 * dt;
              if (e.koTimer <= 0) {
                sim.enemies.splice(i, 1);
                ensureActiveTarget();
                emitHudSnapshot();
              }
              continue;
            }

            const halfW = (e.boxW || 240) / 2 + 20;
            if (e.archetype === 'WEAVER') {
              e.phase += dt * 1.8;
              e.x = Math.max(halfW, Math.min(w - halfW, e.baseX + Math.sin(e.phase) * 36));
              e.y += e.vy * dt;
            } else if (e.archetype === 'ARMORED_CHARGER') {
              if (e.windupTimer > 0) {
                e.windupTimer -= dt;
                e.y += e.vy * 0.65 * dt;
              } else {
                e.y += e.vy * 1.3 * dt;
              }
            } else {
              e.y += e.vy * dt;
            }

            // Check breach of defense perimeter
            if (e.y >= defenseLineY) {
              if (sim.lockedUid === e.uid) {
                sim.lockedUid = null;
              }
              sim.hp = Math.max(0, sim.hp - 1);
              sim.combo = 0;
              sim.hurtFlashTimer = 0.35;
              sim.cameraTrauma = Math.min(1, sim.cameraTrauma + 0.68);
              sim.lastMistypeHint = `Thiên thạch "${e.vocab.meaning}" (${e.vocab.word}) đã lọt lưới! Đã lưu vào Sổ Tay Từ Sai.`;
              soundEngine.playHullDamage();
              spawnParticles(e.x, defenseLineY, 22, '#D71921', 1.25);

              stateRef.current.onMistake(e.vocab, 'BREACHED');
              if (!sim.missedInRun.some((m) => m.vocab.id === e.vocab.id)) {
                sim.missedInRun.push({ vocab: e.vocab, reason: 'BREACHED' });
              }

              sim.enemies.splice(i, 1);
              ensureActiveTarget();
              emitHudSnapshot();

              if (sim.hp <= 0) {
                sim.endingTimer = 0.5;
                sim.pendingVictory = false;
                break;
              }
            }
          }

          // Enforce 2D non-overlapping separation so falling cards never stick together
          resolveEnemyOverlaps(sim.enemies, w);
        }
      }

      // ================= RENDERING =================
      ctx.save();
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, w, h);

      if (sim.cameraTrauma > 0.01) {
        const shake = sim.cameraTrauma * sim.cameraTrauma * 12;
        const ox = (Math.random() * 2 - 1) * shake;
        const oy = (Math.random() * 2 - 1) * shake;
        ctx.translate(ox, oy);
      }

      // 1. Orbital Radar Rings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(shipX, shipY + 120, 260, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(shipX, shipY + 120, 480, Math.PI, Math.PI * 2);
      ctx.stroke();

      // 2. Multi-Plane Starfield
      for (let i = 0; i < NUM_STARS; i++) {
        const s = sim.stars[i];
        const alpha = 0.25 + 0.55 * Math.abs(Math.sin(s.twinklePhase));
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }

      // 3. Defense Perimeter Line
      const defenseLineY = h - 122;
      ctx.save();
      ctx.strokeStyle =
        sim.hurtFlashTimer > 0
          ? 'rgba(215, 25, 33, 0.85)'
          : 'rgba(255, 255, 255, 0.16)';
      ctx.setLineDash([4, 8]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(32, defenseLineY);
      ctx.lineTo(w - 32, defenseLineY);
      ctx.stroke();
      ctx.restore();

      // 4. Active Laser Beams
      for (let i = 0; i < MAX_LASERS; i++) {
        const l = sim.lasers[i];
        if (!l.active) continue;
        const t = l.life / l.maxLife;
        ctx.save();
        ctx.strokeStyle = l.isKillShot
          ? `rgba(215, 25, 33, ${t})`
          : `rgba(255, 255, 255, ${t})`;
        ctx.lineWidth = l.isKillShot ? 4 * t + 1 : 2.2 * t + 0.5;
        ctx.beginPath();
        ctx.moveTo(l.startX, l.startY);
        ctx.lineTo(l.endX, l.endY);
        ctx.stroke();
        ctx.restore();
      }

      // 5. Pooled Particle Bursts
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = sim.particles[i];
        if (!p.active) continue;
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // 6. Player Interceptor Spacecraft
      const recoilOffsetX = Math.cos(sim.shipAngle) * -sim.shipRecoil;
      const recoilOffsetY = Math.sin(sim.shipAngle) * -sim.shipRecoil;
      ctx.save();
      ctx.translate(shipX + recoilOffsetX, shipY + recoilOffsetY);
      ctx.scale(sim.shipScaleX, sim.shipScaleY);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.rotate(sim.shipAngle + Math.PI / 2);

      const flameLen = 10 + Math.random() * 8;
      ctx.fillStyle = '#D71921';
      ctx.beginPath();
      ctx.moveTo(-5, 16);
      ctx.lineTo(5, 16);
      ctx.lineTo(0, 16 + flameLen);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(17, 16);
      ctx.lineTo(6, 11);
      ctx.lineTo(-6, 11);
      ctx.lineTo(-17, 16);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#050505';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, 8);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#D71921';
      ctx.beginPath();
      ctx.arc(0, -2, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // 7. Render Vocabulary Asteroids (Sorted so locked target renders on top, with Individual Character Slot Cells)
      const sortedForRender = [...sim.enemies].sort((a, b) => {
        const aLocked = sim.lockedUid === a.uid ? 1 : 0;
        const bLocked = sim.lockedUid === b.uid ? 1 : 0;
        if (aLocked !== bLocked) return aLocked - bLocked;
        return a.y - b.y;
      });

      for (let i = 0; i < sortedForRender.length; i++) {
        const e = sortedForRender[i];
        const isLocked = sim.lockedUid === e.uid;
        const koScale = e.koTimer > 0 ? 1 + (0.42 - e.koTimer) * 0.9 : 1;
        const koAlpha = e.koTimer > 0 ? Math.max(0, e.koTimer / 0.42) : 1;

        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.scale(koScale, koScale);
        ctx.globalAlpha = koAlpha;

        // Aim sight line from ship to locked enemy
        if (isLocked && e.koTimer === 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(215, 25, 33, 0.38)';
          ctx.setLineDash([4, 6]);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(0, 66);
          ctx.lineTo(shipX - e.x, shipY - e.y);
          ctx.stroke();
          ctx.restore();
        }

        // Windup telegraph ring on ARMORED_CHARGER
        if (e.archetype === 'ARMORED_CHARGER' && e.windupTimer > 0 && e.windupTimer < 0.85) {
          const pulse = (0.85 - e.windupTimer) / 0.85;
          ctx.strokeStyle = `rgba(215, 25, 33, ${0.3 + pulse * 0.6})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, -38, 18 + (1 - pulse) * 16, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Geometric Asteroid Core above plaque
        ctx.save();
        ctx.translate(0, -38);
        ctx.fillStyle = e.hitFlash > 0 ? '#FFFFFF' : isLocked ? '#D71921' : '#141414';
        ctx.strokeStyle = isLocked ? '#D71921' : '#FFFFFF';
        ctx.lineWidth = isLocked ? 2 : 1.2;

        if (e.archetype === 'ARMORED_CHARGER') {
          ctx.beginPath();
          for (let a = 0; a < 8; a++) {
            const ang = (a * Math.PI) / 4;
            const r = 13;
            if (a === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
            else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (e.archetype === 'WEAVER') {
          ctx.beginPath();
          ctx.moveTo(0, -13);
          ctx.lineTo(15, 0);
          ctx.lineTo(0, 13);
          ctx.lineTo(-15, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.beginPath();
          for (let a = 0; a < 6; a++) {
            const ang = (a * Math.PI) / 3;
            const r = 11;
            if (a === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
            else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();

        // Build individual character slot metrics so letters and words NEVER stick together
        const chars = e.normalizedTarget.split('');
        const untypedMask =
          e.koTimer > 0
            ? e.normalizedTarget.slice(e.typedIndex)
            : formatUntypedMask(
                e.normalizedTarget,
                e.typedIndex,
                stateRef.current.displayMode
              );

        const charSlotW = 19;
        const spaceSlotW = 14;
        const slotGap = 4;
        const slotH = 23;

        let totalSlotsW = 0;
        for (let cIdx = 0; cIdx < chars.length; cIdx++) {
          totalSlotsW += chars[cIdx] === ' ' ? spaceSlotW : charSlotW;
          if (cIdx < chars.length - 1) totalSlotsW += slotGap;
        }

        const meaningHeadline = `${e.vocab.meaning} (${e.vocab.pos})`;
        const metaSubline = `${e.vocab.phonetic}  ·  ${getWordLengthHint(e.normalizedTarget)}`;

        ctx.font = '700 13.5px "JetBrains Mono", monospace';
        const meaningW = ctx.measureText(meaningHeadline).width;
        ctx.font = '400 11px "JetBrains Mono", monospace';
        const metaW = ctx.measureText(metaSubline).width;

        const boxW = Math.max(210, Math.ceil(Math.max(meaningW, metaW, totalSlotsW) + 38));
        const boxH = 84;
        e.boxW = boxW;
        e.boxH = boxH;

        // Plaque container with solid high-contrast dark background so stars/lines behind never bleed through
        ctx.fillStyle =
          e.missFlash > 0
            ? 'rgba(90, 10, 15, 0.98)'
            : isLocked
            ? 'rgba(18, 5, 8, 0.97)'
            : 'rgba(8, 8, 8, 0.96)';
        ctx.strokeStyle = isLocked ? '#D71921' : 'rgba(255, 255, 255, 0.38)';
        ctx.lineWidth = isLocked ? 2 : 1;
        ctx.fillRect(-boxW / 2, -20, boxW, boxH);
        ctx.strokeRect(-boxW / 2, -20, boxW, boxH);

        // Nothing OS Corner Ticks
        ctx.fillStyle = isLocked ? '#D71921' : '#FFFFFF';
        ctx.fillRect(-boxW / 2, -20, 4, 4);
        ctx.fillRect(boxW / 2 - 4, -20, 4, 4);

        // Line 1: Vietnamese Meaning + Part of Speech (generous top margin, clear font)
        ctx.font = '700 13.5px "JetBrains Mono", monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meaningHeadline, 0, -2);

        // Line 2: Phonetic IPA + Letter Count Hint (20px below Line 1 so diacritics never touch)
        ctx.font = '400 11px "JetBrains Mono", monospace';
        ctx.fillStyle = isLocked ? '#FCA5A5' : 'rgba(255, 255, 255, 0.65)';
        ctx.fillText(metaSubline, 0, 18);

        // Line 3: Individual Character Slot Boxes (24px below Line 2)
        let curX = -totalSlotsW / 2;
        const slotTopY = 32;

        for (let cIdx = 0; cIdx < chars.length; cIdx++) {
          const rawChar = chars[cIdx];
          const isSpace = rawChar === ' ';
          const wCell = isSpace ? spaceSlotW : charSlotW;
          const isTyped = cIdx < e.typedIndex || e.koTimer > 0;
          const isCurrentCursor = isLocked && e.koTimer === 0 && cIdx === e.typedIndex;

          if (isSpace) {
            // Word-break separator bracket so multi-word phrases never stick together
            ctx.strokeStyle = isTyped
              ? '#D71921'
              : isCurrentCursor
              ? '#D71921'
              : 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(curX + 3, slotTopY + slotH - 6);
            ctx.lineTo(curX + 3, slotTopY + slotH - 2);
            ctx.lineTo(curX + wCell - 3, slotTopY + slotH - 2);
            ctx.lineTo(curX + wCell - 3, slotTopY + slotH - 6);
            ctx.stroke();
          } else {
            // Individual character tile background & border
            ctx.fillStyle =
              e.koTimer > 0
                ? 'rgba(74, 222, 128, 0.18)'
                : isTyped
                ? 'rgba(215, 25, 33, 0.25)'
                : isCurrentCursor
                ? 'rgba(255, 255, 255, 0.12)'
                : 'rgba(255, 255, 255, 0.04)';
            ctx.fillRect(curX, slotTopY, wCell, slotH);

            ctx.strokeStyle =
              e.koTimer > 0
                ? '#4ADE80'
                : isTyped
                ? '#D71921'
                : isCurrentCursor
                ? '#D71921'
                : 'rgba(255, 255, 255, 0.24)';
            ctx.lineWidth = isCurrentCursor || isTyped ? 1.4 : 1;
            ctx.strokeRect(curX, slotTopY, wCell, slotH);

            // Determine displayed character inside this slot
            const maskChar = isTyped
              ? rawChar
              : untypedMask[cIdx - e.typedIndex] || '_';

            if (maskChar !== '_') {
              ctx.font = '700 13px "JetBrains Mono", monospace';
              ctx.fillStyle =
                e.koTimer > 0
                  ? '#4ADE80'
                  : isTyped
                  ? '#FFFFFF'
                  : 'rgba(255, 255, 255, 0.85)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(maskChar.toUpperCase(), curX + wCell / 2, slotTopY + slotH / 2 + 0.5);
            } else {
              // Crisp bottom slot bar inside the cell instead of cramped text underscores
              ctx.fillStyle = isCurrentCursor ? '#D71921' : 'rgba(255, 255, 255, 0.7)';
              ctx.fillRect(curX + 4, slotTopY + slotH - 5, wCell - 8, 2);
            }
          }

          curX += wCell + slotGap;
        }

        ctx.textBaseline = 'alphabetic';
        ctx.restore();
      }

      // Low HP peripheral danger vignette
      if (mode === 'playing' && sim.hp <= 2) {
        const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
        grad.addColorStop(0, 'rgba(215, 25, 33, 0)');
        grad.addColorStop(1, 'rgba(215, 25, 33, 0.22)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.restore();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [runId, virtualInputRef, triggerHintRef, cycleTargetRef]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-full overflow-hidden bg-[#050505]"
      data-testid="space-shooter-canvas-container"
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
        aria-label="Unit 2 Orbital Type Space Shooter Canvas"
      />
    </div>
  );
};
