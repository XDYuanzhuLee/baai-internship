# BAAI 实习专用仓库

BAAI 实习期间积累的各类自动化脚本和工具集合。

## 目录

| 脚本 | 说明 | 入口 |
|------|------|------|
| [auto_gen](./auto_gen/) | FlagGems 算子自动生成工具 — 基于 Claude Code 的自动化编排系统，支持多 GPU 并行和多硬件后端（CUDA/MetaX/Iluvatar） | `python3 ./auto_gen/orchestrator.py` |
| [triton_check](./triton_check/) | Triton 算子合规性检查工具 — 通过 Claude Code CLI 调用大模型，自动审查 FlagGems 算子是否使用了真正的 Triton kernel 实现 | `./triton_check/run.sh` |
| [batch_pr_submit](./batch_pr_submit/) | FlagGems 算子批量提 PR 工具 — 遍历算子列表自动提交 PR，支持并行 worktree 隔离 | `./batch_pr_submit/batch_submit.sh` |
| [ci_performance_update](./ci_performance_update/) | CI 性能数据更新 — 从 CI 结果提取 speedup 数据更新到 PR 描述，审计 H20 性能 | `./ci_performance_update/update_pr_performance_from_ci.py` |
| [github_reviews](./github_reviews/) | GitHub PR Review 抓取 — 批量拉取指定 PR 的 review comments 并生成报告 | `./github_reviews/fetch_reviews.sh` |
| [anti_hack](./anti_hack/) | FlagGems 反作弊检查 — 检测算子实现中的 anti-hack 模式（wrapper 绕过 dual-execution） | `./anti_hack/anti_hack.py` |
| [ds_proxy](./ds_proxy/) | DeepSeek API 代理 — Node.js 代理服务，转发 API 请求 | `./ds_proxy/ds-proxy.js` |
| [skills](./skills/) | Agent skills 集合 — 当前包含 FlagGems 算子 PR 提交 skill，封装规范名查询、代码提取、门禁验证、PR 创建和回填 | `./skills/flaggems-pr-submit/SKILL.md` |

## 使用方式

每个脚本独立运行，详见各自目录下的 README。
