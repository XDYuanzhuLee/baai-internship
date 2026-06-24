# PR Review Auto-Fix Loop

PR Review 评论自动修复闭环系统。从 GitHub 抓取 review 报告 → 解析未回复评论 → 确定性 triage → AI Agent 修复 → 本地验证 → Claude Review Gate → Codex Audit Gate → Push → CI 等待 → 自动回复，形成完整闭环。

## 流水线

```
fetch_reviews.py (抓取未回复 review)
  → 解析为 ReviewTask 列表 (parse_report)
  → 确定性 triage (must_fix / should_reply / ignore / need_human)
  → 按 PR 分组为 fixer shards
  → Fixer Agent 修改 (Claude/DeepSeek)
  → 本地验证 (validate_changed_files.py)
  → Claude Review Gate (独立只读审查)
  → Codex Audit Gate (最终审计)
  → Commit & Push
  → 等待 CI (CI 失败自动生成 fix 任务)
  → 自动回复 GitHub review comments
```

## 目录结构

```
pr_review_loop/
├── run_once.py                  # 主编排器
├── config.example.yaml          # 配置模板
├── .env.example                 # 环境变量 (无真实 token)
├── tools/
│   ├── claude_fixer.py          # Fixer Agent 包装器
│   ├── claude_review.py         # Claude 只读审查
│   ├── codex_audit.py           # Codex/GPT 审计
│   ├── push_approved_prs.py     # 推送已批准变更
│   ├── commit_approved_prs.py   # 提交已批准变更
│   ├── prepare_pr_worktrees.py  # 预创建 worktrees
│   ├── validate_changed_files.py # 本地验证
│   └── requeue_needs_human.py   # 人工任务重入队
├── prompts/
│   ├── triage.md                # Triage 分类 prompt
│   └── fixer.md                 # Fixer agent prompt
├── test_fixtures/               # 测试桩 (冒烟测试用)
├── github_reviews/              # Review 抓取脚本
├── deepseek-workflow/           # Workflow 配置
└── docs/                        # 设计文档
```

## 快速开始

### Dry Run (仅分析不执行)

```bash
python3 run_once.py --dry-run --limit 5
```

### 抓取新 review

```bash
GITHUB_TOKEN="$TOKEN" python3 run_once.py --fetch --days 3 --limit 10
```

> `GITHUB_TOKEN` 应由环境变量或 `gh auth login` 提供，禁止写入配置文件。

### 完整闭环冒烟测试

```bash
python3 run_once.py \
  --no-dry-run \
  --limit 3 \
  --execute-fixers \
  --fixer-command 'python3 test_fixtures/stub_fixer.py {run_dir} {shard_dir}' \
  --execute-claude-review \
  --claude-review-command 'python3 test_fixtures/stub_claude_review.py {task_dir}' \
  --execute-audit \
  --audit-command 'python3 test_fixtures/stub_audit.py {task_dir}' \
  --fixer-parallelism 2
```

### 恢复中断的运行

```bash
python3 run_once.py --resume ./records/YYYYMMDD_HHMMSS --no-dry-run ...
```

## 状态机

```
pending → fixer 执行 → fixed/needs_revision (循环 max_fix_rounds 轮)
fixed → local_validation → validated/revision
validated → claude_review → reviewed/revision
reviewed → codex_audit → local_approved/revision
local_approved → commit → push → pushed
pushed → wait_ci → ci_passed/done
                  ↘ ci_failed → ci-fix-* 任务 (下一轮修复)
                              ↘ needs_human (超过 max_fix_rounds)
done → auto_reply
```

## 关键参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `--dry-run` / `--no-dry-run` | `--dry-run` | 是否执行外部命令 |
| `--fetch` | false | 运行 fetch_reviews.py |
| `--limit` | 10 | 最多处理任务数 |
| `--limit-prs` | 0 | 限制唯一 PR 数 |
| `--shard-scope` | pr | 分组方式: pr/path/task |
| `--execute-fixers` | false | 执行 fixer |
| `--execute-local-validation` | false | 执行本地验证 |
| `--execute-claude-review` | false | 执行 Claude review gate |
| `--execute-audit` | false | 执行 Codex audit gate |
| `--auto-commit` | false | 自动提交 |
| `--auto-push` | false | 自动推送 |
| `--wait-ci` | false | 等待 CI 通过 |
| `--auto-reply` | false | 自动回复 GitHub 评论 |
| `--fixer-parallelism` | 3 | 并行 fixer 数 |
| `--max-fix-rounds` | 2 | 最大重试轮数 |
| `--command-timeout` | 1800 | 外部命令超时(秒) |
| `--ci-timeout` | 3600 | CI 等待超时(秒) |
| `--ci-poll-interval` | 30 | CI 轮询间隔(秒) |

## 命令模板占位符

| 占位符 | Fixer | Validation | Claude Review | Audit | Push |
|---------|-------|-----------|--------------|-------|------|
| `{run_dir}` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `{shard_dir}` | ✓ | | | | |
| `{task_dir}` | ✓† | ✓ | ✓ | ✓ | |
| `{task_id}` | ✓† | ✓ | ✓ | ✓ | |
| `{pr_num}` | ✓† | ✓ | ✓ | ✓ | |
| `{path}` | ✓† | ✓ | ✓ | ✓ | |
| `{handoff}` | ✓ | | | | |
| `{round}` | ✓ | ✓ | ✓ | ✓ | |
| `{worktree}` | | | ✓ | | |
| `{audit_prompt}` | | | | ✓ | |

† 仅在单任务 shard 时有效

## 安全设计

- **默认 dry-run**: 不传 `--no-dry-run` 不执行任何外部命令
- **分层开关**: 每层 gate 独立开关，可按需启用
- **新鲜度检查**: push 前自动重新抓取 review，防止重复回复
- **可恢复**: `--resume` 从中断处恢复，状态持久化在 `status.json`
- **Worktree 隔离**: fixer 在独立 git worktree 中操作，不污染主分支

## 输出

每次运行写入 `records/YYYYMMDD_HHMMSS/`:

```
├── tasks.jsonl               # 所有 ReviewTask
├── summary.md                # 运行摘要
├── run_config.json           # 运行参数快照
├── loop_events.json          # 每轮执行记录
├── source_reviews.md         # 原始 review 报告
├── ci_results.json           # CI 检查结果
├── runs/
│   ├── shards/               # fixer 分片 handoff
│   │   ├── shard-001/        # 常规 review 分片
│   │   └── shard-ext-001/    # CI/rebase 分片
│   └── pr-<N>/
│       ├── review-<id>/      # 每个 review 的任务目录
│       │   ├── task.json     # 任务详情
│       │   ├── status.json   # 可恢复状态
│       │   ├── task.md       # 任务摘要
│       │   ├── fixer_handoff.md   # Fixer prompt
│       │   ├── codex_audit_prompt.md  # Audit prompt
│       │   ├── execution.md  # 执行记录
│       │   ├── reply_draft.md # 回复草稿
│       │   └── final_report.md   # 最终报告
│       ├── ci-fix-*/         # CI 修复任务 (自动生成)
│       └── rebase-conflict-*/ # Rebase 冲突任务 (自动生成)
└── package/                  # 可分享的便携副本
```
