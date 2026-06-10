| 2026-06-08 10:25 | linalg_multi_dot | FAIL | 本地测试失败: 3/envs/zy_dv/lib/python3.12/subprocess.py:2053: in _wait     (pid, sts) = self._try_wait(0)  |
| 2026-06-08 10:26 | lcm_ | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3881 |
| 2026-06-08 10:29 | linalg_multi_dot | FAIL | 命令失败 (exit 1): python /workspace/.claude/skills/flaggems-pr-submit/scripts/check_operator.py linalg_ |
| 2026-06-08 10:31 | linalg_multi_dot | FAIL | benchmark 失败:          E                       offs_m = pid_m * BM + tl.arange(0, BM) E              |
| 2026-06-08 10:31 | broadcast_to | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3882 |
| 2026-06-08 10:49 | linalg_multi_dot | FAIL | 命令失败 (exit 1): python /workspace/.claude/skills/flaggems-pr-submit/scripts/check_operator.py linalg_ |
| 2026-06-08 10:49 | linalg_multi_dot | FAIL | pre-commit 3 次尝试后仍失败 |
| 2026-06-08 10:50 | linalg_multi_dot | LOW_SPEEDUP | 平均 speedup 0.496 低于阈值 0.6，继续提交，仅作为性能提醒 |
| 2026-06-08 10:50 | linalg_multi_dot | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3884 |
| 2026-06-08 10:55 | expand | FAIL | benchmark 无数据（0 case），请检查 benchmark 文件 |
| 2026-06-08 11:00 | unsqueeze | FAIL | benchmark 无数据（0 case），请检查 benchmark 文件 |
| 2026-06-08 11:03 | expand | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3885 |
| 2026-06-08 11:33 | unsqueeze | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3886 |
| 2026-06-08 12:14 | _sparse_semi_structured_addmm | FAIL | 本地测试失败: ================ _______________ test_sparse_semi_structured_addmm[dtype0-shape0] __________ |
| 2026-06-08 12:17 | _sparse_semi_structured_addmm | FAIL | 本地测试失败:         if dtype is None:             dtype = torch.float32         assert res.dtype == dtyp |
| 2026-06-08 12:19 | _sparse_semi_structured_addmm | FAIL | 本地测试失败: type is None:             dtype = torch.float32         assert res.dtype == dtype         re |
| 2026-06-08 12:23 | _sparse_semi_structured_addmm | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3888 |
| 2026-06-08 12:37 | diagonal_copy | FAIL | 本地测试失败: ImportError while loading conftest '/tmp/flaggems_agent_worktrees/agent_aten_diagonal_copy_1 |
| 2026-06-08 12:39 | diagonal_copy | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3889 |
| 2026-06-08 13:32 | _upsample_bilinear2d_aa_backward | FAIL | 本地测试失败: ImportError while loading conftest '/tmp/flaggems_agent_worktrees/agent_aten__upsample_bilin |
| 2026-06-08 13:36 | _upsample_bilinear2d_aa_backward | FAIL | 本地测试失败:        dtype = torch.float32         assert res.dtype == dtype         ref = ref.to(dtype)   |
| 2026-06-08 13:57 | _conj | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3891 |
| 2026-06-08 13:59 | _upsample_bilinear2d_aa_backward | FAIL | 本地测试失败:        dtype = torch.float32         assert res.dtype == dtype         ref = ref.to(dtype)   |
| 2026-06-08 14:25 | _unsafe_view | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3892 |
| 2026-06-08 14:40 | _sparse_semi_structured_mm | FAIL | 本地测试失败: ==================== FAILURES =================================== ________________ test_spar |
| 2026-06-08 14:43 | _sparse_semi_structured_mm | FAIL | 本地测试失败: ):         if dtype is None:             dtype = torch.float32         assert res.dtype == d |
| 2026-06-08 14:49 | _sparse_semi_structured_mm | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3893 |
| 2026-06-08 15:06 | linalg_pinv | FAIL | 本地测试失败: ImportError while loading conftest '/tmp/flaggems_agent_worktrees/agent_aten_linalg_pinv_100 |
| 2026-06-08 15:11 | linalg_cholesky | FAIL | 本地测试失败: ImportError while loading conftest '/tmp/flaggems_agent_worktrees/agent_aten_linalg_cholesky |
| 2026-06-08 15:23 | linalg_cholesky | FAIL | 本地测试失败: ImportError while loading conftest '/tmp/flaggems_agent_worktrees/agent_aten_linalg_cholesky |
| 2026-06-08 15:28 | linalg_cholesky | LOW_SPEEDUP | 平均 speedup 0.502 低于阈值 0.6，继续提交，仅作为性能提醒 |
| 2026-06-08 15:28 | linalg_cholesky | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3894 |
| 2026-06-08 15:33 | linalg_pinv | FAIL | 命令失败 (exit 1): python /workspace/.claude/skills/flaggems-pr-submit/scripts/check_operator.py linalg_ |
| 2026-06-09 03:48 | _functional_sym_constrain_range | LOW_SPEEDUP | 平均 speedup 0.498 低于阈值 0.6，继续提交，仅作为性能提醒 |
| 2026-06-09 03:49 | _functional_sym_constrain_range | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3899 |
| 2026-06-09 03:51 | _embedding_bag_dense_backward | FAIL | 命令失败 (exit 1): git push fork-xdy HEAD:pr/_embedding_bag_dense_backward |
| 2026-06-09 03:53 | _embedding_bag_dense_backward | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3900 |
| 2026-06-09 03:54 | _pdist_backward | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3902 |
| 2026-06-09 04:00 | _thnn_fused_lstm_cell | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3904 |
| 2026-06-09 04:03 | _prelu_kernel | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3905 |
| 2026-06-09 04:10 | _thnn_fused_lstm_cell_backward_impl | LOW_SPEEDUP | 平均 speedup 0.554 低于阈值 0.6，继续提交，仅作为性能提醒 |
| 2026-06-09 04:10 | adaptive_max_pool3d_backward | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3906 |
| 2026-06-09 04:10 | _thnn_fused_lstm_cell_backward_impl | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3907 |
| 2026-06-09 04:19 | amin | FAIL | 本地测试失败:  =================================== _______________________ test_amin_[dtype0-True-0-shape0 |
| 2026-06-09 04:19 | amin | FAIL | 本地测试失败: ______________  shape = (1, 2), dim = 0, keepdim = True, dtype = torch.float16      @pytest. |
| 2026-06-09 04:21 | alpha_dropout | LOW_SPEEDUP | 平均 speedup 0.533 低于阈值 0.6，继续提交，仅作为性能提醒 |
| 2026-06-09 04:21 | amin | FAIL | 本地测试失败: pdim = True, dtype = torch.float16      @pytest.mark.amin_     @pytest.mark.parametrize("kee |
| 2026-06-09 04:21 | alpha_dropout | FAIL | 命令失败 (exit 1): git push fork-xdy HEAD:pr/alpha_dropout |
| 2026-06-09 04:22 | amin | FAIL | 命令失败 (exit 1): python /workspace/.claude/skills/flaggems-pr-submit/scripts/check_operator.py amin -- |
| 2026-06-09 04:23 | alpha_dropout | LOW_SPEEDUP | 平均 speedup 0.528 低于阈值 0.6，继续提交，仅作为性能提醒 |
| 2026-06-09 04:23 | alpha_dropout | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3908 |
| 2026-06-09 04:29 | amin | FAIL | 本地测试失败:  object of type 'int' has no len()  src/flag_gems/ops/amin.py:165: TypeError =============== |
| 2026-06-09 04:30 | amin | FAIL | 本地测试失败:        # Respect PyTorch behaviour: empty tensors should still validate broadcast.           |
| 2026-06-09 04:32 | amin | FAIL | 本地测试失败: .6680],         [-2.3359, -2.3359, -2.3359,  ..., -2.335...6],         [-2.6699, -2.6699, -2 |
| 2026-06-09 04:34 | amin | FAIL | benchmark 失败: e", consts.FLOAT_DTYPES)     def test_amin_(dtype):         bench = base.GenericBenchm |
| 2026-06-09 04:38 | amin | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3909 |
| 2026-06-09 04:39 | arccos | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3910 |
| 2026-06-09 04:45 | arccos_ | FAIL | benchmark 失败:  benchmark/test_arccos_.py __________________ ImportError while importing test module  |
| 2026-06-09 04:46 | arccos_ | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3911 |
| 2026-06-09 04:54 | arcsin | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3912 |
| 2026-06-09 04:55 | arcsin_ | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3913 |
| 2026-06-09 05:06 | asin | FAIL | 本地测试失败: ype is None:             dtype = torch.float32         assert res.dtype == dtype         ref |
| 2026-06-09 05:07 | asin | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3915 |
| 2026-06-09 05:08 | asin_ | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3916 |
| 2026-06-09 05:22 | clone | LOW_SPEEDUP | 平均 speedup 0.493 低于阈值 0.6，继续提交，仅作为性能提醒 |
| 2026-06-09 05:22 | clone | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3917 |
| 2026-06-09 05:35 | dequantize | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3918 |
| 2026-06-09 05:45 | Concat | FAIL | benchmark 无数据（0 case），请检查 benchmark 文件 |
| 2026-06-09 05:49 | erfinv_ | FAIL | benchmark 失败:    def __getattr__(name):         # Deprecated attrs         replacement = _deprecated |
| 2026-06-09 05:50 | erfinv_ | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3919 |
| 2026-06-09 05:57 | Concat | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3920 |
| 2026-06-09 06:09 | greater_equal | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3922 |
| 2026-06-09 06:14 | isposinf | FAIL | 命令失败 (exit 1): python /workspace/.claude/skills/flaggems-pr-submit/scripts/check_operator.py isposin |
| 2026-06-09 06:18 | isposinf | FAIL | 命令失败 (exit 1): python /workspace/.claude/skills/flaggems-pr-submit/scripts/check_operator.py isposin |
| 2026-06-09 06:26 | isposinf | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3923 |
| 2026-06-09 07:02 | less_equal | LOW_SPEEDUP | 平均 speedup 0.594 低于阈值 0.6，继续提交，仅作为性能提醒 |
| 2026-06-09 07:03 | less_equal | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3927 |
| 2026-06-09 07:06 | kthvalue | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3928 |
| 2026-06-09 07:17 | lgamma | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3929 |
| 2026-06-09 07:22 | lgamma_ | PR_CREATED | https://github.com/flagos-ai/FlagGems/pull/3930 |
