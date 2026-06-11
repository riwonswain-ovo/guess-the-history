export type AvatarEmoji = string;

export type PlayerIdentity = {
  avatar: AvatarEmoji;
  nickname: string;
};

export type Judgement = "是" | "不是" | "不确定" | "无关" | "猜对了";

export type QuestionEntry = {
  id: string;
  sequence: number;
  question: string;
  player: PlayerIdentity;
  judgement: Judgement;
  createdAt: string;
};

export type GameRound = {
  id: string;
  hiddenPerson?: string;
  status: "active" | "solved" | "idle";
  questionCount: number;
};
