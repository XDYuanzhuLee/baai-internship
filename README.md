# BAAI 实习专用仓库

BAAI 实习期间积累的各类自动化脚本和工具集合。

## 目录

| 脚本 | 说明 | 入口 |
|------|------|------|
| [pr_review_loop](./pr_review_loop/) | PR Review 自动修复闭环 — 抓取 review → AI Agent 修复 → 多层 Gate → Push → CI → 自动回复 | `python3 ./pr_review_loop/run_once.py --dry-run` |
| [batch_pr_audit](./batch_pr_audit/) | FlagGems PR 批量审计 — 确定性规则 + AI Agent 两阶段并行审计 | `python3 ./batch_pr_audit/batch_pr_audit.py --no-agent --prs "..."` |
| [auto_gen](./auto_gen/) | FlagGems 算子自动生成工具 — Claude Code 编排，支持多 GPU 并行与多后端（CUDA/MetaX/Iluvatar） | `python3 ./auto_gen/orchestrator.py` |
| [triton_check](./triton_check/) | Triton 算子合规性检查 — 自动审查 FlagGems 算子是否使用了真正的 Triton kernel | `./triton_check/run.sh` |
| [batch_pr_submit](./batch_pr_submit/) | FlagGems 算子批量提 PR — 遍历算子列表自动提交，并行 worktree 隔离 | `./batch_pr_submit/batch_submit.sh` |
| [ci_performance_update](./ci_performance_update/) | CI 性能数据更新 — 从 CI 提取 speedup 更新 PR 描述，审计 H20 性能 | `python3 ./ci_performance_update/update_pr_performance_from_ci.py` |
| [github_reviews](./github_reviews/) | GitHub PR Review 抓取 — 批量拉取指定 PR 的 review comments 并生成报告 | `./github_reviews/fetch_reviews.sh` |
| [anti_hack](./anti_hack/) | FlagGems 反作弊检查 — 检测算子实现中的 bypass dual-execution 模式 | `./anti_hack/anti_hack.py` |
| [proxy](./proxy/) | HTTP/1.1 流式反向代理 — 解决中转 API nginx HTTP/2 流式断连问题 | `python3 ./proxy/proxy.py` |
| [skills](./skills/) | Agent skills 集合 — FlagGems 算子 PR 提交 skill，封装规范名查询/代码提取/门禁/PR 创建 | `./skills/flaggems-pr-submit/SKILL.md` |

## 使用方式

每个脚本独立运行，详见各自目录下的 README。
