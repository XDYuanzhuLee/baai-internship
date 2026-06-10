# Auto-Gen - FlagGems 算子自动生成工具

基于 Claude Code 的 FlagGems 算子自动生成编排系统，支持多 GPU 并行处理和多硬件后端（CUDA、MetaX、Iluvatar）。

## 功能特性

- 🔄 **全自动流程**：代码生成 → 编译 → 测试 → 验证
- 🎯 **多硬件后端**：支持 CUDA、MetaX（沐曦）、Iluvatar（天数）
- 🔧 **智能调度**：GPU 资源锁管理，支持 8 卡并行
- 📊 **详细追踪**：执行日志、JSONL 对话记录、时间线统计
- 🔁 **自动重试**：失败自动重试，可配置重试次数
- 🧪 **单算子测试**：支持独立测试单个算子

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
pip install pyyaml anthropic

# 安装 Claude Code CLI（如未安装）
# 参考：https://docs.anthropic.com/claude/docs/claude-code

# 配置 API 密钥
cp .env.example .env
# 编辑 .env 文件，填入你的 API 密钥
```

### 2. 配置环境

编辑 `config.yaml`，修改以下关键配置：

```yaml
flaggems_dir: /path/to/your/FlagGems  # FlagGems 仓库路径
python_path: /usr/local/bin/python3   # Python 解释器路径
claude_bin: claude                     # Claude Code CLI 命令
device:
  gpu_ids: [0, 1, 2, 3, 4, 5, 6, 7]   # 可用的 GPU ID 列表
```

### 3. 运行脚本

#### 测试单个算子
```bash
./test_single_op.sh relu
```

#### 批量处理算子列表
```bash
# 使用默认配置
python3 orchestrator.py

# 指定配置文件和算子列表
python3 orchestrator.py --config config.yaml --ops-list ops_list_example.txt

# 使用 MetaX 后端
python3 orchestrator.py --metax

# 使用 Iluvatar 后端
python3 orchestrator.py --iluvatar
```

## 目录结构

```
auto_gen/
├── orchestrator.py              # 主编排脚本
├── device_manager.py            # GPU 设备管理器
├── config.yaml                  # 配置文件
├── .env                         # API 密钥配置（不提交）
├── .env.example                 # API 密钥配置模板
├── ops_list_example.txt         # 算子列表示例
├── test_single_op.sh            # 单算子测试脚本
├── templates/                   # Prompt 模板
│   ├── generate_op.md           # CUDA 后端模板
│   ├── generate_op_metax.md     # MetaX 后端模板
│   ├── generate_op_iluvatar.md  # Iluvatar 后端模板
│   └── generate_op_iluvatar_optimize.md  # Iluvatar 优化模板
├── extract_metax_failed_ops.py  # 提取 MetaX 失败算子
├── extract_iluvatar_failed_ops.py  # 提取 Iluvatar 失败算子
├── fix_worktree_import.py       # 修复 worktree 导入问题
├── CHANGELOG_METAX.md           # MetaX 实现变更日志
├── ILUVATAR_IMPLEMENTATION.md   # Iluvatar 实现文档
├── SETUP_SUMMARY.md             # 原版脚本恢复总结
└── results/                     # 运行结果（自动生成）
    ├── logs/                    # 算子执行日志
    ├── timelines/               # 执行时间线
    └── summary.json             # 总体执行摘要
```

## 配置说明

### config.yaml 核心配置

```yaml
# FlagGems 仓库路径
flaggems_dir: /root/JudeWorkplace/FlagGems_minimax_2_7

# Python 解释器路径
python_path: /usr/local/bin/python3

# Claude Code CLI 命令
claude_bin: claude

# GPU 设备配置
device:
  gpu_ids: [0, 1, 2, 3, 4, 5, 6, 7]  # 可用 GPU 列表
  lock_dir: /tmp/auto_gen_gpu_locks   # GPU 锁文件目录

# 执行参数
max_retries: 3                # 失败重试次数
timeout_per_op: 9600          # 单个算子超时时间（秒）
budget_per_op: 10000000.0     # 单个算子预算（tokens）
poll_interval: 10             # 状态轮询间隔（秒）

# 结果输出
results_dir: results          # 结果输出目录
template: templates/generate_op.md  # 默认 prompt 模板

# MetaX 后端配置
metax:
  template: templates/generate_op_metax.md
  ops_list: ops_list_metax.txt

# Iluvatar 后端配置
iluvatar:
  template: templates/generate_op_iluvatar_optimize.md
  ops_list: ops_list_iluvatar.txt
```

### .env API 配置

```bash
ANTHROPIC_API_KEY=sk-xxx  # 你的 API 密钥
ANTHROPIC_BASE_URL=https://api.flagos.net  # API 端点
ANTHROPIC_MODEL=MiniMax-M2.5  # 使用的模型
```

## 算子列表格式

算子列表文件支持多种格式：

```
# 注释行会被忽略

# 简单格式
relu
sigmoid

# PyTorch 格式（会自动去除 aten:: 前缀）
aten::tanh
aten::abs

# 带重载后缀（会自动去除 .Tensor 等后缀）
aten::round.Tensor
aten::add.Scalar
```

## 工作流程

1. **读取配置**：加载 `config.yaml` 和 `.env`
2. **解析算子列表**：读取并解析算子列表文件
3. **GPU 分配**：为每个算子分配可用的 GPU
4. **创建 Worktree**：为每个算子创建独立的 git worktree
5. **调用 Claude Code**：使用配置的 prompt 模板生成算子代码
6. **编译测试**：在 worktree 中编译并测试生成的代码
7. **记录结果**：保存日志、JSONL 对话记录、时间线
8. **清理资源**：清理 worktree，释放 GPU 锁
9. **生成摘要**：汇总所有算子的执行结果

## 输出文件说明

### logs/ 目录
- `<op_name>.log`：算子执行日志（Claude Code 的 stdout/stderr）
- `<op_name>.jsonl`：完整的 Claude Code 对话记录

### timelines/ 目录
- `<op_name>_timeline.txt`：算子执行时间线统计

### summary.json
```json
{
  "total": 10,
  "success": 8,
  "failed": 2,
  "operators": {
    "relu": "success",
    "sigmoid": "success",
    "tanh": "failed"
  }
}
```

## 故障排查

### 日志文件为 0 字节
- 检查是否使用了修改过的 `orchestrator.py`
- 参考 `SETUP_SUMMARY.md` 了解原版脚本恢复方案

### GPU 锁死锁
```bash
# 清理所有 GPU 锁
rm -rf /tmp/auto_gen_gpu_locks/*
```

### Worktree 清理失败
```bash
# 手动清理所有 worktree
cd /path/to/FlagGems
git worktree list
git worktree remove <worktree-path> --force
```

### Claude Code 连接失败
- 检查 `.env` 中的 API 密钥是否正确
- 检查网络连接
- 验证 `claude` 命令是否可用：`which claude`

## 辅助工具

### extract_metax_failed_ops.py
从 Excel 文件中提取 MetaX 失败算子列表。

```bash
python3 extract_metax_failed_ops.py --input metax_results.xlsx --output ops_list_metax.txt
```

### extract_iluvatar_failed_ops.py
从 Excel 文件中提取 Iluvatar 失败算子列表。

```bash
python3 extract_iluvatar_failed_ops.py --input iluvatar_results.xlsx --output ops_list_iluvatar.txt
```

### fix_worktree_import.py
修复 worktree 中的模块导入问题。

```bash
python3 fix_worktree_import.py --worktree-path /path/to/worktree
```

## 实现文档

- [CHANGELOG_METAX.md](./CHANGELOG_METAX.md) - MetaX 后端实现变更日志
- [ILUVATAR_IMPLEMENTATION.md](./ILUVATAR_IMPLEMENTATION.md) - Iluvatar 后端实现详解
- [SETUP_SUMMARY.md](./SETUP_SUMMARY.md) - 原版脚本恢复总结

## 注意事项

1. **首次运行**：建议先用 `ops_list_example.txt` 测试几个简单算子
2. **磁盘空间**：每个 worktree 约占用 500MB-1GB，确保有足够空间
3. **GPU 资源**：确保 GPU 可用且未被其他任务占用
4. **中断恢复**：可以用 `Ctrl+C` 优雅停止，会自动清理资源
5. **并行数量**：默认使用所有配置的 GPU，可通过修改 `device.gpu_ids` 控制并行数

## 性能优化建议

- 使用 SSD 存储 worktree 以加快文件操作
- 调整 `timeout_per_op` 以适应不同复杂度的算子
- 合理设置 `budget_per_op` 避免过度消耗 API 额度
- 对于简单算子，可以降低 `max_retries` 节省时间

## 贡献指南

欢迎提交 Issue 和 Pull Request！

- 新增硬件后端：参考 `ILUVATAR_IMPLEMENTATION.md`
- 优化 prompt 模板：修改 `templates/` 下的模板文件
- 改进调度算法：修改 `device_manager.py`

## 许可证

本项目代码仅供学习和研究使用。
