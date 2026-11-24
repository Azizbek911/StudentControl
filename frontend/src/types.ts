/** Talaba profili (HEMIS dan; bazada saqlanmaydi — imzolangan token ichida) */
export interface Student {
  /** HEMIS ichki ID */
  id: number;
  /** 12 xonali talaba ID raqami */
  number: string;
  login: string;
  fullName: string | null;
  shortName: string | null;
  group: string | null;
  specialty: string | null;
  image: string | null;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends Tokens {
  expiresIn: number;
  student: Student;
}

/** Admin sayt qarori (present/late = joyida) yoki gateway holati */
export type CheckStatus =
  | "pending"
  | "present"
  | "late"
  | "out_of_range"
  | "suspicious"
  | "rejected"
  | "refused"
  | "api_error"
  | "unknown";

export type CheckType = "CHECK_IN" | "CHECK_OUT";

export interface CheckResult {
  type: CheckType;
  status: CheckStatus;
  /** true: joyida, false: joydan uzoq, null: boshqa holat */
  inside: boolean | null;
  distanceM: number | null;
  radiusM: number | null;
  location: string | null;
  notes: string[];
  time: string;
}

export interface TodayCheck {
  id: number;
  time: string;
  type: CheckType;
  status: CheckStatus;
  distanceM: number | null;
  notes: string[];
}

/** Admin saytdagi bugungi vazifa */
export interface Task {
  location: string;
  address: string | null;
  radiusM: number;
  workStart: string;
  workEnd: string;
}

export interface TodayInfo {
  task: Task | null;
  /** Vazifa yo'q bo'lsa — sababi (masalan "bugun joy biriktirilmagan") */
  message: string | null;
  /** true — admin sayt hozir javob bermadi: "Yuklanmoqda" ko'rsatib, birozdan keyin qayta so'raladi */
  retry?: boolean;
  checks: TodayCheck[];
}

// ---------------- Developer ----------------

export interface LogItem {
  id: number;
  createdAt: string;
  level: "info" | "warn" | "error";
  kind: string;
  status: string;
  message: string | null;
  studentId: number | null;
  studentName: string | null;
  telegramId: number | null;
  ip: string | null;
  details: Record<string, unknown> | null;
}

export interface LogList {
  items: LogItem[];
  counts: { kind: string; status: string; level: LogItem["level"]; n: number }[];
  totals: { students: number; checks24h: number };
  api: string;
}
