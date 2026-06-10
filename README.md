# BAAI 实习专用仓库

BAAI 实习期间积累的各类自动化脚本和工具集合。

## 目录

| 脚本 | 说明 | 入口 |
|------|------|------|
| [triton_check](./triton_check/) | Triton 算子合规性检查工具 — 通过 Claude Code CLI 调用大模型，自动审查 FlagGems 算子是否使用了真正的 Triton kernel 实现 | `./triton_check/run.sh` |
| [batch_pr_submit](./batch_pr_submit/) | FlagGems 算子批量提 PR 工具 — 遍历算子列表自动提交 PR，支持并行 worktree 隔离 | `./batch_pr_submit/batch_submit.sh` |

## 使用方式

每个脚本独立运行，详见各自目录下的 README。
