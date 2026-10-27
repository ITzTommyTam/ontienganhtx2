import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  LeaderboardEntryItem,
  encodeLeaderboardEntry,
  decodeLeaderboardEntry,
  mergeLeaderboardEntries,
} from '../game/rules';
import { Unit2Section } from '../data/unit2Vocab';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate Connection to Firestore on initial boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

const SEED_LEADERBOARD: LeaderboardEntryItem[] = [
  {
    pilotName: 'NOTHING_OS_01',
    score: 6420,
    accuracy: 98,
    wpm: 68,
    wave: 6,
    mode: 'STANDARD',
    timestamp: 1729990000000,
  },
  {
    pilotName: 'COSMIC_MINH',
    score: 5180,
    accuracy: 95,
    wpm: 59,
    wave: 5,
    mode: 'STANDARD',
    timestamp: 1729985000000,
  },
  {
    pilotName: 'ASTRA_LINH',
    score: 4350,
    accuracy: 93,
    wpm: 52,
    wave: 4,
    mode: 'HARDCORE',
    timestamp: 1729980000000,
  },
  {
    pilotName: 'VANGUARD_KHANH',
    score: 3690,
    accuracy: 91,
    wpm: 46,
    wave: 4,
    mode: 'STANDARD',
    timestamp: 1729975000000,
  },
  {
    pilotName: 'ORBIT_HUY',
    score: 2840,
    accuracy: 89,
    wpm: 41,
    wave: 3,
    mode: 'STANDARD',
    timestamp: 1729970000000,
  },
];

const LOCAL_LB_KEY = 'orbital_unit2_leaderboard_v1';

export function loadLocalLeaderboard(): LeaderboardEntryItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_LB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const items = parsed
          .map(decodeLeaderboardEntry)
          .filter((x): x is LeaderboardEntryItem => x !== null);
        if (items.length > 0) return items;
      }
    }
  } catch {
    // Ignore
  }
  return SEED_LEADERBOARD;
}

export function saveLocalLeaderboard(entries: LeaderboardEntryItem[]): void {
  try {
    const encoded = entries.slice(0, 20).map(encodeLeaderboardEntry);
    localStorage.setItem(LOCAL_LB_KEY, JSON.stringify(encoded));
  } catch {
    // Ignore
  }
}

export async function signInWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await fbSignOut(auth);
}

export function subscribeAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

const GLOBAL_BOARD_ID = 'unit2_main';

export function subscribeGlobalLeaderboard(
  onUpdate: (entries: LeaderboardEntryItem[], isCloudSynced: boolean) => void
): Unsubscribe {
  if (!auth.currentUser) {
    onUpdate(loadLocalLeaderboard(), false);
    return () => {};
  }

  const boardRef = doc(db, 'global_boards', GLOBAL_BOARD_ID);
  const path = `global_boards/${GLOBAL_BOARD_ID}`;

  return onSnapshot(
    boardRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const rawEntries = Array.isArray(data.entries) ? (data.entries as string[]) : [];
        const localEncoded = loadLocalLeaderboard().map(encodeLeaderboardEntry);
        let merged = rawEntries
          .map(decodeLeaderboardEntry)
          .filter((x): x is LeaderboardEntryItem => x !== null);

        // Merge with local entries so nothing is lost
        for (const loc of localEncoded) {
          const dec = decodeLeaderboardEntry(loc);
          if (dec) {
            merged = mergeLeaderboardEntries(
              merged.map(encodeLeaderboardEntry),
              dec
            );
          }
        }
        saveLocalLeaderboard(merged);
        onUpdate(merged, true);
      } else {
        onUpdate(loadLocalLeaderboard(), true);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        onUpdate(loadLocalLeaderboard(), false);
      }
    }
  );
}

export async function submitScoreToLeaderboard(
  newEntry: LeaderboardEntryItem
): Promise<{ entries: LeaderboardEntryItem[]; syncedToFirebase: boolean }> {
  // Always update local cache immediately
  const currentLocal = loadLocalLeaderboard();
  const merged = mergeLeaderboardEntries(
    currentLocal.map(encodeLeaderboardEntry),
    newEntry
  );
  saveLocalLeaderboard(merged);

  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { entries: merged, syncedToFirebase: false };
  }

  const boardRef = doc(db, 'global_boards', GLOBAL_BOARD_ID);
  const path = `global_boards/${GLOBAL_BOARD_ID}`;

  try {
    const existingSnap = await getDoc(boardRef);
    let combined = merged;
    if (existingSnap.exists()) {
      const cloudEntries = Array.isArray(existingSnap.data().entries)
        ? (existingSnap.data().entries as string[])
        : [];
      for (const item of merged) {
        combined = mergeLeaderboardEntries(cloudEntries, item);
      }
    }

    const encodedList = combined.slice(0, 20).map(encodeLeaderboardEntry);
    const topItem = combined[0] || newEntry;
    const safeTopName = (topItem.pilotName || 'PILOT').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 40) || 'PILOT';
    const safeTopScore = Math.max(0, Math.min(10000000, Math.round(topItem.score)));

    if (!existingSnap.exists()) {
      await setDoc(boardRef, {
        ownerId: user.uid,
        topPilotName: safeTopName,
        topScore: safeTopScore,
        entries: encodedList,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(boardRef, {
        ownerId: user.uid,
        topPilotName: safeTopName,
        topScore: safeTopScore,
        entries: encodedList,
        updatedAt: serverTimestamp(),
      });
    }
    saveLocalLeaderboard(combined);
    return { entries: combined, syncedToFirebase: true };
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      return { entries: merged, syncedToFirebase: false };
    }
  }
}

export interface ChallengeRoomData {
  roomId: string;
  ownerId: string;
  hostName: string;
  hostScore: number;
  hostAccuracy: number;
  guestId: string;
  guestName: string;
  guestScore: number;
  guestAccuracy: number;
  sectionFilter: Unit2Section | 'ALL';
  seed: number;
  status: 'waiting' | 'active' | 'completed';
}

const LOCAL_ROOMS_KEY = 'orbital_challenge_rooms_v1';

function saveLocalRoom(room: ChallengeRoomData): void {
  try {
    const raw = localStorage.getItem(LOCAL_ROOMS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, ChallengeRoomData>) : {};
    map[room.roomId] = room;
    localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(map));
  } catch {
    // Ignore
  }
}

export function getLocalRoom(roomId: string): ChallengeRoomData | null {
  try {
    const raw = localStorage.getItem(LOCAL_ROOMS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, ChallengeRoomData>;
    return map[roomId] || null;
  } catch {
    return null;
  }
}

export function generateRoomCode(seed: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'U2';
  let n = seed;
  for (let i = 0; i < 4; i++) {
    code += chars[n % chars.length];
    n = Math.floor(n / chars.length) + i * 17;
  }
  return code;
}

export async function createFriendChallengeRoom(
  hostName: string,
  sectionFilter: Unit2Section | 'ALL'
): Promise<{ room: ChallengeRoomData; isCloud: boolean }> {
  const seed = Math.floor(100000 + Math.random() * 899999);
  const roomId = generateRoomCode(seed);
  const user = auth.currentUser;
  const safeHostName = hostName.trim().slice(0, 40) || 'CAPTAIN';
  const ownerId = user?.uid || 'local_host';

  const room: ChallengeRoomData = {
    roomId,
    ownerId,
    hostName: safeHostName,
    hostScore: 0,
    hostAccuracy: 100,
    guestId: ownerId,
    guestName: 'WAITING_FOR_FRIEND',
    guestScore: 0,
    guestAccuracy: 100,
    sectionFilter,
    seed,
    status: 'waiting',
  };

  saveLocalRoom(room);

  if (user && user.emailVerified) {
    const roomRef = doc(db, 'challenges', roomId);
    const path = `challenges/${roomId}`;
    try {
      await setDoc(roomRef, {
        ownerId: user.uid,
        hostName: safeHostName,
        hostScore: 0,
        hostAccuracy: 100,
        guestId: user.uid,
        guestName: 'WAITING_FOR_FRIEND',
        guestScore: 0,
        guestAccuracy: 100,
        sectionFilter,
        seed,
        status: 'waiting',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { room, isCloud: true };
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, path);
      } catch {
        return { room, isCloud: false };
      }
    }
  }

  return { room, isCloud: false };
}

export async function joinFriendChallengeRoom(
  roomCodeInput: string,
  guestName: string
): Promise<{ room: ChallengeRoomData; isCloud: boolean }> {
  const cleanCode = roomCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) || 'U2DUEL';
  const safeGuestName = guestName.trim().slice(0, 40) || 'CHALLENGER';
  const user = auth.currentUser;

  if (user && user.emailVerified) {
    const roomRef = doc(db, 'challenges', cleanCode);
    const path = `challenges/${cleanCode}`;
    try {
      const snap = await getDoc(roomRef);
      if (snap.exists()) {
        const d = snap.data();
        const isHost = d.ownerId === user.uid;
        if (!isHost && d.status !== 'completed') {
          await updateDoc(roomRef, {
            guestId: user.uid,
            guestName: safeGuestName,
            guestScore: 0,
            guestAccuracy: 100,
            status: 'active',
            updatedAt: serverTimestamp(),
          });
        }
        const room: ChallengeRoomData = {
          roomId: cleanCode,
          ownerId: d.ownerId,
          hostName: d.hostName,
          hostScore: d.hostScore,
          hostAccuracy: d.hostAccuracy,
          guestId: isHost ? d.guestId : user.uid,
          guestName: isHost ? d.guestName : safeGuestName,
          guestScore: d.guestScore,
          guestAccuracy: d.guestAccuracy,
          sectionFilter: d.sectionFilter || 'ALL',
          seed: d.seed || 202610,
          status: isHost ? d.status : 'active',
        };
        saveLocalRoom(room);
        return { room, isCloud: true };
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, path);
      } catch {
        // Fallback to deterministic local duel room
      }
    }
  }

  // Deterministic fallback room derived from code so 2 friends sharing a code get the exact same wave seed
  const existingLocal = getLocalRoom(cleanCode);
  if (existingLocal) {
    const updated: ChallengeRoomData = {
      ...existingLocal,
      guestName: safeGuestName,
      status: 'active',
    };
    saveLocalRoom(updated);
    return { room: updated, isCloud: false };
  }

  let derivedSeed = 0;
  for (let i = 0; i < cleanCode.length; i++) {
    derivedSeed = (derivedSeed * 31 + cleanCode.charCodeAt(i)) % 900000;
  }
  const deterministicRoom: ChallengeRoomData = {
    roomId: cleanCode,
    ownerId: 'remote_host',
    hostName: `PILOT_${cleanCode.slice(-3)}`,
    hostScore: 2850 + (derivedSeed % 1600),
    hostAccuracy: 92 + (derivedSeed % 7),
    guestId: user?.uid || 'local_guest',
    guestName: safeGuestName,
    guestScore: 0,
    guestAccuracy: 100,
    sectionFilter: 'ALL',
    seed: Math.max(1000, derivedSeed),
    status: 'active',
  };
  saveLocalRoom(deterministicRoom);
  return { room: deterministicRoom, isCloud: false };
}

export async function updateChallengeRoomScore(
  room: ChallengeRoomData,
  score: number,
  accuracy: number,
  finished: boolean
): Promise<ChallengeRoomData> {
  const user = auth.currentUser;
  const isHost = room.ownerId === (user?.uid || 'local_host');
  const nextStatus: 'waiting' | 'active' | 'completed' = finished ? 'completed' : 'active';

  const updated: ChallengeRoomData = {
    ...room,
    hostScore: isHost ? Math.round(score) : room.hostScore,
    hostAccuracy: isHost ? Math.round(accuracy) : room.hostAccuracy,
    guestScore: !isHost ? Math.round(score) : room.guestScore,
    guestAccuracy: !isHost ? Math.round(accuracy) : room.guestAccuracy,
    status: nextStatus,
  };
  saveLocalRoom(updated);

  if (user && user.emailVerified) {
    const roomRef = doc(db, 'challenges', room.roomId);
    const path = `challenges/${room.roomId}`;
    try {
      const snap = await getDoc(roomRef);
      if (snap.exists() && snap.data().status !== 'completed') {
        if (snap.data().ownerId === user.uid) {
          await updateDoc(roomRef, {
            hostScore: Math.max(0, Math.min(10000000, Math.round(score))),
            hostAccuracy: Math.max(0, Math.min(100, Math.round(accuracy))),
            status: nextStatus,
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(roomRef, {
            guestId: user.uid,
            guestName: room.guestName.slice(0, 40) || 'CHALLENGER',
            guestScore: Math.max(0, Math.min(10000000, Math.round(score))),
            guestAccuracy: Math.max(0, Math.min(100, Math.round(accuracy))),
            status: nextStatus,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, path);
      } catch {
        // Ignore
      }
    }
  }

  return updated;
}

export function subscribeChallengeRoom(
  roomId: string,
  onUpdate: (room: ChallengeRoomData) => void
): Unsubscribe {
  if (!auth.currentUser) {
    const local = getLocalRoom(roomId);
    if (local) onUpdate(local);
    return () => {};
  }

  const roomRef = doc(db, 'challenges', roomId);
  const path = `challenges/${roomId}`;

  return onSnapshot(
    roomRef,
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        const r: ChallengeRoomData = {
          roomId,
          ownerId: d.ownerId,
          hostName: d.hostName,
          hostScore: d.hostScore,
          hostAccuracy: d.hostAccuracy,
          guestId: d.guestId,
          guestName: d.guestName,
          guestScore: d.guestScore,
          guestAccuracy: d.guestAccuracy,
          sectionFilter: d.sectionFilter || 'ALL',
          seed: d.seed || 202610,
          status: d.status || 'active',
        };
        saveLocalRoom(r);
        onUpdate(r);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        const local = getLocalRoom(roomId);
        if (local) onUpdate(local);
      }
    }
  );
}

export async function syncPilotProfileToCloud(
  pilotName: string,
  bestScore: number,
  missedWordIds: string[],
  reminderTime: string
): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return false;

  const pilotRef = doc(db, 'pilots', user.uid);
  const path = `pilots/${user.uid}`;
  const safeName = pilotName.trim().slice(0, 40) || 'PILOT';
  const safeBest = Math.max(0, Math.min(10000000, Math.round(bestScore)));
  const safeIds = missedWordIds.slice(0, 50).map((id) => String(id).slice(0, 64));
  const safeTime = /^\d{2}:\d{2}$/.test(reminderTime) ? reminderTime : '20:00';

  try {
    const snap = await getDoc(pilotRef);
    if (!snap.exists()) {
      await setDoc(pilotRef, {
        ownerId: user.uid,
        pilotName: safeName,
        bestScore: safeBest,
        missedWordIds: safeIds,
        reminderTime: safeTime,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(pilotRef, {
        pilotName: safeName,
        bestScore: safeBest,
        missedWordIds: safeIds,
        reminderTime: safeTime,
        updatedAt: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      return false;
    }
  }
}
