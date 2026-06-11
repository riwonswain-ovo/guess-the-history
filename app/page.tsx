"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AVATAR_OPTIONS,
  isValidIdentity,
  type GameState,
  type HistoryState,
  type Judgement,
  type PlayerIdentity,
  type QuestionEntry,
  type SolvedHistoryItem
} from "../lib/domain";

const identityStorageKey = "guess-history-player";
const dismissedRoundStorageKey = "guess-history-dismissed-round";

const judgementClass: Record<Judgement, string> = {
  是: "yes",
  不是: "no",
  不确定: "unknown",
  无关: "irrelevant",
  猜对了: "correct"
};

type View = "home" | "qa";

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message ?? "请求失败");
  }

  return payload as T;
}

function Timeline({ entries, compact = false }: { entries: QuestionEntry[]; compact?: boolean }) {
  if (entries.length === 0) {
    return <p className="emptyState">暂无问答。第一问会写入这卷竹简。</p>;
  }

  return (
    <ol className={compact ? "timeline compactTimeline" : "timeline"}>
      {[...entries]
        .sort((a, b) => a.sequence - b.sequence)
        .map((entry) => (
          <li key={entry.id} className="timelineItem">
            <span className="timelineIndex">第 {entry.sequence} 问</span>
            <div className="questionLine">
              <h3>{entry.question}</h3>
              <span className="playerBadge">
                {entry.player.avatar} {entry.player.nickname}
              </span>
            </div>
            {entry.responseType === "hint" ? (
              <p className="hintReply">
                <span>提示</span>
                {entry.hint}
              </p>
            ) : (
              <p className={`judgement ${judgementClass[entry.judgement]}`}>{entry.judgement}</p>
            )}
          </li>
        ))}
    </ol>
  );
}

function EntryModal({
  identity,
  onConfirm
}: {
  identity: PlayerIdentity | null;
  onConfirm: (identity: PlayerIdentity) => void;
}) {
  const [avatar, setAvatar] = useState(identity?.avatar ?? "");
  const [nickname, setNickname] = useState(identity?.nickname ?? "");
  const canConfirm = isValidIdentity({ avatar, nickname });

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="entry-title">
      <section className="modal scrollModal">
        <p className="eyebrow">递交名帖</p>
        <h2 id="entry-title">先留个江湖名号</h2>
        <p className="muted">选择头像，输入 2 到 8 个字符的昵称，之后提问会带上这份身份。</p>

        <div className="avatarGrid" aria-label="选择头像">
          {AVATAR_OPTIONS.map((item) => (
            <button
              className={avatar === item ? "avatarOption selected" : "avatarOption"}
              key={item}
              type="button"
              onClick={() => setAvatar(item)}
              aria-label={`选择头像 ${item}`}
            >
              {item}
            </button>
          ))}
        </div>

        <label className="fieldLabel" htmlFor="nickname">
          昵称
        </label>
        <input
          id="nickname"
          className="textInput"
          maxLength={8}
          minLength={2}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="例如：青衫客"
        />
        <p className="hint">当前 {nickname.trim().length}/8 个字符，需先选择头像。</p>

        <button
          className="sealButton wide"
          type="button"
          disabled={!canConfirm}
          onClick={() => onConfirm({ avatar, nickname: nickname.trim() })}
        >
          入席开猜
        </button>
      </section>
    </div>
  );
}

function HistoryModal({ history, onClose }: { history: HistoryState; onClose: () => void }) {
  const solvedLabel = history.historyItem.solveMode === "reveal" ? "揭晓" : "猜出";

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <section className="modal scrollModal">
        <p className="eyebrow">史册回看</p>
        <h2 id="history-title">{history.historyItem.personName}</h2>
        <p className="muted">
          共提问 {history.historyItem.questionCount} 次，由 {history.historyItem.solvedBy.avatar}{" "}
          {history.historyItem.solvedBy.nickname}
          {solvedLabel}。
        </p>
        <Timeline entries={history.timeline} compact />
        <button className="sealButton wide" type="button" onClick={onClose}>
          关闭
        </button>
      </section>
    </div>
  );
}

function ResultModal({
  result,
  identity,
  loading,
  onNext,
  onHome
}: {
  result: SolvedHistoryItem;
  identity: PlayerIdentity | null;
  loading: boolean;
  onNext: () => void;
  onHome: () => void;
}) {
  const isSolver =
    identity?.avatar === result.solvedBy.avatar && identity?.nickname === result.solvedBy.nickname;
  const isReveal = result.solveMode === "reveal";

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <section className="modal resultModal">
        <p className="eyebrow">揭榜</p>
        <h2 id="result-title">
          {isReveal ? "已为你揭晓答案！" : isSolver ? "你猜对了！" : `${result.solvedBy.nickname} 猜对了！`}
        </h2>
        <p className="answerName">答案是 {result.personName}</p>
        <p className="muted">
          {isReveal ? "系统已为你直接揭晓，并开启新一题。" : `本题共用了 ${result.questionCount} 次提问。`}
        </p>
        <div className="modalActions">
          <button className="sealButton" type="button" disabled={loading} onClick={onNext}>
            {loading ? "开新题中..." : isReveal ? "继续猜下一题" : "再猜一个"}
          </button>
          <button className="paperButton" type="button" onClick={onHome}>
            返回主页
          </button>
        </div>
      </section>
    </div>
  );
}

export default function HomePage() {
  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [view, setView] = useState<View>("home");
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [nextPending, setNextPending] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [result, setResult] = useState<SolvedHistoryItem | null>(null);

  const canSubmit = useMemo(
    () =>
      Boolean(
        identity &&
          question.trim().length >= 2 &&
          !pending &&
          state?.currentRound.status === "active"
      ),
    [identity, pending, question, state?.currentRound.status]
  );

  async function refreshState() {
    const nextState = await readJson<GameState>("/api/game", { cache: "no-store" });
    setState(nextState);
    setError("");
  }

  function navigate(nextView: View) {
    window.location.hash = nextView === "qa" ? "qa" : "";
    setView(nextView);
  }

  useEffect(() => {
    const raw = window.localStorage.getItem(identityStorageKey);

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PlayerIdentity;

        if (isValidIdentity(parsed)) {
          setIdentity(parsed);
        }
      } catch {
        window.localStorage.removeItem(identityStorageKey);
      }
    }

    setIdentityReady(true);
    setView(window.location.hash === "#qa" ? "qa" : "home");

    const onHashChange = () => setView(window.location.hash === "#qa" ? "qa" : "home");
    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    void refreshState().catch((caught) =>
      setError(caught instanceof Error ? caught.message : "读取游戏状态失败")
    );

    const timer = window.setInterval(() => {
      void refreshState().catch(() => undefined);
    }, 2500);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!state?.latestSolvedRound) {
      return;
    }

    const dismissed = window.localStorage.getItem(dismissedRoundStorageKey);

    if (dismissed !== state.latestSolvedRound.roundId) {
      setResult(state.latestSolvedRound);
    }
  }, [state?.latestSolvedRound]);

  function saveIdentity(nextIdentity: PlayerIdentity) {
    window.localStorage.setItem(identityStorageKey, JSON.stringify(nextIdentity));
    setIdentity(nextIdentity);
  }

  async function submitQuestion() {
    if (!identity || !canSubmit) {
      return;
    }

    setPending(true);
    setError("");

    try {
      const nextState = await readJson<GameState>("/api/questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: question.trim(),
          player: identity
        })
      });

      setQuestion("");
      setState(nextState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交问题失败");
    } finally {
      setPending(false);
    }
  }

  async function openHistory(item: SolvedHistoryItem) {
    setError("");

    try {
      setHistory(await readJson<HistoryState>(`/api/history/${item.roundId}`, { cache: "no-store" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取历史失败");
    }
  }

  async function startNextRound() {
    if (result) {
      window.localStorage.setItem(dismissedRoundStorageKey, result.roundId);
    }

    setNextPending(true);

    try {
      const nextState = await readJson<GameState>("/api/rounds/next", { method: "POST" });
      setState(nextState);
      setResult(null);
      navigate("qa");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建下一题失败");
    } finally {
      setNextPending(false);
    }
  }

  function closeResultToHome() {
    if (result) {
      window.localStorage.setItem(dismissedRoundStorageKey, result.roundId);
    }

    setResult(null);
    navigate("home");
  }

  if (!state) {
    return (
      <main className="page centerPage">
        <section className="panel">
          <p className="eyebrow">载入中</p>
          <h1>正在翻开史册...</h1>
          {error ? <p className="errorText">{error}</p> : null}
        </section>
      </main>
    );
  }

  const showEntry = identityReady && !identity;

  return (
    <main className={view === "qa" ? "page qaPage" : "page"}>
      {view === "home" ? (
        <>
          <section className="hero">
            <p className="eyebrow">猜历史人物 · 共问一卷</p>
            <h1>问一问，猜一猜</h1>
            <p className="lead">所有玩家共享同一个谜题。每次提问由 AI 判定，答案揭晓后会收入史册。</p>
          </section>

          <section className="statusBar" aria-label="游戏汇总">
            <span>累计猜对：{state.summary.solvedCount} 个</span>
            <span>累计提问：{state.summary.questionCount} 次</span>
          </section>

          <button className="mysteryCard" type="button" onClick={() => navigate("qa")} aria-label="进入问答页">
            <span className="mysteryMark">?</span>
            <span className="mysteryMeta">
              {state.currentRound.status === "active" ? "当前谜题" : "等待新题"} · 已提问{" "}
              {state.currentRound.questionCount} 次
            </span>
            <span className="mysteryHint">点击整张题签进入问答</span>
          </button>

          <section className="panel">
            <div className="sectionTitle">
              <h2>已猜出人物</h2>
              <span>{state.solvedHistory.length} 人</span>
            </div>
            {state.solvedHistory.length === 0 ? (
              <p className="emptyState">还没有人物被猜出。第一卷史册正等你题名。</p>
            ) : (
              <ul className="list">
                {state.solvedHistory.map((item) => (
                  <li key={item.id}>
                    <button className="listRow" type="button" onClick={() => openHistory(item)}>
                      <span>{item.personName}</span>
                      <span>{item.questionCount} 次</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <>
          <header className="qaHeader">
            <button className="backButton" type="button" onClick={() => navigate("home")}>
              ← 返回
            </button>
            <div>
              <p className="eyebrow">当前卷宗</p>
              <h1>问答时间线</h1>
            </div>
          </header>

          <section className="panel timelinePanel">
            <Timeline entries={state.timeline} />
          </section>

          <section className="inputDock" aria-label="提问输入区">
            {pending ? <p className="thinking">AI 判定中...</p> : null}
            {state.currentRound.status !== "active" ? (
              <p className="thinking">本题已揭晓，请点击“再猜一个”开启下一题。</p>
            ) : null}
            <div className="inputRow">
              <input
                className="textInput"
                value={question}
                disabled={pending || state.currentRound.status !== "active"}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void submitQuestion();
                  }
                }}
                placeholder="询问朝代/身份，或输入“给点提示”"
              />
              <button className="sealButton" type="button" disabled={!canSubmit} onClick={() => void submitQuestion()}>
                发送
              </button>
            </div>
          </section>
        </>
      )}

      {identity ? (
        <p className="identityPill" aria-label="当前身份">
          {identity.avatar} {identity.nickname}
        </p>
      ) : null}

      {error ? <p className="toast">{error}</p> : null}
      {showEntry ? <EntryModal identity={identity} onConfirm={saveIdentity} /> : null}
      {history ? <HistoryModal history={history} onClose={() => setHistory(null)} /> : null}
      {result ? (
        <ResultModal
          result={result}
          identity={identity}
          loading={nextPending}
          onNext={() => void startNextRound()}
          onHome={closeResultToHome}
        />
      ) : null}
    </main>
  );
}
