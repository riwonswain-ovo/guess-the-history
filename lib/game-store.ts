import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  generateHint,
  generateHistoricalPerson,
  isHintRequest,
  isRevealRequest,
  judgeQuestion
} from "./ai";
import {
  isValidIdentity,
  normalizePersonName,
  type GameRound,
  type GameState,
  type HistoryState,
  type PlayerIdentity,
  type QuestionEntry,
  type SolvedHistoryItem
} from "./domain";

type Database = {
  rounds: GameRound[];
  questions: QuestionEntry[];
  solvedHistory: SolvedHistoryItem[];
};

const configuredDbPath = process.env.GAME_DB_PATH?.trim();
const dbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : path.join(process.env.GAME_DATA_DIR ? path.resolve(process.env.GAME_DATA_DIR) : path.join(process.cwd(), "data"), "game-db.json");
const dataDir = path.dirname(dbPath);

let writeQueue = Promise.resolve();

function runSerial<T>(task: () => Promise<T>) {
  const next = writeQueue.then(task, task);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function readDatabase(): Promise<Database> {
  try {
    const raw = await readFile(dbPath, "utf8");
    return JSON.parse(raw) as Database;
  } catch {
    return {
      rounds: [],
      questions: [],
      solvedHistory: []
    };
  }
}

async function writeDatabase(database: Database) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
}

function sortQuestions(questions: QuestionEntry[]) {
  return [...questions].sort((a, b) => a.sequence - b.sequence);
}

function sortHistory(history: SolvedHistoryItem[]) {
  return [...history].sort((a, b) => Date.parse(b.solvedAt) - Date.parse(a.solvedAt));
}

function buildState(database: Database): GameState {
  const currentRound =
    database.rounds.find((round) => round.status === "active") ??
    [...database.rounds].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];

  if (!currentRound) {
    throw new Error("No active round");
  }

  const solvedHistory = sortHistory(database.solvedHistory);

  return {
    summary: {
      solvedCount: database.solvedHistory.length,
      questionCount: database.questions.length
    },
    currentRound,
    timeline: sortQuestions(database.questions.filter((question) => question.roundId === currentRound.id)),
    solvedHistory,
    latestSolvedRound: solvedHistory[0] ?? null
  };
}

async function createRound(database: Database) {
  const existingPeople = database.solvedHistory.map((item) => item.personName);
  let person = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await generateHistoricalPerson(existingPeople);

    if (!existingPeople.map(normalizePersonName).includes(normalizePersonName(candidate))) {
      person = candidate;
      break;
    }
  }

  if (!person) {
    throw new Error("无法生成不重复的历史人物");
  }

  const now = new Date().toISOString();
  const round: GameRound = {
    id: createId("round"),
    hiddenPerson: person,
    status: "active",
    questionCount: 0,
    createdAt: now,
    updatedAt: now
  };

  database.rounds.push(round);
  return round;
}

export async function getGameState(): Promise<GameState> {
  return runSerial(async () => {
    const database = await readDatabase();

    if (!database.rounds.some((round) => round.status === "active")) {
      await createRound(database);
      await writeDatabase(database);
    }

    return buildState(database);
  });
}

export async function createNextRound(): Promise<GameState> {
  return runSerial(async () => {
    const database = await readDatabase();

    if (!database.rounds.some((round) => round.status === "active")) {
      await createRound(database);
      await writeDatabase(database);
    }

    return buildState(database);
  });
}

export async function submitQuestion(input: {
  question: string;
  player: PlayerIdentity;
}): Promise<GameState> {
  const question = input.question.trim();

  if (question.length < 2 || question.length > 80) {
    throw new Error("问题长度需为 2 到 80 个字符");
  }

  if (!isValidIdentity(input.player)) {
    throw new Error("请先选择头像并输入 2 到 8 个字符的昵称");
  }

  return runSerial(async () => {
    const database = await readDatabase();
    let currentRound = database.rounds.find((round) => round.status === "active");

    if (!currentRound) {
      currentRound = await createRound(database);
    }

    const now = new Date().toISOString();
    const sequence = currentRound.questionCount + 1;

    if (isRevealRequest(question)) {
      currentRound.status = "solved";
      currentRound.solvedBy = {
        avatar: input.player.avatar,
        nickname: input.player.nickname.trim()
      };
      currentRound.solvedAt = now;

      const normalized = normalizePersonName(currentRound.hiddenPerson);
      const exists = database.solvedHistory.some(
        (item) => normalizePersonName(item.personName) === normalized
      );

      if (!exists) {
        database.solvedHistory.push({
          id: createId("solved"),
          roundId: currentRound.id,
          personName: currentRound.hiddenPerson,
          questionCount: currentRound.questionCount,
          solvedBy: {
            avatar: input.player.avatar,
            nickname: input.player.nickname.trim()
          },
          solvedAt: now,
          solveMode: "reveal"
        });
      }

      await createRound(database);
      await writeDatabase(database);
      return buildState(database);
    }

    if (isHintRequest(question)) {
      const previousHints = database.questions.flatMap((entry) =>
        entry.roundId === currentRound.id && entry.responseType === "hint" ? [entry.hint] : []
      );
      const hint = await generateHint(currentRound.hiddenPerson, previousHints);

      database.questions.push({
        id: createId("question"),
        roundId: currentRound.id,
        sequence,
        question,
        player: {
          avatar: input.player.avatar,
          nickname: input.player.nickname.trim()
        },
        responseType: "hint",
        hint,
        createdAt: now
      });
      currentRound.questionCount = sequence;
      currentRound.updatedAt = now;

      await writeDatabase(database);
      return buildState(database);
    }

    const judgement = await judgeQuestion(currentRound.hiddenPerson, question);

    const entry: QuestionEntry = {
      id: createId("question"),
      roundId: currentRound.id,
      sequence,
      question,
      player: {
        avatar: input.player.avatar,
        nickname: input.player.nickname.trim()
      },
      judgement,
      createdAt: now
    };

    database.questions.push(entry);
    currentRound.questionCount = sequence;
    currentRound.updatedAt = now;

    if (judgement === "猜对了") {
      currentRound.status = "solved";
      currentRound.solvedBy = entry.player;
      currentRound.solvedAt = now;

      const normalized = normalizePersonName(currentRound.hiddenPerson);
      const exists = database.solvedHistory.some(
        (item) => normalizePersonName(item.personName) === normalized
      );

      if (!exists) {
        database.solvedHistory.push({
          id: createId("solved"),
          roundId: currentRound.id,
          personName: currentRound.hiddenPerson,
          questionCount: currentRound.questionCount,
          solvedBy: entry.player,
          solvedAt: now,
          solveMode: "guess"
        });
      }
    }

    await writeDatabase(database);
    return buildState(database);
  });
}

export async function getHistory(roundId: string): Promise<HistoryState> {
  const database = await readDatabase();
  const round = database.rounds.find((item) => item.id === roundId);
  const historyItem = database.solvedHistory.find((item) => item.roundId === roundId);

  if (!round || !historyItem) {
    throw new Error("没有找到这段历史问答");
  }

  return {
    round,
    historyItem,
    timeline: sortQuestions(database.questions.filter((question) => question.roundId === roundId))
  };
}
