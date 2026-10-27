import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAccuracy,
  calculateWpm,
  calculateWordScore,
  createSeededRng,
  encodeLeaderboardEntry,
  decodeLeaderboardEntry,
  estimateEnemyBoxWidth,
  findNonOverlappingSpawnX,
  formatUntypedMask,
  getWordLengthHint,
  mergeLeaderboardEntries,
  processKeystroke,
  recordMistake,
  resolveEnemyOverlaps,
  ActiveEnemy,
} from './rules';
import { UNIT2_VOCAB } from '../data/unit2Vocab';

test('calculateAccuracy computes accurate integer percentage', () => {
  assert.equal(calculateAccuracy(0, 0), 100);
  assert.equal(calculateAccuracy(45, 50), 90);
  assert.equal(calculateAccuracy(19, 20), 95);
});

test('calculateWpm computes standard 5-char words per minute', () => {
  assert.equal(calculateWpm(250, 60), 50);
  assert.equal(calculateWpm(125, 30), 50);
  assert.equal(calculateWpm(10, 0.5), 0);
});

test('formatUntypedMask hides English letters in HIDDEN_SLOTS and shows first letter in FIRST_LETTER_HINT', () => {
  assert.equal(formatUntypedMask('culture', 0, 'HIDDEN_SLOTS'), '_______');
  assert.equal(formatUntypedMask('culture', 3, 'HIDDEN_SLOTS'), '____');
  assert.equal(formatUntypedMask('tug of war', 0, 'HIDDEN_SLOTS'), '___ __ ___');
  assert.equal(formatUntypedMask('culture', 0, 'FIRST_LETTER_HINT'), 'c______');
  assert.equal(formatUntypedMask('tug of war', 0, 'FIRST_LETTER_HINT'), 't__ o_ w__');
  assert.equal(getWordLengthHint('culture'), '7 chữ cái');
  assert.equal(getWordLengthHint('tug of war'), '3 từ (3-2-3)');
});

test('calculateWordScore scales with word length, combo, and HIDDEN_SLOTS bonus', () => {
  const baseScore = calculateWordScore(7, 0, false, 'CHASER', 'SHOW_ENGLISH');
  const comboFlawlessScore = calculateWordScore(7, 10, true, 'ARMORED_CHARGER', 'HIDDEN_SLOTS');
  assert.ok(baseScore > 0);
  assert.ok(comboFlawlessScore > baseScore * 2);
});

test('processKeystroke locks onto closest matching enemy and advances typedIndex', () => {
  const vocab1 = UNIT2_VOCAB[0]; // 'culture'
  const vocab2 = UNIT2_VOCAB[4]; // 'nation'
  const enemies: ActiveEnemy[] = [
    {
      uid: 'e1',
      vocab: vocab1,
      normalizedTarget: 'culture',
      typedIndex: 0,
      x: 200,
      y: 350,
      vx: 0,
      vy: 40,
      baseX: 200,
      phase: 0,
      archetype: 'CHASER',
      hitFlash: 0,
      missFlash: 0,
      windupTimer: 0,
      koTimer: 0,
      mistypedOnThis: false,
    },
    {
      uid: 'e2',
      vocab: vocab2,
      normalizedTarget: 'nation',
      typedIndex: 0,
      x: 400,
      y: 150,
      vx: 0,
      vy: 40,
      baseX: 400,
      phase: 0,
      archetype: 'CHASER',
      hitFlash: 0,
      missFlash: 0,
      windupTimer: 0,
      koTimer: 0,
      mistypedOnThis: false,
    },
  ];

  // Typing 'c' locks onto e1 ('culture')
  const res1 = processKeystroke('c', enemies, null);
  assert.equal(res1.hit, true);
  assert.equal(res1.lockedUid, 'e1');
  assert.equal(enemies[0].typedIndex, 1);

  // Typing wrong letter 'z' while locked onto e1 records a miss on e1 and returns expectedChar 'u'
  const res2 = processKeystroke('z', enemies, 'e1');
  assert.equal(res2.hit, false);
  assert.equal(res2.lockedUid, 'e1');
  assert.equal(res2.missedVocab?.word, 'culture');
  assert.equal(res2.expectedChar, 'u');
  assert.equal(enemies[0].mistypedOnThis, true);

  // Completing 'ulture' destroys e1
  for (const ch of ['u', 'l', 't', 'u', 'r']) {
    const step = processKeystroke(ch, enemies, 'e1');
    assert.equal(step.hit, true);
    assert.equal(step.completedEnemy, null);
  }
  const finalStep = processKeystroke('e', enemies, 'e1');
  assert.equal(finalStep.hit, true);
  assert.equal(finalStep.completedEnemy?.uid, 'e1');
  assert.equal(finalStep.lockedUid, null);
});

test('recordMistake increments count and sorts by most frequent mistakes', () => {
  const v1 = UNIT2_VOCAB[0];
  const v2 = UNIT2_VOCAB[1];
  let vault = recordMistake([], v1, 'MISTYPED', 1000);
  vault = recordMistake(vault, v2, 'BREACHED', 2000);
  vault = recordMistake(vault, v2, 'MISTYPED', 3000);

  assert.equal(vault.length, 2);
  assert.equal(vault[0].vocabId, v2.id);
  assert.equal(vault[0].mistakeCount, 2);
  assert.equal(vault[1].vocabId, v1.id);
  assert.equal(vault[1].mistakeCount, 1);
});

test('leaderboard encoding, decoding, and merging preserves top 20 sorted by score', () => {
  const entryA = {
    pilotName: 'NOVA_01',
    score: 4200,
    accuracy: 96,
    wpm: 58,
    wave: 4,
    mode: 'HIDDEN_SLOTS',
    timestamp: 1700000000000,
  };
  const encoded = encodeLeaderboardEntry(entryA);
  const decoded = decodeLeaderboardEntry(encoded);
  assert.deepEqual(decoded, entryA);

  const merged = mergeLeaderboardEntries([encoded], {
    pilotName: 'ORION_99',
    score: 5800,
    accuracy: 98,
    wpm: 65,
    wave: 5,
    mode: 'HIDDEN_SLOTS',
    timestamp: 1700000005000,
  });
  assert.equal(merged.length, 2);
  assert.equal(merged[0].pilotName, 'ORION_99');
  assert.equal(merged[1].pilotName, 'NOVA_01');
});

test('createSeededRng produces identical sequence for identical challenge seed', () => {
  const rngA = createSeededRng(20261027);
  const rngB = createSeededRng(20261027);
  for (let i = 0; i < 10; i++) {
    assert.equal(rngA(), rngB());
  }
});

test('findNonOverlappingSpawnX and resolveEnemyOverlaps keep asteroid plaques separated', () => {
  const vocab1 = UNIT2_VOCAB[0];
  const vocab2 = UNIT2_VOCAB[1];
  const boxW1 = estimateEnemyBoxWidth(vocab1, 'culture');
  const boxW2 = estimateEnemyBoxWidth(vocab2, 'cultural');
  const enemies: ActiveEnemy[] = [
    {
      uid: 'e1',
      vocab: vocab1,
      normalizedTarget: 'culture',
      typedIndex: 0,
      x: 500,
      y: 160,
      vx: 0,
      vy: 30,
      baseX: 500,
      phase: 0,
      archetype: 'CHASER',
      hitFlash: 0,
      missFlash: 0,
      windupTimer: 0,
      koTimer: 0,
      mistypedOnThis: false,
      boxW: boxW1,
      boxH: 84,
    },
    {
      uid: 'e2',
      vocab: vocab2,
      normalizedTarget: 'cultural',
      typedIndex: 0,
      x: 510,
      y: 165,
      vx: 0,
      vy: 45,
      baseX: 510,
      phase: 0,
      archetype: 'CHASER',
      hitFlash: 0,
      missFlash: 0,
      windupTimer: 0,
      koTimer: 0,
      mistypedOnThis: false,
      boxW: boxW2,
      boxH: 84,
    },
  ];

  resolveEnemyOverlaps(enemies, 1280);
  const dx = Math.abs(enemies[1].x - enemies[0].x);
  const dy = Math.abs(enemies[1].y - enemies[0].y);
  assert.ok(dx > 50 || dy >= 120, 'Overlapping enemies must be separated horizontally or vertically');

  const safeX = findNonOverlappingSpawnX(1280, 240, [enemies[0]], createSeededRng(42), 160);
  assert.ok(safeX !== null);
  assert.ok(Math.abs(safeX! - enemies[0].x) >= (240 + boxW1) / 2);
});

