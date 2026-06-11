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

const revealHints = [
  "答案是什么",
  "告诉我答案",
  "直接告诉我",
  "直接说答案",
  "不想猜了",
  "我不猜了",
  "放弃了",
  "揭晓答案",
  "揭晓吧",
  "公布答案",
  "看答案",
  "我想知道答案",
  "我想知道是谁",
  "说出答案"
];

const relatedQuestionHints = [
  "朝代",
  "年代",
  "时期",
  "性别",
  "身份",
  "职业",
  "官职",
  "职位",
  "籍贯",
  "诗人",
  "将军",
  "皇帝",
  "文学家",
  "思想家",
  "画家",
  "科学家",
  "功绩",
  "成就",
  "生平",
  "出身",
  "是不是",
  "是否",
  "他是",
  "她是",
  "是男",
  "是女"
];

async function callOpenAI(prompt: string, maxTokens = 40) {
  const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

  if (!apiKey) {
    return null;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
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
    throw new Error(`DeepSeek request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content?.trim() ?? null;
}

export function isRevealRequest(question: string) {
  const compact = question.replace(/\s+/g, "");
  return revealHints.some((hint) => compact.includes(hint));
}

export function isRelatedGuessQuestion(question: string) {
  const compact = question.replace(/\s+/g, "");
  return relatedQuestionHints.some((hint) => compact.includes(hint));
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
    "规则：如果玩家明确猜中了隐藏人物姓名，输出「猜对了」。",
    "如果问题是在问这个人物的朝代、性别、身份、职业、官职、籍贯、生平、成就、作品、关系等，只能在「是」「不是」「不确定」中选择，不要输出「无关」。",
    "只有当问题完全与这位历史人物或猜谜本身无关时，才输出「无关」。",
    "遇到无法确认但仍然相关的问题时，优先输出「不确定」而不是「无关」。",
    "示例：",
    "问题「是清朝吗？」且隐藏人物是杜甫时，输出「不是」。",
    "问题「他是男的吗？」且隐藏人物是杜甫时，输出「是」。",
    "问题「今天几点了？」输出「无关」。"
  ].join("\n");

  try {
    // DeepSeek 这类模型会先用一部分 token 做推理；token 太少时会只返回 reasoning，
    // 导致 content 为空，最后被规范化成「不确定」。
    const judgement = normalizeJudgement(await callOpenAI(prompt, 64));

    if (judgement === "无关" && isRelatedGuessQuestion(question)) {
      return "不确定";
    }

    return judgement;
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
