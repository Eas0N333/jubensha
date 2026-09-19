#!/usr/bin/env bash
#
# 国内服务器拉不动镜像时用这个：配 Docker 镜像加速
#
#   sudo bash deploy/docker-mirror.sh
#
# 背景：Docker Hub（registry-1.docker.io）在部分网络下连不上，报错长这样——
#   failed to resolve reference "docker.io/library/node:22-alpine":
#   failed to do request: ... dial tcp 65.49.26.98:443: i/o timeout
# 本脚本写入 /etc/docker/daemon.json 并重启 docker。
#
# 公共镜像站会时好时坏，脚本会先逐个探测，只把通的写进配置。

set -euo pipefail

c_reset='\033[0m'; c_ok='\033[32m'; c_warn='\033[33m'; c_step='\033[36m'; c_err='\033[31m'
step() { printf "\n${c_step}▶ %s${c_reset}\n" "$*"; }
ok()   { printf "  ${c_ok}✓${c_reset} %s\n" "$*"; }
warn() { printf "  ${c_warn}!${c_reset} %s\n" "$*"; }
die()  { printf "\n${c_err}✗ %s${c_reset}\n" "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "需要 root：sudo bash deploy/docker-mirror.sh"
command -v docker >/dev/null 2>&1 || die "没装 docker"

# 候选镜像站（按优先级）。这些是公共免费服务，失效了就换，脚本会自动跳过不通的。
CANDIDATES=(
  "https://docker.m.daocloud.io"
  "https://docker.nju.edu.cn"
  "https://docker.1panel.live"
  "https://dockerproxy.net"
  "https://mirror.ccs.tencentyun.com"
)

step "1/4 探测本机到 Docker Hub 的连通性"
if timeout 8 curl -sI https://registry-1.docker.io/v2/ >/dev/null 2>&1; then
  ok "Docker Hub 直连可用（其实不用配镜像）"
  HUB_OK=1
else
  warn "Docker Hub 直连不通，需要走镜像"
  HUB_OK=0
fi

step "2/4 逐个探测镜像站"
WORKING=()
for url in "${CANDIDATES[@]}"; do
  printf '  %-40s : ' "$url"
  if timeout 8 curl -sI "$url/v2/" >/dev/null 2>&1; then
    echo "可用"
    WORKING+=("$url")
  else
    echo "不通"
  fi
done

if [ ${#WORKING[@]} -eq 0 ] && [ "$HUB_OK" = "1" ]; then
  ok "直连可用，不改任何配置"
  exit 0
fi
[ ${#WORKING[@]} -gt 0 ] || die "所有镜像站都不通。检查这台机器的出网策略（安全组 / 代理），或自建 registry 镜像。"

step "3/4 写 /etc/docker/daemon.json"
mkdir -p /etc/docker
[ -f /etc/docker/daemon.json ] && cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%Y%m%d%H%M%S)" && warn "已备份原 daemon.json"

{
  echo "{"
  echo '  "registry-mirrors": ['
  for i in "${!WORKING[@]}"; do
    sep=","; [ "$i" -eq $((${#WORKING[@]} - 1)) ] && sep=""
    echo "    \"${WORKING[$i]}\"$sep"
  done
  echo "  ],"
  echo '  "log-driver": "json-file",'
  echo '  "log-opts": { "max-size": "10m", "max-file": "3" }'
  echo "}"
} > /etc/docker/daemon.json
cat /etc/docker/daemon.json | sed 's/^/  /'

step "4/4 重启 docker 并实测拉取"
systemctl restart docker
sleep 4
systemctl is-active --quiet docker || die "docker 没起来，看：journalctl -u docker -n 50 --no-pager"
ok "docker 已重启"

if timeout 180 docker pull hello-world:latest >/dev/null 2>&1; then
  ok "拉取测试通过"
  docker rmi hello-world:latest >/dev/null 2>&1 || true
else
  warn "还是拉不动。可能这几个镜像站都临时挂了，换一批再试："
  warn "  编辑本脚本里的 CANDIDATES，或手动改 /etc/docker/daemon.json"
  exit 1
fi

printf "\n${c_ok}搞定。${c_reset}现在可以正常构建了：\n"
printf "  docker compose up -d --build\n\n"
