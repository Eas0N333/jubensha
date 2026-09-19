/**
 * 部署配置：全部从环境变量读，代码里不写死任何一台机器的东西。
 *
 * 需要的变量见项目根目录的 .env.example。
 */

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

/** WebRTC 打洞用的 ICE 服务器。没配 TURN 的话，跨运营商的玩家很可能连不上语音。 */
function buildIceServers() {
  const servers = [];
  const stuns = list(process.env.STUN_URL);
  for (const url of stuns.length ? stuns : ['stun:stun.l.google.com:19302']) {
    servers.push({ urls: url });
  }
  const turns = list(process.env.TURN_URL);
  for (const url of turns) {
    servers.push({
      urls: url,
      username: process.env.TURN_USER || undefined,
      credential: process.env.TURN_PASS || undefined,
    });
  }
  return servers;
}

export const config = {
  port: num(process.env.PORT, 5178),
  /** 绑定地址。云服务器上保持 0.0.0.0；只打算本机用可以设 127.0.0.1 */
  host: process.env.HOST_BIND || '0.0.0.0',
  /** 自签 HTTPS（没有域名/证书时用；有 nginx 反代就别开） */
  https: process.argv.includes('--https') || process.env.HTTPS === '1',
  /** 放在 nginx / SLB 后面时打开，让 req.ip 取到真实访客 IP */
  trustProxy: process.env.TRUST_PROXY === '1',
  /**
   * 可选的通行码。设了之后，建房和加入房间都要带上它。
   * 公网部署强烈建议设置 —— 否则任何人拿到地址都能开房占内存。
   */
  accessCode: (process.env.ACCESS_CODE || '').trim(),
  /** 打印 banner 用，例如 https://game.example.com */
  publicUrl: (process.env.PUBLIC_URL || '').trim(),
  /**
   * 自签证书要额外写进 SAN 的地址。
   * 云服务器的公网 IP 通常不在网卡上（NAT 到内网 IP），不写进去浏览器会报
   * 「证书名称不匹配」而不是单纯的「不受信任」——两种都要点继续，但前者更唬人。
   */
  certIps: list(process.env.CERT_IP),
  iceServers: buildIceServers(),
  get turnEnabled() { return list(process.env.TURN_URL).length > 0; },
};

/** 给客户端看的运行时配置（不含任何秘密，TURN 的密码除外——那是给浏览器用的，必须下发） */
export function clientRuntimeConfig() {
  return {
    iceServers: config.iceServers,
    accessRequired: !!config.accessCode,
  };
}
