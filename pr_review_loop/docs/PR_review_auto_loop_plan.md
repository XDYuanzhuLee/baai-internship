# PR Review 自动处理闭环计划

## 目标

把已有的 PR review 拉取脚本和 DeepSeek workflow 串成一个可控闭环：

1. 定时获取我提交的 PR 上的新 review。
2. 判断 review 是否真的需要处理。
3. 对需要修改的问题启动 DeepSeek/Claude workflow 修改代码。
4. 修改后由 Codex/GPT 审核。
5. 审核不通过则继续让修改 Agent 迭代。
6. 审核通过后记录完整过程，必要时 push，并为对应 review 行准备简短回复。

核心原则：DeepSeek/Claude 可以负责执行修改，但不能拥有最终决定权；Codex 负责验收、约束范围和发现幻觉。

## 现有组件

- Review 拉取入口：`/workspace/github_reviews`
- DeepSeek 解决 workflow：`/workspace/deepseek-workflow`
- 计划文档目录：`/workspace/docs/0619_pr处理`
- 运行记录根目录：`/workspace/docs/Agent_fix_review`

后续实现时不需要重写 review 拉取逻辑，优先把 `/workspace/github_reviews` 作为输入源。

## 总体架构

```text
定时器 cron/systemd/GitHub Actions
  -> fetch reviews
  -> 生成 review queue
  -> triage agent 判断是否要处理
  -> fixer agent 使用 DeepSeek/Claude 修改
  -> Codex audit agent 审核修改
  -> 需要迭代则回到 fixer
  -> 通过后记录、push、生成对应 review 行回复草稿
```

建议新增一个本地 orchestrator，先做 `run_once`，跑通以后再加定时。每次运行都在 `/workspace/docs/Agent_fix_review` 下创建一个日期时间目录：

```text
/workspace/docs/Agent_fix_review/
  20260619_032829/
    package/
      README.md
      config.example.yaml
      .env.example
      github_reviews/
      deepseek-workflow/
      pr_review_loop/
    runs/
      pr-1234/
        review-5678/
          task.json
          triage.md
          fix_prompt.md
          fixer_output.md
          diff.patch
          test.log
          codex_audit.json
          reply_draft.md
          final_report.md
```

这样一次运行中的脚本副本、配置模板、任务记录、patch、测试结果、审核结论和回复草稿都在同一个大文件夹里，后续整理或分享会更方便。

## Review 状态机

每条 review comment 单独建一个 task：

```text
new
  -> triaged
  -> skipped | reply_needed | queued_for_fix | human_required
  -> fixing
  -> fixed
  -> auditing
  -> approved | revision_required | human_required
  -> pushed
  -> reply_drafted
  -> replied
  -> done
```

状态含义：

- `skipped`：无效 review、重复 review、已经处理过、和当前 diff 无关。
- `reply_needed`：不改代码，只需要解释。
- `queued_for_fix`：明确需要改。
- `human_required`：涉及设计取舍、review 信息不清楚、风险太大。
- `revision_required`：Codex 审核认为修改不够或有副作用，需要再改一轮。
- `approved`：Codex 审核通过，可以进入 push/reply。
- `reply_drafted`：已经为对应 review 行生成简短回复草稿，但还没有自动发送。

## Triage 规则

Triage agent 只做判断，不改代码。输出必须是结构化 JSON，便于 orchestrator 后续处理。

建议分类：

```json
{
  "review_id": "...",
  "pr": 1234,
  "decision": "must_fix | should_reply | ignore | need_human",
  "confidence": "high | medium | low",
  "reason": "...",
  "evidence": [
    "引用 review 原文中的关键点",
    "引用相关代码或 diff 信息"
  ],
  "suggested_action": "..."
}
```

判断标准：

- 明确指出 bug、测试失败、接口不一致、命名错误、格式问题：`must_fix`
- reviewer 问为什么这么做、需要补充说明：`should_reply`
- 重复评论、过期评论、已经被后续提交解决、明显误解：`ignore`
- 需要项目 owner 决策、可能改变 API 或行为：`need_human`

## Fixer Agent：DeepSeek/Claude

DeepSeek/Claude 只接收最小必要上下文：

- PR 编号和分支
- review 原文
- review 对应文件和行号
- 当前 PR diff
- 相关文件片段
- Codex 上一轮 audit 意见，如果是返工

Fixer 的约束：

- 只解决当前 task 对应的问题。
- 不做无关重构。
- 不修改无关文件。
- 不扩大功能范围。
- 修改后必须说明改了什么、为什么这么改、如何验证。
- 修改后必须为对应 review comment 生成一条简短回复草稿，保存到 `reply_draft.md`。
- commit message 和任何生成内容中禁止添加 `Co-authored-by` 或 `Co-authored by`。

需要在 `/workspace/deepseek-workflow` 的模板里追加硬性规则：

```text
Do not add any Co-authored-by, Co-authored by, Generated-by, or AI attribution trailer
to commit messages, PR comments, patches, file headers, or generated documentation.
```

中文规则也建议加一份，避免模型忽略：

```text
禁止在 commit message、PR 回复、patch、文件头、文档中添加 Co-authored-by、
Co-authored by、Generated-by 或任何 AI 署名/协作者署名。
```

回复草稿规则：

```text
Write a short reply for the exact review comment after the fix.
The reply should be concise, factual, and tied to the changed code.
Do not mention AI tools, agents, model names, or internal workflow details.
Do not add Co-authored-by or any attribution trailer.
```

中文规则：

```text
修改完成后，必须为对应 review 行生成简短回复草稿。
回复只说明已如何处理或为什么无需修改，不提 AI、Agent、模型或内部流程。
```

## DeepSeek 多 Agent 并行策略

为了避免单个 DeepSeek/Claude 会话上下文过长导致幻觉，fix 阶段建议拆成多个短上下文 Agent 并行处理。

拆分粒度：

- 优先按 PR 拆分：不同 PR 可以并行。
- 同一 PR 内按文件或 review thread 拆分。
- 同一个文件的多个 review 尽量串行，避免 patch 冲突。
- 涉及同一段代码的 review 必须合并成一个 task。

推荐流程：

```text
orchestrator
  -> 将 actionable reviews 分组成 fix shards
  -> 并行启动 N 个 DeepSeek/Claude fixer
  -> 每个 fixer 只处理自己的 shard
  -> 收集每个 shard 的 patch 和 reply_draft
  -> 逐个 apply patch，遇到冲突转 human_required
  -> 运行测试
  -> 启动 Codex 审核整体 diff
```

并行参数建议：

```yaml
fixer_parallelism: 3
max_reviews_per_fixer: 2
max_files_per_fixer: 3
max_fix_rounds_per_review: 2
```

注意：Codex audit 阶段不建议只按 shard 分开审核。最终至少要有一次 Codex 对整个 PR diff 做总审，避免多个 fixer 的修改组合起来出现问题。

## Audit Agent：Codex/GPT

Codex 负责审核 DeepSeek/Claude 的修改，不直接默认继续改，除非 orchestrator 把它作为下一轮 fixer 调用。

Codex 审核输入：

- review 原文
- triage 结论
- fixer 修改说明
- git diff
- 测试输出
- 当前 PR 背景
- `reply_draft.md`

Codex 输出：

```json
{
  "decision": "approved | needs_revision | needs_human",
  "summary": "...",
  "findings": [
    {
      "severity": "blocking | warning | note",
      "file": "...",
      "line": 123,
      "message": "..."
    }
  ],
  "required_changes": [
    "..."
  ],
  "reply_to_reviewer": "..."
}
```

审核重点：

- 是否真正解决 review。
- 是否有无关修改。
- 是否破坏现有行为。
- 是否有测试或合理验证。
- 是否引入 DeepSeek 幻觉代码。
- 是否出现禁止的 `Co-authored-by` 署名。
- `reply_draft.md` 是否准确、简洁、对应到原 review 行。

## Claude 和 Codex 怎么搭配启动

推荐方式：不要让 Claude 和 Codex 互相直接拉起，而是由一个 orchestrator 统一启动两个 CLI/Agent。

原因：

- 状态集中记录，容易追踪。
- 可以控制最大迭代次数。
- 可以在两者之间插入 git diff、测试、日志、人工审核。
- 避免两个 Agent 同时改同一个 worktree。

推荐启动模式：

```text
orchestrator
  -> 按 PR/thread/file 切分任务
  -> 并行启动多个 Claude/DeepSeek fixer
  -> 等待 fixer 结束并收集 patch
  -> 保存 diff、日志和 reply_draft
  -> 启动 Codex audit
  -> 读取 audit JSON
  -> approved: 结束
  -> needs_revision: 把 audit 意见喂回 Claude/DeepSeek
  -> needs_human: 停止并记录
```

### 方案 A：Shell 子进程编排

最简单可落地。orchestrator 用 Python 或 shell 调命令：

```text
claude --prompt-file fix_prompt.md --workspace /path/to/worktree
codex exec --prompt-file audit_prompt.md --workspace /path/to/worktree
```

具体命令以本机 CLI 实际支持为准。关键不是 CLI 名字，而是固定输入输出协议：

- fixer 读 `fix_prompt.md`
- fixer 写 `fixer_output.md`
- fixer 写 `reply_draft.md`
- orchestrator 保存 `git diff`
- auditor 读 `audit_prompt.md`
- auditor 写 `codex_audit.json`

### 方案 B：文件队列编排

Claude/DeepSeek 和 Codex 都不直接互相调用，只监听任务目录：

```text
queue/fix/*.json
queue/audit/*.json
queue/done/*.json
queue/human_required/*.json
```

优点是稳定，适合长期定时跑；缺点是实现稍复杂。

### 方案 C：云端 workflow + 本地 Codex gate

如果 DeepSeek workflow 已经主要在 cloud 里跑，可以这样配：

```text
本地 orchestrator
  -> 调 cloud DeepSeek workflow API/CLI，按 shard 并行启动多个 fixer
  -> 拉取每个 fixer 修改后的分支或 patch
  -> 合并 patch，保存 reply_draft
  -> 本地 Codex 审核
  -> 审核通过后 push
```

这个方式最符合当前设想：cloud 负责执行，Codex 在本地或另一个环境做最终 gate。

## Worktree 与并发策略

同一个 PR 默认串行处理，多个 PR 可以并行。更细一点：

- 不同 PR：可以并行。
- 同一 PR、不同文件：可以谨慎并行。
- 同一 PR、同一文件：默认串行。
- 同一 review thread：必须串行。

建议每个 PR 建独立 worktree：

```text
/workspace/pr_review_loop/worktrees/pr-1234/
```

锁文件：

```text
/workspace/pr_review_loop/locks/pr-1234.lock
```

规则：

- 拿不到锁就跳过该 PR，下一轮再处理。
- 一个 PR 一次只允许一个 fixer 修改同一文件或同一 thread。
- Codex audit 必须在 fixer 完成后运行。
- 每轮开始前记录 base commit。
- 每轮结束后保存 patch。

## 迭代上限

建议每条 review 最多 2 轮自动修复：

```yaml
max_fix_rounds: 2
max_reviews_per_pr_per_run: 5
max_parallel_prs: 3
fixer_parallelism: 3
```

超过上限进入 `human_required`，避免 Agent 循环消耗时间。

## 记录格式

每条 task 产出一份 Markdown 报告：

````markdown
# PR 1234 Review 处理记录

## Review 原文

...

## Triage 判断

- 结论：
- 理由：

## 修改说明

- 修改文件：
- 修改原因：
- 风险：

## Diff

```diff
...
```

## 测试

```text
...
```

## Codex 审核

- 结论：
- blocking findings：
- 建议回复：

## Review 行后回复草稿

```text
...
```

## 最终状态

...
````

同时写 JSONL，方便程序读取：

```json
{"time":"2026-06-19T00:00:00Z","pr":1234,"review_id":"...","state":"approved","run_dir":"..."}
```

## 定时策略

先手动：

```bash
python /workspace/pr_review_loop/run_once.py --dry-run
python /workspace/pr_review_loop/run_once.py --limit 3
```

稳定后再加 cron：

```cron
*/30 * * * * cd /workspace && python /workspace/pr_review_loop/run_once.py >> /workspace/pr_review_loop/loop.log 2>&1
```

建议默认 dry-run，确认没有误处理后再开启自动 push。

## Push 和回复策略

第一版建议不要自动 push，先只生成 patch 和报告。

第二版再打开：

```yaml
auto_push: false
auto_reply: false
```

成熟后可改：

```yaml
auto_push: true
auto_reply: false
```

reviewer 回复建议仍先人工确认，除非只是“fixed, thanks”这类低风险回复。

回复必须落在对应 review 行后，而不是只在 PR 总评论里回复。实现上需要记录：

```json
{
  "review_comment_id": "...",
  "path": "...",
  "line": 123,
  "reply_draft_file": "reply_draft.md",
  "reply_body": "Addressed by ...",
  "reply_posted": false
}
```

## 可分享的一体化目录

为了后续整理分享，建议把所有需要的东西打包进一个大目录：

```text
/workspace/docs/Agent_fix_review/20260619_032829/package/
  README.md
  config.example.yaml
  .env.example
  github_reviews/
  deepseek-workflow/
  pr_review_loop/
  prompts/
    triage.md
    fixer.md
    audit.md
  examples/
    task.example.json
    codex_audit.example.json
    final_report.example.md
```

`github_reviews/` 和 `deepseek-workflow/` 可以从现有目录复制一份进来，作为可分享版本。复制时要排除：

- `.git/`
- 缓存文件
- 日志里的敏感信息
- 真实 token
- 私有仓库地址中带 token 的 remote URL

配置建议：

```yaml
github:
  username: "XDYuanzhuLee"
  token_env: "GITHUB_TOKEN"

paths:
  review_fetcher_dir: "./github_reviews"
  deepseek_workflow_dir: "./deepseek-workflow"
  records_root: "/workspace/docs/Agent_fix_review"

workflow:
  fixer_parallelism: 3
  max_fix_rounds_per_review: 2
  auto_push: false
  auto_reply: false
```

`.env.example` 只放占位符：

```bash
GITHUB_USERNAME=XDYuanzhuLee
GITHUB_TOKEN=fill_your_token_here
```

不要把真实 GitHub token 写入文档、配置、日志或 git 仓库。若 token 曾经出现在对话、日志或文件中，应立刻在 GitHub 中撤销并重新生成。

## 最小可行版本

第一阶段只做这些：

1. 调用现有 `/workspace/github_reviews` 生成 review 列表。
2. 建 task JSONL。
3. 人工或简单规则挑出 `must_fix`。
4. 调 DeepSeek/Claude 修改一个 task。
5. 保存 diff。
6. 调 Codex 审核。
7. 生成对应 review 行的 `reply_draft.md`。
8. 生成 Markdown 报告。

先不做自动 push、自动回复、复杂并发。

## 下一步

1. 检查 `/workspace/github_reviews` 的输出格式。
2. 检查 `/workspace/deepseek-workflow` 的启动方式和 prompt 模板位置。
3. 在模板中加入禁止 `Co-authored-by` 的规则。
4. 加入 `reply_draft.md` 生成规则，确保回复对应到具体 review 行。
5. 实现 `pr_review_loop/run_once.py` 的最小版本。
6. 增加 DeepSeek/Claude fixer 并行 shard。
7. 用一个真实 PR dry-run 验证闭环。
