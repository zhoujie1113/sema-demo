/** 场景布局常量：单位 = 米。x 向东，+z 朝向海，y 向上。 */
export const L = {
  road: { minX: -104, maxX: 824, half: 9 },
  /** 人行道外沿 */
  walkEdge: 12.6,
  /** 汽车旅馆停车场 */
  lot: { minX: -98, maxX: -8, minZ: -36, maxZ: -13.2 },
  /** 停车场出入口（穿过人行道） */
  driveway: { minX: -24, maxX: -8 },
  motel: { minX: -112, maxX: -20, minZ: -46, maxZ: -36 },
  motelWing: { minX: -112, maxX: -100, minZ: -46, maxZ: -14 },
  /** 海边交付停车区 */
  delivery: { minX: 686, maxX: 806, minZ: 10, maxZ: 38 },
  /** 交付车位中心（车头朝海） */
  bay: { x: 744, z: 25, heading: Math.PI / 2, halfW: 1.8, halfL: 3.4 },
  start: { x: -56, z: -22, heading: 0 },
  /** 海滩与海面 */
  beach: { inner: 12.6, waterline: 39 },
  oceanY: -0.62,
  checkpoints: [
    { x: 150, z: 0, label: "1 号检查点 · 便利店" },
    { x: 470, z: 0, label: "2 号检查点 · 广告牌" },
  ],
  /** 复位用的路径中心线 */
  route: [
    { x: -56, z: -22, heading: 0 },
    { x: -36, z: -21.5, heading: 0 },
    { x: -24, z: -19, heading: 0.5 },
    { x: -17, z: -12, heading: 1.1 },
    { x: -16, z: -3, heading: 1.1 },
    { x: -12, z: 3.5, heading: 0.5 },
    { x: 20, z: 3.5, heading: 0 },
    { x: 100, z: 3.5, heading: 0 },
    { x: 300, z: 3.5, heading: 0 },
    { x: 560, z: 3.5, heading: 0 },
    { x: 676, z: 4, heading: 0.2 },
    { x: 706, z: 10, heading: 0.8 },
    { x: 730, z: 18, heading: 1.2 },
    { x: 742, z: 24, heading: Math.PI / 2 },
  ],
};

export const EAST_BOUND = L.road.maxX - 8;
export const WEST_BOUND = L.road.minX + 8;
