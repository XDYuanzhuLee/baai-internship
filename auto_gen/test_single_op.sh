#!/bin/bash
# 测试单个算子的脚本

# 使用方法: ./test_single_op.sh operator_name
# 例如: ./test_single_op.sh relu

if [ -z "$1" ]; then
    echo "用法: $0 <operator_name>"
    echo "例如: $0 relu"
    exit 1
fi

OPERATOR=$1

# 创建临时算子列表
echo "$OPERATOR" > ops_list_test.txt

echo "=========================================="
echo "测试算子: $OPERATOR"
echo "=========================================="
echo ""

# 运行 orchestrator
python3 orchestrator.py --ops-list ops_list_test.txt

echo ""
echo "=========================================="
echo "测试完成！"
echo "=========================================="
echo ""
echo "查看结果："
echo "  日志文件: results/logs/${OPERATOR}.log"
echo "  JSONL: results/logs/${OPERATOR}.jsonl"
echo "  时间线: results/timelines/${OPERATOR}_timeline.txt"
echo "  摘要: results/summary.json"
echo ""
echo "快速查看命令："
echo "  tail -100 results/logs/${OPERATOR}.log"
echo "  tail -20 results/logs/${OPERATOR}.jsonl"
echo "  cat results/timelines/${OPERATOR}_timeline.txt"