# 当前进度

## 已完成

- 已完成 OpenSpec 规划：
  - `proposal.md`
  - `design.md`
  - 4 份能力规格
  - `tasks.md`
- 已把 OpenSpec 文档改成中文，并补充了古风交互方向。
- 已创建项目骨架：
  - `package.json`
  - `tsconfig.json`
  - `next.config.mjs`
  - `next-env.d.ts`
  - `app/layout.tsx`
  - `app/page.tsx`
  - `app/globals.css`
  - `lib/domain.ts`
- 已创建本地环境变量文件：
  - `.env.local`
- 已安装依赖。
- 已启动开发服务器：
  - `http://127.0.0.1:3000`
- 已完成当前一轮代码落盘：
  - 本地文件持久化层：游戏回合、问答记录、已猜出历史。
  - 服务端 API：读取状态、提交问题、创建下一题、读取历史问答。
  - AI 判定与生成人物接入，已切换到 DeepSeek 兼容接口，并对 AI 判定做五选一规范化。
  - 轮询式同步兜底，支持刷新和重连后从持久化状态恢复。
  - 入场身份弹窗、主页大厅、问答页、历史问答弹窗、猜对结果弹窗。
  - 浅黄色古风移动端优先样式。
- 已完成生产构建验证：
  - `npm run build`
- 已完成基础 API 验证：
  - `GET /api/game`
  - `POST /api/questions`
  - `POST /api/rounds/next`
  - `GET /api/history/[roundId]`
- 已补充 AI 行为修正：
  - 朝代、身份、性别等相关提问不再轻易落到 `无关`
  - 支持识别“答案是什么 / 我不猜了”这类直接揭晓请求，并自动开启新回合
- 已确认当前本地开发数据会写入 `data/game-db.json`，并已加入 `.gitignore`。
- 已将 OpenSpec `tasks.md` 同步到真实进度：
  - 1.1 - 9.3、10.5 - 10.8 已勾选完成
  - 9.4 - 9.5、10.1 - 10.4 仍待验证或补测

## 当前状态

- 项目现在是一个可运行的 Next.js 多人共享猜历史人物应用。
- 当前使用 `data/game-db.json` 作为本地开发数据库文件，已加入 `.gitignore`，不会提交。
- 实时同步采用轮询兜底，每 2.5 秒重新拉取持久化状态。
- OpenSpec change 的 `tasks.md` 已经部分同步，验证项里可自动验证的部分已补上。
- 当前代码已落盘，后续主要是补视觉/UI 验证和多客户端人工复核。
- `.env.local` 现在使用 `DEEPSEEK_API_KEY`，不是 `OPENAI_API_KEY`。

## 下一步任务

1. 完成 9.4 和 9.5 的视觉/布局验证。
2. 做一次真实多人联调，重点看两个客户端的结果弹窗、刷新恢复和下一题流程。
3. 补齐 10.1 - 10.4 的 UI 和多人广播测试记录。
4. 如果要上线生产环境，把 `data/game-db.json` 替换为真正的托管数据库。
5. 如果 AI 模型或接口策略变化，可通过 `DEEPSEEK_MODEL` 环境变量调整。
6. 完成最终人工验收后，再归档 OpenSpec change。

## 备注

- `.env.local` 已保存 `DEEPSEEK_API_KEY`，不要提交到公开仓库。
- 当前开发服务器由本地 `next dev` 提供，后续可以继续沿用该入口。
- 本次尝试使用 in-app Browser 做视觉验证，但当前会话的 `iab` 浏览器不可用；已用构建和 API 方式完成验证。
- 之前的状态里曾把 `tasks.md` 误写成“已完成勾选”，现在已纠正为真实进度。
- 直接要答案会先揭晓当前人物，再自动开启下一回合，且新回合会继续避开刚刚揭晓的人物。
