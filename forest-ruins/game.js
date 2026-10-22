(() => {
  "use strict";

  const SAVE_KEY = "forest-ruins-save-v1";
  const DIRECTIONS = {
    U: { x: 0, y: -1 },
    D: { x: 0, y: 1 },
    L: { x: -1, y: 0 },
    R: { x: 1, y: 0 }
  };

  const $ = (id) => document.getElementById(id);
  const board = $("board");
  const tileLayer = $("tileLayer");
  const entityLayer = $("entityLayer");
  const fxLayer = $("fxLayer");
  const overlay = $("overlay");
  const toastEl = $("toast");

  const key = (x, y) => `${x},${y}`;
  const pad2 = (n) => String(n).padStart(2, "0");

  function defaultProgress() {
    return {
      unlocked: 1,
      current: 0,
      cleared: Array(LEVELS.length).fill(false),
      best: {},
      sound: true
    };
  }

  function readProgress() {
    const base = defaultProgress();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return base;
      const data = JSON.parse(raw);
      const unlocked = Number.isInteger(data.unlocked)
        ? Math.min(LEVELS.length, Math.max(1, data.unlocked))
        : 1;
      const cleared = Array.from({ length: LEVELS.length }, (_, i) =>
        Boolean(data.cleared && data.cleared[i])
      );
      const best = {};
      if (data.best && typeof data.best === "object") {
        for (let i = 0; i < LEVELS.length; i += 1) {
          const item = data.best[i];
          if (item && Number.isFinite(item.moves) && item.moves > 0) {
            best[i] = {
              moves: Math.round(item.moves),
              pushes: Number.isFinite(item.pushes) ? Math.round(item.pushes) : 0
            };
          }
        }
      }
      let current = Number.isInteger(data.current) ? data.current : 0;
      current = Math.min(unlocked - 1, Math.max(0, current));
      return {
        unlocked,
        current,
        cleared,
        best,
        sound: data.sound !== false
      };
    } catch (error) {
      return base;
    }
  }

  const progress = readProgress();

  let levelIndex = progress.current;
  let level = null;
  let player = { x: 0, y: 0 };
  let stones = [];
  let moves = 0;
  let pushes = 0;
  let history = [];
  let won = false;
  let gateOpen = false;
  let overlayOpen = false;
  let unlockPulse = null;
  let toastTimer = null;
  let winTimer = null;
  let walkTimer = null;
  let heroEl = null;
  let gateEl = null;
  let stoneEls = new Map();
  let switchEls = new Map();
  let audioCtx = null;
  let soundOn = progress.sound;

  function persist() {
    try {
      progress.current = levelIndex;
      progress.sound = soundOn;
      localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
    } catch (error) {
      /* Storage may be unavailable in private contexts. */
    }
  }

  function parseLevel(def) {
    const walls = new Set();
    const targets = [];
    const targetSet = new Set();
    const stoneSeeds = [];
    let start = null;
    let exit = null;

    def.grid.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === "#") walls.add(key(x, y));
        if (ch === "T") {
          targets.push({ x, y });
          targetSet.add(key(x, y));
        }
        if (ch === "S") stoneSeeds.push({ x, y });
        if (ch === "P") start = { x, y };
        if (ch === "E") exit = { x, y };
      });
    });

    return {
      def,
      w: def.grid[0].length,
      h: def.grid.length,
      walls,
      targets,
      targetSet,
      stoneSeeds,
      start,
      exit
    };
  }

  function inside(x, y) {
    return x >= 0 && y >= 0 && x < level.w && y < level.h;
  }

  function isWall(x, y) {
    return level.walls.has(key(x, y));
  }

  function isExit(x, y) {
    return level.exit.x === x && level.exit.y === y;
  }

  function stoneAt(x, y) {
    return stones.find((stone) => stone.x === x && stone.y === y) || null;
  }

  function litCount() {
    return level.targets.filter((target) => stoneAt(target.x, target.y)).length;
  }

  function place(el, x, y, instant) {
    if (!el) return;
    if (instant) el.classList.add("no-anim");
    el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    if (instant) {
      void el.offsetWidth;
      requestAnimationFrame(() => el.classList.remove("no-anim"));
    }
  }

  function makeEntity(className, html) {
    const el = document.createElement("div");
    el.className = `entity ${className}`;
    if (html) el.innerHTML = html;
    return el;
  }

  function buildBoard() {
    board.style.setProperty("--cols", level.w);
    board.style.setProperty("--rows", level.h);
    tileLayer.innerHTML = "";
    entityLayer.innerHTML = "";
    fxLayer.innerHTML = "";

    for (let y = 0; y < level.h; y += 1) {
      for (let x = 0; x < level.w; x += 1) {
        const tile = document.createElement("div");
        const wall = isWall(x, y);
        tile.className = `tile ${wall ? "wall" : "floor"}`;
        if (!wall && isExit(x, y)) tile.classList.add("exit");
        tile.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
        tileLayer.appendChild(tile);
      }
    }

    gateEl = makeEntity(
      "gate",
      `<div class="gate-art">
        <img class="gate-closed-img" src="assets/gate-closed.png" alt="" draggable="false" />
        <img class="gate-open-img" src="assets/gate-open.png" alt="" draggable="false" />
      </div>`
    );
    place(gateEl, level.exit.x, level.exit.y, true);
    entityLayer.appendChild(gateEl);

    switchEls = new Map();
    level.targets.forEach((target) => {
      const el = makeEntity("switch", `<img src="assets/switch.png" alt="" draggable="false" />`);
      place(el, target.x, target.y, true);
      entityLayer.appendChild(el);
      switchEls.set(key(target.x, target.y), el);
    });

    stones = level.stoneSeeds.map((seed, index) => ({
      id: index,
      x: seed.x,
      y: seed.y
    }));

    stoneEls = new Map();
    stones.forEach((stone, index) => {
      const el = makeEntity(
        "stone",
        `<div class="bob" style="animation-delay:${(-index * 0.9).toFixed(2)}s">
          <img src="assets/crystal.png" alt="能量石" draggable="false" />
        </div>`
      );
      place(el, stone.x, stone.y, true);
      entityLayer.appendChild(el);
      stoneEls.set(stone.id, el);
    });

    heroEl = makeEntity(
      "hero",
      `<div class="bob"><img src="assets/hero.png" alt="提灯的森林旅人" draggable="false" /></div>`
    );
    player = { ...level.start };
    place(heroEl, player.x, player.y, true);
    entityLayer.appendChild(heroEl);

    for (let i = 0; i < 5; i += 1) {
      const mote = document.createElement("span");
      mote.className = "board-mote";
      mote.style.left = `${8 + Math.random() * 84}%`;
      mote.style.top = `${10 + Math.random() * 78}%`;
      mote.style.setProperty("--dur", `${5 + Math.random() * 5}s`);
      mote.style.setProperty("--delay", `${-Math.random() * 8}s`);
      mote.style.setProperty("--drift", `${Math.round(Math.random() * 20 - 10)}px`);
      fxLayer.appendChild(mote);
    }
  }

  function updateMeta() {
    const def = level.def;
    $("levelKicker").textContent = def.kicker;
    $("levelName").textContent = def.name;
    $("levelFlavor").textContent = def.flavor;
    $("boardCaption").textContent = `${def.name} · ${def.kicker}`;
    $("totalCount").textContent = level.targets.length;

    const pips = $("pips");
    pips.innerHTML = "";
    for (let i = 0; i < level.targets.length; i += 1) {
      const pip = document.createElement("span");
      pip.className = "pip";
      pips.appendChild(pip);
    }
  }

  function updateMeter() {
    const lit = litCount();
    $("litCount").textContent = lit;
    [...document.querySelectorAll(".pip")].forEach((pip, index) => {
      pip.classList.toggle("lit", index < lit);
    });
  }

  function updateHud() {
    $("moveCount").textContent = moves;
    $("pushCount").textContent = pushes;
    const best = progress.best[levelIndex];
    $("bestCount").textContent = best ? best.moves : "—";
    updateMeter();
    updateUndoState();
  }

  function updateUndoState() {
    const btn = $("undoBtn");
    const disabled = history.length === 0 || won;
    btn.classList.toggle("is-disabled", disabled);
    btn.setAttribute("aria-disabled", String(disabled));
  }

  function updateSwitches() {
    level.targets.forEach((target) => {
      const el = switchEls.get(key(target.x, target.y));
      if (el) el.classList.toggle("active", Boolean(stoneAt(target.x, target.y)));
    });
    stones.forEach((stone) => {
      const el = stoneEls.get(stone.id);
      if (el) el.classList.toggle("on-rune", level.targetSet.has(key(stone.x, stone.y)));
    });
  }

  function updateGate(announce = true) {
    const open = litCount() === level.targets.length;
    if (open !== gateOpen) {
      gateOpen = open;
      gateEl.classList.toggle("is-open", open);
      board.classList.toggle("gate-open", open);
      const badge = $("gateBadge");
      badge.textContent = open ? "门扉已开" : "门扉沉睡";
      badge.classList.toggle("is-open", open);
      if (announce) {
        if (open) {
          toast("机关全部点亮 · 林门开启");
          playSound("gate");
          burstAt(level.exit.x, level.exit.y, "#a8f6e7");
        } else {
          toast("机关熄灭 · 林门重新闭合");
          playSound("close");
        }
      }
    }
    updateMeter();
    updateSwitches();
    return open;
  }

  function snapshot() {
    return {
      player: { ...player },
      stones: stones.map((stone) => ({ ...stone })),
      moves,
      pushes
    };
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > 400) history.shift();
  }

  function face(dx) {
    if (dx < 0) heroEl.classList.add("facing-left");
    if (dx > 0) heroEl.classList.remove("facing-left");
  }

  function markWalking() {
    heroEl.classList.add("walking");
    clearTimeout(walkTimer);
    walkTimer = setTimeout(() => heroEl.classList.remove("walking"), 280);
  }

  function bumpHero() {
    heroEl.classList.remove("bump");
    void heroEl.offsetWidth;
    heroEl.classList.add("bump");
    setTimeout(() => heroEl.classList.remove("bump"), 260);
  }

  function attemptMove(direction) {
    if (overlayOpen || won) return;
    playSound("ensure");

    const delta = DIRECTIONS[direction];
    if (!delta) return;
    const nx = player.x + delta.x;
    const ny = player.y + delta.y;

    if (!inside(nx, ny) || isWall(nx, ny)) {
      bumpHero();
      playSound("block");
      return;
    }

    face(delta.x);
    markWalking();

    const stone = stoneAt(nx, ny);
    if (stone) {
      const bx = nx + delta.x;
      const by = ny + delta.y;

      if (!inside(bx, by) || isWall(bx, by)) {
        bumpHero();
        playSound("block");
        return;
      }
      if (stoneAt(bx, by)) {
        bumpHero();
        toast("一次只能推动一块能量石");
        playSound("block");
        return;
      }
      if (isExit(bx, by)) {
        bumpHero();
        toast("石门无法被能量石推动");
        playSound("block");
        return;
      }

      const wasLit = level.targetSet.has(key(stone.x, stone.y));
      pushHistory();
      stone.x = bx;
      stone.y = by;
      player = { x: nx, y: ny };
      moves += 1;
      pushes += 1;
      place(stoneEls.get(stone.id), bx, by, false);
      place(heroEl, player.x, player.y, false);

      const nowLit = level.targetSet.has(key(bx, by));
      if (nowLit && !wasLit) {
        burstAt(bx, by, "#a8f6e7");
        playSound("rune");
      } else {
        playSound("push");
      }
    } else {
      if (isExit(nx, ny) && !gateOpen) {
        const remaining = level.targets.length - litCount();
        bumpHero();
        toast(`石门仍在沉睡 · 还差 ${remaining} 座机关`);
        playSound("block");
        return;
      }

      pushHistory();
      player = { x: nx, y: ny };
      moves += 1;
      place(heroEl, player.x, player.y, false);
      playSound("step");
    }

    updateHud();
    updateGate();

    if (!won && gateOpen && isExit(player.x, player.y)) {
      winLevel();
    }
  }

  function undo() {
    if (overlayOpen || won) return;
    if (!history.length) {
      toast("已经回到这处遗迹的起点");
      playSound("block");
      return;
    }

    const previous = history.pop();
    player = { ...previous.player };
    moves = previous.moves;
    pushes = previous.pushes;
    previous.stones.forEach((savedStone) => {
      const stone = stones.find((item) => item.id === savedStone.id);
      if (stone) {
        stone.x = savedStone.x;
        stone.y = savedStone.y;
        place(stoneEls.get(stone.id), stone.x, stone.y, false);
      }
    });
    place(heroEl, player.x, player.y, false);
    heroEl.classList.remove("entering");
    updateHud();
    updateGate();
    playSound("undo");
  }

  function winLevel() {
    won = true;
    updateUndoState();
    heroEl.classList.add("entering");
    playSound("win");

    const wasCleared = Boolean(progress.cleared[levelIndex]);
    progress.cleared[levelIndex] = true;

    const previousBest = progress.best[levelIndex];
    if (!previousBest || moves < previousBest.moves) {
      progress.best[levelIndex] = { moves, pushes };
    }

    const nextUnlocked = Math.min(LEVELS.length, levelIndex + 2);
    if (nextUnlocked > progress.unlocked) {
      progress.unlocked = nextUnlocked;
      unlockPulse = nextUnlocked - 1;
    }

    persist();
    renderChips();

    clearTimeout(winTimer);
    winTimer = setTimeout(() => {
      winTimer = null;
      if (won && !overlayOpen) showWinOverlay(!wasCleared);
    }, 760);
  }

  function resetLevel(withToast = true) {
    if (overlayOpen) return;
    loadLevel(levelIndex);
    if (withToast) toast("遗迹已复原 · 步数归零");
    playSound("reset");
  }

  function loadLevel(index) {
    levelIndex = Math.min(LEVELS.length - 1, Math.max(0, index));
    level = parseLevel(LEVELS[levelIndex]);
    moves = 0;
    pushes = 0;
    history = [];
    won = false;
    gateOpen = false;
    clearTimeout(winTimer);
    winTimer = null;
    progress.current = levelIndex;

    board.classList.remove("gate-open");
    buildBoard();
    updateMeta();
    updateGate(false);
    updateHud();
    renderChips();
    persist();

    const badge = $("gateBadge");
    badge.textContent = "门扉沉睡";
    badge.classList.remove("is-open");
    updateUndoState();
  }

  function renderChips() {
    const chips = $("levelChips");
    chips.innerHTML = "";
    let clearedCount = 0;

    LEVELS.forEach((def, index) => {
      const unlocked = index < progress.unlocked;
      const cleared = Boolean(progress.cleared[index]);
      if (cleared) clearedCount += 1;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "level-chip";
      if (index === levelIndex) btn.classList.add("current");
      if (cleared) btn.classList.add("cleared");
      if (!unlocked) btn.classList.add("locked");
      if (unlockPulse === index) {
        btn.classList.add("unlocking");
        unlockPulse = null;
      }

      const mark = cleared
        ? `<span class="mark" aria-hidden="true">✓</span>`
        : unlocked
          ? ""
          : `<span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6"/></svg></span>`;

      btn.innerHTML = `<span class="num">${pad2(index + 1)}</span>${mark}`;
      btn.title = unlocked
        ? `第 ${pad2(index + 1)} 处遗迹 · ${def.name}${cleared ? "（已照亮）" : ""}`
        : `尚未解锁 · 先完成第 ${pad2(index)} 处遗迹`;
      btn.setAttribute(
        "aria-label",
        unlocked
          ? `第 ${index + 1} 关，${def.name}${cleared ? "，已通关" : ""}`
          : `第 ${index + 1} 关，尚未解锁`
      );
      if (index === levelIndex) btn.setAttribute("aria-current", "true");
      if (!unlocked) btn.setAttribute("aria-disabled", "true");

      btn.addEventListener("click", () => {
        if (!unlocked) {
          toast(`尚未解锁 · 先完成第 ${pad2(index)} 处遗迹`);
          playSound("block");
          return;
        }
        if (index === levelIndex) {
          toast("你已经站在这处遗迹中");
          return;
        }
        loadLevel(index);
        playSound("select");
        toast(`步入第 ${pad2(index + 1)} 处遗迹 · ${def.name}`);
      });

      chips.appendChild(btn);
    });

    $("trailProgress").textContent =
      clearedCount === LEVELS.length ? "5 / 5 · 全通" : `${clearedCount} / ${LEVELS.length}`;
    $("saveNote").textContent =
      clearedCount === LEVELS.length
        ? "全部遗迹已点亮 · 进度已保存"
        : "进度会自动保存在此设备";
  }

  function toast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add("show");
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2300);
  }

  function burstAt(x, y, color) {
    const cx = ((x + 0.5) / level.w) * 100;
    const cy = ((y + 0.45) / level.h) * 100;
    for (let i = 0; i < 10; i += 1) {
      const spark = document.createElement("span");
      spark.className = "burst";
      spark.style.left = `${cx}%`;
      spark.style.top = `${cy}%`;
      spark.style.background = color;
      spark.style.boxShadow = `0 0 8px ${color}`;
      spark.style.setProperty("--bx", `${Math.random() * 46 - 23}px`);
      spark.style.setProperty("--by", `${-8 - Math.random() * 30}px`);
      spark.style.animationDelay = `${i * 0.012}s`;
      fxLayer.appendChild(spark);
      setTimeout(() => spark.remove(), 850);
    }
  }

  function addModalSparks(modal) {
    for (let i = 0; i < 14; i += 1) {
      const spark = document.createElement("span");
      spark.className = "spark";
      spark.style.left = `${14 + Math.random() * 72}%`;
      spark.style.top = `${24 + Math.random() * 52}%`;
      spark.style.setProperty("--dur", `${2.2 + Math.random() * 2.2}s`);
      spark.style.setProperty("--delay", `${-Math.random() * 3}s`);
      spark.style.setProperty("--drift", `${Math.round(Math.random() * 34 - 17)}px`);
      spark.style.setProperty("--spark-color", Math.random() > 0.45 ? "#a8f6e7" : "#e3c27d");
      modal.appendChild(spark);
    }
  }

  function showWinOverlay(firstClear) {
    if (levelIndex === LEVELS.length - 1) {
      showFinalOverlay();
      return;
    }

    const def = level.def;
    const best = progress.best[levelIndex];
    overlay.innerHTML = `
      <div class="overlay-backdrop"></div>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal-glow"></div>
        <div class="modal-seal" aria-hidden="true">通</div>
        <p class="modal-kicker">遗迹回响 · ${pad2(levelIndex + 1)} / ${pad2(LEVELS.length)}</p>
        <h2 id="modalTitle">石门为你而开</h2>
        <p class="modal-flavor">${def.winLine}</p>
        <div class="modal-stats">
          <div><strong>${moves}</strong><span>步数</span></div>
          <div><strong>${pushes}</strong><span>推动</span></div>
          <div><strong class="accent">${best ? best.moves : moves}</strong><span>最佳</span></div>
        </div>
        <div class="modal-actions">
          <button class="btn primary" id="modalNext" type="button">前往下一处遗迹</button>
          <button class="btn ghost" id="modalReplay" type="button">再走一遍</button>
        </div>
      </div>`;
    overlay.classList.add("show");
    overlayOpen = true;
    addModalSparks(overlay.querySelector(".modal"));

    $("modalNext").addEventListener("click", () => {
      closeOverlay();
      loadLevel(levelIndex + 1);
      toast(`步入第 ${pad2(levelIndex + 1)} 处遗迹 · ${LEVELS[levelIndex].name}`);
    });
    $("modalReplay").addEventListener("click", () => {
      closeOverlay();
      loadLevel(levelIndex);
    });
    $("modalNext").focus();

    if (firstClear && levelIndex + 1 < LEVELS.length) {
      setTimeout(() => {
        if (overlayOpen) toast(`新的遗迹已解锁 · ${LEVELS[levelIndex + 1].name}`);
      }, 900);
    }
  }

  function showFinalOverlay() {
    const rows = LEVELS.map((def, index) => {
      const best = progress.best[index];
      return `<div class="final-row">
        <span class="idx">${pad2(index + 1)}</span>
        <span class="nm">${def.name}</span>
        <span class="sc">${best ? best.moves : "—"}<small>步</small></span>
      </div>`;
    }).join("");

    const totalBest = LEVELS.reduce(
      (sum, _def, index) => sum + (progress.best[index] ? progress.best[index].moves : 0),
      0
    );
    const totalRunes = LEVELS.reduce((sum, def) => {
      const parsed = parseLevel(def);
      return sum + parsed.targets.length;
    }, 0);

    overlay.innerHTML = `
      <div class="overlay-backdrop"></div>
      <div class="modal final" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal-glow"></div>
        <div class="modal-seal" aria-hidden="true">心</div>
        <p class="modal-kicker">森语绘卷 · 终章</p>
        <h2 id="modalTitle">森林之心，苏醒了</h2>
        <p class="modal-flavor">五处遗迹的符文连成一线，月光穿过林门。你在青苔上留下的足迹，成了森林新的年轮。</p>
        <div class="final-list">${rows}</div>
        <p class="final-total">${totalRunes} 枚符文归位 · 最优足迹合计<strong>${totalBest}</strong>步</p>
        <div class="modal-actions">
          <button class="btn primary" id="modalRestart" type="button">回到第一处遗迹</button>
          <button class="btn ghost" id="modalStay" type="button">重游终章</button>
        </div>
      </div>`;
    overlay.classList.add("show");
    overlayOpen = true;
    addModalSparks(overlay.querySelector(".modal"));

    $("modalRestart").addEventListener("click", () => {
      closeOverlay();
      loadLevel(0);
      toast("再次踏上苔痕小径");
    });
    $("modalStay").addEventListener("click", () => {
      closeOverlay();
      loadLevel(LEVELS.length - 1);
    });
    $("modalRestart").focus();
  }

  function closeOverlay() {
    overlay.classList.remove("show");
    overlay.innerHTML = "";
    overlayOpen = false;
  }

  function ensureAudio() {
    if (!soundOn) return null;
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        audioCtx = new AudioCtor();
      } catch (error) {
        return null;
      }
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function tone(freq, when, duration, type, gain) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const start = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.014);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  function playSound(kind) {
    if (!soundOn || kind === "ensure") {
      if (kind === "ensure") ensureAudio();
      return;
    }
    switch (kind) {
      case "step":
        tone(168, 0, 0.06, "triangle", 0.014);
        break;
      case "push":
        tone(118, 0, 0.1, "sine", 0.028);
        tone(286, 0.015, 0.11, "triangle", 0.017);
        break;
      case "rune":
        tone(659, 0, 0.14, "sine", 0.026);
        tone(880, 0.07, 0.2, "sine", 0.021);
        break;
      case "gate":
        tone(392, 0, 0.5, "sine", 0.024);
        tone(523.25, 0.09, 0.55, "sine", 0.022);
        tone(659.25, 0.18, 0.65, "sine", 0.019);
        break;
      case "close":
        tone(330, 0, 0.2, "sine", 0.018);
        tone(247, 0.1, 0.28, "sine", 0.016);
        break;
      case "block":
        tone(92, 0, 0.08, "square", 0.012);
        break;
      case "select":
        tone(440, 0, 0.09, "sine", 0.018);
        tone(587, 0.05, 0.12, "sine", 0.014);
        break;
      case "undo":
        tone(392, 0, 0.1, "sine", 0.018);
        tone(294, 0.07, 0.13, "sine", 0.015);
        break;
      case "reset":
        tone(294, 0, 0.12, "triangle", 0.016);
        tone(220, 0.08, 0.16, "triangle", 0.014);
        break;
      case "win":
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
          tone(freq, index * 0.1, 0.55, "sine", 0.022);
        });
        break;
      default:
        break;
    }
  }

  function buildAmbient() {
    const layer = $("ambientLights");
    for (let i = 0; i < 18; i += 1) {
      const light = document.createElement("span");
      const teal = Math.random() > 0.68;
      light.style.left = `${4 + Math.random() * 92}%`;
      light.style.top = `${26 + Math.random() * 66}%`;
      light.style.setProperty("--size", `${2 + Math.random() * 4}px`);
      light.style.setProperty("--dur", `${10 + Math.random() * 12}s`);
      light.style.setProperty("--delay", `${-Math.random() * 22}s`);
      light.style.setProperty("--glow", teal ? "#8af0dc" : "#ffd98a");
      layer.appendChild(light);
    }
  }

  function bindControls() {
    document.querySelectorAll(".dbtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        ensureAudio();
        attemptMove(btn.dataset.dir);
      });
    });

    $("undoBtn").addEventListener("click", undo);
    $("resetBtn").addEventListener("click", () => resetLevel(true));

    $("soundToggle").addEventListener("click", () => {
      soundOn = !soundOn;
      progress.sound = soundOn;
      persist();
      const toggle = $("soundToggle");
      toggle.classList.toggle("muted", !soundOn);
      toggle.setAttribute("aria-pressed", String(soundOn));
      toggle.setAttribute("aria-label", soundOn ? "关闭音效" : "开启音效");
      if (soundOn) playSound("select");
    });

    const toggle = $("soundToggle");
    toggle.classList.toggle("muted", !soundOn);
    toggle.setAttribute("aria-pressed", String(soundOn));
    toggle.setAttribute("aria-label", soundOn ? "关闭音效" : "开启音效");

    document.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (overlayOpen) {
        if (event.key === "Enter") {
          const primary = overlay.querySelector(".btn.primary");
          if (primary) {
            event.preventDefault();
            primary.click();
          }
        }
        return;
      }

      const dirMap = {
        arrowup: "U",
        arrowdown: "D",
        arrowleft: "L",
        arrowright: "R",
        w: "U",
        s: "D",
        a: "L",
        d: "R"
      };
      const direction = dirMap[event.key.toLowerCase()];
      if (direction) {
        event.preventDefault();
        ensureAudio();
        attemptMove(direction);
        return;
      }

      const action = event.key.toLowerCase();
      if (action === "u" || action === "z") {
        event.preventDefault();
        undo();
      } else if (action === "r") {
        event.preventDefault();
        resetLevel(true);
      }
    });

    let touchStart = null;
    board.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      touchStart = { x: event.clientX, y: event.clientY };
    });
    board.addEventListener("pointerup", (event) => {
      if (!touchStart || event.pointerType === "mouse") return;
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      touchStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        attemptMove(dx > 0 ? "R" : "L");
      } else {
        attemptMove(dy > 0 ? "D" : "U");
      }
    });
    board.addEventListener("pointercancel", () => {
      touchStart = null;
    });
  }

  buildAmbient();
  bindControls();
  loadLevel(levelIndex);
})();
