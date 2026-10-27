import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  SECTION_LABELS,
  UNIT2_TEXTBOOK_IMAGES,
  UNIT2_VOCAB,
  Unit2Section,
} from '../data/unit2Vocab';
import { LeaderboardEntryItem, MistakeRecord } from '../game/rules';
import { ChallengeRoomData } from '../services/firebase';
import { StudyReminderConfig } from '../services/notifications';
import { EndRunSummary } from './SpaceShooterCanvas';
import { soundEngine } from '../services/sound';

export type ActiveDrawerTab =
  | null
  | 'CALLSIGN'
  | 'LEADERBOARD'
  | 'CHALLENGE'
  | 'MISTAKES'
  | 'CODEX'
  | 'REMINDER';

interface OverlaysAndModalsProps {
  activeDrawer: ActiveDrawerTab;
  onCloseDrawer: () => void;
  pilotName: string;
  onSavePilotName: (name: string) => void;
  leaderboard: LeaderboardEntryItem[];
  isCloudSynced: boolean;
  currentUserEmail: string | null;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  mistakes: MistakeRecord[];
  onClearMistakes: () => void;
  onStartMistakeDrill: (vocabIds: string[]) => void;
  activeChallenge: ChallengeRoomData | null;
  onCreateChallenge: (section: Unit2Section | 'ALL') => Promise<void>;
  onJoinChallenge: (code: string) => Promise<void>;
  onStartChallengeMatch: () => void;
  onLeaveChallenge: () => void;
  reminderConfig: StudyReminderConfig;
  onUpdateReminder: (cfg: StudyReminderConfig) => void;
  onRequestNotificationPerm: () => Promise<void>;
  onTestNotification: () => void;
  notificationPerm: string;
}

export const OverlaysAndModals: React.FC<OverlaysAndModalsProps> = ({
  activeDrawer,
  onCloseDrawer,
  pilotName,
  onSavePilotName,
  leaderboard,
  isCloudSynced,
  currentUserEmail,
  onSignInGoogle,
  onSignOutGoogle,
  mistakes,
  onClearMistakes,
  onStartMistakeDrill,
  activeChallenge,
  onCreateChallenge,
  onJoinChallenge,
  onStartChallengeMatch,
  onLeaveChallenge,
  reminderConfig,
  onUpdateReminder,
  onRequestNotificationPerm,
  onTestNotification,
  notificationPerm,
}) => {
  const [nameInput, setNameInput] = useState(pilotName || '');
  const [nameError, setNameError] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [challengeSection, setChallengeSection] = useState<Unit2Section | 'ALL'>('ALL');
  const [codexSection, setCodexSection] = useState<Unit2Section | 'ALL'>('ALL');
  const [codexSearch, setCodexSearch] = useState('');
  const [showTextbookPhotos, setShowTextbookPhotos] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCallsignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError('Vui lòng nhập tên chiến binh trước khi bay vào vũ trụ!');
      soundEngine.playMistype();
      return;
    }
    setNameError('');
    soundEngine.playUiClick();
    onSavePilotName(trimmed.slice(0, 28));
    onCloseDrawer();
  };

  const filteredCodex = UNIT2_VOCAB.filter((item) => {
    if (codexSection !== 'ALL' && item.section !== codexSection) return false;
    if (!codexSearch.trim()) return true;
    const q = codexSearch.trim().toLowerCase();
    return (
      item.word.toLowerCase().includes(q) ||
      item.meaning.toLowerCase().includes(q)
    );
  });

  return (
    <AnimatePresence>
      {activeDrawer && (
        <motion.div
          key="drawer-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/82 p-4 pointer-events-auto"
        >
          <motion.div
            key={activeDrawer}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-3xl max-h-[86vh] flex flex-col bg-[#080808] border border-white/30 text-white shadow-2xl overflow-hidden"
          >
            {/* Corner Matrix Accents */}
            <div className="w-2 h-2 bg-[#D71921] absolute top-0 left-0" />
            <div className="w-2 h-2 bg-white absolute top-0 right-0" />
            <div className="w-2 h-2 bg-white absolute bottom-0 left-0" />
            <div className="w-2 h-2 bg-[#D71921] absolute bottom-0 right-0" />

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/15 bg-[#0C0C0C]">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-base sm:text-lg tracking-wider text-white">
                  {activeDrawer === 'CALLSIGN' && 'PILOT ID // ĐỊNH DANH CHIẾN BINH VŨ TRỤ'}
                  {activeDrawer === 'LEADERBOARD' && 'LEADERBOARD // BẢNG XẾP HẠNG FIREBASE'}
                  {activeDrawer === 'CHALLENGE' && '1v1 DUEL // CHẾ ĐỘ THÁCH ĐẤU BẠN BÈ'}
                  {activeDrawer === 'MISTAKES' && `MISTAKE VAULT // SỔ TAY TỪ SAI (${mistakes.length})`}
                  {activeDrawer === 'CODEX' && 'UNIT 2 CODEX // KHO 138 TỪ VỰNG'}
                  {activeDrawer === 'REMINDER' && 'DAILY PUSH // NHẮC LỊCH HỌC MỖI NGÀY'}
                </span>
              </div>
              {pilotName && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    onCloseDrawer();
                  }}
                  aria-label="Đóng cửa sổ"
                  className="px-3 py-1 text-xs font-mono border border-white/25 hover:border-white hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  ĐÓNG [ESC]
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* 1. CALLSIGN REGISTRATION */}
              {activeDrawer === 'CALLSIGN' && (
                <form onSubmit={handleCallsignSubmit} className="space-y-5">
                  <p className="text-sm text-white/75 leading-relaxed">
                    Chào mừng đến với trạm không gian ôn luyện tiếng Anh{' '}
                    <strong className="text-white">Unit 2: A Multicultural World</strong>. Hãy
                    nhập tên chiến binh của bạn để lưu điểm lên bảng xếp hạng Firebase và theo dõi
                    từ vựng cần ôn tập.
                  </p>
                  <div>
                    <label
                      htmlFor="pilot-callsign-input"
                      className="block text-xs text-white/60 mb-2"
                    >
                      TÊN NGƯỜI CHƠI (CALLSIGN)
                    </label>
                    <input
                      id="pilot-callsign-input"
                      type="text"
                      autoFocus
                      maxLength={28}
                      value={nameInput}
                      onChange={(e) => {
                        setNameInput(e.target.value);
                        if (nameError) setNameError('');
                      }}
                      placeholder="VD: CAPTAIN_TAM, NOVA_2009..."
                      className="w-full px-4 py-3 bg-black border border-white/40 text-white font-mono text-base focus:outline-none focus:border-[#D71921]"
                    />
                    {nameError && (
                      <p className="mt-2 text-xs text-[#D71921]" role="alert">
                        {nameError}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-3 pt-2">
                    {pilotName && (
                      <button
                        type="button"
                        onClick={onCloseDrawer}
                        className="px-4 py-2.5 text-xs font-mono border border-white/25 text-white/80 hover:text-white hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        HỦY
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-6 py-2.5 text-xs font-mono font-bold bg-white text-black hover:bg-[#D71921] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      XÁC NHẬN TÊN CHIẾN BINH
                    </button>
                  </div>
                </form>
              )}

              {/* 2. REAL-TIME FIREBASE LEADERBOARD */}
              {activeDrawer === 'LEADERBOARD' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-black border border-white/15">
                    <div>
                      <div className="text-xs text-white/60">
                        TRẠNG THÁI MÁY CHỦ FIREBASE FIRESTORE
                      </div>
                      <div className="text-sm font-mono mt-0.5 text-white">
                        {currentUserEmail
                          ? `Đã đồng bộ Cloud: ${currentUserEmail}`
                          : isCloudSynced
                          ? 'Đang kết nối dữ liệu Firebase thời gian thực'
                          : 'Chế độ Lưu trữ Trực tiếp · Đăng nhập Google để đồng bộ toàn cầu'}
                      </div>
                    </div>
                    <div>
                      {currentUserEmail ? (
                        <button
                          type="button"
                          onClick={onSignOutGoogle}
                          className="px-3 py-2 text-xs font-mono border border-white/30 hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Đăng xuất Cloud
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onSignInGoogle}
                          className="px-4 py-2 text-xs font-mono font-bold bg-white text-black hover:bg-[#D71921] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Đồng bộ Google Firebase
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="border border-white/15 overflow-hidden">
                    <table className="w-full text-left border-collapse font-telemetry text-xs">
                      <thead>
                        <tr className="border-b border-white/20 bg-white/5 text-white/60">
                          <th className="py-3 px-4">HẠNG</th>
                          <th className="py-3 px-4">CHIẾN BINH</th>
                          <th className="py-3 px-4 text-right">ĐIỂM SỐ</th>
                          <th className="py-3 px-4 text-right">CHÍNH XÁC</th>
                          <th className="py-3 px-4 text-right">TỐC ĐỘ</th>
                          <th className="py-3 px-4 text-right">WAVE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {leaderboard.map((entry, idx) => {
                          const isMe =
                            pilotName &&
                            entry.pilotName.toUpperCase() === pilotName.toUpperCase();
                          return (
                            <tr
                              key={`${entry.pilotName}_${idx}`}
                              className={
                                isMe
                                  ? 'bg-[#D71921]/18 text-white font-bold'
                                  : 'hover:bg-white/5 text-white/85'
                              }
                            >
                              <td className="py-3 px-4 font-mono">
                                #{String(idx + 1).padStart(2, '0')}
                              </td>
                              <td className="py-3 px-4 font-mono">
                                {entry.pilotName}
                                {isMe ? ' (BẠN)' : ''}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-white">
                                {entry.score.toLocaleString('en-US')}
                              </td>
                              <td className="py-3 px-4 text-right font-mono">
                                {entry.accuracy}%
                              </td>
                              <td className="py-3 px-4 text-right font-mono">
                                {entry.wpm} WPM
                              </td>
                              <td className="py-3 px-4 text-right font-mono">
                                W{entry.wave}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 3. FRIEND CHALLENGE 1v1 MODE */}
              {activeDrawer === 'CHALLENGE' && (
                <div className="space-y-5">
                  <p className="text-xs text-white/75 leading-relaxed">
                    Thách đấu bạn bè cùng bắn bộ từ vựng Unit 2 với cùng một kịch bản thiên thạch
                    (Shared Wave Seed). Điểm số và độ chính xác của cả 2 người chơi sẽ được so
                    sánh trực tiếp!
                  </p>

                  {!activeChallenge ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Create Room */}
                      <div className="p-5 bg-black border border-white/20 space-y-4">
                        <h3 className="font-nothing text-base text-white">
                          01. TẠO PHÒNG THÁCH ĐẤU MỚI
                        </h3>
                        <div>
                          <label
                            htmlFor="challenge-section-select"
                            className="block text-xs text-white/60 mb-1.5"
                          >
                            CHỌN PHẦN TỪ VỰNG UNIT 2
                          </label>
                          <select
                            id="challenge-section-select"
                            value={challengeSection}
                            onChange={(e) =>
                              setChallengeSection(e.target.value as Unit2Section | 'ALL')
                            }
                            className="w-full px-3 py-2 bg-[#0A0A0A] border border-white/30 text-xs text-white focus:outline-none"
                          >
                            {(Object.keys(SECTION_LABELS) as (Unit2Section | 'ALL')[]).map(
                              (sec) => (
                                <option key={sec} value={sec}>
                                  {SECTION_LABELS[sec]}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => onCreateChallenge(challengeSection)}
                          className="w-full py-2.5 px-4 text-xs font-mono font-bold bg-white text-black hover:bg-[#D71921] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          TẠO MÃ PHÒNG THÁCH ĐẤU
                        </button>
                      </div>

                      {/* Join Room */}
                      <div className="p-5 bg-black border border-white/20 space-y-4">
                        <h3 className="font-nothing text-base text-white">
                          02. NHẬP MÃ PHÒNG CỦA BẠN BÈ
                        </h3>
                        <div>
                          <label
                            htmlFor="join-room-code-input"
                            className="block text-xs text-white/60 mb-1.5"
                          >
                            MÃ PHÒNG (VD: U2A9K4)
                          </label>
                          <input
                            id="join-room-code-input"
                            type="text"
                            maxLength={12}
                            value={joinCodeInput}
                            onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                            placeholder="Nhập mã 6 ký tự..."
                            className="w-full px-3 py-2 bg-[#0A0A0A] border border-white/30 text-xs text-white uppercase font-mono focus:outline-none focus:border-[#D71921]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (joinCodeInput.trim()) {
                              onJoinChallenge(joinCodeInput.trim());
                            }
                          }}
                          className="w-full py-2.5 px-4 text-xs font-mono font-bold border border-white text-white hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          VÀO PHÒNG THÁCH ĐẤU
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 bg-black border border-white/30 space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-4">
                        <div>
                          <div className="text-xs text-white/60">MÃ PHÒNG THÁCH ĐẤU 1v1</div>
                          <div className="font-nothing text-2xl text-[#D71921] tracking-widest mt-0.5">
                            {activeChallenge.roomId}
                          </div>
                          <div className="text-xs text-white/60 mt-1">
                            Chủ đề: {SECTION_LABELS[activeChallenge.sectionFilter]} · Seed #
                            {activeChallenge.seed}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const url = `${window.location.origin}${window.location.pathname}?room=${activeChallenge.roomId}`;
                              navigator.clipboard?.writeText(url).catch(() => {});
                              setCopiedCode(true);
                              setTimeout(() => setCopiedCode(false), 2000);
                            }}
                            className="px-3 py-2 text-xs font-mono border border-white/30 hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {copiedCode ? 'ĐÃ SAO CHÉP LINK!' : 'SAO CHÉP LINK MỜI BẠN'}
                          </button>
                          <button
                            type="button"
                            onClick={onLeaveChallenge}
                            className="px-3 py-2 text-xs font-mono border border-white/20 text-white/70 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            RỜI PHÒNG
                          </button>
                        </div>
                      </div>

                      {/* Head-to-head telemetry */}
                      <div className="grid grid-cols-2 gap-4 font-telemetry">
                        <div className="p-4 border border-white/20 bg-white/5">
                          <div className="text-xs text-white/60">CHỦ PHÒNG (HOST)</div>
                          <div className="text-sm font-bold mt-1 truncate">
                            {activeChallenge.hostName}
                          </div>
                          <div className="text-xl font-bold text-white mt-2">
                            {activeChallenge.hostScore.toLocaleString('en-US')} PTS
                          </div>
                          <div className="text-xs text-white/70 mt-0.5">
                            Chính xác: {activeChallenge.hostAccuracy}%
                          </div>
                        </div>
                        <div className="p-4 border border-white/20 bg-white/5">
                          <div className="text-xs text-white/60">ĐỐI THỦ (CHALLENGER)</div>
                          <div className="text-sm font-bold mt-1 truncate">
                            {activeChallenge.guestName}
                          </div>
                          <div className="text-xl font-bold text-[#D71921] mt-2">
                            {activeChallenge.guestScore.toLocaleString('en-US')} PTS
                          </div>
                          <div className="text-xs text-white/70 mt-0.5">
                            Chính xác: {activeChallenge.guestAccuracy}%
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={onStartChallengeMatch}
                        className="w-full py-3 px-6 text-xs font-mono font-bold bg-[#D71921] text-white hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        BẮT ĐẦU TRẬN ĐẤU THÁCH ĐẤU NGAY
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 4. MISTAKE VAULT (SỔ TAY TỪ SAI & ÔN LUYỆN LẠI) */}
              {activeDrawer === 'MISTAKES' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-black border border-white/15">
                    <div>
                      <div className="text-xs text-white/60">
                        CHẾ ĐỘ LƯU TỪ SAI & BẮN ÔN TẬP CHUYÊN SÂU
                      </div>
                      <div className="text-sm text-white mt-0.5">
                        {mistakes.length > 0
                          ? `Hệ thống đã ghi nhận ${mistakes.length} từ vựng bạn gõ nhầm hoặc để lọt qua hàng phòng thủ.`
                          : 'Hiện tại bạn chưa có từ vựng nào bị sai. Hãy vào chơi để hệ thống tự động thống kê!'}
                      </div>
                    </div>
                    {mistakes.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onStartMistakeDrill(mistakes.map((m) => m.vocabId))
                          }
                          className="px-4 py-2.5 text-xs font-mono font-bold bg-[#D71921] text-white hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          BẮN ÔN TẬP {mistakes.length} TỪ SAI NGAY
                        </button>
                        <button
                          type="button"
                          onClick={onClearMistakes}
                          className="px-3 py-2.5 text-xs font-mono border border-white/25 text-white/75 hover:text-white hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Xóa lịch sử sai
                        </button>
                      </div>
                    )}
                  </div>

                  {mistakes.length > 0 && (
                    <div className="border border-white/15 divide-y divide-white/10">
                      {mistakes.map((m) => (
                        <div
                          key={m.vocabId}
                          className="flex flex-wrap items-center justify-between gap-4 p-3.5 hover:bg-white/5"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-base text-white">
                                {m.word}
                              </span>
                              <span className="text-xs text-white/50">({m.pos})</span>
                              <span className="text-xs text-white/60 font-mono">
                                {m.phonetic}
                              </span>
                            </div>
                            <div className="text-xs text-white/80 mt-0.5">{m.meaning}</div>
                          </div>
                          <div className="flex items-center gap-3 font-telemetry">
                            <span className="text-xs text-[#D71921] font-mono">
                              Sai {m.mistakeCount} lần ·{' '}
                              {m.reason === 'MISTYPED' ? 'Gõ nhầm phím' : 'Lọt phòng tuyến'}
                            </span>
                            <button
                              type="button"
                              onClick={() => soundEngine.speakWord(m.word)}
                              className="px-2.5 py-1 text-xs font-mono border border-white/25 hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Nghe phát âm
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 5. UNIT 2 VOCAB CODEX & TEXTBOOK PHOTOS */}
              {activeDrawer === 'CODEX' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Lọc theo phần Unit 2"
                        value={codexSection}
                        onChange={(e) =>
                          setCodexSection(e.target.value as Unit2Section | 'ALL')
                        }
                        className="px-3 py-2 bg-black border border-white/30 text-xs text-white focus:outline-none"
                      >
                        {(Object.keys(SECTION_LABELS) as (Unit2Section | 'ALL')[]).map(
                          (sec) => (
                            <option key={sec} value={sec}>
                              {SECTION_LABELS[sec]}
                            </option>
                          )
                        )}
                      </select>
                      <input
                        type="text"
                        value={codexSearch}
                        onChange={(e) => setCodexSearch(e.target.value)}
                        placeholder="Tìm từ tiếng Anh hoặc nghĩa tiếng Việt..."
                        className="px-3 py-2 bg-black border border-white/30 text-xs text-white w-64 focus:outline-none focus:border-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTextbookPhotos((v) => !v)}
                      className="px-3 py-2 text-xs font-mono border border-white/40 hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {showTextbookPhotos
                        ? 'Xem Danh Sách Bảng Từ (138 Từ)'
                        : 'Xem Ảnh Chụp Đề Cương Gốc (Trang 5-9)'}
                    </button>
                  </div>

                  {showTextbookPhotos ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {UNIT2_TEXTBOOK_IMAGES.map((img) => (
                        <div
                          key={img.src}
                          className="border border-white/20 bg-black p-2 space-y-2"
                        >
                          <div className="text-xs font-mono text-white/80 px-1">
                            {img.title}
                          </div>
                          <img
                            src={img.src}
                            alt={img.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-72 object-contain bg-[#050505]"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border border-white/15 max-h-[52vh] overflow-y-auto divide-y divide-white/10">
                      {filteredCodex.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-white/5 text-xs"
                        >
                          <div>
                            <span className="font-bold text-white text-sm">
                              {item.word}
                            </span>{' '}
                            <span className="text-white/50">({item.pos})</span>{' '}
                            <span className="text-white/60">{item.phonetic}</span>
                            <div className="text-white/80 mt-0.5">{item.meaning}</div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-white/45 font-mono">
                              Trang {item.page}
                            </span>
                            <button
                              type="button"
                              onClick={() => soundEngine.speakWord(item.word)}
                              className="px-2.5 py-1 border border-white/25 hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Phát âm
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 6. DAILY STUDY PUSH NOTIFICATION REMINDER */}
              {activeDrawer === 'REMINDER' && (
                <div className="space-y-5">
                  <p className="text-xs text-white/75 leading-relaxed">
                    Hệ thống thông báo đẩy (Web Push Notification & Nothing OS Glyph Alert) sẽ
                    nhắc nhở bạn ôn luyện từ vựng Unit 2 đúng giờ mỗi ngày.
                  </p>

                  <div className="p-4 bg-black border border-white/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-white">
                          BẬT NHẮC LỊCH HỌC MỖI NGÀY
                        </div>
                        <div className="text-xs text-white/60">
                          Quyền thông báo trình duyệt: {notificationPerm.toUpperCase()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateReminder({
                            ...reminderConfig,
                            enabled: !reminderConfig.enabled,
                          })
                        }
                        className={`px-4 py-2 text-xs font-mono font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          reminderConfig.enabled
                            ? 'bg-white text-black border-white'
                            : 'bg-black text-white/60 border-white/30'
                        }`}
                      >
                        {reminderConfig.enabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label
                          htmlFor="reminder-time-input"
                          className="block text-xs text-white/60 mb-1.5"
                        >
                          GIỜ NHẮC HỌC MỖI NGÀY (24H)
                        </label>
                        <input
                          id="reminder-time-input"
                          type="time"
                          value={reminderConfig.time}
                          onChange={(e) =>
                            onUpdateReminder({
                              ...reminderConfig,
                              time: e.target.value || '20:00',
                            })
                          }
                          className="w-full px-3 py-2 bg-[#0C0C0C] border border-white/35 text-sm text-white font-mono focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="reminder-goal-input"
                          className="block text-xs text-white/60 mb-1.5"
                        >
                          MỤC TIÊU SỐ TỪ ÔN MỖI NGÀY
                        </label>
                        <input
                          id="reminder-goal-input"
                          type="number"
                          min={5}
                          max={138}
                          value={reminderConfig.dailyGoalWords}
                          onChange={(e) =>
                            onUpdateReminder({
                              ...reminderConfig,
                              dailyGoalWords: Math.max(5, Number(e.target.value) || 25),
                            })
                          }
                          className="w-full px-3 py-2 bg-[#0C0C0C] border border-white/35 text-sm text-white font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      {notificationPerm !== 'granted' && (
                        <button
                          type="button"
                          onClick={onRequestNotificationPerm}
                          className="px-4 py-2.5 text-xs font-mono font-bold bg-white text-black hover:bg-[#D71921] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          CẤP QUYỀN THÔNG BÁO ĐẨY (PUSH)
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onTestNotification}
                        className="px-4 py-2.5 text-xs font-mono border border-white text-white hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        GỬI THÔNG BÁO THỬ NGAY (TEST PUSH)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface StatusModalProps {
  gameState: 'paused' | 'gameover';
  summary: EndRunSummary | null;
  bestScore: number;
  mistakesTotalCount: number;
  onResume: () => void;
  onRestart: () => void;
  onPracticeRunMistakes: () => void;
  onReturnToTitle: () => void;
  onOpenLeaderboard: () => void;
}

export const StatusModalCard: React.FC<StatusModalProps> = ({
  gameState,
  summary,
  bestScore,
  mistakesTotalCount,
  onResume,
  onRestart,
  onPracticeRunMistakes,
  onReturnToTitle,
  onOpenLeaderboard,
}) => {
  if (gameState === 'paused') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4 pointer-events-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-[#080808] border border-white/35 p-6 space-y-6 text-white shadow-2xl"
          role="dialog"
          aria-modal="true"
        >
          <div className="space-y-1">
            <div className="text-xs text-white/55 font-mono">SYSTEM // PAUSED</div>
            <h2 className="font-nothing text-2xl tracking-wider">TẠM DỪNG NHIỆM VỤ</h2>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 px-4 text-xs font-mono font-bold bg-white text-black hover:bg-[#D71921] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              TIẾP TỤC CHIẾN ĐẤU [ESC / P]
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-3 px-4 text-xs font-mono border border-white/30 hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              CHƠI LẠI TỪ ĐẦU [R]
            </button>
            <button
              type="button"
              onClick={onReturnToTitle}
              className="w-full py-3 px-4 text-xs font-mono border border-white/20 text-white/75 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              VỀ TRẠM CHỈ HUY (LƯU KẾT QUẢ)
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/85 p-4 pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[#080808] border border-white/40 p-6 space-y-6 text-white shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-4">
          <div>
            <div className="text-xs font-mono text-[#D71921]">
              {summary.victory ? 'ORBITAL CLEAR // VICTORY' : 'PERIMETER BREACHED // REPORT'}
            </div>
            <h2 className="font-nothing text-2xl sm:text-3xl tracking-wider mt-1">
              {summary.victory
                ? 'HOÀN THÀNH XUẤT SẮC NHIỆM VỤ!'
                : 'KẾT THÚC ĐỢT TUẦN TRA TỪ VỰNG'}
            </h2>
          </div>
          <div className="text-right font-telemetry">
            <div className="text-xs text-white/55">KỶ LỤC CÁ NHÂN</div>
            <div className="text-lg font-bold text-white">
              {Math.max(bestScore, summary.score).toLocaleString('en-US')}
            </div>
          </div>
        </div>

        {/* 3 Tabular Stat Tiles */}
        <div className="grid grid-cols-3 gap-3 font-telemetry">
          <div className="p-3.5 bg-black border border-white/20">
            <div className="text-[11px] text-white/55">ĐIỂM SỐ ĐẠT ĐƯỢC</div>
            <div className="text-2xl font-bold text-white mt-1">
              {summary.score.toLocaleString('en-US')}
            </div>
            <div className="text-[11px] text-white/60 mt-0.5">
              Đã hạ {summary.wordsCleared} từ · Wave {summary.wave}
            </div>
          </div>
          <div className="p-3.5 bg-black border border-white/20">
            <div className="text-[11px] text-white/55">ĐỘ CHÍNH XÁC</div>
            <div className="text-2xl font-bold text-white mt-1">{summary.accuracy}%</div>
            <div className="text-[11px] text-white/60 mt-0.5">
              Max Combo: {summary.maxCombo}x
            </div>
          </div>
          <div className="p-3.5 bg-black border border-white/20">
            <div className="text-[11px] text-white/55">TỐC ĐỘ GÕ</div>
            <div className="text-2xl font-bold text-white mt-1">{summary.wpm} WPM</div>
            <div className="text-[11px] text-white/60 mt-0.5">
              Chuẩn chấm điểm Unit 2
            </div>
          </div>
        </div>

        {/* Missed Words in This Run */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-white/75">
              TỪ VỰNG BẮN SAI / LỌT TRONG LƯỢT NÀY ({summary.missedInRun.length})
            </span>
            {mistakesTotalCount > 0 && (
              <span className="text-xs font-mono text-[#D71921]">
                Tổng sổ tay từ sai: {mistakesTotalCount} từ
              </span>
            )}
          </div>

          {summary.missedInRun.length === 0 ? (
            <div className="p-3.5 bg-black border border-white/15 text-xs text-white/75">
              Tuyệt vời! Bạn không bắn trượt từ vựng nào trong đợt tuần tra này.
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto border border-white/20 divide-y divide-white/10 bg-black">
              {summary.missedInRun.map(({ vocab, reason }) => (
                <div
                  key={vocab.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-bold text-white">{vocab.word}</span>{' '}
                    <span className="text-white/50">({vocab.pos})</span>{' '}
                    <span className="text-white/60">{vocab.phonetic}</span>
                    <div className="text-white/80">{vocab.meaning}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-[#D71921] font-mono">
                      {reason === 'MISTYPED' ? 'Gõ sai' : 'Lọt lưới'}
                    </span>
                    <button
                      type="button"
                      onClick={() => soundEngine.speakWord(vocab.word)}
                      className="px-2 py-1 border border-white/25 hover:border-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Nghe
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Primary Action CTAs */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            data-start="true"
            onClick={onRestart}
            className="flex-1 py-3 px-5 text-xs font-mono font-bold bg-white text-black hover:bg-[#D71921] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            BẮN LẠI LƯỢT MỚI [ENTER]
          </button>

          {(summary.missedInRun.length > 0 || mistakesTotalCount > 0) && (
            <button
              type="button"
              onClick={onPracticeRunMistakes}
              className="flex-1 py-3 px-5 text-xs font-mono font-bold bg-[#D71921] text-white hover:bg-white hover:text-black transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              ÔN LUYỆN LẠI TỪ SAI NGAY
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="text-xs font-mono text-white/75 hover:text-white underline cursor-pointer whitespace-nowrap shrink-0"
          >
            Xem Bảng Xếp Hạng Firebase
          </button>
          <button
            type="button"
            onClick={onReturnToTitle}
            className="text-xs font-mono text-white/75 hover:text-white underline cursor-pointer whitespace-nowrap shrink-0"
          >
            Quay về Màn Hình Chính
          </button>
        </div>
      </motion.div>
    </div>
  );
};
