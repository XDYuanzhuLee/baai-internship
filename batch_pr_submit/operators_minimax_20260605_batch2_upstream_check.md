# Minimax Batch 2 Upstream Check

Checked against `upstream/master` in `/workspace/FlagGems_minimax_2_7`.

## Already Present Upstream

- `gcd` - `_FULL_CONFIG gcd`, `src/flag_gems/ops/gcd.py`
- `normal_` - `_FULL_CONFIG normal_`, `src/flag_gems/ops/normal.py`
- `avg_pool3d_backward` - `_FULL_CONFIG avg_pool3d_backward`
- `_conv_depthwise2d` - `_FULL_CONFIG _conv_depthwise2d`, `src/flag_gems/ops/conv_depthwise2d.py`

## Pending

- `linear`
- `_amp_foreach_non_finite_check_and_unscale_`
- `special_shifted_chebyshev_polynomial_u`
- `_prelu_kernel_backward`
- `channel_shuffle`
- `special_log_softmax`
- `_linalg_eigvals`
- `unbind_copy`
- `index_reduce`
- `mvlgamma_`
- `broadcast_tensors`
- `special_hermite_polynomial_h`
- `_fused_adam`
- `index_select_backward`
- `_jagged_to_padded_dense_forward`
- `_upsample_bilinear2d_aa`

Note: upstream has ordinary `_log_softmax` / `log_softmax`, but no separate `special_log_softmax` / `special.log_softmax` registration was found.
