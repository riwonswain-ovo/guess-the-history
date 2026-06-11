import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "guess-history-tests-"));
process.env.GAME_DB_PATH = path.join(tempRoot, "game-db.json");
delete process.env.DEEPSEEK_API_KEY;
delete process.env.OPENAI_API_KEY;

let isValidIdentity: typeof import("../lib/domain.ts").isValidIdentity;
let generateHistoricalPerson: typeof import("../lib/ai.ts").generateHistoricalPerson;
let isHintRequest: typeof import("../lib/ai.ts").isHintRequest;
let isRelatedGuessQuestion: typeof import("../lib/ai.ts").isRelatedGuessQuestion;
let isRevealRequest: typeof import("../lib/ai.ts").isRevealRequest;
let normalizeJudgement: typeof import("../lib/ai.ts").normalizeJudgement;
let getGame: typeof import("../app/api/game/route.ts").GET;
let submitQuestionRoute: typeof import("../app/api/questions/route.ts").POST;
let createNextRoundRoute: typeof import("../app/api/rounds/next/route.ts").POST;
let getHistoryRoute: typeof import("../app/api/history/[roundId]/route.ts").GET;

before(async () => {
  ({ isValidIdentity } = await import("../lib/domain.ts"));
  ({
    generateHistoricalPerson,
    isHintRequest,
    isRelatedGuessQuestion,
    isRevealRequest,
    normalizeJudgement
  } = await import("../lib/ai.ts"));
  ({ GET: getGame } = await import("../app/api/game/route.ts"));
  ({ POST: submitQuestionRoute } = await import("../app/api/questions/route.ts"));
  ({ POST: createNextRoundRoute } = await import("../app/api/rounds/next/route.ts"));
  ({ GET: getHistoryRoute } = await import("../app/api/history/[roundId]/route.ts"));
});

after(async () => {
  rmSync(tempRoot, { recursive: true, force: true });
});

test("identity and judgement helpers validate the expected Chinese game rules", () => {
  assert.equal(isValidIdentity({ avatar: "🧑‍🎓", nickname: "青衫客" }), true);
  assert.equal(isValidIdentity({ avatar: "", nickname: "青衫客" }), false);
  assert.equal(isValidIdentity({ avatar: "🧑‍🎓", nickname: "一" }), false);
  assert.equal(isRevealRequest("答案是什么"), true);
  assert.equal(isHintRequest("给点提示"), true);
  assert.equal(isRelatedGuessQuestion("是清朝吗？"), true);
  assert.equal(normalizeJudgement(" 猜对了。 "), "猜对了");
});

test("game state initializes an active round and keeps timeline empty", async () => {
  const response = await getGame();
  assert.equal(response.status, 200);

  const state = (await response.json()) as {
    summary: { solvedCount: number; questionCount: number };
    currentRound: { id: string; hiddenPerson: string; status: string; questionCount: number };
    timeline: unknown[];
    solvedHistory: unknown[];
  };

  assert.equal(state.summary.solvedCount, 0);
  assert.equal(state.summary.questionCount, 0);
  assert.equal(state.currentRound.status, "active");
  assert.equal(state.currentRound.questionCount, 0);
  assert.equal(state.timeline.length, 0);
  assert.equal(state.solvedHistory.length, 0);
  assert.ok(state.currentRound.hiddenPerson.length > 0);
});

test("question API rejects invalid identities", async () => {
  const response = await submitQuestionRoute(
    new Request("http://localhost/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "他是皇帝吗？",
        player: { avatar: "🧑‍🎓", nickname: "一" }
      })
    })
  );

  assert.equal(response.status, 400);

  const payload = (await response.json()) as { message: string };
  assert.match(payload.message, /头像/);
});

test("question submission persists and becomes visible to another client", async () => {
  const firstState = (await (await getGame()).json()) as {
    currentRound: { hiddenPerson: string; id: string };
  };

  const response = await submitQuestionRoute(
    new Request("http://localhost/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: firstState.currentRound.hiddenPerson,
        player: { avatar: "🧑‍🎓", nickname: "青衫客" }
      })
    })
  );

  assert.equal(response.status, 200);

  const nextState = (await response.json()) as {
    summary: { solvedCount: number; questionCount: number };
    currentRound: { id: string; status: string };
    timeline: Array<{ judgement: string }>;
    latestSolvedRound: { roundId: string; solveMode?: string; personName: string } | null;
  };

  assert.equal(nextState.summary.questionCount, 1);
  assert.equal(nextState.timeline.length, 0);
  assert.equal(nextState.latestSolvedRound?.solveMode, "guess");
  assert.equal(nextState.currentRound.status, "active");
  assert.notEqual(nextState.currentRound.id, firstState.currentRound.id);

  const secondClient = (await (await getGame()).json()) as {
    summary: { solvedCount: number; questionCount: number };
    currentRound: { id: string; status: string };
    latestSolvedRound: { roundId: string; personName: string } | null;
  };

  assert.equal(secondClient.summary.questionCount, 1);
  assert.equal(secondClient.summary.solvedCount, 1);
  assert.equal(secondClient.latestSolvedRound?.personName, firstState.currentRound.hiddenPerson);
  assert.equal(secondClient.currentRound.status, "active");
  assert.notEqual(secondClient.currentRound.id, firstState.currentRound.id);
});

test("history and next-round flows remain consistent after reveal", async () => {
  const initialState = (await (await getGame()).json()) as {
    currentRound: { id: string };
  };

  const revealResponse = await submitQuestionRoute(
    new Request("http://localhost/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "直接告诉我答案",
        player: { avatar: "🧑‍🏫", nickname: "书卷生" }
      })
    })
  );

  assert.equal(revealResponse.status, 200);

  const revealState = (await revealResponse.json()) as {
    currentRound: { id: string; status: string };
    latestSolvedRound: { roundId: string; solveMode?: string; questionCount: number } | null;
    timeline: Array<{ responseType?: string; hint?: string }>;
  };

  assert.equal(revealState.latestSolvedRound?.solveMode, "reveal");
  assert.equal(revealState.currentRound.status, "active");
  assert.notEqual(revealState.currentRound.id, initialState.currentRound.id);

  const historyResponse = await getHistoryRoute(new Request("http://localhost/api/history"), {
    params: Promise.resolve({ roundId: revealState.latestSolvedRound?.roundId ?? "" })
  });

  assert.equal(historyResponse.status, 200);

  const historyState = (await historyResponse.json()) as {
    round: { id: string };
    historyItem: { roundId: string; solveMode?: string };
    timeline: unknown[];
  };

  assert.equal(historyState.round.id, revealState.latestSolvedRound?.roundId);
  assert.equal(historyState.historyItem.solveMode, "reveal");
  assert.equal(historyState.timeline.length, 0);
});

test("next-round endpoint is idempotent while a round is already active", async () => {
  const before = (await (await getGame()).json()) as { currentRound: { id: string } };
  const response = await createNextRoundRoute();
  assert.equal(response.status, 200);

  const after = (await response.json()) as { currentRound: { id: string } };
  assert.equal(after.currentRound.id, before.currentRound.id);
});

test("hint generation avoids repeating solved names in fallback mode", async () => {
  const candidate = await generateHistoricalPerson(["李白", "杜甫", "苏轼"]);
  assert.equal(["李白", "杜甫", "苏轼"].includes(candidate), false);
});
