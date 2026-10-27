import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { SECTION_LABELS, Unit2Section, VocabItem } from './data/unit2Vocab';
import {
  GuessDisplayMode,
  LeaderboardEntryItem,
  MistakeRecord,
  recordMistake,
} from './game/rules';
import {
  EndRunSummary,
  GameStateMode,
  HudSnapshot,
  SpaceShooterCanvas,
} from './components/SpaceShooterCanvas';
import {
  ActiveDrawerTab,
  OverlaysAndModals,
  StatusModalCard,
} from './components/OverlaysAndModals';
import {
  ChallengeRoomData,
  createFriendChallengeRoom,
  joinFriendChallengeRoom,
  loadLocalLeaderboard,
  signInWithGoogle,
  signOutUser,
  submitScoreToLeaderboard,
  subscribeAuth,
  subscribeChallengeRoom,
  subscribeGlobalLeaderboard,
  syncPilotProfileToCloud,
  updateChallengeRoomScore,
} from './services/firebase';
import {
  loadReminderConfig,
  requestPushNotificationPermission,
  saveReminderConfig,
  StudyReminderConfig,
  triggerStudyPushNotification,
} from './services/notifications';
import { soundEngine } from './services/sound';

const PILOT_NAME_KEY = 'orbital_pilot_name_v1';
const MISTAKES_STORAGE_KEY = 'orbital_unit2_mistakes_v1';
const BEST_SCORE_KEY = 'orbital_unit2_best_score_v1';

export default function App() {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const isAutostart = params.get('autostart') === '1';
  const roomQuery = params.get('room');

  const [pilotName, setPilotName] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(PILOT_NAME_KEY);
      if (saved && saved.trim()) return saved.trim();
    } catch {
      // Ignore
    }
    return isAutostart ? 'CAPTAIN_U2' : '';
  });

  const [gameState, setGameState] = useState<GameStateMode>(() =>
    isAutostart ? 'playing' : 'title'
  );
  const [sectionFilter, setSectionFilter] = useState<Unit2Section | 'ALL'>('ALL');
  // Default to HIDDEN_SLOTS so the player guesses the English word from the Vietnamese meaning!
  const [displayMode, setDisplayMode] = useState<GuessDisplayMode>('HIDDEN_SLOTS');
  const [reviewOnlyIds, setReviewOnlyIds] = useState<string[] | undefined>(undefined);
  const [runId, setRunId] = useState<number>(1);

  const [bestScore, setBestScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
    } catch {
      return 0;
    }
  });

  const [mistakes, setMistakes] = useState<MistakeRecord[]>(() => {
    try {
      const raw = localStorage.getItem(MISTAKES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore
    }
    return [];
  });

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntryItem[]>(() =>
    loadLocalLeaderboard()
  );
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<ChallengeRoomData | null>(null);

  const [reminderConfig, setReminderConfig] = useState<StudyReminderConfig>(() =>
    loadReminderConfig()
  );
  const [notificationPerm, setNotificationPerm] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );
  const [glyphBanner, setGlyphBanner] = useState<{ title: string; body: string } | null>(
    null
  );

  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawerTab>(() => {
    if (isAutostart) return null;
    if (!pilotName) return 'CALLSIGN';
    if (roomQuery) return 'CHALLENGE';
    return null;
  });

  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [endSummary, setEndSummary] = useState<EndRunSummary | null>(null);
  const [mobileInputValue, setMobileInputValue] = useState('');

  const [hud, setHud] = useState<HudSnapshot>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    accuracy: 100,
    wpm: 0,
    wave: 1,
    hp: 5,
    maxHp: 5,
    wordsCleared: 0,
    targetWordsForWave: 8,
    lockedVocab: null,
    lockedTyped: '',
    lockedRemainingMask: '',
    lockedLengthHint: '',
    lastMistypeHint: null,
    correctKeys: 0,
    totalKeys: 0,
  });

  const virtualInputRef = useRef<((char: string) => void) | null>(null);
  const triggerHintRef = useRef<(() => void) | null>(null);
  const cycleTargetRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  useEffect(() => {
    let unsubBoard: (() => void) | null = null;
    const unsubAuth = subscribeAuth((user) => {
      setCurrentUserEmail(user?.email || null);
      if (unsubBoard) unsubBoard();
      unsubBoard = subscribeGlobalLeaderboard((entries, cloud) => {
        setLeaderboard(entries);
        setIsCloudSynced(cloud);
      });
    });

    unsubBoard = subscribeGlobalLeaderboard((entries, cloud) => {
      setLeaderboard(entries);
      setIsCloudSynced(cloud);
    });

    return () => {
      unsubAuth();
      if (unsubBoard) unsubBoard();
    };
  }, []);

  useEffect(() => {
    if (roomQuery && pilotName) {
      joinFriendChallengeRoom(roomQuery, pilotName).then(({ room }) => {
        setActiveChallenge(room);
      });
    }
  }, [roomQuery, pilotName]);

  useEffect(() => {
    if (!activeChallenge) return;
    const unsub = subscribeChallengeRoom(activeChallenge.roomId, (updated) => {
      setActiveChallenge(updated);
    });
    return () => unsub();
  }, [activeChallenge?.roomId]);

  useEffect(() => {
    if (!reminderConfig.enabled) return;
    const interval = setInterval(() => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentHm = `${hh}:${mm}`;
      const todayIso = now.toISOString().slice(0, 10);

      if (
        currentHm === reminderConfig.time &&
        reminderConfig.lastTriggeredDate !== todayIso
      ) {
        const nextCfg = { ...reminderConfig, lastTriggeredDate: todayIso };
        setReminderConfig(nextCfg);
        saveReminderConfig(nextCfg);
        triggerStudyPushNotification(
          pilotName || 'CHIẾN BINH',
          mistakes.length,
          (title, body) => {
            setGlyphBanner({ title, body });
          }
        );
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [reminderConfig, pilotName, mistakes.length]);

  const handleSavePilotName = useCallback(
    (name: string) => {
      setPilotName(name);
      try {
        localStorage.setItem(PILOT_NAME_KEY, name);
      } catch {
        // Ignore
      }
      syncPilotProfileToCloud(
        name,
        bestScore,
        mistakes.map((m) => m.vocabId),
        reminderConfig.time
      );
    },
    [bestScore, mistakes, reminderConfig.time]
  );

  const startGameplay = useCallback(
    (customReviewIds?: string[]) => {
      if (!pilotName.trim()) {
        setActiveDrawer('CALLSIGN');
        return;
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      soundEngine.playUiClick();
      setReviewOnlyIds(customReviewIds);
      setEndSummary(null);
      setActiveDrawer(null);
      setRunId((r) => r + 1);
      document.body.dataset.state = 'playing';
      setGameState('playing');
    },
    [pilotName]
  );

  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const inInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

      if (gameState === 'title') {
        if (e.key === 'Escape' && activeDrawer && pilotName) {
          setActiveDrawer(null);
          return;
        }
        if (!inInput && !activeDrawer && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          startGameplay(undefined);
        }
        return;
      }

      if (gameState === 'playing') {
        if (e.key === 'Escape') {
          e.preventDefault();
          soundEngine.playUiClick();
          document.body.dataset.state = 'paused';
          setGameState('paused');
        }
        return;
      }

      if (gameState === 'paused') {
        if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
          e.preventDefault();
          soundEngine.playUiClick();
          document.body.dataset.state = 'playing';
          setGameState('playing');
        } else if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          startGameplay(reviewOnlyIds);
        }
        return;
      }

      if (gameState === 'gameover') {
        if (!inInput && !activeDrawer && e.key === 'Enter') {
          e.preventDefault();
          startGameplay(reviewOnlyIds);
        }
      }
    };

    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [gameState, activeDrawer, pilotName, startGameplay, reviewOnlyIds]);

  const handleMistake = useCallback((vocab: VocabItem, reason: 'MISTYPED' | 'BREACHED') => {
    setMistakes((prev) => {
      const updated = recordMistake(prev, vocab, reason);
      try {
        localStorage.setItem(MISTAKES_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  }, []);

  const handleGameEnd = useCallback(
    async (summary: EndRunSummary) => {
      setEndSummary(summary);
      document.body.dataset.state = 'gameover';
      setGameState('gameover');

      if (summary.victory) {
        try {
          confetti({
            particleCount: 55,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#FFFFFF', '#D71921', '#888888'],
          });
        } catch {
          // Ignore
        }
      }

      const newBest = Math.max(bestScore, summary.score);
      if (newBest > bestScore) {
        setBestScore(newBest);
        try {
          localStorage.setItem(BEST_SCORE_KEY, String(newBest));
        } catch {
          // Ignore
        }
      }

      if (summary.score > 0) {
        const entry: LeaderboardEntryItem = {
          pilotName: pilotName || 'CAPTAIN_U2',
          score: summary.score,
          accuracy: summary.accuracy,
          wpm: summary.wpm,
          wave: summary.wave,
          mode: displayMode,
          timestamp: Date.now(),
        };
        const { entries, syncedToFirebase } = await submitScoreToLeaderboard(entry);
        setLeaderboard(entries);
        if (syncedToFirebase) setIsCloudSynced(true);
      }

      if (activeChallenge) {
        const updatedRoom = await updateChallengeRoomScore(
          activeChallenge,
          summary.score,
          summary.accuracy,
          true
        );
        setActiveChallenge(updatedRoom);
      }

      syncPilotProfileToCloud(
        pilotName || 'CAPTAIN_U2',
        newBest,
        mistakes.map((m) => m.vocabId),
        reminderConfig.time
      );
    },
    [bestScore, pilotName, displayMode, activeChallenge, mistakes, reminderConfig.time]
  );

  useEffect(() => {
    if (gameState === 'playing' && activeChallenge && hud.score > 0) {
      updateChallengeRoomScore(activeChallenge, hud.score, hud.accuracy, false).then(
        setActiveChallenge
      );
    }
  }, [hud.wordsCleared]);

  const finishAndSaveEarly = () => {
    soundEngine.playUiClick();
    handleGameEnd({
      victory: hud.wordsCleared >= 5,
      score: hud.score,
      accuracy: hud.accuracy,
      wpm: hud.wpm,
      wave: hud.wave,
      wordsCleared: hud.wordsCleared,
      maxCombo: hud.maxCombo,
      missedInRun: [],
    });
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050505] text-white select-none">
      {/* 1. Isolated 60FPS Space Shooter Canvas */}
      <SpaceShooterCanvas
        gameState={gameState}
        sectionFilter={sectionFilter}
        reviewOnlyIds={reviewOnlyIds}
        displayMode={displayMode}
        challengeSeed={activeChallenge?.seed}
        runId={runId}
        onHudUpdate={setHud}
        onMistake={handleMistake}
        onGameEnd={handleGameEnd}
        virtualInputRef={virtualInputRef}
        triggerHintRef={triggerHintRef}
        cycleTargetRef={cycleTargetRef}
      />

      {/* Nothing OS Glyph Push Notification Banner */}
      <AnimatePresence>
        {glyphBanner && (
          <motion.div
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md bg-[#090909] border border-[#D71921] px-5 py-3.5 shadow-2xl pointer-events-auto"
            role="status"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-nothing text-xs text-[#D71921] tracking-wider">
                  {glyphBanner.title}
                </div>
                <div className="text-xs text-white/90 mt-1 leading-relaxed">
                  {glyphBanner.body}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGlyphBanner(null)}
                className="px-2 py-1 text-[11px] font-mono border border-white/25 hover:border-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                ĐÓNG
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. TITLE SCREEN OVERLAY */}
      <AnimatePresence>
        {gameState === 'title' && (
          <motion.main
            key="title-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-20 flex flex-col justify-between p-6 sm:p-10 pointer-events-none"
          >
            {/* Top Perimeter Utility Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pointer-events-auto">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setActiveDrawer('CALLSIGN');
                }}
                className="flex items-center gap-3 px-3.5 py-2 bg-[#080808] border border-white/25 hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="text-xs text-white/55 font-mono">CHIẾN BINH:</span>
                <span className="text-xs font-mono font-bold text-white">
                  {pilotName || 'CHƯA ĐẶT TÊN'}
                </span>
                <span className="text-[11px] text-[#D71921] font-mono">[ĐỔI]</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setActiveDrawer('LEADERBOARD');
                  }}
                  className="px-3.5 py-2 text-xs font-mono bg-[#080808] border border-white/25 hover:border-white hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Bảng Xếp Hạng ({leaderboard.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setActiveDrawer('CHALLENGE');
                  }}
                  className="px-3.5 py-2 text-xs font-mono bg-[#080808] border border-white/25 hover:border-white hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {activeChallenge
                    ? `Phòng Đấu: ${activeChallenge.roomId}`
                    : 'Thách Đấu Bạn Bè'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setActiveDrawer('MISTAKES');
                  }}
                  className={`px-3.5 py-2 text-xs font-mono border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mistakes.length > 0
                      ? 'bg-[#D71921] text-white border-[#D71921] hover:bg-white hover:text-black'
                      : 'bg-[#080808] text-white border-white/25 hover:border-white'
                  }`}
                >
                  Từ Vựng Sai ({mistakes.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setActiveDrawer('CODEX');
                  }}
                  className="px-3.5 py-2 text-xs font-mono bg-[#080808] border border-white/25 hover:border-white hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Kho Từ Unit 2 (138)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setActiveDrawer('REMINDER');
                  }}
                  className="px-3.5 py-2 text-xs font-mono bg-[#080808] border border-white/25 hover:border-white hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Lịch Học ({reminderConfig.time})
                </button>
                <button
                  type="button"
                  aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                  onClick={() => setMuted(soundEngine.toggleMute())}
                  className="px-3 py-2 text-xs font-mono bg-[#080808] border border-white/25 hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {muted ? 'ÂM: TẮT' : 'ÂM: BẬT'}
                </button>
              </div>
            </div>

            {/* Asymmetric Left-Third Title Lockup & Launch Deck */}
            <div className="my-auto max-w-2xl space-y-6 pointer-events-auto">
              <div className="space-y-2">
                <svg
                  viewBox="0 0 520 116"
                  className="w-full max-w-[490px] h-auto overflow-visible"
                  role="img"
                  aria-label="ORBITAL TYPE UNIT 2: A MULTICULTURAL WORLD"
                >
                  <rect
                    x="2"
                    y="6"
                    width="88"
                    height="88"
                    fill="#050505"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                  <circle
                    cx="46"
                    cy="50"
                    r="30"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <polygon points="46,24 64,66 46,58 28,66" fill="#FFFFFF" />
                  <circle cx="46" cy="48" r="5" fill="#D71921" />
                  <rect x="2" y="6" width="8" height="8" fill="#D71921" />
                  <rect x="82" y="86" width="8" height="8" fill="#D71921" />

                  <text
                    x="108"
                    y="48"
                    fill="#FFFFFF"
                    fontFamily="'DotGothic16', 'Space Mono', monospace"
                    fontSize="40"
                    letterSpacing="4"
                  >
                    ORBITAL // TYPE
                  </text>
                  <text
                    x="108"
                    y="76"
                    fill="#D71921"
                    fontFamily="'JetBrains Mono', monospace"
                    fontWeight="700"
                    fontSize="14"
                    letterSpacing="2.5"
                  >
                    UNIT 2: A MULTICULTURAL WORLD
                  </text>
                  <line
                    x1="108"
                    y1="90"
                    x2="510"
                    y2="90"
                    stroke="rgba(255,255,255,0.28)"
                    strokeWidth="1"
                    strokeDasharray="3 5"
                  />
                </svg>

                <p className="text-xs sm:text-sm text-white/80 max-w-lg leading-relaxed">
                  Nhìn <strong className="text-white">nghĩa tiếng Việt & số ô trống</strong> trên
                  thiên thạch đang rơi xuống, đoán và gõ chính xác{' '}
                  <strong className="text-[#D71921]">từ vựng tiếng Anh Unit 2</strong> để khai hỏa
                  tiêu diệt!
                </p>
              </div>

              {/* Mission Configuration Controls */}
              <div className="p-5 bg-[#080808]/95 border border-white/25 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="title-section-select"
                      className="block text-[11px] font-mono text-white/55 mb-1.5"
                    >
                      PHẦN ÔN TẬP TRONG ĐỀ CƯƠNG UNIT 2
                    </label>
                    <select
                      id="title-section-select"
                      value={sectionFilter}
                      onChange={(e) =>
                        setSectionFilter(e.target.value as Unit2Section | 'ALL')
                      }
                      className="w-full px-3 py-2.5 bg-black border border-white/35 text-xs text-white font-mono focus:outline-none focus:border-white"
                    >
                      {(Object.keys(SECTION_LABELS) as (Unit2Section | 'ALL')[]).map((sec) => (
                        <option key={sec} value={sec}>
                          {SECTION_LABELS[sec]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="title-mode-select"
                      className="block text-[11px] font-mono text-white/55 mb-1.5"
                    >
                      CHẾ ĐỘ ĐOÁN TỪ TIẾNG ANH
                    </label>
                    <select
                      id="title-mode-select"
                      value={displayMode}
                      onChange={(e) => setDisplayMode(e.target.value as GuessDisplayMode)}
                      className="w-full px-3 py-2.5 bg-black border border-white/35 text-xs text-white font-mono focus:outline-none focus:border-white"
                    >
                      <option value="HIDDEN_SLOTS">
                        Đoán từ (Hiện nghĩa Việt + Ẩn hoàn toàn _ _ _)
                      </option>
                      <option value="FIRST_LETTER_HINT">
                        Đoán có gợi ý (Hiện nghĩa Việt + Chữ đầu c _ _)
                      </option>
                      <option value="SHOW_ENGLISH">
                        Tập gõ mặt chữ (Hiện nghĩa Việt + Từ tiếng Anh)
                      </option>
                    </select>
                  </div>
                </div>

                {/* Primary CTA + Secondary Mistake Review CTA */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    data-start="true"
                    onClick={() => startGameplay(undefined)}
                    className="flex-1 py-3.5 px-6 text-xs sm:text-sm font-mono font-bold bg-white text-black hover:bg-[#D71921] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    BẮT ĐẦU ĐOÁN TỪ & BẮN [ENTER]
                  </button>

                  {mistakes.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        startGameplay(mistakes.map((m) => m.vocabId))
                      }
                      className="py-3.5 px-4 text-xs font-mono font-bold border border-[#D71921] text-[#D71921] hover:bg-[#D71921] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      BẮN ÔN LẠI {mistakes.length} TỪ SAI
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Safe Margin Single Flat Control-Hint Line */}
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-white/55 font-mono">
              <span>
                Đoán từ tiếng Anh & gõ phím A–Z để bắn · Tab Mở gợi ý 1 chữ · Backspace Đổi mục
                tiêu · Esc Tạm dừng
              </span>
              <span className="font-telemetry">
                Kỷ lục: {bestScore.toLocaleString('en-US')} PTS · Đề cương THPT Quang Trung Unit 2
              </span>
            </div>
          </motion.main>
        )}
      </AnimatePresence>

      {/* 3. PLAYING HUD (World-Matched, Low-Occlusion >= 85% Clear Playfield) */}
      {gameState === 'playing' && (
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-5">
          {/* Top Perimeter Clusters */}
          <div className="flex items-start justify-between gap-4">
            {/* Top-Left Cluster: Vitality Pips + Wave + Pilot */}
            <div className="bg-[#080808]/92 border border-white/25 px-4 py-2.5 space-y-1.5 font-telemetry">
              <div className="flex items-center gap-3 text-[11px] text-white/60">
                <span>PILOT: {pilotName || 'CAPTAIN_U2'}</span>
                <span>·</span>
                <span className="text-white font-bold">WAVE {hud.wave}</span>
                <span>·</span>
                <span>
                  TIẾN ĐỘ: {hud.wordsCleared}/{hud.targetWordsForWave}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/55 mr-1">GIÁP HẠM:</span>
                {Array.from({ length: hud.maxHp }).map((_, idx) => {
                  const isFull = idx < hud.hp;
                  const isCritical = hud.hp <= 2 && isFull;
                  return (
                    <svg
                      key={idx}
                      viewBox="0 0 20 20"
                      className="w-4 h-4"
                      aria-hidden="true"
                    >
                      <polygon
                        points="10,2 18,7 18,15 10,18 2,15 2,7"
                        fill={
                          isFull
                            ? isCritical
                              ? '#D71921'
                              : '#FFFFFF'
                            : 'transparent'
                        }
                        stroke={isFull ? '#FFFFFF' : 'rgba(255,255,255,0.28)'}
                        strokeWidth="1.5"
                      />
                    </svg>
                  );
                })}
                <span className="text-xs font-bold ml-1">
                  {hud.hp}/{hud.maxHp}
                </span>
              </div>
            </div>

            {/* Top-Center Cluster: Active Vietnamese Clue & English Guess Slots */}
            <div className="hidden md:flex flex-col items-center bg-[#080808]/94 border border-white/30 px-5 py-2.5 min-w-[360px]">
              {activeChallenge ? (
                <div className="flex items-center gap-4 text-xs font-telemetry mb-1">
                  <span className="text-white/60">
                    PHÒNG {activeChallenge.roomId}
                  </span>
                  <span>·</span>
                  <span className="text-white font-bold">
                    {activeChallenge.hostName}: {activeChallenge.hostScore}
                  </span>
                  <span className="text-[#D71921] font-bold">VS</span>
                  <span className="text-white font-bold">
                    {activeChallenge.guestName}: {activeChallenge.guestScore}
                  </span>
                </div>
              ) : null}

              {hud.lockedVocab ? (
                <div className="text-center space-y-1">
                  <div className="text-[11px] text-white/65 font-mono tracking-wide">
                    ĐOÁN TỪ TIẾNG ANH · ({hud.lockedVocab.pos}) {hud.lockedVocab.phonetic} ·{' '}
                    {hud.lockedLengthHint}
                  </div>
                  <div className="text-sm font-mono font-bold text-white tracking-wide">
                    Nghĩa: &ldquo;{hud.lockedVocab.meaning}&rdquo;
                  </div>
                  <div
                    className="flex flex-wrap items-center justify-center gap-1.5 pt-1"
                    aria-label="Các ô chữ cái tiếng Anh cần đoán"
                  >
                    {Array.from(
                      {
                        length:
                          hud.lockedTyped.length + hud.lockedRemainingMask.length,
                      },
                      (_, idx) => {
                        const isTyped = idx < hud.lockedTyped.length;
                        const isCursor = idx === hud.lockedTyped.length;
                        const ch = isTyped
                          ? hud.lockedTyped[idx]
                          : hud.lockedRemainingMask[idx - hud.lockedTyped.length];

                        if (ch === ' ') {
                          return (
                            <span
                              key={idx}
                              className="inline-flex items-end justify-center w-4 h-6 text-[10px] text-white/45 font-mono"
                              title="Khoảng cách giữa các từ"
                            >
                              ␣
                            </span>
                          );
                        }

                        return (
                          <span
                            key={idx}
                            className={`inline-flex items-center justify-center w-6 h-6 text-xs font-mono font-bold border ${
                              isTyped
                                ? 'bg-[#D71921]/25 border-[#D71921] text-white'
                                : isCursor
                                ? 'bg-white/10 border-[#D71921] text-white'
                                : 'bg-white/5 border-white/30 text-white/90'
                            }`}
                          >
                            {ch === '_' ? '–' : ch.toUpperCase()}
                          </span>
                        );
                      }
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-white/55 font-mono py-1">
                  ĐANG QUÉT MỤC TIÊU TỪ VỰNG UNIT 2...
                </div>
              )}
            </div>

            {/* Top-Right Cluster: Hero Score, Accuracy, WPM & Compact Utility Buttons */}
            <div className="flex items-start gap-2.5">
              <div className="bg-[#080808]/92 border border-white/25 px-4 py-2 text-right font-telemetry">
                <div className="flex items-center justify-end gap-4">
                  <div>
                    <div className="text-[10px] text-white/55">COMBO</div>
                    <div className="text-base font-bold text-[#D71921]">
                      {hud.combo}x
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/55">CHÍNH XÁC</div>
                    <div className="text-base font-bold text-white">
                      {hud.accuracy}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/55">TỐC ĐỘ</div>
                    <div className="text-base font-bold text-white">
                      {hud.wpm} WPM
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/55">ĐIỂM SỐ</div>
                    <div
                      className="text-2xl font-bold text-white leading-none"
                      data-testid="hud-score"
                    >
                      {hud.score.toLocaleString('en-US')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Compact Clickable SVG Utility Controls */}
              <div className="flex flex-col gap-1.5 pointer-events-auto">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Mở gợi ý 1 chữ cái tiếp theo (Tab)"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      triggerHintRef.current?.();
                    }}
                    className="px-2.5 py-2 bg-[#080808] border border-white/30 hover:border-white text-[11px] font-mono whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    MỞ 1 CHỮ [TAB]
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Đổi sang mục tiêu khác (Backspace)"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      cycleTargetRef.current?.();
                    }}
                    className="px-2.5 py-2 bg-[#080808] border border-white/30 hover:border-white text-[11px] font-mono whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    ĐỔI TỪ
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setMuted(soundEngine.toggleMute());
                    }}
                    className="p-2 bg-[#080808] border border-white/30 hover:border-white cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                      {muted ? (
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                      ) : (
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                      )}
                    </svg>
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Tạm dừng trò chơi"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      soundEngine.playUiClick();
                      document.body.dataset.state = 'paused';
                      setGameState('paused');
                    }}
                    className="p-2 bg-[#080808] border border-white/30 hover:border-white cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    finishAndSaveEarly();
                  }}
                  className="px-2.5 py-1 bg-[#080808] border border-white/25 hover:border-[#D71921] text-[10px] font-mono text-white/80 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  KẾT THÚC & CHẤM ĐIỂM
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Safe Margin Guess Console & Mistype Feedback */}
          <div className="flex flex-wrap items-center justify-between gap-4 pointer-events-auto">
            <div className="text-xs font-mono">
              {hud.lastMistypeHint ? (
                <span className="text-[#D71921] font-bold bg-[#080808]/95 border border-[#D71921]/60 px-3 py-1.5 inline-block">
                  {hud.lastMistypeHint}
                </span>
              ) : (
                <span className="text-white/55 bg-[#080808]/80 px-2.5 py-1">
                  Đoán từ tiếng Anh qua nghĩa tiếng Việt · [Tab] Mở 1 chữ gợi ý · Click vào thiên
                  thạch để chọn từ muốn bắn
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="text"
                aria-label="Ô nhập đoán từ tiếng Anh"
                value={mobileInputValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.length > 0) {
                    const lastChar = val[val.length - 1];
                    virtualInputRef.current?.(lastChar);
                  }
                  setMobileInputValue('');
                }}
                placeholder="Gõ chữ cái tiếng Anh tại đây..."
                className="w-56 sm:w-64 px-3 py-1.5 bg-[#080808]/95 border border-white/35 text-xs font-mono text-white focus:outline-none focus:border-[#D71921]"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. PAUSE & GAMEOVER MODALS */}
      {(gameState === 'paused' || gameState === 'gameover') && (
        <StatusModalCard
          gameState={gameState}
          summary={endSummary}
          bestScore={bestScore}
          mistakesTotalCount={mistakes.length}
          onResume={() => {
            soundEngine.playUiClick();
            document.body.dataset.state = 'playing';
            setGameState('playing');
          }}
          onRestart={() => startGameplay(reviewOnlyIds)}
          onPracticeRunMistakes={() => {
            const runIds =
              endSummary && endSummary.missedInRun.length > 0
                ? endSummary.missedInRun.map((m) => m.vocab.id)
                : mistakes.map((m) => m.vocabId);
            startGameplay(runIds);
          }}
          onReturnToTitle={() => {
            soundEngine.playUiClick();
            document.body.dataset.state = 'title';
            setGameState('title');
          }}
          onOpenLeaderboard={() => {
            soundEngine.playUiClick();
            document.body.dataset.state = 'title';
            setGameState('title');
            setActiveDrawer('LEADERBOARD');
          }}
        />
      )}

      {/* 5. FEATURE DRAWERS */}
      <OverlaysAndModals
        activeDrawer={activeDrawer}
        onCloseDrawer={() => setActiveDrawer(null)}
        pilotName={pilotName}
        onSavePilotName={handleSavePilotName}
        leaderboard={leaderboard}
        isCloudSynced={isCloudSynced}
        currentUserEmail={currentUserEmail}
        onSignInGoogle={async () => {
          try {
            await signInWithGoogle();
          } catch {
            // Ignore popup close
          }
        }}
        onSignOutGoogle={async () => {
          await signOutUser();
        }}
        mistakes={mistakes}
        onClearMistakes={() => {
          setMistakes([]);
          try {
            localStorage.removeItem(MISTAKES_STORAGE_KEY);
          } catch {
            // Ignore
          }
        }}
        onStartMistakeDrill={(vocabIds) => startGameplay(vocabIds)}
        activeChallenge={activeChallenge}
        onCreateChallenge={async (sec) => {
          const { room } = await createFriendChallengeRoom(
            pilotName || 'CAPTAIN_U2',
            sec
          );
          setActiveChallenge(room);
          setSectionFilter(room.sectionFilter);
        }}
        onJoinChallenge={async (code) => {
          const { room } = await joinFriendChallengeRoom(
            code,
            pilotName || 'CHALLENGER'
          );
          setActiveChallenge(room);
          setSectionFilter(room.sectionFilter);
        }}
        onStartChallengeMatch={() => {
          if (activeChallenge) {
            setSectionFilter(activeChallenge.sectionFilter);
          }
          startGameplay(undefined);
        }}
        onLeaveChallenge={() => setActiveChallenge(null)}
        reminderConfig={reminderConfig}
        onUpdateReminder={(cfg) => {
          setReminderConfig(cfg);
          saveReminderConfig(cfg);
        }}
        onRequestNotificationPerm={async () => {
          const perm = await requestPushNotificationPermission();
          setNotificationPerm(perm);
        }}
        onTestNotification={() => {
          triggerStudyPushNotification(
            pilotName || 'CHIẾN BINH',
            mistakes.length,
            (title, body) => {
              setGlyphBanner({ title, body });
            }
          );
        }}
        notificationPerm={notificationPerm}
      />
    </div>
  );
}
