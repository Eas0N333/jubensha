#!/usr/bin/env bash
#
# 更新已部署的服务：拉代码 → 重装依赖 → 重启
#
#   cd /opt/online-story && sudo bash deploy/update.sh
#
# 注意：重启会结束所有进行中的房间（房间状态在内存里，没有持久化）。

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="online-story"

c_reset='\033[0m'; c_ok='\033[32m'; c_warn='\033[33m'; c_step='\033[36m'
step() { printf "\n${c_step}▶ %s${c_reset}\n" "$*"; }
ok()   { printf "  ${c_ok}✓${c_reset} %s\n" "$*"; }
warn() { printf "  ${c_warn}!${c_reset} %s\n" "$*"; }

cd "$PROJECT_DIR"

step "1/4 拉取最新代码"
if [ -d .git ]; then
  BEFORE="$(git rev-parse --short HEAD)"
  git pull --ff-only
  AFTER="$(git rev-parse --short HEAD)"
  if [ "$BEFORE" = "$AFTER" ]; then ok "已经是最新的（$AFTER）"; else ok "$BEFORE → $AFTER"; fi
else
  warn "不是 git 仓库，跳过拉取（手动覆盖文件后继续）"
fi

step "2/4 安装依赖"
if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
ok "依赖就绪"

step "3/4 重启服务"
if systemctl list-unit-files | grep -q "^${SERVICE_NAME}\.service"; then
  systemctl restart "$SERVICE_NAME"
  sleep 2
  systemctl is-active --quiet "$SERVICE_NAME" && ok "服务已重启" || {
    warn "服务没起来，看日志：journalctl -u $SERVICE_NAME -n 50 --no-pager"; exit 1; }
else
  warn "没找到 systemd 服务 $SERVICE_NAME。如果用的是 Docker，请改用："
  warn "  docker compose up -d --build"
  exit 0
fi

step "4/4 健康检查"
PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 || true)"
PORT="${PORT:-5178}"
if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  ok "健康检查通过（端口 $PORT）"
else
  warn "健康检查没通过，看日志：journalctl -u $SERVICE_NAME -n 50 --no-pager"
  exit 1
fi
