/* 长征·征途 —— 交互、视图与演示模式 */
(function () {
  const { STAGES, SRC, FACTS } = window.LC;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const els = {
    body: document.body,
    sideHome: $('#side-home'),
    sideStage: $('#side-stage'),
    stageList: $('#stage-list'),
    factRow: $('#fact-row'),
    timeline: $('#timeline'),
    tlTrack: $('#tl-track'),
    nodeStrip: $('#node-strip'),
    drawer: $('#drawer'),
    drawerBody: $('#drawer-body'),
    scrim: $('#scrim'),
    about: $('#about-modal'),
    aboutSources: $('#source-list'),
    toast: $('#toast'),
    hud: $('#play-hud'),
    hudStage: $('#hud-stage'),
    hudPlace: $('#hud-place'),
    hudDate: $('#hud-date'),
    presentTitle: $('#present-title'),
    presentBadge: $('#pb-badge'),
    btnPlay: $('#btn-play'),
  };

  const state = {
    view: 'overview',
    stageIndex: -1,
    nodeIndex: -1,
    lastFocus: null,
  };

  const playback = {
    active: false,
    paused: false,
    journey: false,
    idx: 0,
    elapsed: 0,
    duration: 0,
    last: 0,
    raf: 0,
    waitTimer: 0,
    waiting: false,
    pendingNext: false,
    hudKey: '',
    hudHideTimer: 0,
  };

  let toastTimer = 0;

  /* ---------------- 基础 UI ---------------- */

  function buildHome() {
    els.factRow.innerHTML = FACTS.map(
      (f) => `<li><b>${f.k}</b><span>${f.v}</span></li>`
    ).join('');

    els.stageList.innerHTML =
      `<p class="section-label"><span>五个阶段</span><em>点击进入详细路线</em></p>` +
      STAGES.map(
        (s, i) => `
      <button class="stage-item" type="button" data-stage="${s.id}" style="--c:${s.color}" aria-label="进入第${i + 1}阶段：${s.name}">
        <span class="no">${s.no}</span>
        <span><span class="nm">${s.name}</span><span class="dt">${s.dateRange}</span></span>
        <span class="arw" aria-hidden="true">›</span>
      </button>`
      ).join('');

    els.tlTrack.innerHTML = STAGES.map(
      (s, i) => `
      <button class="tl-seg" type="button" data-stage="${s.id}" style="--c:${s.color}" aria-label="第${i + 1}阶段 ${s.name}，${s.dateRange}">
        <span class="no">${s.no}</span><span class="nm">${s.name}</span><span class="dt">${s.dateRange}</span>
      </button>`
    ).join('');

    els.aboutSources.innerHTML = Object.keys(SRC)
      .filter((k) => ['series', 'wuqi', 'dsw', 'museum', 'ep1', 'ep3', 'ep6', 'ep11', 'ep12', 'ep16', 'ep17'].includes(k))
      .map((k) => `<li><a href="${SRC[k].url}" target="_blank" rel="noopener noreferrer">${SRC[k].label}</a></li>`)
      .join('');
  }

  function setTimelineActive(id) {
    $$('.tl-seg').forEach((b) => b.classList.toggle('is-current', b.dataset.stage === id));
    $$('.stage-item').forEach((b) => b.classList.toggle('is-current', b.dataset.stage === id));
  }

  function showToast(msg, ms) {
    clearTimeout(toastTimer);
    els.toast.textContent = msg;
    els.toast.classList.add('is-on');
    toastTimer = setTimeout(() => els.toast.classList.remove('is-on'), ms || 2600);
  }

  /* ---------------- 视图 ---------------- */

  function stageIndexById(id) {
    return STAGES.findIndex((s) => s.id === id);
  }

  function renderStagePanel(idx) {
    const stage = STAGES[idx];
    els.sideStage.style.setProperty('--stage', stage.color);
    const prevDisabled = idx === 0 ? 'disabled' : '';
    const nextDisabled = idx === STAGES.length - 1 ? 'disabled' : '';
    els.sideStage.innerHTML = `
      <div class="stage-head">
        <span class="stage-step">阶段 <b>${stage.no}</b> / 05</span>
        <span class="stage-chip">中央红军主线</span>
      </div>
      <h1 class="stage-title">${stage.name}</h1>
      <p class="stage-alias">${stage.alias}</p>
      <p class="stage-dates">${stage.startDate} — ${stage.endDate}</p>
      <dl class="stage-meta">
        <div><dt>起点</dt><dd>${stage.from}</dd></div>
        <div><dt>终点</dt><dd>${stage.to}</dd></div>
        <div class="wide"><dt>行进方向</dt><dd>${stage.direction}</dd></div>
        <div><dt>关键节点</dt><dd>${stage.nodes.length} 处</dd></div>
      </dl>
      <p class="stage-summary">${stage.summary}</p>
      <div class="stage-terrain"><b>地形与路线选择</b>${stage.terrain}</div>
      <p class="stage-source">史料来源：<a href="${SRC[stage.sources[0]].url}" target="_blank" rel="noopener noreferrer">${SRC[stage.sources[0]].label} ↗</a></p>
      <figure class="stage-image">
        <img src="${stage.scene}" alt="${stage.name}场景示意插画，非历史照片">
        <figcaption>${stage.sceneCaption} · 非历史照片</figcaption>
      </figure>
      <div class="stage-play">
        <button class="btn solid" type="button" data-action="play-stage">逐步显示本阶段</button>
        <button class="btn ghost" type="button" data-action="replay">重播</button>
      </div>
      <div class="stage-nav">
        <button class="btn ghost" type="button" data-action="prev-stage" ${prevDisabled}>← 上一阶段</button>
        <button class="btn ghost" type="button" data-action="next-stage" ${nextDisabled}>下一阶段 →</button>
        <button class="btn ghost wide" type="button" data-action="home">返回全程总览</button>
      </div>
    `;
  }

  function shortDate(s) {
    return s
      .replace(/年/g, '.')
      .replace(/月/g, '.')
      .replace(/日/g, '')
      .replace(/\s+—\s+/g, ' – ');
  }

  function renderNodeStrip(idx) {
    const stage = STAGES[idx];
    els.nodeStrip.innerHTML = `
      <div class="strip-head"><b>关键节点</b><span>点击展开</span></div>
      <div class="strip-scroll">
        ${stage.nodes
          .map(
            (n, i) => `
          <button class="node-card" type="button" data-node="${n.id}" style="--c:${stage.color}">
            <span class="n">${i + 1}</span>
            <span><span class="nm">${n.name}</span><span class="dt">${shortDate(n.date)}</span></span>
          </button>`
          )
          .join('')}
      </div>`;
  }

  function renderPresentTitle(idx) {
    if (idx == null) {
      els.presentTitle.classList.add('is-overview');
      els.presentTitle.style.removeProperty('--stage');
      els.presentTitle.innerHTML = `
        <span class="pt-kicker">中央红军长征 · 1934.10—1935.10</span>
        <h2>长征<span class="mid">·</span>征途</h2>
        <div class="pt-date">五阶段 · 二万五千里 · 纵横 11 个省</div>
        <p>从于都河到吴起镇。点击阶段名称，或按 ← → 进入详细路线。</p>
        <ul class="pt-stages">
          ${STAGES.map(
            (s) => `<li><button type="button" data-stage="${s.id}" style="--c:${s.color}">
              <span class="pt-no">${s.no}</span>
              <span class="pt-nm">${s.name}</span>
              <span class="pt-dt">${s.dateRange}</span>
            </button></li>`
          ).join('')}
        </ul>
        <p class="pt-note">路线示意图，非精确测绘。动画只表示行进顺序，不代表真实行军速度。</p>`;
      els.presentBadge.textContent = '全程总览';
      return;
    }
    els.presentTitle.classList.remove('is-overview');
    const stage = STAGES[idx];
    els.presentTitle.style.setProperty('--stage', stage.color);
    els.presentTitle.innerHTML = `
      <span class="pt-kicker">阶段 ${stage.no} / 05 · 中央红军主线</span>
      <h2>${stage.name}</h2>
      <div class="pt-date">${stage.startDate} — ${stage.endDate} · ${stage.direction}</div>
      <p>${stage.summary}</p>
      <p class="pt-src"><a href="${SRC[stage.sources[0]].url}" target="_blank" rel="noopener noreferrer">史料来源 ↗</a></p>`;
    els.presentBadge.textContent = `阶段 ${stage.no} · ${stage.name}`;
  }

  function setView(idx, animate) {
    state.view = idx == null ? 'overview' : 'stage';
    els.body.dataset.view = state.view;
    state.stageIndex = idx == null ? -1 : idx;

    if (idx == null) {
      state.nodeIndex = -1;
      window.LCMap.showOverview(animate !== false);
      setTimelineActive(null);
      renderPresentTitle(null);
      closeDrawer({ silent: true });
    } else {
      closeDrawer({ silent: true });
      state.nodeIndex = -1;
      const stage = STAGES[idx];
      window.LCMap.focusStage(stage.id, animate !== false);
      renderStagePanel(idx);
      renderNodeStrip(idx);
      setTimelineActive(stage.id);
      renderPresentTitle(idx);
    }
    updateHash();
    updatePlayUI();
  }

  function goStage(idx, animate) {
    stopPlayback();
    idx = Math.max(0, Math.min(STAGES.length - 1, idx));
    setView(idx, animate !== false);
    if (els.body.dataset.present === 'true') els.presentTitle.scrollTop = 0;
  }

  function goHome() {
    stopPlayback();
    setView(null, true);
  }

  /* ---------------- 节点详情 ---------------- */

  function nodeById(stage, id) {
    return stage.nodes.find((n) => n.id === id);
  }

  function openNode(stageId, nodeId) {
    const idx = stageIndexById(stageId);
    if (idx < 0) return;
    const stage = STAGES[idx];
    const ni = stage.nodes.findIndex((n) => n.id === nodeId);
    if (ni < 0) return;
    if (state.stageIndex !== idx) setView(idx, true);

    state.nodeIndex = ni;
    const node = stage.nodes[ni];

    els.drawer.style.setProperty('--stage', stage.color);
    $('#d-eyebrow').textContent = `节点 ${ni + 1} / ${stage.nodes.length} · ${stage.name}阶段`;
    $('#d-name').textContent = node.name;
    $('#d-meta').textContent = `${node.date} · ${node.place}`;
    const img = $('#d-img');
    img.src = node.image || stage.scene;
    img.alt = `${node.name}场景示意插画，非历史照片`;
    $('#d-caption').textContent = `${node.imageCaption || stage.sceneCaption} · 非历史照片`;
    $('#d-passage').textContent = node.passage;
    $('#d-difficulty').textContent = node.difficulty;
    $('#d-significance').textContent = node.significance;
    $('#d-terrain').textContent = node.terrain;
    $('#d-question').textContent = node.question;

    const src = SRC[node.source] || SRC[stage.sources[0]] || SRC.series;
    const link = $('#d-source');
    link.href = src.url;
    link.querySelector('.src-title').textContent = src.label;

    $('#d-counter').textContent = `${ni + 1} / ${stage.nodes.length}`;
    $$('[data-action="prev-node"]').forEach((b) => (b.disabled = ni === 0));
    $$('[data-action="next-node"]').forEach((b) => (b.disabled = ni === stage.nodes.length - 1));

    markReading(nodeId);
    state.lastFocus = document.activeElement;
    els.body.classList.add('drawer-open');
    els.drawer.classList.add('is-open');
    els.drawer.setAttribute('aria-hidden', 'false');
    els.drawerBody.scrollTop = 0;
    setTimeout(() => $('[data-action="close-drawer"]').focus(), 320);
    updateHash();
    if (els.body.dataset.present === 'true') showToast('按 Esc 关闭详情，← → 切换阶段');
  }

  function closeDrawer(opts) {
    if (!els.drawer.classList.contains('is-open')) return;
    els.body.classList.remove('drawer-open');
    els.drawer.classList.remove('is-open');
    els.drawer.setAttribute('aria-hidden', 'true');
    state.nodeIndex = -1;
    markReading(null);
    if (!(opts && opts.silent)) {
      if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
      updateHash();
    }
  }

  function markReading(nodeId) {
    $$('.node-card, .node-item').forEach((b) => {
      b.classList.toggle('is-reading', !!nodeId && b.dataset.node === nodeId);
    });
  }

  function stepNode(delta) {
    if (state.stageIndex < 0) return;
    const stage = STAGES[state.stageIndex];
    const ni = state.nodeIndex + delta;
    if (ni < 0 || ni >= stage.nodes.length) return;
    openNode(stage.id, stage.nodes[ni].id);
  }

  /* ---------------- 演示模式 ---------------- */

  function enterPresent() {
    if (els.body.dataset.present === 'true') return;
    closeDrawer({ silent: true });
    els.body.dataset.present = 'true';
    document.documentElement.classList.add('present');
    window.LCMap.setPresent(true);
    const req = document.documentElement.requestFullscreen;
    if (req) {
      req.call(document.documentElement).catch(() => {
        showToast('已进入演示布局；浏览器未允许全屏，可按 F11 全屏');
      });
    }
    requestAnimationFrame(() => {
      window.LCMap.refit();
      setTimeout(() => window.LCMap.refit(), 80);
    });
    showToast('演示模式：← → 切换阶段 · 空格播放/暂停 · F 或 Esc 退出', 3600);
  }

  function exitPresent() {
    if (els.body.dataset.present !== 'true') return;
    els.body.dataset.present = 'false';
    document.documentElement.classList.remove('present');
    window.LCMap.setPresent(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    requestAnimationFrame(() => {
      window.LCMap.refit();
      setTimeout(() => window.LCMap.refit(), 80);
    });
  }

  function toggleFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (els.body.dataset.present === 'true') {
      const req = document.documentElement.requestFullscreen;
      if (req) {
        req.call(document.documentElement).catch(() => {
          showToast('浏览器未允许全屏，可按 F11 进入全屏', 2600);
        });
      }
      return;
    }
    enterPresent();
  }

  /* ---------------- 路线播放 ---------------- */

  function updatePlayUI() {
    const playing = playback.active && !playback.paused;
    els.body.classList.toggle('is-playing', playing);
    if (els.btnPlay) {
      els.btnPlay.setAttribute('aria-label', playing ? '暂停路线显示' : '逐步显示路线');
      els.btnPlay.title = playing ? '暂停（空格）' : '逐步显示路线（空格）';
    }
    const stagePlayBtns = Array.from(document.querySelectorAll('.stage-play [data-action="play-stage"]'));
    stagePlayBtns.forEach((b) => {
      b.textContent = playing ? '暂停显示' : '逐步显示本阶段';
    });
  }

  function showHud(stage, p) {
    els.hud.classList.add('is-on');
    let cur = null;
    stage.nodes.forEach((n) => {
      if (p >= (n._t || 0)) cur = n;
    });
    const place = cur ? cur.name : stage.from;
    const date = cur ? cur.date : stage.startDate;
    const key = stage.id + '|' + place + '|' + date;
    if (key === playback.hudKey) return;
    playback.hudKey = key;
    els.hudStage.textContent = `阶段 ${stage.no} · ${stage.name}`;
    els.hudPlace.textContent = place;
    els.hudDate.textContent = date;
    markHotNode(cur ? cur.id : null);
  }

  function hideHud() {
    els.hud.classList.remove('is-on');
    playback.hudKey = '';
    markHotNode(null);
  }

  function markHotNode(nodeId) {
    $$('.node-card, .node-item').forEach((b) => {
      b.classList.toggle('is-hot', !!nodeId && b.dataset.node === nodeId);
      if (nodeId && b.dataset.node === nodeId) {
        const scroller = b.closest('.strip-scroll');
        if (scroller && b.offsetLeft < scroller.scrollLeft) scroller.scrollLeft = b.offsetLeft - 8;
        else if (scroller && b.offsetLeft + b.offsetWidth > scroller.scrollLeft + scroller.clientWidth) {
          scroller.scrollLeft = b.offsetLeft + b.offsetWidth - scroller.clientWidth + 8;
        }
      }
    });
  }

  function startSegment(idx, journey) {
    cancelAnimationFrame(playback.raf);
    clearTimeout(playback.waitTimer);
    playback.waiting = false;
    playback.pendingNext = false;
    playback.journey = !!journey;
    playback.idx = idx;
    playback.active = true;
    playback.paused = false;
    playback.elapsed = 0;
    playback.hudKey = '';

    setView(idx, true);
    const stage = STAGES[idx];
    const len = window.LCMap.getLength(stage.id) || 1400;
    playback.duration = Math.max(7000, Math.min(15000, len * 6.6));
    playback.last = performance.now();

    window.LCMap.clearProgress();
    window.LCMap.setProgress(stage.id, 0);
    showHud(stage, 0);
    updatePlayUI();

    playback.raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!playback.active || playback.paused) return;
    const dt = Math.min(140, now - playback.last);
    playback.last = now;
    playback.elapsed += dt;
    const stage = STAGES[playback.idx];
    const p = Math.min(1, playback.elapsed / playback.duration);
    window.LCMap.setProgress(stage.id, p);
    showHud(stage, p);

    if (p < 1) {
      playback.raf = requestAnimationFrame(tick);
    } else {
      finishSegment();
    }
  }

  function finishSegment() {
    const stage = STAGES[playback.idx];
    window.LCMap.setProgress(stage.id, 1);
    window.LCMap.revealStage(stage.id);
    playback.elapsed = playback.duration;

    if (playback.journey && playback.idx < STAGES.length - 1) {
      playback.waiting = true;
      playback.waitTimer = setTimeout(() => {
        playback.waiting = false;
        if (playback.paused) {
          playback.pendingNext = true;
          return;
        }
        startSegment(playback.idx + 1, true);
      }, 900);
      return;
    }

    playback.active = false;
    playback.paused = false;
    updatePlayUI();
    if (playback.journey) {
      window.LCMap.clearProgress();
      setView(null, true);
      hideHud();
      showToast('全程演示结束：5 个阶段 · 二万五千里', 3200);
    } else {
      showToast('本阶段路线显示完毕，按 R 重播', 2800);
    }
  }

  function togglePlay() {
    if (playback.active) {
      if (playback.paused) resumePlayback();
      else pausePlayback();
      return;
    }
    if (state.stageIndex >= 0) beginStagePlayback(state.stageIndex);
    else beginJourney();
  }

  function beginStagePlayback(idx) {
    if (idx == null || idx < 0) {
      beginJourney();
      return;
    }
    stopPlayback();
    closeDrawer({ silent: true });
    startSegment(idx, false);
    showToast('逐步显示路线：动画仅表示行进顺序，不代表真实速度', 3000);
  }

  function beginJourney() {
    stopPlayback();
    closeDrawer({ silent: true });
    setView(null, false);
    window.LCMap.clearProgress();
    startSegment(0, true);
    showToast('全程演示开始：按空格可暂停', 3000);
  }

  function pausePlayback() {
    if (!playback.active || playback.paused) return;
    playback.paused = true;
    cancelAnimationFrame(playback.raf);
    if (playback.waiting) {
      clearTimeout(playback.waitTimer);
      playback.pendingNext = true;
    }
    updatePlayUI();
    showToast('已暂停 · 按空格继续', 2000);
  }

  function resumePlayback() {
    if (!playback.active) return;
    playback.paused = false;
    playback.last = performance.now();
    updatePlayUI();
    clearTimeout(playback.hudHideTimer);
    if (playback.pendingNext) {
      playback.pendingNext = false;
      startSegment(playback.idx + 1, true);
      return;
    }
    if (playback.elapsed >= playback.duration) {
      playback.elapsed = 0;
      window.LCMap.setProgress(STAGES[playback.idx].id, 0);
    }
    playback.raf = requestAnimationFrame(tick);
  }

  function stopPlayback() {
    cancelAnimationFrame(playback.raf);
    clearTimeout(playback.waitTimer);
    clearTimeout(playback.hudHideTimer);
    playback.active = false;
    playback.paused = false;
    playback.waiting = false;
    playback.pendingNext = false;
    playback.elapsed = 0;
    playback.journey = false;
    hideHud();
    updatePlayUI();
    if (window.LCMap) window.LCMap.clearProgress();
  }

  function replay() {
    const wasJourney = playback.journey;
    stopPlayback();
    if (wasJourney) beginJourney();
    else if (state.stageIndex >= 0) beginStagePlayback(state.stageIndex);
    else beginJourney();
  }

  function showAll() {
    stopPlayback();
    setView(null, true);
    window.LCMap.clearProgress();
    showToast('已显示全程：5 个阶段 · 1934.10—1935.10', 2800);
  }

  /* ---------------- 路由 ---------------- */

  function updateHash() {
    let h = '#overview';
    if (state.stageIndex >= 0) {
      h = '#' + STAGES[state.stageIndex].id;
      if (state.nodeIndex >= 0) {
        const node = STAGES[state.stageIndex].nodes[state.nodeIndex];
        if (node) h += '/' + node.id;
      }
    }
    try {
      history.replaceState(null, '', h);
    } catch (e) {
      /* 本地 file:// 下可能受限，忽略 */
    }
  }

  function applyHash() {
    if (window.LCMap) stopPlayback();
    const m = (location.hash || '').match(/^#(s[1-5])(?:\/([a-z0-9-]+))?/i);
    if (!m) {
      setView(null, false);
      return;
    }
    const idx = stageIndexById(m[1].toLowerCase());
    if (idx < 0) {
      setView(null, false);
      return;
    }
    setView(idx, false);
    if (m[2]) openNode(STAGES[idx].id, m[2]);
  }

  /* ---------------- 事件 ---------------- */

  function bindEvents() {
    document.addEventListener('click', (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (actionEl) {
        const a = actionEl.dataset.action;
        switch (a) {
          case 'home': goHome(); break;
          case 'present': enterPresent(); break;
          case 'exit-present': exitPresent(); break;
          case 'about': openAbout(); break;
          case 'close-about': closeAbout(); break;
          case 'prev-stage': goStage(state.stageIndex - 1); break;
          case 'next-stage': goStage(state.stageIndex + 1); break;
          case 'play-stage':
            if (playback.active && !playback.journey && playback.idx === state.stageIndex) togglePlay();
            else beginStagePlayback(state.stageIndex);
            break;
          case 'replay': replay(); break;
          case 'show-all': showAll(); break;
          case 'toggle-play': togglePlay(); break;
          case 'close-drawer': closeDrawer(); break;
          case 'prev-node': stepNode(-1); break;
          case 'next-node': stepNode(1); break;
          case 'toggle-legend': toggleLegend(); break;
          case 'zoom-in': window.LCMap.zoomBy(0.8); break;
          case 'zoom-out': window.LCMap.zoomBy(1.25); break;
          case 'reset-view': window.LCMap.reset(); break;
          default: break;
        }
        return;
      }

      const stageBtn = e.target.closest('[data-stage]');
      if (stageBtn && !e.target.closest('.stage-g') && !e.target.closest('.node-g')) {
        const idx = stageIndexById(stageBtn.dataset.stage);
        if (idx >= 0) goStage(idx);
        return;
      }

      const nodeBtn = e.target.closest('[data-node]');
      if (nodeBtn && !e.target.closest('.node-g')) {
        openNode(STAGES[state.stageIndex].id, nodeBtn.dataset.node);
        return;
      }

      if (e.target === els.scrim) {
        if (els.about.classList.contains('is-open')) closeAbout();
        else closeDrawer();
      }
    });

    els.nodeStrip.addEventListener('click', (e) => {
      const card = e.target.closest('.node-card');
      if (!card) return;
      openNode(STAGES[state.stageIndex].id, card.dataset.node);
    });

    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

      if (e.key === 'Escape') {
        if (els.about.classList.contains('is-open')) {
          closeAbout();
        } else if (els.drawer.classList.contains('is-open')) {
          closeDrawer();
        } else if (els.body.dataset.present === 'true') {
          exitPresent();
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (state.stageIndex < 0) goStage(0);
        else if (state.stageIndex < STAGES.length - 1) goStage(state.stageIndex + 1);
        else showToast('已是最后一个阶段，按 Home 返回全程', 2000);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (state.stageIndex < 0) goStage(STAGES.length - 1);
        else if (state.stageIndex > 0) goStage(state.stageIndex - 1);
        else showToast('已是第一个阶段，按 Home 返回全程', 2000);
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        replay();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        showAll();
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        goHome();
      }
    });

    window.LCMap.init({
      onStage: (id) => {
        const idx = stageIndexById(id);
        if (idx >= 0) goStage(idx);
      },
      onNode: (stageId, nodeId) => openNode(stageId, nodeId),
    });

    window.addEventListener('hashchange', applyHash);
    applyHash();
  }

  /* ---------------- 弹窗与图例 ---------------- */

  function openAbout() {
    if (els.drawer.classList.contains('is-open')) closeDrawer({ silent: true });
    state.lastFocus = document.activeElement;
    els.body.classList.add('modal-open');
    els.about.classList.add('is-open');
    els.about.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('[data-action="close-about"]').focus(), 60);
  }

  function closeAbout() {
    els.body.classList.remove('modal-open');
    els.about.classList.remove('is-open');
    els.about.setAttribute('aria-hidden', 'true');
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  function toggleLegend() {
    const lg = $('#map-legend');
    lg.classList.toggle('is-collapsed');
    const b = $('[data-action="toggle-legend"]');
    const collapsed = lg.classList.contains('is-collapsed');
    b.textContent = collapsed ? '+' : '−';
    b.setAttribute('aria-label', collapsed ? '展开图例' : '收起图例');
  }

  /* ---------------- 启动 ---------------- */

  buildHome();
  bindEvents();
  els.drawer.setAttribute('aria-hidden', 'true');
  els.about.setAttribute('aria-hidden', 'true');
})();
