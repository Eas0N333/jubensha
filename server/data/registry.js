/**
 * 剧本注册表：把服务端所有可玩的剧本收在一处，并为每本建立索引。
 *
 * 索引挂在 scenario 对象上（scenario.clueIndex / roleIndex / nodeIndex），
 * 这样游戏引擎只要拿着 room.scenario 就能查，不用管全局状态。
 */

import { scenario as wuyin } from './scenario.js';
import { studioScenario as studio } from './studio.js';
import { steamerScenario as steamer } from './steamer.js';

/** 给一本剧本建好所有查找表 */
function buildIndexes(s) {
  const clueIndex = new Map();
  for (const room of s.rooms) {
    for (const c of room.clues) clueIndex.set(c.id, { ...c, roomId: room.id, roomName: room.name });
  }
  for (const c of s.extraClues || []) {
    clueIndex.set(c.id, { ...c, roomId: '__extra', roomName: '节点所得' });
  }
  s.clueIndex = clueIndex;
  s.roleIndex = new Map(s.cast.map((r) => [r.id, r]));
  s.nodeIndex = new Map(s.nodes.map((n) => [n.id, n]));
  s.castSize = s.cast.length;
  s.clueTotal = s.rooms.reduce((n, r) => n + r.clues.length, 0);
  return s;
}

export const scenarios = new Map([
  [studio.id, buildIndexes(studio)],
  [steamer.id, buildIndexes(steamer)],
  [wuyin.id, buildIndexes(wuyin)],
]);

/** 默认开哪一本（人少的排前面，3 人本更容易凑齐） */
export const DEFAULT_SCENARIO_ID = studio.id;

export const getScenario = (id) => scenarios.get(id) || scenarios.get(DEFAULT_SCENARIO_ID);

/** 首页给客人看的剧本清单（不含任何剧透内容） */
export function listScenarios() {
  return [...scenarios.values()].map((s) => ({
    id: s.id,
    title: s.title,
    subtitle: s.subtitle,
    tagline: s.tagline,
    castSize: s.castSize,
    cover: s.cover,
    clueTotal: s.clueTotal,
    roomCount: s.rooms.length,
    nodeCount: s.nodes.length,
    phaseCount: s.phases.length,
    // 每人每轮的行动力之和 = 全员两轮能抽多少次；用来判断线索翻不翻得完
    drawCapacity: s.castSize * s.phases.filter((p) => p.kind === 'search').reduce((n, p) => n + (p.ap || 2), 0),
    keyTotal: [...s.clueIndex.values()].filter((c) => c.key && c.roomId !== '__extra').length,
    victim: { name: s.victim.name, age: s.victim.age, role: s.victim.role, found: s.victim.found, scene: s.victim.scene },
    cast: s.cast.map((r) => ({ name: r.name, gender: r.gender, age: r.age, title: r.title, color: r.color })),
  }));
}
