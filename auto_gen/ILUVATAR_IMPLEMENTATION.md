# 天数(Iluvatar/Tianshu)特化算子自动生成 — 实现文档

> 基于沐曦(Metax/Muxi)方案改造，适配天数 GPU 后端。  
> 运行命令：`cd /root/JudeWorkplace/auto_gen && python orchestrator.py --iluvatar`

---

## 一、文件清单

| # | 文件 | 类型 | 行数 | 说明 |
|---|------|------|------|------|
| 1 | `templates/generate_op_iluvatar.md` | 新建 | 490 | Claude Code prompt 模板（天数专用） |
| 2 | `config.yaml` | 修改 | 45 | 新增 `iluvatar:` 配置段（2行） |
| 3 | `ops_list_iluvatar.txt` | 新建 | 151 | 天数失败算子列表（150个去重算子） |
| 4 | `orchestrator.py` | 修改 | 752 | 新增 `--iluvatar` CLI + 8处条件分支 |
| 5 | `extract_iluvatar_failed_ops.py` | 新建 | 190 | 从 Excel 提取天数失败算子 |

---

## 二、各文件改动详解

### 2.1 `config.yaml` — 新增 iluvatar 配置段

**位置**：文件末尾，第42-45行（在 metax 配置段之后）

```yaml
# Iluvatar (Tianshu GPU) backend configuration
iluvatar:
  template: templates/generate_op_iluvatar.md
  ops_list: ops_list_iluvatar.txt
```

**作用**：
- `template`：指定天数专用的 prompt 模板文件
- `ops_list`：指定天数失败算子列表文件

**查错**：如果 `--iluvatar` 模式加载了错误的模板或算子列表，检查此配置段是否正确指向相应文件。

---

### 2.2 `orchestrator.py` — 8处改动点

#### 改动点 ①：L520-L522 — 读取 `--iluvatar` 参数

```python
# 沐曦原有代码 (L520-521):
is_metax = getattr(args, "metax", False)

# 新增 (L522):
is_iluvatar = getattr(args, "iluvatar", False)
```

#### 改动点 ②：L525-L530 — 选择模板

```python
# 沐曦原有逻辑:
if is_metax:
    template_name = config.get("metax", {}).get("template", "templates/generate_op_metax.md")
else:
    template_name = config.get("template", "templates/generate_op.md")

# 新增天数分支 (L527-L528):
elif is_iluvatar:
    template_name = config.get("iluvatar", {}).get("template", "templates/generate_op_iluvatar.md")
```

**注意**：`is_iluvatar` 检查在 `is_metax` 之后。两者互斥（不会同时为 True，因为 argparse 是两个独立的 `store_true` 参数，但若同时传入则 metax 优先）。

#### 改动点 ③：L543-L546 — 选择算子列表

```python
# 沐曦原有逻辑:
if is_metax and not args.ops_list:
    ops_list_name = config.get("metax", {}).get("ops_list", "ops_list_metax.txt")

# 新增天数分支 (L545-L546):
elif is_iluvatar and not args.ops_list:
    ops_list_name = config.get("iluvatar", {}).get("ops_list", "ops_list_iluvatar.txt")
```

#### 改动点 ④：L241-L248 — `check_worktree_has_changes()`

```python
def check_worktree_has_changes(worktree_path, operator, metax=False, iluvatar=False):
    if metax:
        op_file = ... "_metax/ops/{operator}.py"
    elif iluvatar:                                          # 新增
        op_file = ... "_iluvatar/ops/{operator}.py"         # 新增
    else:
        op_file = ... "ops/{operator}.py"
```

**作用**：检查 CC 是否在正确的后端路径下生成了算子文件。天数检查 `_iluvatar/ops/` 路径。

#### 改动点 ⑤：L261 — `parse_cc_result()` 签名

```python
# 原来:
def parse_cc_result(proc, operator, worktree_path=None, metax=False):
# 改为:
def parse_cc_result(proc, operator, worktree_path=None, metax=False, iluvatar=False):
```

#### 改动点 ⑥：L300 — `parse_cc_result()` 内的 fallback 检查

```python
# 原来:
if proc.returncode == 0 and worktree_path and check_worktree_has_changes(
    worktree_path, operator, metax=metax
):
# 改为:
if proc.returncode == 0 and worktree_path and check_worktree_has_changes(
    worktree_path, operator, metax=metax, iluvatar=iluvatar
):
```

#### 改动点 ⑦：L647 — 调用 parse_cc_result 时传入 iluvatar 参数

```python
# 原来:
result = parse_cc_result(proc, operator, worktree_path, metax=is_metax)
# 改为:
result = parse_cc_result(proc, operator, worktree_path, metax=is_metax, iluvatar=is_iluvatar)
```

#### 改动点 ⑧：L736 — argparse 新增 `--iluvatar` 参数

```python
parser.add_argument("--metax", action="store_true", 
    help="Metax (Muxi) backend mode: generate operators in _metax/ops/")
parser.add_argument("--iluvatar", action="store_true",     # 新增
    help="Iluvatar (Tianshu) backend mode: generate operators in _iluvatar/ops/")
```

---

### 2.3 `templates/generate_op_iluvatar.md` — 天数专用 Prompt 模板

**与沐曦模板 `generate_op_metax.md` 的关键差异**：

| 差异项 | 沐曦模板 | 天数模板 |
|--------|----------|----------|
| 后端路径 | `_metax/ops/` | `_iluvatar/ops/` |
| 参考算子 | `sigmoid.py` | `div.py` |
| Logger 前缀 | `"METAX GEMS ..."` | `"ILUVATAR GEMS ..."` |
| Triton API | `tle.program_id()`（需 `triton_lang_extension`） | `tl.program_id()`（标准 Triton） |
| GPU 管理 | 无特殊步骤 | **杀残留进程**（pkill）+ ixsmi 重置 |
| 测试前检查 | 无 | **pytest marker 大小写校验**（grep） |
| import 环境修复 | `fix_worktree_import.py` | 同（共用） |

**Step 流程概览**：

| Step | 内容 | 天数特有 |
|------|------|----------|
| 1 | 了解算子语义（help + aten schema） | — |
| 2 | 阅读参考代码 | 参考 `div.py` 而非 `sigmoid.py` |
| 3 | 实现特化算子 | 使用标准 Triton API |
| 3.5 | 验证真实 Triton 实现 | — |
| 4 | 注册算子（`__init__.py`） | — |
| 5 | 编写 accuracy 测试 | marker 大小写校验 |
| 6 | 运行 accuracy 测试 | 杀残留进程 + 确认 marker |
| 6.5 | 提交代码 | — |
| 7 | benchmark | — |
| 8 | 输出 JSON | — |

**天数特有约束（第488-493行）**：

```
12. 天数标准 Triton API：使用 tl.program_id() 而非 tle.program_id()
13. 测试前杀残留进程：必须先执行 pkill -f 清理残留 CUDA 上下文
14. 确认 marker 大小写：运行测试前先用 grep 确认 pytest marker 名称
```

---

### 2.4 `ops_list_iluvatar.txt` — 天数失败算子列表

**来源**：从 `TianshuOperatorTest/第一批及格算子国产GPU测试.xlsx` 的 "天数测试结果" 列中提取。

**提取逻辑**（见 `extract_iluvatar_failed_ops.py`）：
- 结果列为 `"失败"` → 精度失败，纳入列表
- 结果列为 `"跳过"` → 跳过，纳入列表
- 结果列为 `"成功"` 或空 → 不纳入
- 结果列为数字（如 `"1.0088"`） → 通过，不纳入

**当前列表**：150 个去重算子（覆盖全部3个 sheet：1~5、6、7）。

**格式**：每行一个算子名，自动去除 `aten::` 前缀和 `.Tensor` 等重载后缀。支持以 `#` 开头的注释行。

---

### 2.5 `extract_iluvatar_failed_ops.py` — Excel 提取脚本

**用法**：

```bash
# 默认路径（自动查找 Excel 和输出位置）
python extract_iluvatar_failed_ops.py

# 指定输入输出
python extract_iluvatar_failed_ops.py -i "TianshuOperatorTest/第一批及格算子国产GPU测试.xlsx" -o ops_list_iluvatar.txt

# 指定 sheet
python extract_iluvatar_failed_ops.py -s "1~5"
```

**Excel 结构**（3个 sheet，每 sheet 4列）：

| 列 | 内容 | 示例 |
|----|------|------|
| A | 算子名称 | `abs`, `aten::add.Tensor` |
| B | 生成加速比 | `1.0088` |
| C | 天数测试结果 | `失败`, `成功`, `跳过`, `1.0088` |
| D | 失败原因 | 文本描述 |

**列检测逻辑**：
1. 优先匹配表头含 `"算子"` + `"名称"` 的列为算子列
2. 优先匹配表头含 `"天数测试结果"` 或 `"测试结果"` 的列为结果列
3. 回退：算子列匹配含 `"算子"` 的列，结果列默认为索引 2

**查错**：
- 如果提取数量不对，检查列检测输出 `Columns found: op_col=X, result_col=Y`
- sheet "1~5" 的算子列表头为 `（前五批第二次操作）\n算子名称`（含换行符），脚本已处理此情况

---

## 三、数据流 / 执行流程

```
python orchestrator.py --iluvatar
  │
  ├─ 1. load_config("config.yaml")
  │     ├─ is_iluvatar = True (from args)
  │     ├─ template = config["iluvatar"]["template"]  → "templates/generate_op_iluvatar.md"
  │     └─ ops_list = config["iluvatar"]["ops_list"]  → "ops_list_iluvatar.txt"
  │
  ├─ 2. load_ops_list("ops_list_iluvatar.txt")
  │     └─ 150 个算子名
  │
  ├─ 3. For each operator:
  │     ├─ create_worktree()       → .worktrees/gen-{op}/
  │     ├─ render_template()       → 替换 {{OPERATOR}}, {{GPU_ID}}, {{WORK_DIR}}, {{PYTHON_PATH}}
  │     ├─ launch_cc()             → claude -p <prompt> --dangerously-skip-permissions
  │     └─ CC executes:
  │           ├─ Step 1-2: 了解算子 + 阅读 div.py
  │           ├─ Step 3:   创建 _iluvatar/ops/{op}.py
  │           ├─ Step 3.5: grep 验证 @triton 装饰器
  │           ├─ Step 4:   注册到 _iluvatar/ops/__init__.py
  │           ├─ Step 5:   编写测试（含 marker 校验）
  │           ├─ Step 6:   杀残留进程 → 确认 marker → pytest
  │           ├─ Step 6.5: git commit
  │           ├─ Step 7:   benchmark
  │           └─ Step 8:   输出 JSON
  │
  ├─ 4. parse_cc_result(iluvatar=True)
  │     ├─ 解析 .jsonl 中的 JSON 结果
  │     └─ fallback: check_worktree_has_changes(iluvatar=True)
  │           └─ 检查 _iluvatar/ops/{op}.py 是否存在
  │
  └─ 5. summary.json → results/summary_{timestamp}.json
```

---

## 四、天数 vs 沐曦 — 完整差异对照表

| 项目 | 沐曦 | 天数 |
|------|------|------|
| **CLI 参数** | `--metax` | `--iluvatar` |
| **后端目录** | `runtime/backend/_metax/ops/` | `runtime/backend/_iluvatar/ops/` |
| **配置段** | `config.yaml → metax:` | `config.yaml → iluvatar:` |
| **模板** | `templates/generate_op_metax.md` | `templates/generate_op_iluvatar.md` |
| **算子列表** | `ops_list_metax.txt` | `ops_list_iluvatar.txt` |
| **参考算子** | `sigmoid.py`（已存在） | `div.py`（已存在） |
| **Triton API** | `tle.program_id()` | `tl.program_id()` |
| **Logger 前缀** | `"METAX GEMS"` | `"ILUVATAR GEMS"` |
| **GPU 重置** | 无 | `ixsmi -r`（模板含此步骤） |
| **杀残留进程** | 无 | `pkill -f multiprocessing.spawn` 等 |
| **marker 校验** | 无 | `grep @pytest.mark` 确认大小写 |
| **导入修复** | `fix_worktree_import.py` | 同（共用） |
| **device_name** | `"metax"` | `"cuda"`（天数） |
| **triton_lang_extension** | 需要 import | 不需要 |
| **预算** | 同 | `10000000.0` USD/op |
| **超时** | 同 | `9600` 秒 |
| **重试** | 同 | `3` 次 |
| **GPU 数量** | 同 | `[0,1,2,3,4,5,6,7]` |

---

## 五、常见错误排查

### 5.1 模板加载错误

**症状**：CC 生成的代码路径不对（如生成到 `_metax/` 而非 `_iluvatar/`）

**检查**：
```bash
grep "iluvatar" auto_gen/config.yaml
# 应输出:
# iluvatar:
#   template: templates/generate_op_iluvatar.md
#   ops_list: ops_list_iluvatar.txt
```

### 5.2 算子列表为空

**症状**：`Loaded 0 operators`

**检查**：
```bash
wc -l auto_gen/ops_list_iluvatar.txt
# 应输出: 150 (或类似数字)
head -5 auto_gen/ops_list_iluvatar.txt
# 应输出算子名（不含 aten:: 前缀）
```

### 5.3 CC 生成后 check_worktree_has_changes 返回 False

**原因**：CC 可能把文件写到了错误路径。

**检查**：
```bash
# 在对应 worktree 中检查:
ls src/flag_gems/runtime/backend/_iluvatar/ops/
# 应包含 {operator}.py
```

**确认**：`orchestrator.py` L246 检查的路径为 `_iluvatar/ops/{operator}.py`。如果 CC 写到了 `_metax/ops/` 或其他位置，说明模板中的路径占位符没有被正确替换。

### 5.4 CC 进程卡死

**症状**：某个算子执行超时（超过 `timeout_per_op` 秒）

**排查步骤**：
1. 查看日志：`results/logs_{timestamp}/{operator}.log`
2. 查看 JSONL：`results/logs_{timestamp}/{operator}.jsonl`
3. 查看 timeline：`results/logs_{timestamp}/{operator}.timeline.txt`
4. 手动杀残留进程：
   ```bash
   pkill -9 -f "claude"
   pkill -9 -f "multiprocessing.spawn"
   ```

### 5.5 pytest marker 大小写不匹配

**症状**：pytest 输出 `collected 0 items` 或所有测试被跳过

**原因**：天数环境中 CSV 记录的命令可能使用 `-m And` 而实际 marker 是 `and_op`。

**解决**：模板 Step 5/6 已包含 marker 校验步骤（`grep @pytest.mark`），CC 应自动处理。

### 5.6 导入全局版本 flag_gems

**症状**：`import flag_gems` 加载的是 `/root/FlagGems/` 而非 worktree 版本

**解决**：模板中已强制要求使用 `fix_worktree_import.py`。手动验证：
```bash
cd .worktrees/gen-{op}
python /root/JudeWorkplace/auto_gen/fix_worktree_import.py -c "import flag_gems; print(flag_gems.__file__)"
```

### 5.7 提取脚本运行出错

**症状**：`extract_iluvatar_failed_ops.py` 报错或提取数量不对

**检查**：
```bash
# 确认 openpyxl 已安装
pip show openpyxl

# 确认 Excel 文件存在
ls -la TianshuOperatorTest/第一批及格算子国产GPU测试.xlsx

# 手动查看表头
python -c "
import openpyxl
wb = openpyxl.load_workbook('TianshuOperatorTest/第一批及格算子国产GPU测试.xlsx')
for s in wb.sheetnames:
    ws = wb[s]
    print(f'{s}: {[c.value for c in ws[1]]}')
"
```

### 5.8 `--iluvatar` 和 `--metax` 同时指定

**行为**：`is_metax` 检查在前（L525），因此 metax 优先。**不应同时使用两个参数**。

---

## 六、运行前检查清单

- [ ] `.env` 文件存在且包含 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL`
- [ ] `FlagGems_minimax_2_7/` 是 git 仓库且 master 分支存在
- [ ] `_iluvatar/ops/div.py` 存在（参考算子）
- [ ] `fix_worktree_import.py` 在 `auto_gen/` 下且可执行
- [ ] GPU 可用（`nvidia-smi` 或 `ixsmi`）
- [ ] `ops_list_iluvatar.txt` 有内容
- [ ] `config.yaml` 中 `iluvatar:` 段配置正确

---

## 七、输出文件说明

每次运行在 `results/` 下生成：

```
results/
├── logs_{timestamp}/
│   ├── {operator}.log          # CC stderr 日志
│   ├── {operator}.jsonl        # CC stream-json 输出
│   └── {operator}.timeline.txt # 人类可读的执行时间线
└── summary_{timestamp}.json    # 汇总结果
```

`summary.json` 结构：
```json
{
  "start_time": "2026-05-11T08:00:00+00:00",
  "end_time": "...",
  "summary": {
    "total": 150,
    "success": 0,
    "failed": 0,
    "in_progress": 0
  },
  "operators": {
    "abs": {
      "status": "success",
      "gpu_id": 0,
      "attempt": 1,
      "accuracy_passed": true,
      "duration_seconds": 123.4,
      "cc_result": { ... }
    }
  }
}