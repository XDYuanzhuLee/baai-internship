# DeepSeek Workflow

这套流程用于“Codex 规划，Claude Code + DeepSeek 执行，Codex 复核”。

Claude Code 负责工具调用、读写文件、运行命令；DeepSeek 是 Claude Code 背后的模型。因此只要 Claude 已配置到 DeepSeek，执行能力仍然可用。

## 标准流程

1. 用户提出任务。
2. Codex 创建任务目录并写 `request.md`、`plan.md`、`handoff.md`。
3. Claude Code/DeepSeek 只读取 `handoff.md` 执行，不重新设计任务目标。
4. 执行者把过程和结果写入 `execution.md`。
5. Codex 读取 diff、测试结果、`execution.md`，写 `review.md`。
6. 若复核不通过，Codex 写 `followup.md`，DeepSeek 继续修。

## 创建任务

```bash
python3 /workspace/deepseek-workflow/scripts/new_task.py "任务标题" "原始需求"
```

## DeepSeek 执行方式

在 Claude Code 中对 DeepSeek 说：

```text
请严格按照 /workspace/deepseek-workflow/tasks/<task-id>/handoff.md 执行。
执行过程写入 execution.md。
遇到 BLOCKED 条件立即停止，不要猜。
```
