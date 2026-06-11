import { isJudgement, JUDGEMENTS, normalizePersonName, type Judgement } from "./domain";

const fallbackPeople = [
  "李白",
  "杜甫",
  "苏轼",
  "李清照",
  "王安石",
  "岳飞",
  "霍去病",
  "班昭",
  "祖冲之",
  "张衡",
  "司马迁",
  "王昭君"
];

async function callOpenAI(prompt: string, maxTokens = 40) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "你是一个严格遵守格式的中国古代历史人物猜谜助手。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content?.trim() ?? null;
}

export function normalizeJudgement(value: string | null | undefined): Judgement {
  const cleaned = (value ?? "").trim().replace(/[。！!.\s]/g, "");

  if (isJudgement(cleaned)) {
    return cleaned;
  }

  const matched = JUDGEMENTS.find((judgement) => cleaned.includes(judgement));
  return matched ?? "不确定";
}

export async function judgeQuestion(hiddenPerson: string, question: string): Promise<Judgement> {
  const prompt = [
    `隐藏答案是：中国古代历史人物「${hiddenPerson}」。`,
    `玩家问题是：「${question}」。`,
    "请只输出下面五个值之一，不要解释，不要标点：",
    JUDGEMENTS.join("、"),
    "规则：如果玩家明确猜中了隐藏人物姓名，输出「猜对了」。如果问题与猜人物无关，输出「无关」。"
  ].join("\n");

  try {
    return normalizeJudgement(await callOpenAI(prompt, 12));
  } catch {
    if (question.includes(hiddenPerson)) {
      return "猜对了";
    }

    return "不确定";
  }
}

export async function generateHistoricalPerson(existingPeople: string[]): Promise<string> {
  const existing = existingPeople.map(normalizePersonName).filter(Boolean);
  const prompt = [
    "请生成一个中国古代历史人物姓名，用作猜谜游戏的隐藏答案。",
    "只输出人物姓名，不要朝代、解释、标点或引号。",
    existing.length > 0 ? `不要生成这些已经猜过的人物：${existing.join("、")}` : "当前没有已猜过人物。"
  ].join("\n");

  try {
    const generated = normalizePersonName((await callOpenAI(prompt, 24)) ?? "");

    if (generated && !existing.includes(generated)) {
      return generated;
    }
  } catch {
    // 本地开发或网络失败时兜底，正式运行会优先使用 AI 结果。
  }

  return fallbackPeople.find((person) => !existing.includes(normalizePersonName(person))) ?? `古人${Date.now()}`;
}
