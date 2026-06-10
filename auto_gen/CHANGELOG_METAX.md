# auto_gen 沐曦(Metax)后端适配变更记录

> **日期**: 2026-05-11
> **目标**: 使 auto_gen 脚本支持为沐曦(Muxi) GPU 生成特化算子
> **仓库**: FlagGems_minimax_2_7
> **沐曦算子路径**: `src/flag_gems/runtime/backend/_metax/ops/`

---

## 目录

1. [变更概览](#1-变更概览)
2. [新增文件详解](#2-新增文件详解)
3. [修改文件详解](#3-修改文件详解)
4. [fix_worktree_import.py 修复导入路径](#4-fix_worktree_importpy-修复导入路径)
5. [模板命令更新](#5-模板命令更新)
6. [完整运行流程](#6-完整运行流程)
7. [迁移到其他国产芯片的指南](#7-迁移到其他国产芯片的指南)
8. [常见问题](#8-常见问题)

---

## 1. 变更概览

| 文件 | 操作 | 说明 |
|------|------|------|
| `templates/generate_op_metax.md` | **新增** | 沐曦专用模板，指导 CC 生成沐曦特化算子 |
| `extract_metax_failed_ops.py` | **新增** | 从 Excel 提取沐曦失败算子的辅助脚本 |
| `ops_list_metax.txt` | **新增** | 168 个在沐曦上测试失败的算子 |
| `config.yaml` | **修改** | 更新 `flaggems_dir`，新增 `metax` 配置节 |
| `orchestrator.py` | **修改** | 新增 `--metax` 模式和全部配套逻辑 |

---

## 2. 新增文件详解

### 2.1 `templates/generate_op_metax.md` — 沐曦模板

**定位**：与 `templates/generate_op.md` 平级，是 NVIDIA 模板的沐曦版本。

**与 NVIDIA 模板的核心差异**：

| 方面 | NVIDIA 模板 (`generate_op.md`) | 沐曦模板 (`generate_op_metax.md`) |
|------|-------------------------------|-----------------------------------|
| 算子实现路径 | `src/flag_gems/ops/{{OPERATOR}}.py` | `src/flag_gems/runtime/backend/_metax/ops/{{OPERATOR}}.py` |
| 注册方式 | 改 `ops/__init__.py` + `__init__.py` 的 `_FULL_CONFIG` | **仅**改 `_metax/ops/__init__.py` |
| 参考实现 | `ops/abs.py` 等通用算子 | `_metax/ops/sigmoid.py` 等沐曦现有实现 |
| program_id | `tl.program_id()` | `tle.program_id()` (跨后端兼容) |
| 设备管理 | `CUDA_VISIBLE_DEVICES` | `torch_device_fn.device()` |
| Logger 前缀 | `"GEMS ..."` | `"METAX GEMS ..."` |
| tune_configs | 全局 `tune_configs.yaml` | `_metax/tune_configs.yaml` |
| 导入规范 | 标准 Triton 导入 | 需 `from flag_gems.utils import triton_lang_extension as tle` |
| 约束 | 无特殊约束 | 禁止 `tl.extra.cuda.libdevice`，使用 `tl_extra_shim` |

**模板结构**（共 8 步）：
1. 了解算子语义
2. 阅读沐曦现有参考代码
3. 实现算子（在 `_metax/ops/` 下创建）
4. 注册算子（仅改 `_metax/ops/__init__.py`）
5. 编写 accuracy 测试
6. 运行测试
7. 提交代码
8. 输出 JSON 结果

### 2.2 `extract_metax_failed_ops.py` — 提取脚本

**用途**：从 `第一批及格算子国产GPU测试.xlsx` 中自动提取沐曦失败的算子。

**使用方法**：
```bash
# 默认路径（自动找 Excel）
python3 auto_gen/extract_metax_failed_ops.py

# 指定 Excel 路径 + 输出
python3 auto_gen/extract_metax_failed_ops.py /path/to/excel.xlsx -o my_ops.txt

# 同时打印到终端
python3 auto_gen/extract_metax_failed_ops.py --print
```

**解析规则**：
- 遍历所有 Sheet（当前有 Sheet 1~5、6、7）
- 从第 4 行开始读，列 A=算子名，列 C=沐曦结果
- 列 C 值为 `"失败"` 的算子被提取
- 自动去掉 `aten::` 前缀和 `.Tensor` 等 overload 后缀
- 去重后按字母排序

### 2.3 `ops_list_metax.txt` — 算子失败列表

**来源**：`第一批及格算子国产GPU测试.xlsx` 中所有 Sheet 的沐曦失败算子

**统计**：
- Sheet 1~5: ~100 个标准 PyTorch 算子
- Sheet 6: 7 个（ONNX 格式算子：`_to_copy`, `If`, `Cast`, `Shape`, `slice`, `ReduceL2`, `ConstantOfShape`）
- Sheet 7: ~60 个（融合算子：`Fused_Softmax`, `GroupNorm`, `Paged_Attention` 等）
- **合计：168 个**

**注意**：Sheet 6 和 Sheet 7 的算子名可能不是标准 Triton 算子名（如 `If`, `Shape`, `Paged_Attention`），CC 在生成时可能需要特殊处理。

---

## 3. 修改文件详解

### 3.1 `config.yaml` 修改

**改动内容**：

```yaml
# 1. 更新了 flaggems_dir 路径
flaggems_dir: /root/JudeWorkplace/FlagGems_minimax_2_7

# 2. 新增 metax 配置节
metax:
  template: templates/generate_op_metax.md    # 沐曦专用模板
  ops_list: ops_list_metax.txt                # 默认沐曦算子列表
```

### 3.2 `orchestrator.py` 修改

共 **5 处改动**，全部通过 `is_metax` 标志控制：

#### 改动 1: CLI 参数（main 函数）

```python
parser.add_argument("--metax", action="store_true",
    help="Metax (Muxi) backend mode: generate operators in _metax/ops/")
```

#### 改动 2: 配置选择（run 函数开头）

```python
is_metax = getattr(args, "metax", False)
flaggems_dir = config.get("flaggems_dir", ...)

# 模板选择
if is_metax:
    template_name = config.get("metax", {}).get("template", "templates/generate_op_metax.md")
else:
    template_name = config.get("template", "templates/generate_op.md")
template_path = os.path.join(script_dir, template_name)

# 算子列表选择
if is_metax and not args.ops_list:
    ops_list_name = config.get("metax", {}).get("ops_list", "ops_list_metax.txt")
else:
    ops_list_name = "ops_list.txt"
ops_list_path = args.ops_list or os.path.join(script_dir, ops_list_name)
```

#### 改动 3: `check_worktree_has_changes()` 函数

```python
def check_worktree_has_changes(worktree_path: str, operator: str, metax: bool = False) -> bool:
    if metax:
        op_file = os.path.join(worktree_path, "src", "flag_gems", "runtime", "backend",
                               "_metax", "ops", f"{operator}.py")
    else:
        op_file = os.path.join(worktree_path, "src", "flag_gems", "ops", f"{operator}.py")
```

#### 改动 4: `parse_cc_result()` 函数

```python
def parse_cc_result(proc: subprocess.Popen, operator: str, worktree_path: str = None,
                    metax: bool = False) -> dict:
```

以及调用处传递 metax：
```python
result = parse_cc_result(proc, operator, worktree_path, metax=is_metax)
```

以及 fallback 分支传递 metax：
```python
if proc.returncode == 0 and worktree_path and check_worktree_has_changes(
    worktree_path, operator, metax=metax):
```

#### 改动 5: summary 文件带时间戳

每次运行的结果文件不再覆盖，而是带时间戳：

```python
# 改前：固定文件名和目录，每次运行会覆盖
summary_path = os.path.join(results_dir, "summary.json")
log_dir = os.path.join(results_dir, "logs")

# 改后：带时间戳，如 summary_20260511_1124.json、logs_20260511_1124/
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
summary_path = os.path.join(results_dir, f"summary_{timestamp}.json")
log_dir = os.path.join(results_dir, f"logs_{timestamp}")
```

---

## 4. fix_worktree_import.py 修复导入路径

### 4.1 问题背景

`flag_gems` 以 editable 模式全局安装于 `/root/FlagGems/src/`，通过 `_flag_gems_editable` import hook 拦截所有 `import flag_gems`。即使 `sys.path.insert(0, 'src')` 指向 worktree，Python 仍加载全局版本，导致 worktree 中新建的 `_metax/ops/*.py` 不可见。

### 4.2 解决方案

`fix_worktree_import.py` 提供三种使用方式：

```bash
# 方式 1：-c 模式（运行 Python 代码）
cd {{WORK_DIR}}
{{PYTHON_PATH}} /root/JudeWorkplace/auto_gen/fix_worktree_import.py -c "import flag_gems; print(flag_gems.__file__)"

# 方式 2：--pytest 模式（运行 pytest）
cd {{WORK_DIR}}
{{PYTHON_PATH}} /root/JudeWorkplace/auto_gen/fix_worktree_import.py --pytest tests/test_xxx.py -m op -vs

# 方式 3：PYTHONSTARTUP 环境变量
PYTHONSTARTUP=/root/JudeWorkplace/auto_gen/fix_worktree_import.py {{PYTHON_PATH}} -c "..."
```

### 4.3 脚本逻辑

1. **自动检测 worktree 根目录**：从 CWD 向上查找含 `src/flag_gems/` 的目录
2. **移除全局路径**：过滤 `sys.path` 中所有 `/root/FlagGems` 条目
3. **移除 editable hook**：清除 `_flag_gems_editable` meta_path 钩子
4. **优先 worktree**：将检测到的 worktree 目录插入 `sys.path` 最前端
5. **清除缓存**：删除 `sys.modules` 中所有 `flag_gems` 相关缓存
6. **设置环境变量**：设 `FLAG_GEMS_WORKTREE` 供其他工具使用

### 4.4 重要约束

- **必须 `cd {{WORK_DIR}}` 后才执行**，脚本依赖 CWD 自动检测
- 不要在命令中额外 `sys.path.insert` — 脚本已完整处理
- 支持环境变量 `FIX_WORKTREE_DIR` 手动覆盖 worktree 路径

---

## 5. 模板命令更新

> **日期**: 2026-05-11  
> **变更**: 将 `generate_op_metax.md` 中的过时 `exec/split` 模式替换为 `fix_worktree_import.py` 的 `-c` / `--pytest` 模式

### 5.1 旧写法（已废弃）

```bash
# 复杂、易出错的 exec/split 方式
python3 -c "
exec(open('/root/JudeWorkplace/auto_gen/fix_worktree_import.py').read().split('# ===')[0])
import flag_gems
# ...
"
```

### 5.2 新写法

```bash
# 简洁的 -c 模式
cd {{WORK_DIR}}
{{PYTHON_PATH}} /root/JudeWorkplace/auto_gen/fix_worktree_import.py -c "import flag_gems; print(flag_gems.__file__)"

# 简洁的 --pytest 模式
cd {{WORK_DIR}}
{{PYTHON_PATH}} /root/JudeWorkplace/auto_gen/fix_worktree_import.py --pytest tests/TEST_FILE.py -m {{OPERATOR}} -vs --log-cli-level=DEBUG
```

### 5.3 模板中更新的具体位置

| 模板位置 | 旧内容 | 新内容 |
|---------|--------|--------|
| "修复 flag_gems 导入路径" 章节 | exec/split 方式 A/B | `-c` / `--pytest` 模式 |
| Step 6 测试运行命令 | 内联 python -c + exec/split | `--pytest` 单行命令 |
| Step 6 验证导入命令 | 内联 python -c + exec/split | `-c` 单行命令 |

---

## 6. 完整运行流程

### 6.1 沐曦模式

```bash
# Step 1: 如果 Excel 有更新，先重新提取失败算子
python3 auto_gen/extract_metax_failed_ops.py

# Step 2: 运行沐曦算子生成
cd /root/JudeWorkplace/auto_gen
python orchestrator.py --metax

# 也可以指定自定义列表
python orchestrator.py --metax my_ops_list.txt
```

### 6.2 执行流程

```
1. orchestrator.py 读取 config.yaml
   └─ is_metax=True → 选择 metax 配置
2. 加载 ops_list_metax.txt（168 个算子）
3. 对每个算子:
   a. 创建 worktree（基于 master 分支）
   b. 启动 Claude Code
   c. CC 读取 generate_op_metax.md 模板
   d. CC 在 worktree 中:
      - 创建 src/flag_gems/runtime/backend/_metax/ops/{op}.py
      - 注册到 _metax/ops/__init__.py
      - 追加测试用例
      - 运行 pytest
   e. 解析结果，更新 summary.json
4. 输出最终报告
```

### 6.3 沐曦 worktree 目录结构

```
FlagGems_minimax_2_7/.worktrees/gen-{operator}/
├── src/flag_gems/
│   ├── ops/                        # 通用算子（master 已有，不动）
│   │   ├── __init__.py
│   │   └── ...
│   └── runtime/backend/_metax/
│       ├── __init__.py
│       ├── tune_configs.yaml
│       └── ops/
│           ├── __init__.py         # 注册沐曦特化算子
│           ├── sigmoid.py          # 已有参考实现
│           ├── addmm.py
│           ├── ...
│           └── {operator}.py       # CC 新建
├── tests/
│   └── test_xxx_ops.py             # CC 追加测试
└── benchmark/
    └── test_xxx_perf.py            # CC 追加 benchmark
```

---

## 7. 迁移到其他国产芯片的指南

如果要将这套机制迁移到其他国产芯片（如华为昇腾、寒武纪、海光等），需要做以下修改：

### 5.1 核心思路

每个国产芯片对应 `migrate_to_new_chip(brand_name)`：

```python
# 伪代码：迁移到新芯片的核心逻辑
def migrate_to_new_chip(brand_name: str, backend_path: str):
    """
    brand_name:  芯片品牌名，如 "ascend", "cambricon", "hygon"
    backend_path: 后端代码路径，如 "src/flag_gems/runtime/backend/_ascend/ops/"
    """
    changes = {
        # 1. 创建模板
        "templates/generate_op_metax.md"
            → f"templates/generate_op_{brand_name}.md",
        
        # 2. 修改 config.yaml
        f"""
        {brand_name}:
          template: templates/generate_op_{brand_name}.md
          ops_list: ops_list_{brand_name}.txt
        """,
        
        # 3. 修改 orchestrator.py 中的路径逻辑
        #    将 "_metax" 替换为 backend_path 中的目录名
    }
```

### 5.2 具体修改清单

#### Step 1: 创建模板

- 复制 `templates/generate_op_metax.md` → `templates/generate_op_{brand}.md`
- 将模板中所有 `_metax` 替换为对应后端目录名
- 修改参考实现路径、device 管理方式、约束条件等

#### Step 2: 修改 `config.yaml`

```yaml
{brand}:
  template: templates/generate_op_{brand}.md
  ops_list: ops_list_{brand}.txt
```

#### Step 3: 修改 `orchestrator.py`

需要在 4 个地方进行替换：

| 位置 | 需要修改的内容 |
|------|--------------|
| `run()` 中模板选择 | 增加新的 chip 分支 |
| `run()` 中算子列表选择 | 增加新的 chip 分支 |
| `check_worktree_has_changes()` | 增加新 chip 的路径检查 |
| `parse_cc_result()` | 传递新 chip 的 metax 参数（接口不变） |

**推荐方案**：将 `is_metax` 扩展为通用 `backend` 参数：

```python
# 更好的设计
parser.add_argument("--backend", choices=["nvidia", "metax", "ascend", ...],
                    default="nvidia",
                    help="Backend type for operator generation")

# backend 配置表
BACKEND_CONFIG = {
    "nvidia": {
        "template": "templates/generate_op.md",
        "ops_list": "ops_list.txt",
        "op_subdir": "ops",
    },
    "metax": {
        "template": "templates/generate_op_metax.md",
        "ops_list": "ops_list_metax.txt",
        "op_subdir": "runtime/backend/_metax/ops",
    },
    # 新芯片加在这里
    "ascend": {
        "template": "templates/generate_op_ascend.md",
        "ops_list": "ops_list_ascend.txt",
        "op_subdir": "runtime/backend/_ascend/ops",
    },
}
```

#### Step 4: 提取失败算子

- 修改 `extract_metax_failed_ops.py` 中 Excel 的列号映射
- 或创建新的提取脚本

### 5.3 各芯片后端路径参考

| 芯片 | FlagGems 后端路径 |
|------|------------------|
| 沐曦 (Metax/Muxi) | `runtime/backend/_metax/ops/` |
| 华为昇腾 (Ascend) | `runtime/backend/_ascend/ops/` |
| 寒武纪 (Cambricon) | `runtime/backend/_camb/ops/` |
| 海光 (Hygon/DCU) | `runtime/backend/_hygon/ops/` |
| 壁仞 (Biren) | `runtime/backend/_biren/ops/` |
| 摩尔线程 (Moore Threads) | `runtime/backend/_mthreads/ops/` |
| 天数智芯 (Iluvatar) | `runtime/backend/_iluvatar/ops/` |
| 燧原 (Enflame) | `runtime/backend/_enflame/ops/` |

---

## 8. 常见问题

### Q1: 为什么 worktree 会被覆盖？

`create_worktree()` 每次都会强制删除并重新创建 worktree。这是设计如此——因为 master 分支已有通用算子实现，用于沐曦特化的 worktree 只是一个临时工作区。改完后代码在 `_metax/ops/` 中，需要手动合入 master 或推送。

### Q2: 为什么在沐曦模式下不改 `_FULL_CONFIG`？

沐曦后端通过 `runtime.replace_customized_ops()` 自动替换算子，不需要修改 `_FULL_CONFIG`。只用在 `_metax/ops/__init__.py` 注册即可。

### Q3: ops_list_metax.txt 中 Sheet 6 和 Sheet 7 的算子如何处理？

- Sheet 6 的算子（`_to_copy`, `If`, `Cast` 等）可能不是标准 PyTorch Triton 算子，CC 在生成时可能需要特殊处理
- Sheet 7 的算子（`Fused_Softmax`, `GroupNorm` 等）是融合算子，可能已有沐曦特化版本
- 建议首次运行时先用 Sheet 1~5 的算子做测试，确认 CC 能正常工作

### Q4: 如何在沐曦机器上运行？

```
# 1. 拷贝 auto_gen 目录到沐曦机器
# 2. 确保配置好 ANTHROPIC_API_KEY（已在 .env 中）
# 3. 运行
python3 orchestrator.py --metax
```

### Q5: NVIDIA 模板和沐曦模板能否共用？

不能。两个模板的目标路径、注册方式、参考代码完全不同。必须根据 `--metax` 标志选择正确的模板。
