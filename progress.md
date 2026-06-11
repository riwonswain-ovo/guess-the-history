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
  - 双后端持久化层：默认 Supabase/Postgres，本地测试仍可用文件回退。
  - 服务端 API：读取状态、提交问题、创建下一题、读取历史问答。
  - AI 判定与生成人物接入，已切换到 DeepSeek 兼容接口，并对 AI 判定做五选一规范化。
  - 轮询式同步兜底，支持刷新和重连后从持久化状态恢复。
  - 入场身份弹窗、主页大厅、问答页、历史问答弹窗、猜对结果弹窗。
  - 浅黄色古风移动端优先样式。
- 已完成生产构建验证：
  - `npm run build`
- 已补充自动化验证：
  - `npm test`
  - 覆盖无效身份拦截、问答提交流程、猜对后广播、直接揭晓、下一回合幂等和提示生成兜底
- 已加入 Supabase 迁移与部署准备：
  - `supabase/migrations/20260611190000_init.sql`
  - `.env.example`
  - `SUPABASE_URL` / `SUPABASE_SECRET_KEY`
  - 已应用到 Supabase 项目 `txotvmxktxvmsvwzxdfr`
- 已完成 Supabase/Vercel 上线排障：
  - RPC 已使用 `SECURITY DEFINER` 安全绕过表级 RLS，并限制为服务端 secret key 调用
  - Vercel 已配置 Supabase 和 DeepSeek 环境变量
  - GitHub `main` 分支已连接 Vercel 自动部署
  - 生产站点已成功部署并可访问
- 已完成基础 API 验证：
  - `GET /api/game`
  - `POST /api/questions`
  - `POST /api/rounds/next`
  - `GET /api/history/[roundId]`
- 已补充 AI 行为修正：
  - 朝代、身份、性别等相关提问不再轻易落到 `无关`
  - 支持识别“答案是什么 / 我不猜了”这类直接揭晓请求，并自动开启新回合
  - 支持识别“给点提示 / 有什么线索”这类请求，生成不泄露答案且尽量不重复的人物提示
  - 人物提示作为独立时间线条目持久化，刷新和其他客户端轮询后仍可看到
- 已保留本地文件回退用于测试与离线开发，并为测试新增 `GAME_DB_PATH` 覆盖入口，避免污染本地开发数据。
- 已将 OpenSpec `tasks.md` 同步到真实进度：
  - 1.1 - 10.9 已勾选完成

## 当前状态

- 项目现在是一个可运行的 Next.js 多人共享猜历史人物应用。
- 项目已成功部署到 Vercel，生产环境已接入 Supabase。
- 生产默认走 Supabase/Postgres；测试和离线开发可临时回退到 `data/game-db.json`，测试会改用 `GAME_DB_PATH`。
- Supabase 项目已创建 3 张表：`game_rounds`、`game_questions`、`game_solved_history`，并已初始化活动回合。
- 实时同步采用轮询兜底，每 2.5 秒重新拉取持久化状态。
- OpenSpec change 的 `tasks.md` 已完成同步，所有任务已勾选完成。
- 当前代码已落盘、验证通过并完成生产部署。
- `.env.local` 现在使用 `DEEPSEEK_API_KEY`，不是 `OPENAI_API_KEY`。

## 下一步任务

1. 做一次生产环境多人回归，确认两个客户端的同步和结果弹窗。
2. 后续代码推送到 GitHub `main` 后，由 Vercel 自动部署。
3. 如果 AI 模型或接口策略变化，可通过 Vercel 的 `DEEPSEEK_MODEL` 环境变量调整。

## 备注

- `.env.local` 已保存 `DEEPSEEK_API_KEY`，不要提交到公开仓库。
- Supabase 服务端密钥使用 `SUPABASE_SECRET_KEY`（`sb_secret_...`）或旧版 `SUPABASE_SERVICE_ROLE_KEY`，不能使用 anon/publishable key。
- 当前开发服务器由本地 `next dev` 提供，后续可以继续沿用该入口。
- 本次尝试使用 in-app Browser 做视觉验证，但当前会话的 `iab` 浏览器不可用；已用构建和 API 方式完成验证。
- 之前的状态里曾把 `tasks.md` 误写成“已完成勾选”，现在已纠正为真实进度。
- 直接要答案会先揭晓当前人物，再自动开启下一回合，且新回合会继续避开刚刚揭晓的人物。
- 请求提示不会结束当前回合；连续请求时会把已有提示交给 DeepSeek，尽量返回不同角度的线索。
