export type AvatarEmoji = string;

export type PlayerIdentity = {
  avatar: AvatarEmoji;
  nickname: string;
};

export type Judgement = "是" | "不是" | "不确定" | "无关" | "猜对了";

export const JUDGEMENTS: Judgement[] = ["是", "不是", "不确定", "无关", "猜对了"];

export const AVATAR_OPTIONS = [
  "🧑‍🎓",
  "👩‍🎓",
  "🧑‍🏫",
  "👩‍🏫",
  "🧑‍🌾",
  "👩‍🌾",
  "🧑‍⚖️",
  "👩‍⚖️",
  "🧑‍🎨",
  "👩‍🎨",
  "🧙",
  "🧝",
  "🐉",
  "🐼",
  "🦊",
  "🐯",
  "🐵",
  "🐴",
  "🦉",
  "🦁",
  "🐲",
  "🦚",
  "🐢",
  "🦌"
];

export type QuestionEntry = {
  id: string;
  roundId: string;
  sequence: number;
  question: string;
  player: PlayerIdentity;
  judgement: Judgement;
  createdAt: string;
};

export type GameRound = {
  id: string;
  hiddenPerson: string;
  status: "active" | "solved";
  questionCount: number;
  solvedBy?: PlayerIdentity;
  solvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SolvedHistoryItem = {
  id: string;
  roundId: string;
  personName: string;
  questionCount: number;
  solvedBy: PlayerIdentity;
  solvedAt: string;
};

export type GameSummary = {
  solvedCount: number;
  questionCount: number;
};

export type GameState = {
  summary: GameSummary;
  currentRound: GameRound;
  timeline: QuestionEntry[];
  solvedHistory: SolvedHistoryItem[];
  latestSolvedRound: SolvedHistoryItem | null;
};

export type HistoryState = {
  round: GameRound;
  timeline: QuestionEntry[];
  historyItem: SolvedHistoryItem;
};

export function isJudgement(value: string): value is Judgement {
  return JUDGEMENTS.includes(value as Judgement);
}

export function normalizePersonName(value: string) {
  return value.trim().replace(/[《》“”"'\s]/g, "");
}

export function isValidIdentity(identity: Partial<PlayerIdentity> | null | undefined) {
  const nickname = identity?.nickname?.trim() ?? "";
  return Boolean(identity?.avatar) && nickname.length >= 2 && nickname.length <= 8;
}
