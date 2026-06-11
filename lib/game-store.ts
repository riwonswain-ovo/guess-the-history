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
  type Judgement,
  type GameRound,
  type GameState,
  type HistoryState,
  type PlayerIdentity,
  type QuestionEntry,
  type SolvedHistoryItem
} from "./domain";
import { getSupabaseAdminClient, hasSupabaseEnv } from "./supabase-admin";

type Database = {
  rounds: GameRound[];
  questions: QuestionEntry[];
  solvedHistory: SolvedHistoryItem[];
};

type SupabaseRoundRow = {
  id: string;
  hidden_person: string;
  status: "active" | "solved";
  question_count: number;
  solved_by_avatar: string | null;
  solved_by_nickname: string | null;
  solved_at: string | null;
  created_at: string;
  updated_at: string;
};

type SupabaseQuestionRow = {
  id: string;
  round_id: string;
  sequence: number;
  question: string;
  player_avatar: string;
  player_nickname: string;
  response_type: "judgement" | "hint";
  judgement: string | null;
  hint: string | null;
  created_at: string;
};

type SupabaseSolvedHistoryRow = {
  id: string;
  round_id: string;
  person_name: string;
  normalized_person_name: string;
  question_count: number;
  solved_by_avatar: string;
  solved_by_nickname: string;
  solved_at: string;
  solve_mode: "guess" | "reveal";
};

const configuredDbPath = process.env.GAME_DB_PATH?.trim();
const dbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : path.join(
      process.env.GAME_DATA_DIR ? path.resolve(process.env.GAME_DATA_DIR) : path.join(process.cwd(), "data"),
      "game-db.json"
    );
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

function toGameRound(row: SupabaseRoundRow): GameRound {
  return {
    id: row.id,
    hiddenPerson: row.hidden_person,
    status: row.status,
    questionCount: row.question_count,
    solvedBy:
      row.solved_by_avatar && row.solved_by_nickname
        ? {
            avatar: row.solved_by_avatar,
            nickname: row.solved_by_nickname
          }
        : undefined,
    solvedAt: row.solved_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toQuestionEntry(row: SupabaseQuestionRow): QuestionEntry {
  const base = {
    id: row.id,
    roundId: row.round_id,
    sequence: row.sequence,
    question: row.question,
    player: {
      avatar: row.player_avatar,
      nickname: row.player_nickname
    },
    createdAt: row.created_at
  };

  if (row.response_type === "hint") {
    return {
      ...base,
      responseType: "hint",
      hint: row.hint ?? ""
    };
  }

  return {
    ...base,
    responseType: "judgement",
    judgement: (row.judgement ?? "不确定") as Judgement
  };
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

async function readLocalDatabase(): Promise<Database> {
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

async function writeLocalDatabase(database: Database) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
}

async function createLocalRound(database: Database) {
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

async function readSupabaseDatabase(): Promise<Database> {
  const supabase = getSupabaseAdminClient();

  const [roundsResult, questionsResult, solvedHistoryResult] = await Promise.all([
    supabase.from("game_rounds").select("*").order("updated_at", { ascending: false }),
    supabase.from("game_questions").select("*").order("sequence", { ascending: true }),
    supabase.from("game_solved_history").select("*").order("solved_at", { ascending: false })
  ]);

  if (roundsResult.error) {
    throw new Error(roundsResult.error.message);
  }

  if (questionsResult.error) {
    throw new Error(questionsResult.error.message);
  }

  if (solvedHistoryResult.error) {
    throw new Error(solvedHistoryResult.error.message);
  }

  return {
    rounds: (roundsResult.data ?? []).map(toGameRound),
    questions: (questionsResult.data ?? []).map(toQuestionEntry),
    solvedHistory: (solvedHistoryResult.data ?? []).map((row) => ({
      id: row.id,
      roundId: row.round_id,
      personName: row.person_name,
      questionCount: row.question_count,
      solvedBy: {
        avatar: row.solved_by_avatar,
        nickname: row.solved_by_nickname
      },
      solvedAt: row.solved_at,
      solveMode: row.solve_mode
    }))
  };
}

async function createSupabaseRoundIfNeeded() {
  const supabase = getSupabaseAdminClient();
  const snapshot = await readSupabaseDatabase();

  if (snapshot.rounds.some((round) => round.status === "active")) {
    return;
  }

  const existingPeople = snapshot.solvedHistory.map((item) => item.personName);
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

  const { error } = await supabase.rpc("game_ensure_active_round", {
    hidden_person: person
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function generateNextPerson(snapshot: Database, currentHiddenPerson: string) {
  const existingPeople = snapshot.solvedHistory.map((item) => item.personName);
  const deduped = [...existingPeople, currentHiddenPerson];
  let person = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await generateHistoricalPerson(deduped);

    if (!deduped.map(normalizePersonName).includes(normalizePersonName(candidate))) {
      person = candidate;
      break;
    }
  }

  if (!person) {
    throw new Error("无法生成不重复的历史人物");
  }

  return person;
}

async function getGameStateFromSupabase(): Promise<GameState> {
  await createSupabaseRoundIfNeeded();
  return buildState(await readSupabaseDatabase());
}

export async function getGameState(): Promise<GameState> {
  return runSerial(async () => {
    if (!hasSupabaseEnv() || configuredDbPath) {
      const database = await readLocalDatabase();

      if (!database.rounds.some((round) => round.status === "active")) {
        await createLocalRound(database);
        await writeLocalDatabase(database);
      }

      return buildState(database);
    }

    return getGameStateFromSupabase();
  });
}

export async function createNextRound(): Promise<GameState> {
  return runSerial(async () => {
    if (!hasSupabaseEnv() || configuredDbPath) {
      const database = await readLocalDatabase();

      if (!database.rounds.some((round) => round.status === "active")) {
        await createLocalRound(database);
        await writeLocalDatabase(database);
      }

      return buildState(database);
    }

    await createSupabaseRoundIfNeeded();
    return buildState(await readSupabaseDatabase());
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
    if (!hasSupabaseEnv() || configuredDbPath) {
      const database = await readLocalDatabase();
      let currentRound = database.rounds.find((round) => round.status === "active");

      if (!currentRound) {
        currentRound = await createLocalRound(database);
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

        await createLocalRound(database);
        await writeLocalDatabase(database);
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

        await writeLocalDatabase(database);
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

        await createLocalRound(database);
      }

      await writeLocalDatabase(database);
      return buildState(database);
    }

    let snapshot = await readSupabaseDatabase();
    let currentRound = snapshot.rounds.find((round) => round.status === "active");

    if (!currentRound) {
      await createSupabaseRoundIfNeeded();
      snapshot = await readSupabaseDatabase();
      currentRound = snapshot.rounds.find((round) => round.status === "active");
      if (!currentRound) {
        throw new Error("No active round");
      }
    }

    const now = new Date().toISOString();
    const solvedBy = {
      avatar: input.player.avatar,
      nickname: input.player.nickname.trim()
    };
    const supabase = getSupabaseAdminClient();

    if (isRevealRequest(question)) {
      const nextHiddenPerson = await generateNextPerson(snapshot, currentRound.hiddenPerson);
      const { error } = await supabase.rpc("game_submit_question", {
        p_question: question,
        p_player_avatar: solvedBy.avatar,
        p_player_nickname: solvedBy.nickname,
        p_response_type: "judgement",
        p_judgement: "猜对了",
        p_hint: null,
        p_is_solved: true,
        p_solve_mode: "reveal",
        p_next_hidden_person: nextHiddenPerson,
        p_created_at: now
      });

      if (error) {
        throw new Error(error.message);
      }

      return buildState(await readSupabaseDatabase());
    }

    if (isHintRequest(question)) {
      const previousHints = snapshot.questions.flatMap((entry) =>
        entry.roundId === currentRound.id && entry.responseType === "hint" ? [entry.hint] : []
      );
      const hint = await generateHint(currentRound.hiddenPerson, previousHints);
      const { error } = await supabase.rpc("game_submit_question", {
        p_question: question,
        p_player_avatar: solvedBy.avatar,
        p_player_nickname: solvedBy.nickname,
        p_response_type: "hint",
        p_judgement: null,
        p_hint: hint,
        p_is_solved: false,
        p_solve_mode: null,
        p_next_hidden_person: null,
        p_created_at: now
      });

      if (error) {
        throw new Error(error.message);
      }

      return buildState(await readSupabaseDatabase());
    }

    const judgement = await judgeQuestion(currentRound.hiddenPerson, question);
    const solved = judgement === "猜对了";
    const nextHiddenPerson = solved ? await generateNextPerson(snapshot, currentRound.hiddenPerson) : null;
    const { error } = await supabase.rpc("game_submit_question", {
      p_question: question,
      p_player_avatar: solvedBy.avatar,
      p_player_nickname: solvedBy.nickname,
      p_response_type: "judgement",
      p_judgement: judgement,
      p_hint: null,
      p_is_solved: solved,
      p_solve_mode: "guess",
      p_next_hidden_person: nextHiddenPerson,
      p_created_at: now
    });

    if (error) {
      throw new Error(error.message);
    }

    return buildState(await readSupabaseDatabase());
  });
}

export async function getHistory(roundId: string): Promise<HistoryState> {
  if (!hasSupabaseEnv() || configuredDbPath) {
    const database = await readLocalDatabase();
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

  const database = await readSupabaseDatabase();
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
