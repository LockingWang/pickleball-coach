import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- 球場與物理常數（公尺） ----------
const COURT_L = 13.41;          // 球場全長
const COURT_W = 6.10;           // 球場全寬
const HALF_L = COURT_L / 2;
const HALF_W = COURT_W / 2;
const KITCHEN = 2.13;           // 廚房區（非截擊區）深度
const NET_H = 0.9;              // 網高（取平均）
const G = 9.81;
const BALL_R = 0.06;            // 球半徑（為了可視性略放大）

// ---------- 基本場景 ----------
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1420);
scene.fog = new THREE.Fog(0x0e1420, 25, 60);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4.5, 11);

// 視角控制：滾輪縮放、右鍵拖曳旋轉（左鍵保留給遊戲操作不佔用）
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.5, 0);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 28;
controls.maxPolarAngle = Math.PI / 2 - 0.06; // 不能鑽到地面以下
controls.update();

// 燈光
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a2a1a, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
scene.add(sun);

// ---------- 球場 ----------
// 周圍地面
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x1f4d3a, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// 球場主體（藍色）
const court = new THREE.Mesh(
  new THREE.PlaneGeometry(COURT_W, COURT_L),
  new THREE.MeshStandardMaterial({ color: 0x2563a8, roughness: 0.9 })
);
court.rotation.x = -Math.PI / 2;
court.receiveShadow = true;
scene.add(court);

// 廚房區（網兩側較淺色）
for (const side of [1, -1]) {
  const kitchen = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT_W, KITCHEN),
    new THREE.MeshStandardMaterial({ color: 0x3b82c4, roughness: 0.9 })
  );
  kitchen.rotation.x = -Math.PI / 2;
  kitchen.position.set(0, 0.002, side * KITCHEN / 2);
  kitchen.receiveShadow = true;
  scene.add(kitchen);
}

// 白色場線
const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
function addLine(x, z, w, d) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, 0.005, z);
  scene.add(line);
}
const LW = 0.05; // 線寬
addLine(0, HALF_L, COURT_W, LW);          // 底線
addLine(0, -HALF_L, COURT_W, LW);
addLine(HALF_W, 0, LW, COURT_L);          // 邊線
addLine(-HALF_W, 0, LW, COURT_L);
addLine(0, KITCHEN, COURT_W, LW);         // 廚房線
addLine(0, -KITCHEN, COURT_W, LW);
// 中線（廚房線到底線）
const midLen = HALF_L - KITCHEN;
addLine(0, KITCHEN + midLen / 2, LW, midLen);
addLine(0, -(KITCHEN + midLen / 2), LW, midLen);

// 球網
const net = new THREE.Mesh(
  new THREE.PlaneGeometry(COURT_W + 0.6, NET_H),
  new THREE.MeshStandardMaterial({ color: 0x15202e, transparent: true, opacity: 0.88, side: THREE.DoubleSide })
);
net.position.set(0, NET_H / 2, 0);
scene.add(net);
const netTape = new THREE.Mesh(
  new THREE.BoxGeometry(COURT_W + 0.6, 0.06, 0.03),
  new THREE.MeshStandardMaterial({ color: 0xffffff })
);
netTape.position.set(0, NET_H, 0);
scene.add(netTape);
for (const side of [1, -1]) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, NET_H + 0.05),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  post.position.set(side * (HALF_W + 0.3), (NET_H + 0.05) / 2, 0);
  scene.add(post);
}

// ---------- 人偶 ----------
function makeCharacter({ shirt, skin = 0xe8b88a, paddleColor }) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });

  // 腿：髖關節樞軸 + 大腿/膝蓋/小腿分段 + 白襪 + 球鞋（整條腿從髖部擺動）
  // 分段以「微蹲」姿勢組裝：大腿前傾、小腿後收，呈現運動員屈膝預備姿態
  function buildLeg(sideX) {
    const leg = new THREE.Group();
    leg.position.set(sideX * 0.13, 0.9, 0); // 髖關節
    leg.rotation.z = sideX * 0.18;          // 腿微微外張，兩腳距離比肩膀寬
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.28, 4, 10), mat(skin));
    thigh.position.set(0, -0.2, -0.05);
    thigh.rotation.x = 0.3;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(skin));
    knee.position.set(0, -0.4, -0.1);
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.26, 4, 10), mat(skin));
    calf.position.set(0, -0.6, -0.055);
    calf.rotation.x = -0.25;
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.16, 10), mat(0xffffff));
    sock.position.set(0, -0.74, -0.02);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.25), mat(0xf2f2f2));
    shoe.position.set(0, -0.86, 0.03);
    const shoeSole = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.03, 0.26), mat(0x444444));
    shoeSole.position.set(0, -0.9, 0.03);
    leg.add(thigh, knee, calf, sock, shoe, shoeSole);
    return leg;
  }
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  // 運動短褲
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.26, 14), mat(0x27313f));
  shorts.position.y = 0.82;

  // 上半身整體掛在「髖部樞軸」下，向前傾斜呈預備姿態
  const upper = new THREE.Group();
  upper.position.y = 0.95;
  upper.rotation.x = -0.2; // 前傾（負值 = 軀幹頂端倒向面對的 -z 方向）

  // 身體（運動衫 + 白色下擺與領口）+ 脖子（座標相對髖部）
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 12), mat(shirt));
  torso.position.y = 0.17;
  const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.205, 0.05, 14), mat(0xffffff));
  hem.position.y = 0;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 8, 16), mat(0xffffff));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.52;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), mat(skin));
  neck.position.y = 0.55;

  // 頭 + 眼睛 + 同色棒球帽（臉朝 -z，即各自面向網子的方向）
  const headGrp = new THREE.Group();
  headGrp.position.y = 0.67;
  headGrp.rotation.x = 0.18; // 抵銷身體前傾，視線保持向前
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 14), mat(skin));
  const eyeGeo = new THREE.SphereGeometry(0.018, 8, 6);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.05, 0.02, -0.13);
  eyeR.position.set(0.05, 0.02, -0.13);
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.012, 0.01),
    new THREE.MeshStandardMaterial({ color: 0xb06a55 })
  );
  mouth.position.set(0, -0.06, -0.135);
  const capTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.152, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(shirt));
  capTop.position.y = 0.035;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.13), mat(shirt));
  visor.position.set(0, 0.08, -0.16);
  headGrp.add(head, eyeL, eyeR, mouth, capTop, visor);

  // 手臂共用幾何：肩膀球 + 上臂膠囊 + 手腕節點（兩臂對稱，球拍可換手掛載）
  const shoulderGeo = new THREE.SphereGeometry(0.09, 12, 10);
  function buildArm(sideX) {
    const pivot = new THREE.Group();
    pivot.position.set(sideX * 0.24, 0.47, 0); // 相對髖部樞軸的肩膀位置
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.062, 0.16, 10), mat(shirt)); // 短袖
    sleeve.position.y = -0.1;
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.2, 4, 8), mat(skin));
    upperArm.position.y = -0.24;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), mat(skin));
    elbow.position.y = -0.36;
    // 前臂從手肘微微向前下彎折，手腕節點移到彎折後的末端
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.18, 4, 8), mat(skin));
    forearm.position.set(0, -0.455, -0.03);
    forearm.rotation.x = 0.3;
    const wrist = new THREE.Group();
    wrist.position.set(0, -0.55, -0.06);
    wrist.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat(skin))); // 手掌
    pivot.add(new THREE.Mesh(shoulderGeo, mat(shirt)), sleeve, upperArm, elbow, forearm, wrist);
    return { pivot, wrist };
  }
  const armR = buildArm(1);
  const armL = buildArm(-1);
  armL.pivot.rotation.set(0.85, 0, 0.3);    // 非持拍手扶向身前拍頸（不越過中線）
  armR.pivot.rotation.set(1.0, 0, -0.28);   // 預設持拍手：拍子舉在身體正前方
  armR.wrist.rotation.set(0.35, 1.45, 0);   // 拍頭朝前、拍面朝側

  // 球拍：握把 + 橢圓拍面 + 拍框（掛在持拍手的手腕上）
  const paddle = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.023, 0.16, 10), mat(0x333333));
  handle.position.y = -0.08;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.034, 22), mat(paddleColor));
  face.rotation.x = Math.PI / 2; // 圓盤面朝 ±z（與原方塊拍面同向，不影響姿勢邏輯）
  face.scale.z = 1.3;            // 拉成直立橢圓
  face.position.y = -0.31;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.013, 8, 26), mat(0x333333));
  rim.scale.y = 1.3;
  rim.position.y = -0.31;
  paddle.add(handle, face, rim);
  armR.wrist.add(paddle);

  upper.add(torso, hem, collar, neck, headGrp, armL.pivot, armR.pivot);
  g.add(legL, legR, shorts, upper);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return {
    group: g, armL, armR, paddle, paddleFace: face, head: headGrp,
    armPivot: armR.pivot, wrist: armR.wrist, // 目前持拍手的別名（換手時重新指向）
    legL, legR, swingT: -1, walkT: 0,
  };
}

const player = makeCharacter({ shirt: 0x2f7fe0, paddleColor: 0xf3d23e });
player.group.position.set(0, 0, 5.2);
scene.add(player.group);

const ai = makeCharacter({ shirt: 0xe08a2f, paddleColor: 0x3ee07a });
ai.group.position.set(0, 0, -4.2);
ai.group.rotation.y = Math.PI; // 面向玩家
scene.add(ai.group);

// ---------- 裁判：網邊高台、頭部追球、依判決比手勢 ----------
const referee = makeCharacter({ shirt: 0x37474f, paddleColor: 0x37474f });
referee.paddle.visible = false;
referee.armR.pivot.rotation.set(0, 0, 0.22); // 不持拍，雙手自然垂放
referee.group.scale.setScalar(0.9);
referee.group.position.set(HALF_W + 1.15, 1.12, 0);
referee.group.rotation.y = Math.PI / 2; // 面向球場
scene.add(referee.group);

// 裁判高台
const podium = new THREE.Group();
const podMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 0.9 });
const podBase = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.12, 0.85), podMat);
podBase.position.y = 0.56;
const podRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.85), podMat);
podRail.position.set(-0.42, 1.3, 0); // 靠球場那一側的欄杆
podium.add(podBase, podRail);
podium.position.set(HALF_W + 1.15, 0, 0);
podium.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(podium);

// 判決手勢（手臂角度）
const REF_POSES = {
  idle:  { r: { x: 0, z: 0.22 },  l: { x: 0, z: -0.22 } },
  out:   { r: { x: 0, z: 1.57 },  l: { x: 0, z: -0.22 } },  // 單手平舉：出界
  in:    { r: { x: 0.9, z: 0.3 }, l: { x: 0.9, z: -0.3 } }, // 雙手斜指地面：界內、有效得分
  fault: { r: { x: 0, z: 2.5 },   l: { x: 0, z: -0.22 } },  // 單手高舉：違例/失誤
  win:   { r: { x: 0, z: 2.5 },   l: { x: 0, z: -2.5 } },   // 雙手高舉：比賽結束
};
const refGesture = { pose: 'idle', t: 0 };

function refSignal(pose, hold = 1.8) {
  refGesture.pose = pose;
  refGesture.t = hold;
}
function signalFromReason(reason) {
  if (reason.includes('出界') || reason.includes('未進')) return 'out';
  if (reason.includes('掛網') || reason.includes('違例') || reason.includes('失誤') || reason.includes('廚房')) return 'fault';
  return 'in';
}

function updateReferee(dt) {
  // 頭部追球（球隱藏時回正）
  let yaw = 0, pitch = 0;
  if (ball.visible) {
    const lp = referee.group.worldToLocal(ball.position.clone());
    lp.y -= 1.62; // 改以頭部為原點
    yaw = THREE.MathUtils.clamp(Math.atan2(-lp.x, -lp.z), -1.25, 1.25);
    pitch = THREE.MathUtils.clamp(Math.atan2(lp.y, Math.hypot(lp.x, lp.z)), -0.6, 0.5);
  }
  const hk = Math.min(1, 10 * dt);
  referee.head.rotation.y += (yaw - referee.head.rotation.y) * hk;
  referee.head.rotation.x += (pitch - referee.head.rotation.x) * hk;

  // 判決手勢：維持一段時間後放下
  if (refGesture.t > 0) refGesture.t -= dt;
  else refGesture.pose = 'idle';
  const pose = REF_POSES[refGesture.pose];
  const k = Math.min(1, 8 * dt);
  const rr = referee.armR.pivot.rotation;
  const rl = referee.armL.pivot.rotation;
  rr.x += (pose.r.x - rr.x) * k;
  rr.z += (pose.r.z - rr.z) * k;
  rl.x += (pose.l.x - rl.x) * k;
  rl.z += (pose.l.z - rl.z) * k;
}

// ---------- 規則教學模式 ----------
const tutCapEl = document.getElementById('tutCap');

// 區域高亮（半透明發光面，平時隱藏，教學時呼吸閃爍）
function makeZoneHL(x, z, w, d, color) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  scene.add(m);
  return m;
}
const SBD = HALF_L - KITCHEN; // 發球區深度
const hlCourt = makeZoneHL(0, 0, COURT_W, COURT_L, 0x55ccff);
const hlKitchenP = makeZoneHL(0, KITCHEN / 2, COURT_W, KITCHEN, 0xffd34d);
const hlKitchenA = makeZoneHL(0, -KITCHEN / 2, COURT_W, KITCHEN, 0xffd34d);
const hlBoxPL = makeZoneHL(-HALF_W / 2, KITCHEN + SBD / 2, HALF_W, SBD, 0x7aff8a);
const hlBoxPR = makeZoneHL(HALF_W / 2, KITCHEN + SBD / 2, HALF_W, SBD, 0x7aff8a);
const hlBoxAL = makeZoneHL(-HALF_W / 2, -(KITCHEN + SBD / 2), HALF_W, SBD, 0x7aff8a);
const hlBoxAR = makeZoneHL(HALF_W / 2, -(KITCHEN + SBD / 2), HALF_W, SBD, 0x7aff8a);
const hlNet = new THREE.Mesh(
  new THREE.PlaneGeometry(COURT_W + 0.6, NET_H),
  new THREE.MeshBasicMaterial({ color: 0xff8c5a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
);
hlNet.position.set(0, NET_H / 2, 0.03);
scene.add(hlNet);
const ALL_HL = [hlCourt, hlKitchenP, hlKitchenA, hlBoxPL, hlBoxPR, hlBoxAL, hlBoxAR, hlNet];
const HL_COLORS = new Map(ALL_HL.map((h) => [h, h.material.color.getHex()]));

// 落點光圈（球每次落地時擴散）
function spawnBounceRing(pos) {
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: 0x66e0ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, 0.025, pos.z);
  scene.add(ring);
  fxList.push({ mesh: ring, t: 0, update(dt) {
    this.t += dt; const k = this.t / 0.8;
    this.mesh.scale.setScalar(1 + k * 5);
    this.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
    return k < 1;
  }});
}

// 教學劇本執行狀態
const tut = {
  key: null, def: null, t: 0, fired: 0,
  ballActive: false, glow: [], moves: new Map(),
  holdBall: null,          // 球托在哪個人偶的非持拍手上（null = 不托球）
  freezeNextBounce: false, // 下一次落地時立刻定格（不彈起）
};

function moveTo(rig, x, z) { tut.moves.set(rig, { x, z }); }

// 非持拍手的手腕節點（托球、發球起點用）
function idleWristOf(rig) {
  if (rig === ai) return ai.armL.wrist;
  return state.hand === 'left' ? player.armR.wrist : player.armL.wrist;
}

// 示範用的發球 / 擊球（不套用任何判定）：從托球的手掌位置發出
function tutServeBall(fromRig, tx, tz, times) {
  ball.visible = true;
  idleWristOf(fromRig).getWorldPosition(ball.position);
  ball.position.y += 0.1;
  state.ballV.copy(launchTo(ball.position, new THREE.Vector3(tx, 0, tz), times));
  tut.holdBall = null;
  tut.ballActive = true;
  if (fromRig === ai) triggerSwing(ai);
  else startRelease({ x: 1.6, z: 0.18, wrist: -0.8, body: 0 }, 0.15);
}
function tutHitBall(fromRig, tx, tz, times) {
  state.ballV.copy(launchTo(ball.position, new THREE.Vector3(tx, 0, tz), times));
  tut.ballActive = true;
  if (fromRig === ai) triggerSwing(ai);
  else startRelease({ x: 1.1, z: 0.9, wrist: 0.5, twist: 1.45, body: 0 });
}

// ---- 球場區域：手動點選，停留說明（不輪播） ----
const ZONE_ITEMS = {
  court: {
    glow: [hlCourt],
    cap: '<b>球場全貌</b>：標準皮克球場長 13.41 公尺、寬 6.10 公尺——大約是羽球場的大小、網球場的三分之一。單打與雙打使用同樣大小的場地。',
  },
  net: {
    glow: [hlNet],
    cap: '<b>球網</b>：兩端高 0.914 公尺、中央 0.86 公尺（比網球網略低）。擊球掛網彈回自己場內就失分，所以回球的過網高度是基本功。',
  },
  kitchen: {
    glow: [hlKitchenP, hlKitchenA],
    cap: '<b>廚房區（非截擊區 NVZ）</b>：網子兩側各 2.13 公尺的區域。站在區內（含踩線）時<b>不可以截擊空中球</b>；但球落地後進來打完全合法。這條規則是為了防止球員貼網暴扣，也造就了皮克球獨特的網前 dink 攻防。',
  },
  boxes: {
    glow: [hlBoxPL, hlBoxPR, hlBoxAL, hlBoxAR],
    cap: '<b>發球區</b>：廚房線到底線之間，左右各一格。發球必須落在<b>對角</b>的發球區內，不能壓到廚房線。發球方看自己的分數：偶數站右區、奇數站左區。',
  },
};
let zoneSel = 'court';
function selectZone(key) {
  zoneSel = key;
  const it = ZONE_ITEMS[key];
  tutCapEl.innerHTML = it.cap;
  tut.glow = it.glow;
  document.querySelectorAll('#zoneOpts .zone').forEach((b) => b.classList.toggle('active', b.dataset.zone === key));
}

// ---- 五個課程劇本 ----
const TUTORIALS = {
  zones: {
    duration: Infinity, // 手動選擇區域，不輪播
    onStart() {
      ball.visible = false;
      moveTo(player, 2.9, 6.9); moveTo(ai, -2.9, -6.9);
      selectZone(zoneSel);
    },
    steps: [],
  },
  serve: {
    duration: 13,
    onStart() {
      moveTo(player, 1.5, 7.05); moveTo(ai, -1.5, -5.6);
      tut.holdBall = player; // 球托在發球者手上
    },
    steps: [
      { at: 0,   cap: '<b>發球</b>：站在底線後，發到<b>對角</b>發球區（綠色發光格），必須飛越廚房區', glow: [hlBoxAL] },
      { at: 1.6, act: () => tutServeBall(player, -1.5, -4.3, [1.25]) },
      { at: 3.2, cap: '✔ <b>合法發球</b>：落在對角發球區內（看落點光圈）' },
      { at: 6.0, cap: '✘ 發球若落進<b>廚房區</b>（紅色），就是失誤', glow: [hlKitchenA],
        act: () => hlKitchenA.material.color.setHex(0xff4040) },
      { at: 7.2, act: () => tutServeBall(player, -0.8, -1.3, [1.0]) },
      { at: 9.8, cap: '發球也不能出界或掛網。發球方計分<b>偶數站右區、奇數站左區</b>' },
    ],
  },
  twobounce: {
    duration: 26.5,
    onStart() {
      moveTo(player, 1.5, 7.0); moveTo(ai, -1.3, -5.2);
      tut.holdBall = player; // 球托在發球者手上
    },
    steps: [
      { at: 0,    cap: '<b>雙彈跳規則</b>：發球後的「前兩拍」都必須等球<b>落地一次</b>才能回擊。先看發球——' },
      { at: 1.5,  act: () => { tutServeBall(player, -1.3, -4.5, [1.25]); tut.freezeNextBounce = true; } },
      // 球觸地瞬間已自動定格在落點 → 講解
      { at: 2.9,  cap: '⏸ <b>第 1 跳</b>：發球落在接發方場內。接發球方<b>不可以截擊發球</b>，必須等這一跳落地才能回擊。' },
      // 說明完畢 → 球反彈、對手回擊
      { at: 7.3,  cap: '接發方等球落地後回擊——',
        act: () => { tut.ballActive = true; state.ballV.set(0, 3.2, 0); } },
      { at: 7.75, act: () => { tutHitBall(ai, 1.2, 5.3, [1.25]); tut.freezeNextBounce = true; } },
      // 球觸地瞬間自動定格 → 講解
      { at: 9.2,  cap: '⏸ <b>第 2 跳</b>：回擊落在發球方場內。發球方打「第三拍」時<b>同樣必須等球落地</b>——這就是雙彈跳。' },
      // 說明完畢 → 我方回擊第三拍
      { at: 13.6, cap: '發球方等球落地後，回擊第三拍——',
        act: () => { tut.ballActive = true; state.ballV.set(0, 3.2, 0); } },
      { at: 14.05, act: () => { tutHitBall(player, -1.0, -4.2, [1.5]); moveTo(player, 1.0, 4.4); moveTo(ai, -0.5, -2.6); } },
      // 球還飛在對手半場上空 → 空中定格，先講解「現在起可以截擊」
      { at: 15.15, cap: '⏸ <b>雙彈跳完成</b>！球正飛向對手——從<b>第四拍</b>起，雙方都可以「截擊」：不等落地直接回擊',
        act: () => { tut.ballActive = false; state.ballV.set(0, 0, 0); } },
      // 說明完畢 → 對手示範空中截擊
      { at: 19.6, cap: '對手直接在空中截擊——',
        act: () => tutHitBall(ai, 1.0, 5.2, [1.4]) },
      // 球飛回我方 → 短暫空中定格
      { at: 20.75, cap: '⏸ 球飛回我方——你同樣可以直接出手',
        act: () => { tut.ballActive = false; state.ballV.set(0, 0, 0); } },
      // 我方截擊收尾
      { at: 23.2, cap: '✔ <b>截擊成功</b>！複習：第 1 跳接發方等落地、第 2 跳發球方等落地、之後就能自由攻防',
        act: () => tutHitBall(player, -1.5, -4.0, [1.2]) },
    ],
  },
  kitchen: {
    duration: 16,
    onStart() {
      moveTo(player, 0.6, 1.3); moveTo(ai, -0.6, -3.2);
      tut.holdBall = ai; // 球托在餵球的 AI 手上
    },
    steps: [
      // ① 違例示範：站在廚房內截擊
      { at: 0,   cap: '<b>廚房區（非截擊區）</b>：腳在黃色區域內（含踩線）時，不能攔打<b>還沒落地</b>的球', glow: [hlKitchenP] },
      { at: 1.6, act: () => tutServeBall(ai, 1.2, 3.2, [0.85]) }, // 平飛球，胸口高度到達
      { at: 2.2, act: () => { // 玩家站在廚房內截擊 → 違例
        startRelease({ x: 1.75, z: 0.1, wrist: 0.95, body: 0 }, 0.12);
        const p = player.group.position;
        ball.position.set(p.x + 0.15, 1.2, p.z - 0.5); // 球貼到拍面接觸點，確保擊中
        state.ballV.set(-0.5, 1.8, -3.0);              // 確實把球截回網子另一側
        tut.ballActive = true;
        hlKitchenP.material.color.setHex(0xff4040);
        refSignal('fault', 2.5); // 裁判舉手判違例
      } },
      { at: 3.0, cap: '✘ 腳還在廚房區內就「截擊」＝<b>違例</b>，立刻失分', glow: [hlKitchenP] },
      // ② 合法做法一：退出廚房區再截擊
      { at: 5.8, cap: '合法做法 ①：<b>先退出廚房區</b>，再攔打空中球——',
        act: () => { hlKitchenP.material.color.setHex(0xffd34d); moveTo(player, 0.6, 2.8); } },
      { at: 7.4, act: () => tutServeBall(ai, 1.2, 4.6, [0.95]) },
      { at: 8.1, act: () => { // 在廚房線外合法截擊（球先吸附到拍面）
        const p = player.group.position;
        ball.position.set(p.x + 0.15, 1.15, p.z - 0.5);
        tutHitBall(player, -0.8, -3.5, [1.1]);
      } },
      { at: 8.6, cap: '✔ 雙腳都在廚房區<b>外</b>，空中截擊完全合法' },
      // ③ 合法做法二：球先落地，就可以進廚房打
      { at: 11.0, cap: '合法做法 ②：球<b>先在廚房區落地</b>——',
        act: () => tutServeBall(ai, 0.5, 1.5, [1.15]) },
      { at: 12.2, act: () => moveTo(player, 0.5, 1.7) }, // 球落地後才踏進廚房
      { at: 12.75, act: () => tutHitBall(player, -0.8, -1.6, [1.1]) },
      { at: 13.0, cap: '✔ 球落地後，進廚房區擊球也合法——這就是網前 dink 短球戰術' },
    ],
  },
  scoring: {
    duration: 15.5,
    onStart() {
      ball.visible = false;
      moveTo(player, 1.5, 5.5); moveTo(ai, -1.5, -4.5);
      scoreEl.classList.add('tutGlow');
    },
    steps: [
      { at: 0,    cap: '<b>計分方式</b>：只有「<b>發球方</b>」贏得該回合才能得 1 分（看上方發光的計分板）' },
      { at: 3.8,  cap: '接發球方贏球<b>不得分</b>，而是取得發球權，稱為 <b>side-out（換發）</b>' },
      { at: 7.6,  cap: '發球方看自己的分數：<b>偶數→右發球區、奇數→左發球區</b>，永遠發對角' },
      { at: 11.4, cap: '先拿到 <b>11 分</b>且<b>淨勝 2 分</b>者獲勝。正式比賽通常採三局兩勝 🏆' },
    ],
  },
};

function restartCurrentTut() {
  tut.t = 0; tut.fired = 0; tut.ballActive = false;
  tut.holdBall = null; tut.freezeNextBounce = false;
  for (const [h, c] of HL_COLORS) h.material.color.setHex(c);
  tut.def.onStart?.();
}
function startTutorial(key) {
  scoreEl.classList.remove('tutGlow');
  tut.key = key;
  tut.def = TUTORIALS[key];
  tut.glow = [];
  tut.moves.clear();
  restartCurrentTut();
  document.querySelectorAll('#tutOpts .tut').forEach((b) => b.classList.toggle('active', b.dataset.tut === key));
  document.getElementById('zoneOpts').style.display = key === 'zones' ? 'block' : 'none';
}
function stopTutorial() {
  tut.def = null; tut.key = null; tut.glow = []; tut.moves.clear();
  tut.holdBall = null; tut.freezeNextBounce = false;
  for (const h of ALL_HL) h.material.opacity = 0;
  for (const [h, c] of HL_COLORS) h.material.color.setHex(c);
  scoreEl.classList.remove('tutGlow');
  ball.visible = true;
}

function updateTutorial(dt) {
  if (!tut.def) return;
  tut.t += dt;
  const T = tut.def;
  while (tut.fired < T.steps.length && T.steps[tut.fired].at <= tut.t) {
    const s = T.steps[tut.fired++];
    if (s.cap) tutCapEl.innerHTML = s.cap;
    if (s.glow) tut.glow = s.glow;
    s.act?.();
  }
  if (tut.t >= T.duration) { restartCurrentTut(); return; }

  // 區域高亮呼吸燈
  const pulse = 0.2 + 0.12 * Math.sin(tut.t * 6);
  for (const h of ALL_HL) {
    const target = tut.glow.includes(h) ? pulse : 0;
    h.material.opacity += (target - h.material.opacity) * Math.min(1, 12 * dt);
  }
  // 劇本角色移動
  for (const [rig, tgt] of tut.moves) {
    const pos = rig.group.position;
    const dx = tgt.x - pos.x, dz = tgt.z - pos.z, d = Math.hypot(dx, dz);
    const moving = d > 0.06;
    if (moving) {
      const st = Math.min(2.8 * dt, d);
      pos.x += (dx / d) * st;
      pos.z += (dz / d) * st;
    }
    updateWalk(rig, moving, dt);
  }
  // 托球：球跟著人偶的非持拍手掌
  if (tut.holdBall && !tut.ballActive) {
    ball.visible = true;
    idleWristOf(tut.holdBall).getWorldPosition(ball.position);
    ball.position.y += 0.1;
  }
  // 示範球物理（不套用判定，每次落地都畫光圈）
  if (tut.ballActive && ball.visible) {
    state.ballV.y -= G * dt;
    ball.position.addScaledVector(state.ballV, dt);
    if (ball.position.y <= BALL_R && state.ballV.y < 0) {
      ball.position.y = BALL_R;
      spawnBounceRing(ball.position);
      if (tut.freezeNextBounce) {
        // 落地瞬間定格在落點，不彈起
        tut.freezeNextBounce = false;
        tut.ballActive = false;
        state.ballV.set(0, 0, 0);
      } else {
        state.ballV.y *= -0.68;
        state.ballV.x *= 0.8;
        state.ballV.z *= 0.8;
      }
    }
  }
}

// ---------- 黑衣人戰鬥系統 ----------
// 揮拍打到對手/裁判 → 黑衣人進場追殺（與玩家同速）；玩家可反擊，
// 黑衣人被打五下倒地，但會招來兩倍增援，直到玩家被打倒為止。
const WEAPON_TYPES = ['bat', 'pan', 'hammer', 'slingshot', 'dart'];
const WEAPON_DEF = {
  bat:       { melee: true, reach: 1.1 },                              // 鋁棒
  pan:       { melee: true, reach: 1.0 },                              // 平底鍋
  hammer:    { melee: true, reach: 1.15 },                             // 大木槌
  slingshot: { melee: false, standoff: 4.2, cd: 1.9, proj: 'lob' },    // 彈弓（拋物線石彈）
  dart:      { melee: false, standoff: 5.0, cd: 1.5, proj: 'straight' }, // 飛鏢（直線快速）
};

function buildWeapon(type) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.85, roughness: 0.3 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.45 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 });
  if (type === 'bat') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.75, 10), metal);
    m.position.y = -0.4;
    g.add(m);
  } else if (type === 'pan') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), iron);
    handle.position.y = -0.17;
    const panBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.05, 16), iron);
    panBody.rotation.x = Math.PI / 2;
    panBody.position.y = -0.45;
    g.add(handle, panBody);
  } else if (type === 'hammer') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), wood);
    handle.position.y = -0.32;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.13), wood);
    head.position.y = -0.62;
    g.add(handle, head);
  } else if (type === 'slingshot') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 8), wood);
    handle.position.y = -0.17;
    const prongL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), wood);
    prongL.position.set(-0.07, -0.38, 0);
    prongL.rotation.z = 0.5;
    const prongR = prongL.clone();
    prongR.position.x = 0.07;
    prongR.rotation.z = -0.5;
    g.add(handle, prongL, prongR);
  } else if (type === 'dart') {
    const dartMesh = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3, 8), metal);
    dartMesh.position.y = -0.3;
    dartMesh.rotation.x = Math.PI; // 鏢尖朝下待擲
    g.add(dartMesh);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// 決鬥鐵籠：戰鬥時升起，把玩家與黑衣人圍在場內
const CAGE_X = 7.5, CAGE_Z = 10.0, CAGE_H = 2.8;
const cage = new THREE.Group();
{
  const barMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f36, metalness: 0.7, roughness: 0.4, emissive: 0x2a0000,
  });
  const barGeo = new THREE.CylinderGeometry(0.035, 0.035, CAGE_H, 6);
  const addBar = (x, z) => {
    const b = new THREE.Mesh(barGeo, barMat);
    b.position.set(x, CAGE_H / 2, z);
    cage.add(b);
  };
  for (let x = -CAGE_X; x <= CAGE_X + 0.01; x += 0.65) { addBar(x, -CAGE_Z); addBar(x, CAGE_Z); }
  for (let z = -CAGE_Z + 0.65; z <= CAGE_Z - 0.64; z += 0.65) { addBar(-CAGE_X, z); addBar(CAGE_X, z); }
  const railX = new THREE.BoxGeometry(CAGE_X * 2 + 0.2, 0.09, 0.09);
  const railZ = new THREE.BoxGeometry(0.09, 0.09, CAGE_Z * 2 + 0.2);
  for (const z of [-CAGE_Z, CAGE_Z]) {
    const r = new THREE.Mesh(railX, barMat);
    r.position.set(0, CAGE_H, z);
    cage.add(r);
  }
  for (const x of [-CAGE_X, CAGE_X]) {
    const r = new THREE.Mesh(railZ, barMat);
    r.position.set(x, CAGE_H, 0);
    cage.add(r);
  }
}
cage.visible = false;
scene.add(cage);

const WEAPON_NAME = { bat: '鋁棒', pan: '平底鍋', hammer: '大木槌', slingshot: '彈弓', dart: '飛鏢' };

const combat = {
  active: false,
  thugs: [],        // { rig, weapon, weaponMesh, hp, state, swingT, cd, downT }
  projectiles: [],  // { mesh, v, lob, t, fromPlayer }
  drops: [],        // 掉落在地上的武器 { mesh, type }
  playerWeapon: null,
  playerWeaponMesh: null,
  playerHits: 0,
  playerState: 'ok', // 'ok' | 'fall' | 'dead'
  pt: 0,
};

function spawnThug() {
  if (combat.thugs.filter((t) => t.state !== 'down').length >= 16) return; // 場上人數上限
  const rig = makeCharacter({ shirt: 0x111111, skin: 0xd9a06b, paddleColor: 0x111111 });
  rig.paddle.visible = false;
  const weapon = WEAPON_TYPES[Math.floor(Math.random() * WEAPON_TYPES.length)];
  const weaponMesh = buildWeapon(weapon);
  rig.armR.wrist.add(weaponMesh);
  const side = Math.random() < 0.5 ? -1 : 1;
  rig.group.position.set(
    side * (CAGE_X - 0.4), 0,
    THREE.MathUtils.clamp(player.group.position.z + THREE.MathUtils.randFloat(-2.5, 2.5), -6.8, 6.8)
  );
  scene.add(rig.group);
  combat.thugs.push({ rig, weapon, weaponMesh, hp: 0, state: 'chase', swingT: 0, cd: THREE.MathUtils.randFloat(0.8, 1.6), downT: 0 });
}

// 全身紅光閃爍
const flashes = [];
function flashRed(rig) {
  flashes.push({ rig, t: 0 });
}
function updateFlashes(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    const k = Math.max(0, 1 - f.t / 0.45);
    f.rig.group.traverse((o) => {
      if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(k, 0, 0);
    });
    if (k <= 0) flashes.splice(i, 1);
  }
}

function startCombat() {
  combat.active = true;
  combat.playerHits = 0;
  combat.playerState = 'ok';
  state.phase = 'punish'; // 凍結回合
  state.ballV.set(0, 0, 0);
  cage.visible = true;
  cage.position.y = -CAGE_H; // 從地面升起
  spawnThug();
  showMsg('⚠ 你打到人了！鐵籠升起，黑衣人進場——逃不掉的，反擊吧！', true);
  refSignal('fault', 5);
}

// 玩家揮拍：戰鬥中攻擊黑衣人；平時打到對手/裁判會觸發戰鬥
function checkPersonHit() {
  if (state.mode === 'tutorial') return false;
  const pp = player.group.position;

  if (combat.active) {
    // 撿到遠程武器：攻擊鍵改為射擊
    if (combat.playerWeapon && !WEAPON_DEF[combat.playerWeapon].melee) {
      playerShoot();
      return true;
    }
    // 近戰攻擊最近的黑衣人（撿到近戰武器攻擊範圍更長）
    const reach = combat.playerWeapon ? 1.6 : 1.25;
    let best = null, bestD = reach;
    for (const t of combat.thugs) {
      if (t.state === 'down') continue;
      const d = Math.hypot(t.rig.group.position.x - pp.x, t.rig.group.position.z - pp.z);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best) {
      hitThug(best);
      return true;
    }
    return false;
  }

  for (const victim of [ai, referee]) {
    const vp = new THREE.Vector3();
    victim.group.getWorldPosition(vp);
    if (Math.hypot(vp.x - pp.x, vp.z - pp.z) < 1.15) {
      flashRed(victim); // 被打到的人偶閃紅光
      startCombat();
      return true;
    }
  }
  return false;
}

function hitThug(t) {
  t.hp++;
  flashRed(t.rig); // 被打到的黑衣人閃紅光
  if (t.hp >= 5) {
    t.state = 'down';
    t.downT = 0;
    // 武器掉落在地，可以撿
    const drop = t.weaponMesh;
    scene.add(drop); // 自動從黑衣人手上移除
    drop.position.set(
      t.rig.group.position.x + THREE.MathUtils.randFloat(-0.3, 0.3),
      0.08,
      t.rig.group.position.z + THREE.MathUtils.randFloat(-0.3, 0.3)
    );
    drop.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI); // 平躺在地
    combat.drops.push({ mesh: drop, type: t.weapon });
    showMsg('打倒一個黑衣人！武器掉了——快撿！兩倍增援來襲…');
    spawnThug();
    spawnThug();
  }
}

function equipWeapon(dropItem) {
  // 換掉手上原本的武器（或球拍）
  if (combat.playerWeaponMesh) {
    player.wrist.remove(combat.playerWeaponMesh);
  }
  const mesh = dropItem.mesh;
  mesh.rotation.set(0, 0, 0);
  mesh.position.set(0, 0, 0);
  player.wrist.add(mesh);
  combat.playerWeapon = dropItem.type;
  combat.playerWeaponMesh = mesh;
  player.paddle.visible = false;
  const def = WEAPON_DEF[dropItem.type];
  showMsg(`撿起了【${WEAPON_NAME[dropItem.type]}】！${def.melee ? '攻擊範圍變長' : '按攻擊鍵射擊'}`);
}

function playerShoot() {
  // 用撿到的遠程武器射向最近的黑衣人
  const from = new THREE.Vector3();
  player.wrist.getWorldPosition(from);
  const pp = player.group.position;
  let best = null, bd = Infinity;
  for (const t of combat.thugs) {
    if (t.state === 'down') continue;
    const d = Math.hypot(t.rig.group.position.x - pp.x, t.rig.group.position.z - pp.z);
    if (d < bd) { bd = d; best = t; }
  }
  const target = best
    ? best.rig.group.position.clone()
    : pp.clone().add(new THREE.Vector3(0, 0, -3));
  target.y = 1.0;
  launchProjectile(combat.playerWeapon, from, target, true);
}

function playerTakeHit() {
  if (combat.playerState !== 'ok') return;
  combat.playerHits++;
  flashRed(player);
  state.camShake = Math.max(state.camShake, 0.18);
  if (combat.playerHits >= 5) {
    combat.playerState = 'fall';
    combat.pt = 0;
    ctl.windup = null;
    ctl.chargeT = 0;
    ctl.releaseAnim = null;
  }
}

function launchProjectile(weaponType, from, target, fromPlayer) {
  const def = WEAPON_DEF[weaponType];
  let v, mesh;
  if (def.proj === 'lob') {
    // 彈弓：拋物線石彈
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 }));
    const T = 0.8;
    v = new THREE.Vector3(
      (target.x - from.x) / T,
      (target.y - from.y + 0.5 * G * T * T) / T,
      (target.z - from.z) / T
    );
  } else {
    // 飛鏢：直線快速
    mesh = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.28, 8),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.7, roughness: 0.3 }));
    v = target.clone().sub(from).normalize().multiplyScalar(12);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
  }
  mesh.position.copy(from);
  mesh.castShadow = true;
  scene.add(mesh);
  combat.projectiles.push({ mesh, v, lob: def.proj === 'lob', t: 0, fromPlayer });
}

function shootProjectile(t) {
  const from = new THREE.Vector3();
  t.rig.armR.wrist.getWorldPosition(from);
  const target = player.group.position.clone();
  target.y = 1.0;
  launchProjectile(t.weapon, from, target, false);
  t.swingT = 0.001; // 觸發投擲手臂動畫
}

function updateCombat(dt) {
  if (!combat.active) return;
  const pp = player.group.position;

  // 鐵籠升起
  if (cage.visible && cage.position.y < 0) {
    cage.position.y = Math.min(0, cage.position.y + 6 * dt);
  }
  // 撿武器：走到掉落武器旁自動拾取
  if (combat.playerState === 'ok') {
    for (let i = combat.drops.length - 1; i >= 0; i--) {
      const dp = combat.drops[i];
      if (Math.hypot(dp.mesh.position.x - pp.x, dp.mesh.position.z - pp.z) < 0.6) {
        combat.drops.splice(i, 1);
        equipWeapon(dp);
      }
    }
  }

  // 玩家倒地 → 重生倒數
  if (combat.playerState === 'fall') {
    combat.pt += dt;
    player.group.rotation.x = Math.min(1.5, (combat.pt / 0.6) * 1.5);
    if (combat.pt >= 0.7) { combat.playerState = 'dead'; combat.pt = 0; }
  } else if (combat.playerState === 'dead') {
    combat.pt += dt;
    showMsg(`💀 被打倒了！${Math.max(1, Math.ceil(5 - combat.pt))} 秒後重生…`, true);
    if (combat.pt >= 5) { endCombat(); return; }
  }
  const playerDown = combat.playerState !== 'ok';
  const SPEED = 4.0; // 與玩家同速

  // 黑衣人行動
  for (let i = combat.thugs.length - 1; i >= 0; i--) {
    const t = combat.thugs[i];
    const g = t.rig.group;
    if (t.state === 'down') {
      t.downT += dt;
      g.rotation.x = Math.min(1.5, (t.downT / 0.5) * 1.5); // 倒地
      if (t.downT > 2.5) { scene.remove(g); combat.thugs.splice(i, 1); }
      continue;
    }
    const dx = pp.x - g.position.x, dz = pp.z - g.position.z;
    const d = Math.hypot(dx, dz);
    g.rotation.y = Math.atan2(-dx, -dz); // 面向玩家
    const def = WEAPON_DEF[t.weapon];
    let moving = false;

    if (playerDown) {
      updateWalk(t.rig, false, dt);
      t.rig.armPivot.rotation.x += (0.5 - t.rig.armPivot.rotation.x) * Math.min(1, 6 * dt);
      continue;
    }

    if (def.melee) {
      if (d > 0.95) {
        // 追擊
        g.position.x += (dx / d) * SPEED * dt;
        g.position.z += (dz / d) * SPEED * dt;
        moving = true;
        t.swingT = 0;
        t.rig.armPivot.rotation.x += (0.9 - t.rig.armPivot.rotation.x) * Math.min(1, 8 * dt); // 舉著武器追
      } else {
        // 近戰掄擊，每一輪砸中就算一下
        const P = 0.55;
        const prev = Math.floor(t.swingT / P);
        t.swingT += dt;
        t.rig.armPivot.rotation.x = 0.5 + Math.sin(((t.swingT % P) / P) * Math.PI) * 2.1;
        if (Math.floor(t.swingT / P) > prev && d < def.reach) playerTakeHit();
      }
    } else {
      // 遠程：保持距離並射擊
      if (d > def.standoff + 0.8) {
        g.position.x += (dx / d) * SPEED * dt;
        g.position.z += (dz / d) * SPEED * dt;
        moving = true;
      } else if (d < def.standoff - 1.8) {
        // 後撤比玩家慢，追得上；且會被場地邊界擋住
        g.position.x -= (dx / d) * 2.3 * dt;
        g.position.z -= (dz / d) * 2.3 * dt;
        moving = true;
      }
      t.cd -= dt;
      if (t.cd <= 0 && d < def.standoff + 1.5) {
        shootProjectile(t);
        t.cd = def.cd;
      }
      if (t.swingT > 0) {
        // 投擲動作
        t.swingT += dt;
        const k = Math.min(t.swingT / 0.3, 1);
        t.rig.armPivot.rotation.x = 2.4 - k * 1.9;
        if (k >= 1) t.swingT = 0;
      } else {
        t.rig.armPivot.rotation.x += (0.9 - t.rig.armPivot.rotation.x) * Math.min(1, 8 * dt);
      }
    }
    // 鐵籠範圍內活動，退無可退（玩家可以把遠程型逼到籠邊）
    g.position.x = THREE.MathUtils.clamp(g.position.x, -(CAGE_X - 0.35), CAGE_X - 0.35);
    g.position.z = THREE.MathUtils.clamp(g.position.z, -(CAGE_Z - 0.35), CAGE_Z - 0.35);
    updateWalk(t.rig, moving, dt);
  }

  // 投射物飛行與命中（玩家射的打黑衣人，黑衣人射的打玩家）
  for (let i = combat.projectiles.length - 1; i >= 0; i--) {
    const p = combat.projectiles[i];
    p.t += dt;
    if (p.lob) p.v.y -= G * dt;
    p.mesh.position.addScaledVector(p.v, dt);
    let hit = false;
    if (p.fromPlayer) {
      for (const t of combat.thugs) {
        if (t.state === 'down') continue;
        const g = t.rig.group.position;
        if (Math.hypot(p.mesh.position.x - g.x, p.mesh.position.z - g.z) < 0.5 && p.mesh.position.y < 1.9) {
          hitThug(t);
          hit = true;
          break;
        }
      }
    } else {
      hit = !playerDown &&
        Math.hypot(p.mesh.position.x - pp.x, p.mesh.position.z - pp.z) < 0.45 &&
        p.mesh.position.y < 1.8;
      if (hit) playerTakeHit();
    }
    if (hit || p.t > 3 || p.mesh.position.y < 0) {
      scene.remove(p.mesh);
      combat.projectiles.splice(i, 1);
    }
  }
}

function endCombat() {
  for (const t of combat.thugs) scene.remove(t.rig.group);
  for (const p of combat.projectiles) scene.remove(p.mesh);
  for (const dp of combat.drops) scene.remove(dp.mesh);
  combat.thugs.length = 0;
  combat.projectiles.length = 0;
  combat.drops.length = 0;
  if (combat.playerWeaponMesh) {
    player.wrist.remove(combat.playerWeaponMesh);
    combat.playerWeaponMesh = null;
  }
  combat.playerWeapon = null;
  player.paddle.visible = true; // 拿回球拍
  cage.visible = false;
  combat.active = false;
  combat.playerState = 'ok';
  player.group.rotation.x = 0;
  player.group.position.set(0, 0, 5.2);
  showMsg('已重生——請尊重場上所有人 🙏');
  if (state.mode === 'match') resetForServe();
  else if (state.mode === 'practice') { state.phase = 'practiceWait'; state.feedTimer = 1.2; }
  else if (state.mode === 'shadow') state.phase = 'shadow';
}

// 人物實體碰撞：圓柱體互相推開，不能重疊
function separateBodies() {
  const bodies = [player.group, ai.group];
  for (const t of combat.thugs) if (t.state !== 'down') bodies.push(t.rig.group);
  const R = 0.36;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i].position, b = bodies[j].position;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < R * 2 && d > 1e-4) {
        const push = (R * 2 - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
      }
    }
  }
}

// 把球拍掛到指定的手，另一隻手回到自然垂放
function setPaddleHand(rig, hand) {
  const active = hand === 'left' ? rig.armL : rig.armR;
  const idle = hand === 'left' ? rig.armR : rig.armL;
  active.wrist.add(rig.paddle); // three.js 會自動從原本的手腕移除
  rig.armPivot = active.pivot;
  rig.wrist = active.wrist;
  active.wrist.rotation.set(0, 0, 0);
  idle.wrist.rotation.set(0, 0, 0);
  // 非持拍手向前內收到中線附近扶拍頸，但停在自己這一側，不越線交叉
  idle.pivot.rotation.set(0.85, 0, idle === rig.armL ? 0.3 : -0.3);
}

// ---------- 球 ----------
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 20, 16),
  new THREE.MeshStandardMaterial({ color: 0xd9ff2e, roughness: 0.5 })
);
ball.castShadow = true;
scene.add(ball);

// 球的地面落點提示（陰影圈）
const ballShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.14, 24),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
);
ballShadow.rotation.x = -Math.PI / 2;
ballShadow.position.y = 0.01;
scene.add(ballShadow);

// ---------- 遊戲狀態 ----------
const state = {
  phase: 'serve',           // 'serve' | 'rally' | 'point'
  ballV: new THREE.Vector3(),
  bounces: 0,               // 上次擊球後的彈跳數
  lastHitter: null,         // 'player' | 'ai'
  score: { player: 0, ai: 0 },
  rallyHits: 0,
  aiCooldown: 0,
  pointTimer: 0,
  smashTrail: 0,   // 殺球尾跡剩餘時間
  camShake: 0,     // 鏡頭震動剩餘時間
  netFault: false, // 這一球是否掛過網（影響得分訊息）
  smashBy: null,   // 這一球是誰殺的（'player' | 'ai' | null），用來觸發殺球得分特效
  hand: 'left',    // 慣用手：'left' | 'right'（影響按鍵、持拍手、側身方向）
  server: 'player',  // 發球權（只有發球方能得分）
  serveCourt: -1,    // 本球對角發球區的世界 x 正負號（落點須在該半場）
  serveFromX: 1,     // 發球方應站位的 x 正負號
  aiServeTimer: 0,   // AI 發球倒數
  mode: 'match',   // 'match' 對戰 | 'practice' 練球
  feedType: 'normal', // 練球餵球球路
  feedTimer: 0,    // 下一顆餵球倒數
  feedSide: 1,     // 左右調動用
};

// 玩家揮拍控制：按下 = 引拍（windup），放開 = 揮擊
const ctl = {
  windup: null,      // 'A' | 'D' | 'S' | 'W' | 'SMASH' | null
  chargeT: 0,        // 殺球蓄力秒數
  releaseAnim: null, // 揮擊動畫 { from, to, t, dur }
};
const CHARGE_MAX = 1.4; // 蓄力上限（秒）

// 慣用手：左撇子 = WASD 擊球、方向鍵移動；右撇子 = 方向鍵擊球、WASD 移動
let windupMap = {};
let moveMap = {};
function setHandedness(hand) {
  ctl.windup = null; // 切換時清掉引拍狀態，避免 keyup 對不上
  ctl.releaseAnim = null;
  state.hand = hand;
  setPaddleHand(player, hand); // 人偶的球拍換到對應的手
  if (hand === 'right') {
    windupMap = { Space: 'SMASH', ArrowLeft: 'A', ArrowRight: 'D', ArrowUp: 'W', ArrowDown: 'S' };
    moveMap = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS' };
  } else {
    windupMap = { Space: 'SMASH', KeyA: 'A', KeyD: 'D', KeyW: 'W', KeyS: 'S' };
    moveMap = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
  }
  const k = hand === 'right'
    ? { move: 'WASD', L: '←', R: '→', lob: '↓', block: '↑' }
    : { move: '方向鍵', L: 'A', R: 'D', lob: 'S', block: 'W' };
  document.getElementById('help').innerHTML =
    `${k.move} 移動 · 擊球採「<b>按住引拍、放開揮擊</b>」：球快到時放開才打得到<br>` +
    `<kbd>${k.L}</kbd> 左引拍→放開往<b>右</b>抽球 · <kbd>${k.R}</kbd> 右引拍→放開往<b>左</b>抽球 · ` +
    `<kbd>${k.lob}</kbd> 下引拍→放開挑<b>高球</b> · <kbd>${k.block}</kbd> 按住立拍於身前，球到自動擋成<b>短球</b><br>` +
    `<kbd>空白鍵</kbd> 發球；對打中<b>按住側身蓄力、放開殺球</b>（越久越快，球低於網會掛網）<br>` +
    `🖱 <b>滾輪</b>縮放視角 · <b>右鍵拖曳</b>旋轉視角<br>` +
    `<span class="note">完整規則：對角發球（偶數分右區／奇數分左區）・雙彈跳（發球後前兩拍須落地）・廚房區禁截擊・發球方才能得分，11 分制、淨勝 2 分獲勝</span>`;
  document.getElementById('handL').classList.toggle('active', hand !== 'right');
  document.getElementById('handR').classList.toggle('active', hand === 'right');
}

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (state.mode === 'tutorial') return; // 教學模式由劇本控制，停用操作
  if (combat.active && combat.playerState !== 'ok') return; // 倒地中無法操作
  if (e.code === 'Space' && state.phase === 'gameover') { restartMatch(); return; }
  if (e.code === 'Space' && state.phase === 'serve' && state.server === 'player') { doServe(); return; }
  const w = windupMap[e.code];
  if (w) {
    if (combat.active && combat.playerState === 'ok') {
      // 戰鬥中：按下立即揮擊攻擊黑衣人，不用引拍放開
      startRelease({ x: 1.0, z: w === 'A' ? 1.2 : -1.2, wrist: 0.4, body: 0 }, 0.14);
      checkPersonHit();
      return;
    }
    ctl.windup = w;
    if (w === 'SMASH') ctl.chargeT = 0;
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  const w = windupMap[e.code];
  if (!w || ctl.windup !== w) return; // 只處理目前引拍中的那顆鍵
  ctl.windup = null;
  if (w === 'SMASH') releaseSmash();
  else if (w === 'W') startRelease({ ...POSES.rest }, 0.15); // 收拍，不揮擊
  else releaseShot(w);
});

document.getElementById('handL').addEventListener('click', (e) => { e.target.blur(); setHandedness('left'); });
document.getElementById('handR').addEventListener('click', (e) => { e.target.blur(); setHandedness('right'); });
setHandedness('left');

// ---------- HUD ----------
const scoreEl = document.getElementById('score');
const msgEl = document.getElementById('msg');
const rallyEl = document.getElementById('rally');
let msgTimeout = null;

function showMsg(text, sticky = false) {
  msgEl.textContent = text;
  msgEl.style.opacity = 1;
  if (msgTimeout) clearTimeout(msgTimeout);
  if (!sticky) msgTimeout = setTimeout(() => { msgEl.style.opacity = 0; }, 1400);
}
function updateScore() {
  const serveTag = state.server === 'player' ? '你發球' : '對手發球';
  scoreEl.innerHTML =
    `<span class="you">${state.score.player}</span> : <span class="ai">${state.score.ai}</span>` +
    `<small style="display:block;font-size:11px;font-weight:400;opacity:.75;text-align:center">${serveTag}｜11 分制・發球方得分</small>`;
}

// ---------- 練球模式面板 ----------
const flashEl = document.getElementById('flash');
const chargeWrap = document.getElementById('chargeWrap');
const chargeFill = document.getElementById('chargeFill');
const modeBtn = document.getElementById('modeBtn');
const feedOpts = document.getElementById('feedOpts');

const shadowBtn = document.getElementById('shadowBtn');

const tutBtn = document.getElementById('tutBtn');
const tutOpts = document.getElementById('tutOpts');

// 操作說明收合
const helpEl = document.getElementById('help');
const helpToggle = document.getElementById('helpToggle');
let helpCollapsed = false;
function applyHelpVisibility() {
  const isTut = state.mode === 'tutorial';
  helpEl.style.display = (isTut || helpCollapsed) ? 'none' : '';
  helpToggle.style.display = isTut ? 'none' : 'block'; // 教學模式有自己的字幕框，不顯示切換鈕
  helpToggle.textContent = helpCollapsed ? '❔ 顯示操作說明' : '✕ 收起說明';
}
helpToggle.addEventListener('click', () => {
  helpToggle.blur();
  helpCollapsed = !helpCollapsed;
  applyHelpVisibility();
});

function setMode(mode) {
  state.mode = mode; // 'match' | 'practice' | 'shadow' | 'tutorial'
  const isShadow = mode === 'shadow';
  const isTut = mode === 'tutorial';
  ball.visible = !isShadow;
  ballShadow.visible = !isShadow;
  modeBtn.classList.toggle('on', mode === 'practice');
  shadowBtn.classList.toggle('on', isShadow);
  tutBtn.classList.toggle('on', isTut);
  modeBtn.textContent = mode === 'practice' ? '結束練球（回對戰）' : '開始練球';
  shadowBtn.textContent = isShadow ? '結束空揮（回對戰）' : '空揮練習（無球）';
  tutBtn.textContent = isTut ? '離開教學（回對戰）' : '進入教學模式';
  feedOpts.style.display = mode === 'practice' ? 'block' : 'none';
  tutOpts.style.display = isTut ? 'block' : 'none';
  tutCapEl.style.display = isTut ? 'block' : 'none';
  applyHelpVisibility();
  if (!isTut) stopTutorial();

  if (mode === 'practice') {
    scoreEl.textContent = '練球中';
    state.phase = 'practiceWait';
    state.feedTimer = 1.0;
    showMsg('對手開始餵球！');
  } else if (mode === 'shadow') {
    scoreEl.textContent = '空揮練習';
    state.phase = 'shadow';
    state.ballV.set(0, 0, 0);
    showMsg('沒有球，自由練習揮拍動作！');
  } else if (mode === 'tutorial') {
    updateScore(); // 計分課程需要看到計分板
    state.phase = 'tutorial';
    state.ballV.set(0, 0, 0);
    msgEl.style.opacity = 0;
    startTutorial('zones');
  } else {
    updateScore();
    resetForServe();
  }
}

modeBtn.addEventListener('click', () => {
  modeBtn.blur(); // 避免之後按空白鍵又觸發按鈕
  setMode(state.mode === 'practice' ? 'match' : 'practice');
});
shadowBtn.addEventListener('click', () => {
  shadowBtn.blur();
  setMode(state.mode === 'shadow' ? 'match' : 'shadow');
});
tutBtn.addEventListener('click', () => {
  tutBtn.blur();
  setMode(state.mode === 'tutorial' ? 'match' : 'tutorial');
});
for (const b of document.querySelectorAll('#tutOpts .tut')) {
  b.addEventListener('click', () => {
    b.blur();
    startTutorial(b.dataset.tut);
  });
}
for (const b of document.querySelectorAll('#zoneOpts .zone')) {
  b.addEventListener('click', () => {
    b.blur();
    selectZone(b.dataset.zone);
  });
}
for (const b of document.querySelectorAll('#feedOpts .feed')) {
  b.addEventListener('click', () => {
    b.blur();
    document.querySelectorAll('#feedOpts .feed').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.feedType = b.dataset.type;
  });
}

// ---------- 殺球特效 ----------
const fxList = [];
const ringGeo = new THREE.RingGeometry(0.12, 0.2, 32);
const sparkGeo = new THREE.SphereGeometry(0.035, 6, 5);
const trailGeo = new THREE.SphereGeometry(BALL_R * 0.9, 10, 8);

function smashFX(pos, intensity = 1) {
  state.smashTrail = 0.3 + 0.35 * intensity;
  state.camShake = 0.18 + 0.2 * intensity;
  // 衝擊波圓環（面向鏡頭、放大淡出）
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: 0xffd34d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false,
  }));
  ring.position.copy(pos);
  ring.lookAt(camera.position);
  scene.add(ring);
  fxList.push({ mesh: ring, t: 0, update(dt) {
    this.t += dt; const k = this.t / 0.35;
    this.mesh.scale.setScalar(1 + k * 6);
    this.mesh.material.opacity = Math.max(0, 0.95 * (1 - k));
    return k < 1;
  }});
  // 火花粒子（強度越高越多）
  const sparkCount = Math.round(10 + 12 * intensity);
  for (let i = 0; i < sparkCount; i++) {
    const spark = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
      color: Math.random() < 0.5 ? 0xffd34d : 0xff7b2f, transparent: true, opacity: 1, depthWrite: false,
    }));
    spark.position.copy(pos);
    const v = new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 4 + 1, (Math.random() - 0.5) * 7);
    scene.add(spark);
    fxList.push({ mesh: spark, t: 0, update(dt) {
      this.t += dt; const k = this.t / 0.5;
      v.y -= 12 * dt;
      this.mesh.position.addScaledVector(v, dt);
      this.mesh.material.opacity = Math.max(0, 1 - k);
      return k < 1;
    }});
  }
}

// 殺球飛行中的火焰殘影
function spawnTrailGhost() {
  const ghost = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
    color: 0xff8c2f, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  ghost.position.copy(ball.position);
  scene.add(ghost);
  fxList.push({ mesh: ghost, t: 0, update(dt) {
    this.t += dt; const k = this.t / 0.28;
    this.mesh.material.opacity = Math.max(0, 0.55 * (1 - k));
    this.mesh.scale.setScalar(Math.max(0.3, 1 - k * 0.6));
    return k < 1;
  }});
}

// 殺球得分：全畫面閃光 + 彩帶噴發 + 大震動
const CONFETTI_COLORS = [0xff5e5e, 0x5ec8ff, 0xffd34d, 0x7aff8a, 0xff8ce0];
const confettiGeo = new THREE.PlaneGeometry(0.07, 0.12);

function smashPointFX(winner) {
  showMsg(winner === 'player' ? '💥 殺球得分！' : '💥 被對手殺球了！');
  state.camShake = 0.5;
  // 閃一下白光
  flashEl.style.transition = 'none';
  flashEl.style.opacity = winner === 'player' ? 0.65 : 0.45;
  requestAnimationFrame(() => {
    flashEl.style.transition = 'opacity .6s';
    flashEl.style.opacity = 0;
  });
  // 彩帶從落點噴出
  for (let i = 0; i < 40; i++) {
    const c = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false,
    }));
    c.position.copy(ball.position);
    c.position.y += 0.1;
    const v = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5 + 2, (Math.random() - 0.5) * 6);
    const spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    scene.add(c);
    fxList.push({ mesh: c, t: 0, update(dt) {
      this.t += dt; const k = this.t / 1.1;
      v.y -= 7 * dt;
      this.mesh.position.addScaledVector(v, dt);
      this.mesh.rotation.x += spin.x * dt;
      this.mesh.rotation.y += spin.y * dt;
      this.mesh.rotation.z += spin.z * dt;
      this.mesh.material.opacity = Math.max(0, 1 - k * k);
      return k < 1;
    }});
  }
}

function updateFX(dt) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    if (!fxList[i].update(dt)) {
      scene.remove(fxList[i].mesh);
      fxList[i].mesh.material.dispose();
      fxList.splice(i, 1);
    }
  }
  if (state.smashTrail > 0 && state.phase === 'rally') {
    state.smashTrail -= dt;
    spawnTrailGhost();
    ball.material.emissive.setHex(0xff5500);
  } else {
    ball.material.emissive.setHex(0x000000);
  }
}

// ---------- 擊球軌跡計算 ----------
// 從 from 打一顆會落在 target 的拋物線球，自動挑一個能過網的飛行時間
// times 可自訂：越長的飛行時間 = 越高越慢的弧線
function launchTo(from, target, times = [0.7, 0.85, 1.0, 1.2, 1.45]) {
  for (const T of times) {
    const vx = (target.x - from.x) / T;
    const vz = (target.z - from.z) / T;
    const vy = (BALL_R - from.y + 0.5 * G * T * T) / T;
    // 檢查過網時的高度
    if (Math.sign(from.z) !== Math.sign(target.z) && vz !== 0) {
      const tNet = (0 - from.z) / vz;
      if (tNet > 0 && tNet < T) {
        const yNet = from.y + vy * tNet - 0.5 * G * tNet * tNet;
        if (yNet < NET_H + 0.18) continue; // 過不了網，換更高的弧線
      }
    }
    return new THREE.Vector3(vx, vy, vz);
  }
  // 全都過不了就用最高弧線
  const T = times[times.length - 1];
  return new THREE.Vector3(
    (target.x - from.x) / T,
    (BALL_R - from.y + 0.5 * G * T * T) / T,
    (target.z - from.z) / T
  );
}

function triggerSwing(rig) { rig.swingT = 0; }

// ---------- 玩家操作：引拍姿勢與揮擊 ----------
// 姿勢 = 揮拍手角度 (x, z) + 手腕/拍面角度 (wrist) + 身體朝向 (body)
// 手臂前舉角度 x 和手腕角度 wrist 相加 ≈ 0 時，拍面正對對手
const POSES = {
  // 預備：拍子放在身體正前方中線，拍頭指向對手、拍面朝左右（另一手由 setPaddleHand 扶向拍頸）
  // mirrorZ：這個姿勢的左右內收方向需隨持拍手鏡像
  rest:  { x: 1.0,  z: -0.28, wrist: 0.35, twist: 1.45, body: 0, mirrorZ: true },
  A:     { x: -0.2, z: -1.0, wrist: 0,    body: 0 },     // 引拍：水平偏下拉向左側
  D:     { x: -0.2, z: 1.2,  wrist: 0,    body: 0 },     // 引拍：水平偏下拉向右側
  S:     { x: -1.1, z: 0.25, wrist: 0.6,  body: 0 },     // 引拍：下壓到身後，拍面微開
  W:     { x: 1.5,  z: 0.1,  wrist: 1.1,  body: 0 },     // 擋球：拍子立在臉前，拍頭朝上、拍面朝向自己的臉
  SMASH: { x: 2.5,  z: 0.3,  wrist: 0,    body: -0.85 }, // 殺球：側身、手臂從身前高舉過頭，拍頭朝上
};

function capturePose() {
  return {
    x: player.armPivot.rotation.x,
    z: player.armPivot.rotation.z,
    wrist: player.wrist.rotation.x,
    twist: player.wrist.rotation.y, // 拍子繞拍柄軸的旋轉（前臂內外旋）
    body: player.group.rotation.y,
  };
}
// 姿勢數值以右手持拍為準；側身方向（body）與標了 mirrorZ 的左右內收依持拍手鏡像
const bodySign = () => (state.hand === 'left' ? -1 : 1);
function resolvePose(p) {
  const zs = p.mirrorZ && state.hand === 'left' ? -1 : 1;
  return {
    x: p.x,
    z: p.z * zs,
    wrist: p.wrist,
    twist: (p.twist ?? 0) * zs,
    body: (p.body ?? 0) * bodySign(),
  };
}

function startRelease(to, dur = 0.16) {
  ctl.releaseAnim = { from: capturePose(), to: resolvePose(to), t: 0, dur };
}

function canHitNow() {
  if (state.phase !== 'rally' || state.lastHitter === 'player') return false;
  const dx = ball.position.x - player.group.position.x;
  const dz = ball.position.z - player.group.position.z;
  return Math.hypot(dx, dz) < 1.45 && ball.position.y < 2.6;
}

// 完整規則：截擊（球未落地就打）的違例檢查，回傳違例說明或 null
function hitViolation() {
  if (state.mode !== 'match') return null;
  if (state.bounces > 0) return null; // 球已落地，合法
  if (state.rallyHits < 3) return '雙彈跳違例！發球後前兩拍須等球落地';
  if (player.group.position.z < KITCHEN) return '廚房區違例！不可在非截擊區內截擊';
  return null;
}

function playerHit(target, times, msg) {
  const violation = hitViolation();
  if (violation) { endPoint('ai', violation); return; }
  state.ballV.copy(launchTo(ball.position, target, times));
  state.smashBy = null;
  state.lastHitter = 'player';
  state.bounces = 0;
  state.netFault = false;
  state.rallyHits++;
  if (msg) showMsg(msg);
}

function doServe() {
  // 發球站位檢查：底線後、正確的發球區
  const p = player.group.position;
  if (p.z < HALF_L - 0.1) { showMsg('發球要站在底線後！'); return; }
  if (p.x * state.serveFromX < 0) {
    showMsg(`這一球要從${state.serveFromX > 0 ? '右' : '左'}發球區發！`);
    return;
  }
  // 對角發球：落點須越過廚房區、在對角半場
  const target = new THREE.Vector3(
    state.serveCourt * THREE.MathUtils.randFloat(0.6, 2.5), 0,
    -THREE.MathUtils.randFloat(KITCHEN + 0.6, HALF_L - 0.4)
  );
  state.ballV.copy(launchTo(ball.position, target));
  state.phase = 'rally';
  state.lastHitter = 'player';
  state.bounces = 0;
  state.netFault = false;
  state.smashBy = null;
  state.rallyHits = 1;
  startRelease({ x: 1.6, z: 0.18, wrist: -0.8, body: 0 }, 0.15);
  msgEl.style.opacity = 0;
}

// AI 發球（有發球權時自動倒數發出）
function aiServe() {
  const target = new THREE.Vector3(
    state.serveCourt * THREE.MathUtils.randFloat(0.6, 2.5), 0,
    THREE.MathUtils.randFloat(KITCHEN + 0.6, HALF_L - 0.4)
  );
  state.ballV.copy(launchTo(ball.position, target, [1.0, 1.2, 1.45]));
  state.phase = 'rally';
  state.lastHitter = 'ai';
  state.bounces = 0;
  state.netFault = false;
  state.smashBy = null;
  state.rallyHits = 1;
  triggerSwing(ai);
  msgEl.style.opacity = 0;
}

function restartMatch() {
  state.score.player = 0;
  state.score.ai = 0;
  state.server = 'player';
  updateScore();
  resetForServe();
}

// 放開 A/D/S：往引拍的反方向揮出去
function releaseShot(type) {
  // 收尾：手臂伸向正前方（手臂仰角 + 手腕角 ≈ 90° = 拍頭指向正前方），twist 讓拍面朝左右
  if (type === 'A') startRelease({ x: 1.1, z: 0.9, wrist: 0.5, twist: 1.45, body: 0 });   // 由左往右抽，拍面朝右
  if (type === 'D') startRelease({ x: 1.1, z: -0.9, wrist: 0.5, twist: -1.45, body: 0 }); // 由右往左抽，拍面朝左
  if (type === 'S') startRelease({ x: 2.1, z: 0.25, wrist: 0.3, body: 0 });               // 由下往上挑，拍面開向天空
  if (checkPersonHit()) return; // 揮到人：黑衣人伺候
  if (!canHitNow()) return; // 揮空

  if (type === 'A') {
    // 左引拍 → 往右揮 → 球往右去
    playerHit(new THREE.Vector3(THREE.MathUtils.randFloat(1.5, 2.7), 0, THREE.MathUtils.randFloat(-6.0, -2.4)));
  } else if (type === 'D') {
    // 右引拍 → 往左揮 → 球往左去
    playerHit(new THREE.Vector3(THREE.MathUtils.randFloat(-2.7, -1.5), 0, THREE.MathUtils.randFloat(-6.0, -2.4)));
  } else if (type === 'S') {
    // 下引拍 → 往上挑 → 高吊球
    playerHit(
      new THREE.Vector3(THREE.MathUtils.randFloat(-1.8, 1.8), 0, THREE.MathUtils.randFloat(-6.3, -5.2)),
      [1.5, 1.7, 1.9], '高吊球！'
    );
  }
}

// 放開空白鍵：殺球，蓄力越久球速越快
function releaseSmash() {
  const charge = Math.min(ctl.chargeT / CHARGE_MAX, 1);
  ctl.chargeT = 0;
  // 從高舉處往前下方劈擊
  startRelease({ x: 0.9, z: 0.3, wrist: -0.3, body: 0 }, 0.11);
  if (checkPersonHit()) return; // 殺球殺到人：黑衣人伺候
  if (!canHitNow()) return;
  const violation = hitViolation();
  if (violation) { endPoint('ai', violation); return; }

  const from = ball.position;
  const target = new THREE.Vector3(
    THREE.MathUtils.randFloat(-2.2, 2.2), 0,
    THREE.MathUtils.randFloat(-5.8, -2.8)
  );
  if (from.y > NET_H + BALL_R) {
    // 蓄力決定飛行時間：沒蓄力 ≈ 一般擊球（0.75 秒），滿蓄力是 0.28 秒的炮彈
    const T = THREE.MathUtils.lerp(0.75, 0.28, charge);
    state.ballV.copy(launchTo(from, target, [T, T + 0.08, T + 0.18]));
    showMsg(charge > 0.75 ? '全力殺球！💥💥' : '殺球！💥');
  } else {
    // 擊球點太低，硬殺只會砸在網子上
    const T = 0.35;
    state.ballV.set(
      (target.x - from.x) / T,
      (BALL_R - from.y + 0.5 * G * T * T) / T,
      (target.z - from.z) / T
    );
  }
  smashFX(from.clone(), 0.3 + 1.3 * charge);
  state.smashBy = 'player';
  state.lastHitter = 'player';
  state.bounces = 0;
  state.netFault = false;
  state.rallyHits++;
}

// 每一幀更新玩家的手臂姿勢
function updatePlayerArm(dt) {
  const arm = player.armPivot.rotation;

  if (ctl.releaseAnim) {
    // 揮擊中：快速插值到揮擊終點
    const ra = ctl.releaseAnim;
    ra.t += dt;
    const k = Math.min(ra.t / ra.dur, 1);
    arm.x = THREE.MathUtils.lerp(ra.from.x, ra.to.x, k);
    arm.z = THREE.MathUtils.lerp(ra.from.z, ra.to.z, k);
    player.wrist.rotation.x = THREE.MathUtils.lerp(ra.from.wrist, ra.to.wrist, k);
    player.wrist.rotation.y = THREE.MathUtils.lerp(ra.from.twist ?? 0, ra.to.twist ?? 0, k);
    player.group.rotation.y = THREE.MathUtils.lerp(ra.from.body, ra.to.body, k);
    if (k >= 1) ctl.releaseAnim = null;
    return;
  }

  const pose = resolvePose(ctl.windup ? POSES[ctl.windup] : POSES.rest);
  const k = Math.min(1, (ctl.windup ? 12 : 8) * dt);
  arm.x += (pose.x - arm.x) * k;
  arm.z += (pose.z - arm.z) * k;
  player.wrist.rotation.x += (pose.wrist - player.wrist.rotation.x) * k;
  player.wrist.rotation.y += (pose.twist - player.wrist.rotation.y) * k;
  player.group.rotation.y += (pose.body - player.group.rotation.y) * k;

  if (ctl.windup === 'SMASH') {
    ctl.chargeT = Math.min(ctl.chargeT + dt, CHARGE_MAX);
  }

  // W 擋球：拍子立在身前，球到了直接反彈成短球，不用放開
  if (ctl.windup === 'W' && canHitNow()) {
    playerHit(
      new THREE.Vector3(THREE.MathUtils.randFloat(-1.5, 1.5), 0, THREE.MathUtils.randFloat(-2.0, -0.9)),
      [0.8, 0.95, 1.1], '擋短球！'
    );
    startRelease({ x: 1.75, z: 0.1, wrist: 0.95, body: 0 }, 0.1); // 小小的推擋動作，拍頭保持朝上
  }
}

// ---------- 得分與重置 ----------
function endPoint(winner, reason) {
  const wonBySmash = state.smashBy === winner && state.lastHitter === winner;
  refSignal(signalFromReason(reason)); // 裁判比出對應手勢

  if (state.mode === 'practice') {
    // 練球模式：不計分，直接餵下一顆
    if (wonBySmash && winner === 'player') smashPointFX('player');
    else showMsg(winner === 'player' ? '好球！👍' : '再來一球');
    state.phase = 'practiceWait';
    state.feedTimer = 1.3;
    return;
  }

  state.phase = 'point';
  state.pointTimer = 1.8;

  if (winner === state.server) {
    // 發球方贏球才得分
    state.score[winner]++;
    updateScore();
    if (wonBySmash) {
      smashPointFX(winner);
    } else {
      showMsg(`${reason}　${winner === 'player' ? '你得分！🎉' : '對手得分'}`);
    }
    // 勝利判定：11 分、淨勝 2
    const w = state.score[winner];
    const l = state.score[winner === 'player' ? 'ai' : 'player'];
    if (w >= 11 && w - l >= 2) {
      state.phase = 'gameover';
      refSignal('win', 6); // 裁判雙手高舉宣告比賽結束
      showMsg(`🏆 ${winner === 'player' ? '你贏得比賽' : '對手贏得比賽'} ${w}:${l}！按空白鍵再來一場`, true);
    }
  } else {
    // 接發球方贏球：不得分，取得發球權（side-out）
    state.server = winner;
    updateScore();
    if (wonBySmash) smashPointFX(winner);
    else showMsg(`${reason}　換邊發球`);
  }
}

function resetForServe() {
  state.phase = 'serve';
  state.lastHitter = null;
  state.bounces = 0;
  state.rallyHits = 0;
  state.smashTrail = 0;
  state.netFault = false;
  state.smashBy = null;
  state.ballV.set(0, 0, 0);

  // 發球方計分偶數站右區、奇數站左區；發對角
  const s = state.server;
  const even = state.score[s] % 2 === 0;
  // 玩家的右區 = 世界 +x；AI（面向 +z）的右區 = 世界 -x
  const sx = s === 'player' ? (even ? 1.5 : -1.5) : (even ? -1.5 : 1.5);
  state.serveFromX = Math.sign(sx);
  state.serveCourt = -Math.sign(sx); // 對角 = x 異號的半場

  if (s === 'player') {
    player.group.position.set(sx, 0, 7.0);
    ai.group.position.set(state.serveCourt * 1.5, 0, -5.8); // 對角接發
    showMsg(`你發球（${even ? '右' : '左'}區）：按【空白鍵】`, true);
  } else {
    ai.group.position.set(sx, 0, -7.0);
    player.group.position.set(state.serveCourt * 1.5, 0, 6.2);
    state.aiServeTimer = 1.4;
    showMsg(`對手發球（${even ? '右' : '左'}區）`, true);
  }
}

// ---------- 練球模式：餵球機 ----------
function feedBall() {
  const p = ai.group.position;
  ball.position.set(p.x + 0.3, 1.1, p.z + 0.3);
  triggerSwing(ai);
  const pl = player.group.position;
  let target, times;
  switch (state.feedType) {
    case 'lob': // 高球：吊到你附近的高空，練習抓時機殺球
      target = new THREE.Vector3(
        THREE.MathUtils.clamp(pl.x + THREE.MathUtils.randFloat(-0.6, 0.6), -2.5, 2.5), 0,
        THREE.MathUtils.clamp(pl.z + THREE.MathUtils.randFloat(-0.6, 0.6), 2.8, 6.2)
      );
      times = [1.6, 1.8, 2.0];
      break;
    case 'drop': // 短球：掉在廚房區附近，練習往前衝
      target = new THREE.Vector3(THREE.MathUtils.randFloat(-1.5, 1.5), 0, THREE.MathUtils.randFloat(0.9, 1.9));
      times = [0.95, 1.1];
      break;
    case 'corners': // 左右調動：輪流打兩側邊線
      state.feedSide = -state.feedSide;
      target = new THREE.Vector3(state.feedSide * 2.3, 0, THREE.MathUtils.randFloat(3.0, 5.5));
      break;
    default: // 平球
      target = new THREE.Vector3(THREE.MathUtils.randFloat(-2.0, 2.0), 0, THREE.MathUtils.randFloat(3.0, 5.8));
  }
  state.ballV.copy(launchTo(ball.position, target, times));
  state.phase = 'rally';
  state.lastHitter = 'ai';
  state.bounces = 0;
  state.netFault = false;
  state.smashBy = null;
}

// ---------- AI 對手 ----------
function predictLanding() {
  // 解拋物線：球何時落到地面高度
  const p = ball.position, v = state.ballV;
  const disc = v.y * v.y + 2 * G * (p.y - BALL_R);
  if (disc < 0) return null;
  const t = (v.y + Math.sqrt(disc)) / G;
  return { x: p.x + v.x * t, z: p.z + v.z * t };
}

// AI 的殺球姿勢狀態：windup = 側身蓄力中，release >= 0 = 下劈動畫進行中
const aiSmash = { windup: false, release: -1 };

// AI 的手臂/身體姿勢（殺球蓄力與下劈；一般揮拍仍走 updateSwing）
function updateAIPose(dt) {
  const arm = ai.armPivot.rotation;

  if (aiSmash.release >= 0) {
    // 下劈：從高舉處快速揮到前下方
    aiSmash.release += dt;
    const k = Math.min(aiSmash.release / 0.12, 1);
    arm.x = THREE.MathUtils.lerp(2.5, 0.9, k);
    ai.wrist.rotation.x = THREE.MathUtils.lerp(0, -0.3, k);
    ai.group.rotation.y = THREE.MathUtils.lerp(Math.PI - 0.85, Math.PI, k);
    if (k >= 1) aiSmash.release = -1;
    return;
  }
  if (ai.swingT >= 0) return; // 一般揮拍動畫進行中，不干涉

  // 蓄力姿勢（側身、手臂從身前高舉）或回到預備姿勢（拍子舉在身前）
  const target = aiSmash.windup
    ? { x: 2.5, z: 0.3, wrist: 0, body: Math.PI - 0.85 }
    : { x: 1.0, z: -0.28, wrist: 0.35, body: Math.PI };
  const k = Math.min(1, 8 * dt);
  arm.x += (target.x - arm.x) * k;
  arm.z += (target.z - arm.z) * k;
  ai.wrist.rotation.x += (target.wrist - ai.wrist.rotation.x) * k;
  ai.group.rotation.y += (target.body - ai.group.rotation.y) * k;
}

function updateAI(dt) {
  state.aiCooldown = Math.max(0, state.aiCooldown - dt);
  const pos = ai.group.position;

  // 預判來球到達時的高度：夠高就提前側身蓄力
  aiSmash.windup = false;
  if (state.mode === 'match' && state.phase === 'rally'
      && state.lastHitter === 'player' && state.ballV.z < 0) {
    const t = (ball.position.z - pos.z) / -state.ballV.z;
    if (t > 0 && t < 1.4) {
      const yAtArrival = ball.position.y + state.ballV.y * t - 0.5 * G * t * t;
      if (yAtArrival > NET_H + 0.25) aiSmash.windup = true;
    }
  }
  updateAIPose(dt);

  // 練球 / 空揮模式：AI 站在原地，不跑位不回擊
  if (state.mode !== 'match') {
    updateWalk(ai, false, dt);
    return;
  }
  const AI_SPEED = 3.0;
  let targetX = 0, targetZ = -3.8; // 預設站位

  if (state.phase === 'rally' && state.lastHitter === 'player') {
    const landing = predictLanding();
    if (landing && landing.z < 0.5) {
      targetX = THREE.MathUtils.clamp(landing.x, -3.3, 3.3);
      targetZ = THREE.MathUtils.clamp(landing.z, -6.4, -1.2);
    }
  }
  const dx = targetX - pos.x, dz = targetZ - pos.z;
  const d = Math.hypot(dx, dz);
  const moving = d > 0.08;
  if (moving) {
    const step = Math.min(AI_SPEED * dt, d);
    pos.x += (dx / d) * step;
    pos.z += (dz / d) * step;
  }
  updateWalk(ai, moving, dt);

  // AI 擊球判定
  if (state.phase === 'rally' && state.lastHitter === 'player' && state.aiCooldown <= 0) {
    const bd = Math.hypot(ball.position.x - pos.x, ball.position.z - pos.z);
    // 完整規則：雙彈跳（前兩拍須落地）、廚房區內不可截擊
    const volley = state.bounces === 0;
    const illegalVolley = volley && (state.rallyHits < 3 || pos.z > -KITCHEN);
    if (bd < 1.4 && ball.position.z < -0.3 && ball.position.y < 2.3 && !illegalVolley) {
      if (ball.position.y > NET_H + 0.2) {
        // 球夠高：AI 殺球（已側身蓄力，放出下劈動畫）
        aiSmash.release = 0;
        const target = new THREE.Vector3(
          THREE.MathUtils.randFloat(-2.2, 2.2), 0,
          THREE.MathUtils.randFloat(2.6, 5.6)
        );
        state.ballV.copy(launchTo(ball.position, target, [0.32, 0.4, 0.5, 0.6]));
        smashFX(ball.position.clone());
        showMsg('對手殺球！⚡');
        state.smashBy = 'ai';
      } else {
        triggerSwing(ai);
        // 一般回球，偶爾失誤打到界外
        let tx = THREE.MathUtils.randFloat(-2.4, 2.4);
        let tz = THREE.MathUtils.randFloat(2.4, 6.1);
        if (Math.random() < 0.1) tx = Math.sign(tx) * THREE.MathUtils.randFloat(3.2, 3.8);
        state.ballV.copy(launchTo(ball.position, new THREE.Vector3(tx, 0, tz)));
        state.smashBy = null;
      }
      state.lastHitter = 'ai';
      state.bounces = 0;
      state.netFault = false;
      state.rallyHits++;
      state.aiCooldown = 0.5;
    }
  }
}

// ---------- 動畫 ----------
function updateWalk(rig, moving, dt) {
  if (moving) {
    rig.walkT += dt * 9;
    rig.legL.rotation.x = Math.sin(rig.walkT) * 0.55;
    rig.legR.rotation.x = -Math.sin(rig.walkT) * 0.55;
  } else {
    rig.legL.rotation.x *= 0.8;
    rig.legR.rotation.x *= 0.8;
  }
}

function updateSwing(rig, dt) {
  if (rig.swingT < 0) return;
  rig.swingT += dt;
  const k = rig.swingT / 0.32;
  if (k >= 1) {
    rig.swingT = -1;
    rig.armPivot.rotation.x = 0.35;
    return;
  }
  // 先往後引拍，再往前揮擊（rotation.x 為正 = 手臂往網子方向揮）
  const REST = 0.35, BACK = -1.3, FRONT = 2.0;
  let r;
  if (k < 0.3) r = THREE.MathUtils.lerp(REST, BACK, k / 0.3);
  else if (k < 0.65) r = THREE.MathUtils.lerp(BACK, FRONT, (k - 0.3) / 0.35);
  else r = THREE.MathUtils.lerp(FRONT, REST, (k - 0.65) / 0.35);
  rig.armPivot.rotation.x = r;
}

// ---------- 球的物理 ----------
function updateBall(dt) {
  if (state.phase === 'serve') {
    // 球精確放在發球者「非持拍手」的手掌上（取手腕節點的世界座標）
    if (state.mode === 'match' && state.server === 'ai') {
      ai.armL.wrist.getWorldPosition(ball.position);
    } else {
      const idleArm = state.hand === 'left' ? player.armR : player.armL;
      idleArm.wrist.getWorldPosition(ball.position);
    }
    ball.position.y += 0.1; // 球心疊在手掌上方
    return;
  }
  if (state.phase !== 'rally') return;

  const prevZ = ball.position.z;
  state.ballV.y -= G * dt;
  ball.position.addScaledVector(state.ballV, dt);

  // 掛網判定：越過中線時高度不夠
  if (Math.sign(prevZ) !== Math.sign(ball.position.z) && prevZ !== 0) {
    const t = Math.abs(prevZ) / Math.abs(ball.position.z - prevZ);
    const yCross = THREE.MathUtils.lerp(ball.position.y - state.ballV.y * dt * (1 - t), ball.position.y, t);
    if (yCross < NET_H + BALL_R) {
      // 彈回原本那一側
      ball.position.z = Math.sign(prevZ) * 0.08;
      state.ballV.z *= -0.15;
      state.ballV.x *= 0.5;
      state.netFault = true;
      showMsg('掛網！');
    }
  }

  // 落地彈跳
  if (ball.position.y <= BALL_R && state.ballV.y < 0) {
    ball.position.y = BALL_R;
    state.bounces++;
    const inX = Math.abs(ball.position.x) <= HALF_W + 0.06;
    const inZ = Math.abs(ball.position.z) <= HALF_L + 0.06;

    if (state.bounces === 1 && !(inX && inZ)) {
      // 第一跳出界：打的人失分
      endPoint(state.lastHitter === 'player' ? 'ai' : 'player', '出界！');
      return;
    }
    // 發球落點須在對角發球區（過廚房、對角半場、接球方場地）
    if (state.bounces === 1 && state.rallyHits === 1 && state.mode === 'match') {
      const receiverZ = state.server === 'player' ? -1 : 1;
      const zAbs = Math.abs(ball.position.z);
      const rightSide = ball.position.z * receiverZ > 0;
      const pastKitchen = zAbs > KITCHEN + 0.02;
      const diagonal = ball.position.x * state.serveCourt > -0.06;
      if (!(rightSide && pastKitchen && diagonal)) {
        const reason = !pastKitchen && rightSide ? '發球落在廚房區，失誤！' : '發球未進對角發球區，失誤！';
        endPoint(state.server === 'player' ? 'ai' : 'player', reason);
        return;
      }
    }
    if (state.bounces >= 2) {
      // 同一側彈兩次：這一側的人失分
      const sideIsPlayer = ball.position.z > 0;
      endPoint(sideIsPlayer ? 'ai' : 'player', state.netFault ? '掛網！' : '沒接到！');
      return;
    }
    state.ballV.y = -state.ballV.y * 0.72;
    state.ballV.x *= 0.82;
    state.ballV.z *= 0.82;
  }

  // 球滾出太遠直接判
  if (Math.abs(ball.position.z) > 12 || Math.abs(ball.position.x) > 10) {
    endPoint(state.lastHitter === 'player' ? 'ai' : 'player', '出界！');
  }
}

// ---------- 玩家移動 ----------
function updatePlayer(dt) {
  const SPEED = 4.0;
  const pos = player.group.position;
  let mx = 0, mz = 0;
  if (keys.has(moveMap.left)) mx -= 1;
  if (keys.has(moveMap.right)) mx += 1;
  if (keys.has(moveMap.up)) mz -= 1;
  if (keys.has(moveMap.down)) mz += 1;
  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    const len = Math.hypot(mx, mz);
    // 戰鬥中活動範圍 = 整個鐵籠；平時 = 球場周邊
    const bx = combat.active ? CAGE_X - 0.35 : 4.8;
    const bz = combat.active ? CAGE_Z - 0.35 : 7.0;
    pos.x = THREE.MathUtils.clamp(pos.x + (mx / len) * SPEED * dt, -bx, bx);
    pos.z = THREE.MathUtils.clamp(pos.z + (mz / len) * SPEED * dt, -bz, bz);
  }
  updateWalk(player, moving, dt);
}

// ---------- 主迴圈 ----------
const clock = new THREE.Clock();
updateScore();
resetForServe();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.phase === 'point') {
    state.pointTimer -= dt;
    if (state.pointTimer <= 0) resetForServe();
  }
  if (state.phase === 'practiceWait') {
    state.feedTimer -= dt;
    if (state.feedTimer <= 0) feedBall();
  }
  if (state.phase === 'serve' && state.mode === 'match' && state.server === 'ai') {
    state.aiServeTimer -= dt;
    if (state.aiServeTimer <= 0) aiServe();
  }

  if (state.mode === 'tutorial') {
    updateTutorial(dt); // 劇本接管人偶與示範球
  } else {
    if (!(combat.active && combat.playerState !== 'ok')) updatePlayer(dt); // 倒地時不能動，戰鬥中可以逃跑
    updateAI(dt);
    separateBodies(); // 人物實體碰撞
  }
  updateBall(dt);
  updatePlayerArm(dt);
  updateSwing(ai, dt);
  updateReferee(dt);
  updateCombat(dt);
  updateFlashes(dt);
  updateFX(dt);

  // 殺球蓄力條與球拍發光
  const charging = ctl.windup === 'SMASH';
  chargeWrap.style.display = charging ? 'block' : 'none';
  const chargeK = Math.min(ctl.chargeT / CHARGE_MAX, 1);
  if (charging) chargeFill.style.width = `${chargeK * 100}%`;
  player.paddleFace.material.emissive.setRGB(chargeK, chargeK * 0.25, 0);

  // 球的地面陰影
  ballShadow.visible = ball.visible;
  ballShadow.position.x = ball.position.x;
  ballShadow.position.z = ball.position.z;
  const h = Math.min(ball.position.y, 4);
  ballShadow.scale.setScalar(Math.max(0.5, 1.4 - h * 0.2));
  ballShadow.material.opacity = Math.max(0.1, 0.35 - h * 0.05);

  // 視角控制（縮放/旋轉）+ 殺球震動
  controls.update();
  if (state.camShake > 0) {
    state.camShake -= dt;
    const amp = state.camShake * 0.3;
    camera.position.x += (Math.random() - 0.5) * amp;
    camera.position.y += (Math.random() - 0.5) * amp;
  }

  rallyEl.textContent = state.phase !== 'rally' ? ''
    : (state.mode === 'match' && state.rallyHits < 3 && state.bounces === 0
      ? `回合擊球數：${state.rallyHits}｜⚠ 雙彈跳規則：要等球落地才能擊球`
      : `回合擊球數：${state.rallyHits}`);

  renderer.render(scene, camera);
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
