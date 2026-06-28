#!/bin/bash
# 一键启动：自动创建虚拟环境、安装依赖、启动服务
cd "$(dirname "$0")"

# 创建 venv（如果不存在）
if [ ! -d ".venv" ]; then
  echo "→ 创建 Python 虚拟环境..."
  python3 -m venv .venv
fi

# 激活 venv
source .venv/bin/activate

# 安装依赖（如果未安装）
if [ ! -f ".venv/.installed" ]; then
  echo "→ 安装依赖..."
  pip install -q -r requirements.txt
  touch .venv/.installed
fi

# 启动服务
echo "→ 启动服务..."
python server.py
