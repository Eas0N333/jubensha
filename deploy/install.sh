#!/usr/bin/env bash
#
# 一键部署脚本（Ubuntu / Debian 系）
#
#   sudo bash deploy/install.sh
#
# 也可以全自动跑（无人值守）：
#   sudo DOMAIN=game.example.com ACCESS_CODE=abc123 bash deploy/install.sh --yes
#
# 可选环境变量：
#   DOMAIN         域名（留空则用 服务器IP:端口 直连）
#   ACCESS_CODE    通行码（留空则不开）
#   PORT           端口，默认 5178
#   RUN_USER       以哪个用户跑服务，默认调用 sudo 的那个用户
#   TURN_URL / TURN_USER / TURN_PASS   自建 TURN 的凭据（留空则只配 STUN）
#   NO_NGINX=1     跳过 nginx/证书配置（比如你要自己写反代）
#   NO_SYSTEMD=1   只准备目录和依赖，不装服务（Docker 部署用得上）

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="online-story"
DRY_RUN=0
ASSUME_YES=0

# ── 输出小工具 ───────────────────────────────────────
c_reset='\033[0m'; c_dim='\033[2m'; c_ok='\033[32m'; c_warn='\033[33m'; c_err='\033[31m'; c_step='\033[36m'
step() { printf "\n${c_step}▶ %s${c_reset}\n" "$*"; }
ok()   { printf "  ${c_ok}✓${c_reset} %s\n" "$*"; }
warn() { printf "  ${c_warn}!${c_reset} %s\n" "$*"; }
die()  { printf "\n${c_err}✗ %s${c_reset}\n" "$*" >&2; exit 1; }

# 干跑模式：只打印要执行的命令
run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf "  ${c_dim}[dry-run] %s${c_reset}\n" "$*"
  else
    "$@"
  fi
}

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y)  ASSUME_YES=1 ;;
    --help|-h) usage ;;
    *) die "不认识的参数：$arg（用 --help 看用法）" ;;
  esac
done

printf "\n%s\n" "════ 线上剧本杀 · 一键部署 ════"
printf "  项目目录 %s\n" "$PROJECT_DIR"
[ "$DRY_RUN" = "1" ] && warn "干跑模式：只打印命令，不会真的改动系统"

# ── 0. 基本检查 ──────────────────────────────────────
step "0/6 检查环境"

[ -f "$PROJECT_DIR/package.json" ] || die "这里不像项目根目录（找不到 package.json）"
[ -f "$PROJECT_DIR/server/index.js" ] || die "找不到 server/index.js"

if ! command -v node >/dev/null 2>&1; then
  die "没装 Node。先装 Node 22（或更高）再跑这个脚本：
       curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
       sudo apt install -y nodejs"
fi

NODE_BIN="$(command -v node)"
NODE_REAL="$(readlink -f "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node 版本太低（当前 $(node -v)），需要 18 以上"
ok "Node $(node -v) → $NODE_REAL"

if [[ "$NODE_REAL" == "$HOME"* && -n "${SUDO_USER:-}" ]]; then
  warn "Node 装在当前用户目录下（像是 nvm 装的）。服务以 $SUDO_USER 运行时没问题，"
  warn "但换成别的用户会找不到 node。建议用系统级安装的 Node。"
fi

RUN_USER="${RUN_USER:-${SUDO_USER:-$(id -un)}}"
id "$RUN_USER" >/dev/null 2>&1 || die "用户 $RUN_USER 不存在"
ok "服务将以用户 $RUN_USER 运行"

PORT="${PORT:-5178}"

# ── 1. 交互收集配置 ──────────────────────────────────
step "1/6 收集配置"

ask() { # ask 变量名 "提示" 默认值
  local var="$1" prompt="$2" def="${3:-}"
  local cur="${!var:-}"
  if [ -n "$cur" ]; then printf "  %s = %s\n" "$var" "$cur"; return; fi
  if [ "$ASSUME_YES" = "1" ] || [ ! -t 0 ]; then printf -v "$var" '%s' "$def"; printf "  %s = %s（默认）\n" "$var" "${!var}"; return; fi
  local answer
  read -r -p "  $prompt${def:+ [$def]}: " answer || true
  printf -v "$var" '%s' "${answer:-$def}"
}

ask DOMAIN "域名（直接回车则用 IP:端口 访问，浏览器会弹证书警告）" ""
ask ACCESS_CODE "通行码（建议设置，回车表示不设）" ""
ask TURN_URL "TURN 地址（回车跳过，语音可能在某些网络下连不上）" ""

if [ -n "${TURN_URL:-}" ]; then
  ask TURN_USER "TURN 用户名" ""
  ask TURN_PASS "TURN 密码" ""
fi

SERVER_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
[ -n "$SERVER_IP" ] || SERVER_IP="<服务器IP>"
if [ -n "${DOMAIN:-}" ]; then
  SCHEME_AND_HOST="https://$DOMAIN"
elif [ "${NO_SYSTEMD:-0}" = "1" ]; then
  # Docker / 自己反代：HTTPS 由外层负责，这里只报真实监听地址
  SCHEME_AND_HOST="http://$SERVER_IP:$PORT   （HTTPS 由你的反代或 SLB 负责）"
else
  SCHEME_AND_HOST="https://$SERVER_IP:$PORT   （自签证书，浏览器会拦一次）"
fi

# ── 2. 装依赖 ────────────────────────────────────────
step "2/6 安装依赖（只装生产依赖）"
cd "$PROJECT_DIR"
if [ -f package-lock.json ]; then
  run npm ci --omit=dev
else
  run npm install --omit=dev
fi
ok "依赖就绪"

# ── 3. 生成 .env ─────────────────────────────────────
step "3/6 写配置 .env"
if [ -f .env ]; then
  BACKUP=".env.bak.$(date +%Y%m%d%H%M%S)"
  warn "已存在 .env，先备份到 $BACKUP"
  run cp .env "$BACKUP"
fi

# 没有域名时：让 Node 自己起自签 HTTPS（否则浏览器不给麦克风权限）
SELF_HTTPS=0
if [ -z "${DOMAIN:-}" ] && [ "${NO_SYSTEMD:-0}" != "1" ]; then SELF_HTTPS=1; fi

if [ "$DRY_RUN" = "1" ]; then
  ok "[dry-run] 会写入 .env：PORT=$PORT TRUST_PROXY=$([ -n "${DOMAIN:-}" ] && echo 1 || echo 0)$([ "$SELF_HTTPS" = "1" ] && echo " HTTPS=1")$([ -n "${ACCESS_CODE:-}" ] && echo " ACCESS_CODE=***")$([ -n "${TURN_URL:-}" ] && echo " TURN_URL=$TURN_URL")"
else
  {
    echo "# 由 deploy/install.sh 生成于 $(date '+%Y-%m-%d %H:%M:%S')"
    echo "PORT=$PORT"
    echo "TRUST_PROXY=$([ -n "${DOMAIN:-}" ] && echo 1 || echo 0)"
    [ -n "${DOMAIN:-}" ] && echo "PUBLIC_URL=https://$DOMAIN"
    [ "$SELF_HTTPS" = "1" ] && echo "HTTPS=1"
    [ -n "${ACCESS_CODE:-}" ] && echo "ACCESS_CODE=$ACCESS_CODE"
    [ -n "${TURN_URL:-}" ] && echo "TURN_URL=$TURN_URL"
    [ -n "${TURN_USER:-}" ] && echo "TURN_USER=$TURN_USER"
    [ -n "${TURN_PASS:-}" ] && echo "TURN_PASS=$TURN_PASS"
  } > .env
  chmod 600 .env
  ok "已写入 .env（权限 600；里面有通行码和 TURN 密码，已加进 .gitignore）"
  [ "$SELF_HTTPS" = "1" ] && ok "已开启自签 HTTPS（HTTPS=1）—— 没有域名时浏览器会拦一次，点「继续前往」"
fi

# ── 4. 装服务 ────────────────────────────────────────
if [ "${NO_SYSTEMD:-0}" = "1" ]; then
  step "4/6 跳过 systemd（NO_SYSTEMD=1）"
else
  step "4/6 安装 systemd 服务"
  UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
  UNIT_TMP="$(mktemp)"
  cat > "$UNIT_TMP" <<UNIT_EOF
[Unit]
Description=线上剧本杀 (online story)
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$PROJECT_DIR
EnvironmentFile=$PROJECT_DIR/.env
ExecStart=$NODE_REAL server/index.js
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT_EOF
  run mkdir -p "$PROJECT_DIR/.certs"
  run chown -R "$RUN_USER":"$RUN_USER" "$PROJECT_DIR"
  run cp "$UNIT_TMP" "$UNIT"
  rm -f "$UNIT_TMP"
  run systemctl daemon-reload
  run systemctl enable --now "$SERVICE_NAME"
  run systemctl restart "$SERVICE_NAME"
  ok "服务已启动：systemctl status $SERVICE_NAME"
fi

# ── 5. nginx + 证书 ──────────────────────────────────
if [ "${NO_NGINX:-0}" = "1" ] || [ -z "${DOMAIN:-}" ]; then
  step "5/6 跳过 nginx / 证书"
  if [ -z "${DOMAIN:-}" ]; then
    warn "没填域名 —— 走自签证书模式（.env 里已经写了 HTTPS=1）。"
    warn "安全组记得放行 $PORT，浏览器首次访问会拦一次证书警告。"
  fi
else
  step "5/6 配置 nginx 与 HTTPS 证书"
  if ! command -v nginx >/dev/null 2>&1; then
    run apt-get install -y nginx
  fi
  CONF_SRC="$PROJECT_DIR/deploy/nginx.conf.example"
  CONF_DST="/etc/nginx/sites-available/$SERVICE_NAME"
  [ -f "$CONF_SRC" ] || die "找不到 $CONF_SRC"
  run mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  if [ "$DRY_RUN" = "0" ]; then
    sed "s/game\.example\.com/$DOMAIN/g; s|http://127\.0\.0\.1:5178|http://127.0.0.1:$PORT|g" "$CONF_SRC" > "$CONF_DST"
  else
    ok "[dry-run] 生成 $CONF_DST（把 game.example.com 换成 $DOMAIN，端口换成 $PORT）"
  fi
  run ln -sf "$CONF_DST" "/etc/nginx/sites-enabled/$SERVICE_NAME"
  run nginx -t
  run systemctl reload nginx
  ok "nginx 已接管 $DOMAIN"

  if command -v certbot >/dev/null 2>&1; then
    run certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --register-unsafely-without-email || \
      warn "certbot 没成功（域名解析到这台机器了吗？80 端口通吗？）稍后可以手动跑：certbot --nginx -d $DOMAIN"
  else
    warn "没装 certbot，先给你装上"
    run apt-get install -y certbot python3-certbot-nginx
    run certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --register-unsafely-without-email || \
      warn "certbot 没成功，稍后手动跑：sudo certbot --nginx -d $DOMAIN"
  fi
fi

# ── 6. 自查 ──────────────────────────────────────────
step "6/6 自查"
sleep 2
if [ "$DRY_RUN" = "0" ]; then
  if curl -fsS --max-time 5 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    ok "健康检查通过"
  else
    warn "健康检查没通过，看看日志：journalctl -u $SERVICE_NAME -n 50 --no-pager"
  fi
fi

cat <<SUMMARY

════════════════════════════════════════
  部署完成
════════════════════════════════════════
  访问地址    $SCHEME_AND_HOST
  通行码      ${ACCESS_CODE:-（未设置 —— 公网建议补上）}
  TURN        ${TURN_URL:-（未配置 —— 严格 NAT 的玩家语音可能连不上）}
  配置文件    $PROJECT_DIR/.env
  服务管理    systemctl {status,restart,stop} $SERVICE_NAME
  看日志      journalctl -u $SERVICE_NAME -f

  以后更新代码（脚本自己会 git pull）：
      cd $PROJECT_DIR && sudo bash deploy/update.sh

SUMMARY

if [ -n "${DOMAIN:-}" ]; then
  cat <<'NEXT'
  还差一步：确认 DNS 里这个域名已经解析到本机 IP，并且安全组放行了 80 和 443。
NEXT
fi
if [ -z "${TURN_URL:-}" ]; then
  cat <<'NEXT'
  想让语音在各种网络下都通，配一台 coturn：
      sudo apt install -y coturn
      sudo cp deploy/coturn.conf.example /etc/turnserver.conf   # 改 external-ip 和 user
      sudo vim /etc/default/coturn                              # TURN_SERVER_ENABLED=1
      sudo systemctl enable --now coturn
  安全组放行 3478/udp、3478/tcp、49160-49200/udp，然后把 TURN_* 填进 .env 重启服务。
NEXT
fi
