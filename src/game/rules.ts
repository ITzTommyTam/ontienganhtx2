import { UNIT2_VOCAB, Unit2Section, VocabItem } from '../data/unit2Vocab';

export type EnemyArchetype = 'CHASER' | 'WEAVER' | 'ARMORED_CHARGER';

export type GuessDisplayMode = 'HIDDEN_SLOTS' | 'FIRST_LETTER_HINT' | 'SHOW_ENGLISH';

export interface ActiveEnemy {
  uid: string;
  vocab: VocabItem;
  normalizedTarget: string;
  typedIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  phase: number;
  archetype: EnemyArchetype;
  hitFlash: number;
  missFlash: number;
  windupTimer: number;
  koTimer: number; // > 0 when destroyed and playing KO dissolve animation
  mistypedOnThis: boolean;
  boxW?: number;
  boxH?: number;
}

export interface MistakeRecord {
  vocabId: string;
  word: string;
  pos: string;
  phonetic: string;
  meaning: string;
  section: Unit2Section;
  mistakeCount: number;
  lastMissedAt: number;
  reason: 'MISTYPED' | 'BREACHED';
}

export interface LeaderboardEntryItem {
  pilotName: string;
  score: number;
  accuracy: number;
  wpm: number;
  wave: number;
  mode: string;
  timestamp: number;
}

/**
 * Normalizes a word for typing comparison (lowercase, trimmed, single spaces).
 */
export function normalizeForTyping(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Formats the untyped portion of an English target word according to the GuessDisplayMode.
 * - HIDDEN_SLOTS: masks all untyped letters with '•' / '_' while preserving spaces and hyphens.
 * - FIRST_LETTER_HINT: shows the first letter of the word (if typedIndex === 0) and masks the rest.
 * - SHOW_ENGLISH: shows the full untyped English letters.
 */
export function formatUntypedMask(
  normalizedTarget: string,
  typedIndex: number,
  displayMode: GuessDisplayMode
): string {
  const untyped = normalizedTarget.slice(typedIndex);
  if (displayMode === 'SHOW_ENGLISH') {
    return untyped;
  }

  return untyped
    .split('')
    .map((ch, idx) => {
      const globalIdx = typedIndex + idx;
      if (ch === ' ' || ch === '-') return ch;
      if (
        displayMode === 'FIRST_LETTER_HINT' &&
        (globalIdx === 0 || normalizedTarget[globalIdx - 1] === ' ' || normalizedTarget[globalIdx - 1] === '-')
      ) {
        return ch;
      }
      return '_';
    })
    .join('');
}

/**
 * Returns word length breakdown string (e.g. "7 chữ cái" or "3 từ (3-2-3)").
 */
export function getWordLengthHint(normalizedTarget: string): string {
  const parts = normalizedTarget.split(' ').filter(Boolean);
  if (parts.length <= 1) {
    return `${normalizedTarget.length} chữ cái`;
  }
  return `${parts.length} từ (${parts.map((p) => p.length).join('-')})`;
}

/**
 * Calculates accuracy percentage (0 to 100) from correct and total keystrokes.
 */
export function calculateAccuracy(correctKeys: number, totalKeys: number): number {
  if (totalKeys <= 0) return 100;
  const raw = (correctKeys / totalKeys) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Calculates Words Per Minute (WPM) where 1 word = 5 characters.
 */
export function calculateWpm(correctKeys: number, elapsedSeconds: number): number {
  if (elapsedSeconds <= 1) return 0;
  const minutes = elapsedSeconds / 60;
  return Math.max(0, Math.round(correctKeys / 5 / minutes));
}

/**
 * Calculates points awarded for destroying a vocabulary asteroid.
 */
export function calculateWordScore(
  wordLength: number,
  combo: number,
  flawlessWord: boolean,
  archetype: EnemyArchetype,
  displayMode: GuessDisplayMode
): number {
  const base = Math.max(1, wordLength) * 15;
  const comboMultiplier = 1 + Math.min(combo, 25) * 0.1;
  const archetypeBonus = archetype === 'ARMORED_CHARGER' ? 1.4 : archetype === 'WEAVER' ? 1.2 : 1.0;
  const flawlessBonus = flawlessWord ? 1.25 : 1.0;
  const modeBonus =
    displayMode === 'HIDDEN_SLOTS' ? 1.5 : displayMode === 'FIRST_LETTER_HINT' ? 1.25 : 1.0;
  return Math.round(base * comboMultiplier * archetypeBonus * flawlessBonus * modeBonus);
}

/**
 * Deterministic Mulberry32 PRNG for synchronized 1v1 Friend Challenge waves.
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Filters vocabulary pool by section or mistake review list.
 */
export function getVocabPool(
  sectionFilter: Unit2Section | 'ALL',
  reviewOnlyIds?: string[]
): VocabItem[] {
  if (reviewOnlyIds && reviewOnlyIds.length > 0) {
    const idSet = new Set(reviewOnlyIds);
    const filtered = UNIT2_VOCAB.filter((item) => idSet.has(item.id));
    if (filtered.length > 0) return filtered;
  }
  if (sectionFilter === 'ALL') {
    return UNIT2_VOCAB;
  }
  const sectionPool = UNIT2_VOCAB.filter((item) => item.section === sectionFilter);
  return sectionPool.length > 0 ? sectionPool : UNIT2_VOCAB;
}

/**
 * Selects enemy archetype based on word length and wave number.
 */
export function selectArchetype(word: string, wave: number, rngVal: number): EnemyArchetype {
  if (word.length >= 10 || (wave >= 3 && rngVal > 0.72)) {
    return 'ARMORED_CHARGER';
  }
  if (wave >= 2 && rngVal > 0.4) {
    return 'WEAVER';
  }
  return 'CHASER';
}

/**
 * Processes a single character keystroke against active enemies.
 */
export interface KeystrokeResult {
  hit: boolean;
  lockedUid: string | null;
  completedEnemy: ActiveEnemy | null;
  missedVocab: VocabItem | null;
  expectedChar: string | null;
}

export function processKeystroke(
  char: string,
  enemies: ActiveEnemy[],
  currentLockedUid: string | null
): KeystrokeResult {
  const key = char.toLowerCase();
  const aliveEnemies = enemies.filter((e) => e.koTimer === 0);

  if (aliveEnemies.length === 0) {
    return { hit: false, lockedUid: null, completedEnemy: null, missedVocab: null, expectedChar: null };
  }

  // 1. If we have a locked enemy that already has progress (typedIndex > 0), check its next character
  if (currentLockedUid) {
    const locked = aliveEnemies.find((e) => e.uid === currentLockedUid);
    if (locked && locked.typedIndex > 0) {
      const expectedChar = locked.normalizedTarget[locked.typedIndex];
      if (expectedChar === key) {
        locked.typedIndex += 1;
        locked.hitFlash = 1.0;
        if (locked.typedIndex >= locked.normalizedTarget.length) {
          return {
            hit: true,
            lockedUid: null,
            completedEnemy: locked,
            missedVocab: null,
            expectedChar: null,
          };
        }
        return {
          hit: true,
          lockedUid: locked.uid,
          completedEnemy: null,
          missedVocab: null,
          expectedChar: locked.normalizedTarget[locked.typedIndex] || null,
        };
      } else {
        locked.mistypedOnThis = true;
        locked.missFlash = 1.0;
        return {
          hit: false,
          lockedUid: locked.uid,
          completedEnemy: null,
          missedVocab: locked.vocab,
          expectedChar,
        };
      }
    }
  }

  // 2. If a specific enemy is selected (even at typedIndex === 0) and matches `key`, prioritize it
  if (currentLockedUid) {
    const selected = aliveEnemies.find((e) => e.uid === currentLockedUid);
    if (selected && selected.normalizedTarget[0] === key) {
      selected.typedIndex = 1;
      selected.hitFlash = 1.0;
      if (selected.typedIndex >= selected.normalizedTarget.length) {
        return {
          hit: true,
          lockedUid: null,
          completedEnemy: selected,
          missedVocab: null,
          expectedChar: null,
        };
      }
      return {
        hit: true,
        lockedUid: selected.uid,
        completedEnemy: null,
        missedVocab: null,
        expectedChar: selected.normalizedTarget[1] || null,
      };
    }
  }

  // 3. Otherwise, find the lowest (closest to player) enemy starting with `key`
  const candidates = aliveEnemies
    .filter((e) => e.normalizedTarget[0] === key)
    .sort((a, b) => b.y - a.y);

  if (candidates.length > 0) {
    const target = candidates[0];
    target.typedIndex = 1;
    target.hitFlash = 1.0;
    if (target.typedIndex >= target.normalizedTarget.length) {
      return {
        hit: true,
        lockedUid: null,
        completedEnemy: target,
        missedVocab: null,
        expectedChar: null,
      };
    }
    return {
      hit: true,
      lockedUid: target.uid,
      completedEnemy: null,
      missedVocab: null,
      expectedChar: target.normalizedTarget[1] || null,
    };
  }

  // 4. Mistype when no enemy matched: attribute mistake to currently selected or closest enemy
  const fallbackTarget =
    (currentLockedUid && aliveEnemies.find((e) => e.uid === currentLockedUid)) ||
    [...aliveEnemies].sort((a, b) => b.y - a.y)[0];

  if (fallbackTarget) {
    fallbackTarget.mistypedOnThis = true;
    fallbackTarget.missFlash = 1.0;
  }
  return {
    hit: false,
    lockedUid: fallbackTarget ? fallbackTarget.uid : null,
    completedEnemy: null,
    missedVocab: fallbackTarget ? fallbackTarget.vocab : null,
    expectedChar: fallbackTarget ? fallbackTarget.normalizedTarget[fallbackTarget.typedIndex] : null,
  };
}

/**
 * Upserts a vocabulary item into the user's Mistake Vault.
 */
export function recordMistake(
  existing: MistakeRecord[],
  vocab: VocabItem,
  reason: 'MISTYPED' | 'BREACHED',
  now: number = Date.now()
): MistakeRecord[] {
  const copy = existing.map((item) => ({ ...item }));
  const idx = copy.findIndex((m) => m.vocabId === vocab.id);
  if (idx >= 0) {
    copy[idx].mistakeCount += 1;
    copy[idx].lastMissedAt = now;
    copy[idx].reason = reason;
  } else {
    copy.unshift({
      vocabId: vocab.id,
      word: vocab.word,
      pos: vocab.pos,
      phonetic: vocab.phonetic,
      meaning: vocab.meaning,
      section: vocab.section,
      mistakeCount: 1,
      lastMissedAt: now,
      reason,
    });
  }
  return copy.sort((a, b) => b.mistakeCount - a.mistakeCount || b.lastMissedAt - a.lastMissedAt).slice(0, 50);
}

/**
 * Serializes and deserializes LeaderboardEntryItem to compact pipe-delimited string (< 300 chars)
 * for Firestore `entries` array compliance.
 */
export function encodeLeaderboardEntry(entry: LeaderboardEntryItem): string {
  const safeName = entry.pilotName.replace(/[|\n\r]/g, '').trim().slice(0, 32) || 'PILOT';
  const safeMode = entry.mode.replace(/[|\n\r]/g, '').trim().slice(0, 20) || 'GUESS';
  return `${safeName}|${Math.round(entry.score)}|${Math.round(entry.accuracy)}|${Math.round(entry.wpm)}|${Math.round(entry.wave)}|${safeMode}|${Math.round(entry.timestamp)}`.slice(0, 280);
}

export function decodeLeaderboardEntry(raw: string): LeaderboardEntryItem | null {
  const parts = raw.split('|');
  if (parts.length < 7) return null;
  const [pilotName, scoreStr, accStr, wpmStr, waveStr, mode, tsStr] = parts;
  const score = Number(scoreStr);
  const accuracy = Number(accStr);
  const wpm = Number(wpmStr);
  const wave = Number(waveStr);
  const timestamp = Number(tsStr);
  if (!pilotName || Number.isNaN(score) || Number.isNaN(accuracy)) return null;
  return {
    pilotName,
    score,
    accuracy,
    wpm: Number.isNaN(wpm) ? 0 : wpm,
    wave: Number.isNaN(wave) ? 1 : wave,
    mode: mode || 'GUESS',
    timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
  };
}

export function mergeLeaderboardEntries(
  existingStrings: string[],
  newEntry: LeaderboardEntryItem
): LeaderboardEntryItem[] {
  const parsed = existingStrings
    .map(decodeLeaderboardEntry)
    .filter((item): item is LeaderboardEntryItem => item !== null);

  parsed.push(newEntry);

  // Deduplicate keeping highest score per pilotName
  const bestByPilot = new Map<string, LeaderboardEntryItem>();
  for (const item of parsed) {
    const key = item.pilotName.toUpperCase();
    const prev = bestByPilot.get(key);
    if (!prev || item.score > prev.score || (item.score === prev.score && item.accuracy > prev.accuracy)) {
      bestByPilot.set(key, item);
    }
  }

  return Array.from(bestByPilot.values())
    .sort((a, b) => b.score - a.score || b.accuracy - a.accuracy || b.wpm - a.wpm)
    .slice(0, 20);
}

/**
 * Estimates the pixel width of an asteroid vocabulary card so spawn and collision logic
 * can prevent cards from overlapping or sticking together.
 */
export function estimateEnemyBoxWidth(vocab: VocabItem, normalizedTarget: string): number {
  const meaningLen = `${vocab.meaning} (${vocab.pos})`.length;
  const metaLen = `${vocab.phonetic} · ${getWordLengthHint(normalizedTarget)}`.length;
  const meaningPx = meaningLen * 8.6;
  const metaPx = metaLen * 6.8;
  const slotsPx = normalizedTarget.split('').reduce((acc, ch) => acc + (ch === ' ' ? 16 : 22), 0);
  return Math.max(210, Math.ceil(Math.max(meaningPx, metaPx, slotsPx) + 40));
}

/**
 * Finds a horizontal spawn coordinate X that does not overlap with existing enemies near the top.
 * Returns null if the top spawn band is currently too crowded so spawning should wait briefly.
 */
export function findNonOverlappingSpawnX(
  viewportWidth: number,
  candidateBoxW: number,
  enemies: ActiveEnemy[],
  rng: () => number,
  spawnY: number = 156
): number | null {
  const halfW = candidateBoxW / 2;
  const minX = Math.max(halfW + 24, 150);
  const maxX = Math.min(viewportWidth - halfW - 24, viewportWidth - 150);
  if (maxX <= minX) {
    return viewportWidth / 2;
  }

  const alive = enemies.filter((e) => e.koTimer === 0);
  const numSamples = 14;
  let bestX: number | null = null;
  let bestClearance = -Infinity;

  for (let s = 0; s < numSamples; s++) {
    const t = (s + 0.5) / numSamples;
    const jitter = (rng() - 0.5) * ((maxX - minX) / numSamples) * 0.6;
    const x = Math.max(minX, Math.min(maxX, minX + t * (maxX - minX) + jitter));

    let minClearance = Infinity;
    let blockedVertically = false;

    for (const other of alive) {
      const otherW = other.boxW || estimateEnemyBoxWidth(other.vocab, other.normalizedTarget);
      const requiredDx = (candidateBoxW + otherW) / 2 + 28;
      const requiredDy = 128;
      const dx = Math.abs(x - other.x);
      const dy = Math.abs(spawnY - other.y);

      if (dy < requiredDy) {
        const clearance = dx - requiredDx;
        if (clearance < minClearance) {
          minClearance = clearance;
        }
        if (clearance < 0) {
          blockedVertically = true;
        }
      }
    }

    if (!blockedVertically && minClearance > bestClearance) {
      bestClearance = minClearance;
      bestX = x;
    }
  }

  return bestX;
}

/**
 * Separates any active enemies whose text plaques would overlap horizontally & vertically,
 * ensuring vocabulary cards never stick together on screen.
 */
export function resolveEnemyOverlaps(enemies: ActiveEnemy[], viewportWidth: number): void {
  const alive = enemies.filter((e) => e.koTimer === 0);
  if (alive.length < 2) return;

  const padX = 28;
  const padY = 124; // Plaque height (84) + top asteroid core (32) + breathing room

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        const aW = a.boxW || estimateEnemyBoxWidth(a.vocab, a.normalizedTarget);
        const bW = b.boxW || estimateEnemyBoxWidth(b.vocab, b.normalizedTarget);

        const minDx = (aW + bW) / 2 + padX;
        const dx = b.x - a.x;
        const absDx = Math.abs(dx);
        const dy = b.y - a.y;
        const absDy = Math.abs(dy);

        if (absDx < minDx && absDy < padY) {
          const overlapX = minDx - absDx;
          const overlapY = padY - absDy;

          // Prefer horizontal separation if reasonable, plus vertical clamping so upper doesn't rear-end lower
          const dirX = dx === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dx);
          const pushX = Math.min(overlapX * 0.55, 18);
          a.x -= dirX * pushX;
          b.x += dirX * pushX;
          a.baseX -= dirX * pushX * 0.5;
          b.baseX += dirX * pushX * 0.5;

          // If still overlapping horizontally, enforce vertical separation so the upper card stays above the lower card
          if (Math.abs(b.x - a.x) < minDx * 0.88) {
            if (a.y < b.y) {
              a.y = Math.max(145, b.y - padY);
              if (a.vy > b.vy) a.vy = b.vy;
            } else {
              b.y = Math.max(145, a.y - padY);
              if (b.vy > a.vy) b.vy = a.vy;
            }
          } else if (overlapY < 24) {
            if (a.y < b.y) a.y -= overlapY * 0.3;
            else b.y -= overlapY * 0.3;
          }
        }
      }
    }

    // Clamp all enemies within horizontal screen bounds so plaques never clip off-screen
    for (const e of alive) {
      const w = e.boxW || estimateEnemyBoxWidth(e.vocab, e.normalizedTarget);
      const minX = Math.min(viewportWidth / 2, w / 2 + 20);
      const maxX = Math.max(viewportWidth / 2, viewportWidth - w / 2 - 20);
      e.x = Math.max(minX, Math.min(maxX, e.x));
      e.baseX = Math.max(minX, Math.min(maxX, e.baseX));
    }
  }
}

