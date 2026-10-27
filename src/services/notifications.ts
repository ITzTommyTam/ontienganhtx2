import { soundEngine } from './sound';

export interface StudyReminderConfig {
  enabled: boolean;
  time: string; // "HH:MM" (24h)
  lastTriggeredDate: string; // "YYYY-MM-DD"
  dailyGoalWords: number;
}

const REMINDER_STORAGE_KEY = 'orbital_study_reminder_v1';

export function loadReminderConfig(): StudyReminderConfig {
  try {
    const raw = localStorage.getItem(REMINDER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed.enabled),
        time: typeof parsed.time === 'string' && /^\d{2}:\d{2}$/.test(parsed.time) ? parsed.time : '20:00',
        lastTriggeredDate: typeof parsed.lastTriggeredDate === 'string' ? parsed.lastTriggeredDate : '',
        dailyGoalWords: typeof parsed.dailyGoalWords === 'number' ? parsed.dailyGoalWords : 25,
      };
    }
  } catch {
    // Ignore
  }
  return {
    enabled: true,
    time: '20:00',
    lastTriggeredDate: '',
    dailyGoalWords: 25,
  };
}

export function saveReminderConfig(config: StudyReminderConfig): void {
  try {
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore
  }
}

export async function requestPushNotificationPermission(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch {
    return Notification.permission;
  }
}

export function triggerStudyPushNotification(
  pilotName: string,
  missedCount: number,
  onInAppBanner?: (title: string, body: string) => void
): void {
  const title = `ORBITAL // TYPE — LỊCH ÔN TẬP UNIT 2`;
  const body =
    missedCount > 0
      ? `Chiến binh ${pilotName}, bạn có ${missedCount} từ vựng Unit 2 cần bắn ôn tập lại hôm nay!`
      : `Chiến binh ${pilotName}, đã đến giờ tuần tra từ vựng Unit 2: A Multicultural World!`;

  soundEngine.playGlyphNotification();

  if (onInAppBanner) {
    onInAppBanner(title, body);
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        tag: 'orbital-unit2-daily-reminder',
      });
    } catch {
      // Fallback already shown via onInAppBanner
    }
  }
}
