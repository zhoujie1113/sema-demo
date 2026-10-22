/* 长征·征途 —— 地图渲染与相机
 * 所有地理位置由经纬度投影生成；路线、地名、时间为可编辑矢量/文本。
 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const { STAGES, OVERVIEW_LABELS, RIVERS, MOUNTAINS, PROVINCES } = window.LC;

  const MAP_W = 1200;
  const MAP_H = 1000;
  const BOUNDS = { lonMin: 99.4, lonMax: 118.6, latMin: 24.2, latMax: 38.2 };
  const LAT0 = 31.2;
  const COS = Math.cos((LAT0 * Math.PI) / 180);
  const SCALE = Math.min(
    MAP_W / ((BOUNDS.lonMax - BOUNDS.lonMin) * COS),
    MAP_H / (BOUNDS.latMax - BOUNDS.latMin)
  );
  const PX0 = (MAP_W - (BOUNDS.lonMax - BOUNDS.lonMin) * COS * SCALE) / 2;

  function proj(lon, lat) {
    return {
      x: PX0 + (lon - BOUNDS.lonMin) * COS * SCALE,
      y: (BOUNDS.latMax - lat) * SCALE,
    };
  }

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    if (attrs) {
      for (const k in attrs) {
        if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  function svgText(parent, cls, x, y, text, attrs) {
    const t = el('text', Object.assign({ x, y, class: cls }, attrs || {}), parent);
    t.textContent = text;
    return t;
  }

  /* Catmull-Rom -> cubic Bezier */
  function smoothPath(points) {
    if (!points.length) return '';
    if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
    const d = [`M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d.push(
        `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
      );
    }
    return d.join(' ');
  }

  function seeded(seed) {
    let s = seed;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  let svg, miniSvg, miniViewport, layers, cam, current = 'overview', activeStage = null;
  let presentMode = false;
  let labelScale = 1;
  const geo = {};
  const callbacks = {};
  let anim = null;

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function buildDefs(root) {
    const defs = el('defs', {}, root);
    const glow = el('filter', { id: 'softGlow', x: '-60%', y: '-60%', width: '220%', height: '220%' }, defs);
    el('feGaussianBlur', { stdDeviation: '3', result: 'b' }, glow);
    el('feMerge', {}, glow).append(
      el('feMergeNode', { in: 'b' }, glow),
      el('feMergeNode', { in: 'SourceGraphic' }, glow)
    );
    const paper = el('filter', { id: 'paperBleed', x: '-10%', y: '-10%', width: '120%', height: '120%' }, defs);
    el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.012', numOctaves: '2', seed: '4', result: 'n' }, paper);
    el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '3', xChannelSelector: 'R', yChannelSelector: 'G' }, paper);
  }

  function buildGrid(g) {
    for (let lon = 100; lon <= 118; lon += 2) {
      const a = proj(lon, BOUNDS.latMin);
      const b = proj(lon, BOUNDS.latMax);
      el('line', { x1: a.x, y1: 0, x2: b.x, y2: MAP_H, class: 'grid-line' }, g);
      svgText(g, 'grid-label', a.x + 3, 15, lon + '°E', { 'font-size': 9, style: '--fs:9' });
    }
    for (let lat = 26; lat <= 38; lat += 2) {
      const a = proj(BOUNDS.lonMin, lat);
      const b = proj(BOUNDS.lonMax, lat);
      el('line', { x1: 0, y1: a.y, x2: MAP_W, y2: a.y, class: 'grid-line' }, g);
      svgText(g, 'grid-label', 7, a.y - 3, lat + '°N', { 'font-size': 9, style: '--fs:9' });
    }
  }

  function buildMountains(g) {
    MOUNTAINS.forEach((m, mi) => {
      const pts = m.peaks.map(([lon, lat]) => proj(lon, lat));
      const lift = 30 + (mi % 3) * 6;
      const baseY = Math.max.apply(null, pts.map((p) => p.y)) + 82;

      let ridge = '';
      pts.forEach((p, i) => {
        if (i === 0) {
          ridge += `M${(p.x - 34).toFixed(1)} ${(p.y + 24).toFixed(1)} Q${(p.x - 12).toFixed(1)} ${(p.y - 4).toFixed(1)} ${p.x.toFixed(1)} ${(p.y - lift).toFixed(1)}`;
        } else {
          const prev = pts[i - 1];
          const cx = (prev.x + p.x) / 2;
          const cy = Math.max(prev.y, p.y) + 18;
          ridge += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${p.x.toFixed(1)} ${(p.y - lift).toFixed(1)}`;
        }
      });
      const last = pts[pts.length - 1];
      ridge += ` Q${(last.x + 16).toFixed(1)} ${(last.y - 2).toFixed(1)} ${(last.x + 36).toFixed(1)} ${(last.y + 24).toFixed(1)}`;
      const poly = `${ridge} L${(last.x + 36).toFixed(1)} ${baseY.toFixed(1)} L${(pts[0].x - 34).toFixed(1)} ${baseY.toFixed(1)} Z`;

      el('path', { d: poly, class: 'mtn-base' }, g);
      el('path', {
        d: ridge,
        class: 'mtn-ridge',
        'stroke-width': 1.5,
        filter: 'url(#paperBleed)',
      }, g);

      // 峰线
      pts.forEach((p, i) => {
        const w = 19 + (i % 3) * 5;
        el('path', {
          d: `M${(p.x - w).toFixed(1)} ${(p.y + 14).toFixed(1)} Q${(p.x - 3).toFixed(1)} ${(p.y - lift + 6).toFixed(1)} ${p.x.toFixed(1)} ${(p.y - lift).toFixed(1)} Q${(p.x + 4).toFixed(1)} ${(p.y - lift + 8).toFixed(1)} ${(p.x + w).toFixed(1)} ${(p.y + 16).toFixed(1)}`,
          class: 'mtn-hatch',
          'stroke-width': 1,
        }, g);
        // 阴影排线
        for (let h = 0; h < 2; h++) {
          el('path', {
            d: `M${(p.x + 4 + h * 5).toFixed(1)} ${(p.y - lift + 12 + h * 4).toFixed(1)} l${8 - h * 2} ${16 + h * 3}`,
            class: 'mtn-hatch',
            'stroke-width': 0.9,
          }, g);
        }
        if (m.snow) {
          el('path', {
            d: `M${(p.x - 7).toFixed(1)} ${(p.y - lift + 12).toFixed(1)} L${p.x.toFixed(1)} ${(p.y - lift).toFixed(1)} L${(p.x + 7).toFixed(1)} ${(p.y - lift + 12).toFixed(1)} Q${p.x.toFixed(1)} ${(p.y - lift + 17).toFixed(1)} ${(p.x - 7).toFixed(1)} ${(p.y - lift + 12).toFixed(1)} Z`,
            class: 'mtn-snow',
          }, g);
        }
      });

      // 小树
      const rand = seeded(17 + mi * 31);
      for (let i = 0; i < 9; i++) {
        const idx = Math.floor(rand() * (pts.length - 1));
        const a = pts[idx];
        const b = pts[idx + 1];
        const t = rand();
        const x = a.x + (b.x - a.x) * t + (rand() - 0.5) * 26;
        const y = a.y + (b.y - a.y) * t + 26 + rand() * 18;
        const s = 0.7 + rand() * 0.6;
        el('path', {
          d: `M${x.toFixed(1)} ${y.toFixed(1)} l${(-4 * s).toFixed(1)} ${(9 * s).toFixed(1)} l${(3 * s).toFixed(1)} 0 l${(-5 * s).toFixed(1)} ${(10 * s).toFixed(1)} l${(12 * s).toFixed(1)} 0 l${(-5 * s).toFixed(1)} ${(-10 * s).toFixed(1)} l${(3 * s).toFixed(1)} 0 Z`,
          class: 'tree',
        }, g);
      }

      const lp = proj(m.labelAt[0], m.labelAt[1]);
      svgText(g, 'mtn-label', lp.x, lp.y, m.name, {
        'text-anchor': 'middle',
        'font-size': 15,
        style: '--fs:15',
      });
    });
  }

  function buildRivers(g) {
    RIVERS.forEach((r) => {
      const pts = r.points.map(([lon, lat]) => proj(lon, lat));
      const d = smoothPath(pts);
      el('path', { d, class: 'river-halo', 'stroke-width': 10, filter: 'url(#paperBleed)' }, g);
      el('path', { d, class: 'river', 'stroke-width': 2.8 }, g);
      const lp = proj(r.labelAt[0], r.labelAt[1]);
      svgText(g, 'river-label', lp.x, lp.y, r.name, {
        'text-anchor': 'middle',
        'font-size': 13,
        style: '--fs:13',
      });
    });
  }

  function buildProvinces(g) {
    PROVINCES.forEach((p) => {
      const q = proj(p.at[0], p.at[1]);
      svgText(g, 'province-label', q.x, q.y, p.name, {
        'text-anchor': 'middle',
        'font-size': 22,
        style: '--fs:22',
      });
    });
  }

  function buildStagePill(parent, stage) {
    const g = el('g', { class: 'stage-pill', 'data-stage': stage.id, 'data-hit': 'stage' }, parent);
    const at = proj(stage.labelAt[0], stage.labelAt[1]);
    g.setAttribute('transform', `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
    const inner = el('g', { class: 'pill-scale' }, g);
    const fs = 19.5;
    const text = `${stage.no}  ${stage.name}`;
    const w = 34 + text.length * fs * 0.86;
    const h = 34;
    el('rect', {
      x: (-w / 2).toFixed(1), y: (-h / 2).toFixed(1), width: w.toFixed(1), height: h.toFixed(1),
      rx: 6, fill: stage.color,
    }, inner);
    const t = svgText(inner, '', 0, 6, text, {
      'text-anchor': 'middle', 'font-size': fs,
      style: 'font-family:var(--serif);fill:#fff8ea;letter-spacing:.06em;font-weight:600',
    });
    t.setAttribute('font-family', 'Songti SC, serif');
    // 小三角指向
    el('path', {
      d: `M${(-7).toFixed(1)} ${(h / 2).toFixed(1)} L0 ${(h / 2 + 8).toFixed(1)} L7 ${(h / 2).toFixed(1)} Z`,
      fill: stage.color,
    }, inner);
    return g;
  }

  function buildRoutes(g) {
    STAGES.forEach((stage) => {
      const pts = stage.route.map(([lon, lat]) => proj(lon, lat));
      const pathData = smoothPath(pts);
      const group = el('g', {
        class: 'stage-g',
        'data-stage': stage.id,
        style: `--c:${stage.color}`,
        role: 'button',
        tabindex: '0',
        'aria-label': `第${stage.no}阶段 ${stage.name}，${stage.dateRange}，查看详细路线`,
      }, g);
      el('path', { d: pathData, class: 'route-halo', 'stroke-width': 10 }, group);
      const route = el('path', {
        d: pathData, class: 'route', stroke: stage.color, 'stroke-width': 4.2,
      }, group);
      el('path', { d: pathData, class: 'route-hit', 'stroke-width': 24, 'data-hit': 'stage', 'data-stage': stage.id }, group);

      const ends = el('g', { class: 'stage-ends', 'data-ends': stage.id }, group);
      [[pts[0], '起'], [pts[pts.length - 1], '终']].forEach(([p, tag]) => {
        const g2 = el('g', { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})` }, ends);
        el('circle', { r: 9, fill: '#fbf3e2', stroke: stage.color, 'stroke-width': 2 }, g2);
        svgText(g2, 'end-tag', 0, 3.6, tag, {
          'text-anchor': 'middle', 'font-size': 10,
          style: `fill:${stage.color};font-family:var(--serif);font-weight:700`,
        });
      });

      const len = route.getTotalLength();
      const arrows = el('g', { class: 'arrows' }, group);
      const fractions = [0.13, 0.34, 0.56, 0.77, 0.92];
      const arrowEls = [];
      fractions.forEach((f) => {
        const p = route.getPointAtLength(len * f);
        const p2 = route.getPointAtLength(Math.min(len, len * f + 2));
        const ang = (Math.atan2(p2.y - p.y, p2.x - p.x) * 180) / Math.PI;
        const ag = el('g', { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)})` }, arrows);
        el('path', { d: 'M-7 -6 L4 0 L-7 6', fill: 'none', stroke: '#fbf3e2', 'stroke-width': 5.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ag);
        el('path', { d: 'M-7 -6 L4 0 L-7 6', fill: 'none', stroke: stage.color, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ag);
        arrowEls.push({ group: ag, t: f });
      });

      // 计算节点在路径上的进度 t（避免路线自交时跳到错误分支）
      const samples = 600;
      const samplePts = [];
      for (let i = 0; i <= samples; i++) samplePts.push(route.getPointAtLength((len * i) / samples));
      let prevT = 0;
      const near = 26 * 26;
      stage.nodes.forEach((node) => {
        const np = proj(node.at[0], node.at[1]);
        let firstHit = -1;
        let best = Math.floor(prevT * samples);
        let bestD = Infinity;
        for (let i = Math.floor(prevT * samples); i <= samples; i++) {
          const s = samplePts[i];
          const d = (s.x - np.x) ** 2 + (s.y - np.y) ** 2;
          if (d < near && firstHit < 0) firstHit = i;
          if (d < bestD) { bestD = d; best = i; }
        }
        // 路线自交时优先取“第一次经过”的点，保证动画与史实顺序一致
        let chosen = firstHit >= 0 ? firstHit : best;
        if (firstHit >= 0) {
          let local = firstHit;
          let localD = (samplePts[firstHit].x - np.x) ** 2 + (samplePts[firstHit].y - np.y) ** 2;
          for (let i = firstHit; i <= Math.min(samples, firstHit + 10); i++) {
            const s = samplePts[i];
            const d = (s.x - np.x) ** 2 + (s.y - np.y) ** 2;
            if (d < localD) { localD = d; local = i; }
          }
          chosen = local;
        }
        node._t = Math.max(chosen / samples, prevT + 0.015);
        prevT = node._t;
      });

      geo[stage.id] = { path: route, len, arrows: arrowEls, group, pts };
    });
  }

  function buildCities(g) {
    OVERVIEW_LABELS.forEach((c) => {
      const p = proj(c.at[0], c.at[1]);
      const dot = el('g', { class: 'city-g' }, g);
      if (c.kind === 'city') {
        el('circle', { cx: p.x, cy: p.y, r: 4.5, class: 'city-dot' }, dot);
      }
      svgText(dot, 'city-label' + (c.kind === 'city' ? '' : ' small'), p.x + c.dx, p.y + c.dy, c.name, {
        'text-anchor': c.anchor,
        'font-size': 21,
        style: '--fs:21',
      });
    });

    // 起点 / 终点标识
    const start = proj(116.03, 25.89);
    const end = proj(108.18, 36.93);
    addFlag(g, start, '起点', '#a8342a', 1);
    addFlag(g, end, '终点', '#7b4a63', -1);
  }

  function addFlag(g, p, tag, color, dir) {
    const f = el('g', { class: 'anchor' }, g);
    const x = p.x;
    const y = p.y;
    el('line', { x1: x, y1: y, x2: x, y2: y - 38, stroke: color, 'stroke-width': 2.2 }, f);
    el('path', {
      d: `M${x} ${y - 38} L${x + 26 * dir} ${y - 31} L${x} ${y - 23} Z`,
      class: 'anchor-flag', fill: color,
    }, f);
    svgText(f, 'anchor-label', x + 5 * dir, y - 46, tag, {
      'text-anchor': dir > 0 ? 'start' : 'end',
      'font-size': 13,
      style: `--fs:13;fill:${color}`,
    });
  }

  function buildNodes(g) {
    STAGES.forEach((stage) => {
      stage.nodes.forEach((node, i) => {
        const p = proj(node.at[0], node.at[1]);
        const outer = el('g', {
          class: 'node-g',
          'data-stage': stage.id,
          'data-node': node.id,
          transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`,
          role: 'button',
          tabindex: '0',
          'aria-label': `${node.name}，${node.date}，${node.place}，查看事件详情`,
        }, g);
        const inner = el('g', { class: 'node-scale' }, outer);
        el('circle', { class: 'pulse', r: 11, stroke: stage.color, 'stroke-width': 1.4 }, inner);
        el('circle', { class: 'hit', r: 18 }, inner);
        el('circle', { class: 'disc', r: 8.4, stroke: stage.color }, inner);
        svgText(inner, 'num', 0, 4.2, String(i + 1), { 'text-anchor': 'middle', 'font-size': 11 });

        const lx = (node.label && node.label.dx) || 0;
        const ly = (node.label && node.label.dy) || 24;
        const anchor = (node.label && node.label.anchor) || 'middle';
        if (Math.abs(lx) > 7 || Math.abs(ly) > 16) {
          const ex = anchor === 'middle' ? 0 : anchor === 'start' ? lx - 3 : lx + 3;
          el('line', {
            x1: 0, y1: 0, x2: ex, y2: ly - 6,
            stroke: stage.color, 'stroke-width': 1, 'stroke-opacity': 0.5,
          }, inner);
        }
        const fs = 12.5;
        const tw = Math.max(node.name.length * fs, 38) + 9;
        const bx = anchor === 'middle' ? -tw / 2 : anchor === 'end' ? -tw : 0;
        el('rect', {
          class: 'label-bg',
          x: lx + bx, y: ly - fs - 2, width: tw, height: fs + 8, rx: 4,
          stroke: stage.color, 'stroke-opacity': 0.45,
        }, inner);
        svgText(inner, 'label-tx', lx, ly, node.name, {
          'text-anchor': anchor, 'font-size': fs, style: `--fs:${fs}`,
        });
        outer.style.display = 'none';
      });
    });
  }

  function buildPlayMarker(g) {
    const m = el('g', { class: 'play-marker', id: 'play-marker', style: 'display:none' }, g);
    el('circle', { class: 'halo', r: 12 }, m);
    el('circle', { class: 'core', r: 6 }, m);
    el('circle', { class: 'pin', r: 2.2 }, m);
  }

  function buildMini() {
    miniSvg.innerHTML = '';
    const g = el('g', {}, miniSvg);
    STAGES.forEach((stage) => {
      const d = smoothPath(stage.route.map(([lon, lat]) => proj(lon, lat)));
      el('path', {
        d,
        fill: 'none',
        stroke: stage.color,
        'stroke-width': 2.4,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'data-mini': stage.id,
        opacity: 0.45,
        'vector-effect': 'non-scaling-stroke',
      }, g);
    });
    miniViewport = el('rect', {
      x: 0, y: 0, width: 0, height: 0,
      fill: 'rgba(168,52,42,0.08)',
      stroke: '#a8342a',
      'stroke-width': 1.4,
      'stroke-dasharray': '4 3',
      rx: 4,
    }, g);
  }

  function stageBBox(stage) {
    const pts = stage.route.map(([lon, lat]) => proj(lon, lat));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach((p) => {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    });
    return { x: x0 - 76, y: y0 - 92, w: x1 - x0 + 196, h: y1 - y0 + 200 };
  }

  function overviewBBox() {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    STAGES.forEach((s) => {
      const b = stageBBox(s);
      x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w);
      y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y + b.h);
    });
    OVERVIEW_LABELS.forEach((c) => {
      const p = proj(c.at[0], c.at[1]);
      x0 = Math.min(x0, p.x - 42); x1 = Math.max(x1, p.x + 66);
      y0 = Math.min(y0, p.y - 34); y1 = Math.max(y1, p.y + 38);
    });
    x0 -= 20; x1 += 20; y0 -= 26; y1 += 26;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function fit(bbox, aspect, padRatio) {
    const pad = padRatio == null ? 0.06 : padRatio;
    let w = bbox.w * (1 + pad * 2);
    let h = bbox.h * (1 + pad * 2);
    if (w / h < aspect) w = h * aspect;
    else h = w / aspect;
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  function aspect() {
    const r = svg.parentNode.getBoundingClientRect();
    return Math.max(0.6, r.width / Math.max(1, r.height));
  }

  function overviewCam() {
    return fit(overviewBBox(), aspect(), 0.035);
  }

  function stageCam(id) {
    const stage = STAGES.find((s) => s.id === id);
    const a = aspect();
    const v = fit(stageBBox(stage), a, 0.03);
    const minW = 680;
    if (v.w < minW) {
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      return { x: cx - minW / 2, y: cy - minW / a / 2, w: minW, h: minW / a };
    }
    return v;
  }

  function applyLabelScale() {
    const k = cam.w / MAP_W;
    const ls = Math.min(1.45, Math.max(0.66, Math.pow(k, 0.55)));
    labelScale = ls;
    svg.style.setProperty('--ls', ls.toFixed(3));
    document.querySelectorAll('.pill-scale').forEach((g) => {
      g.setAttribute('transform', `scale(${ls.toFixed(3)})`);
    });
    const box = svg.parentNode.getBoundingClientRect();
    const ss = Math.max(0.2, box.width / Math.max(1, cam.w));
    svg.style.setProperty('--ss', ss.toFixed(4));
    const target = presentMode ? 18.5 : 16.5;
    const nls = Math.min(1.8, Math.max(0.62, (target * cam.w) / (12.5 * Math.max(1, box.width))));
    document.querySelectorAll('.node-scale').forEach((g) => {
      g.setAttribute('transform', `scale(${nls.toFixed(3)})`);
    });
    svg.style.setProperty('--nls', nls.toFixed(3));
  }

  function setViewBox(v) {
    svg.setAttribute('viewBox', `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
    cam = v;
    applyLabelScale();
    if (miniViewport) {
      miniViewport.setAttribute('x', Math.max(0, v.x).toFixed(1));
      miniViewport.setAttribute('y', Math.max(0, v.y).toFixed(1));
      miniViewport.setAttribute('width', Math.min(MAP_W - Math.max(0, v.x), v.w).toFixed(1));
      miniViewport.setAttribute('height', Math.min(MAP_H - Math.max(0, v.y), v.h).toFixed(1));
    }
  }

  function animateTo(target, duration) {
    if (anim) cancelAnimationFrame(anim);
    const from = Object.assign({}, cam);
    const t0 = performance.now();
    const d = duration == null ? 760 : duration;
    if (!d || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setViewBox(target);
      return;
    }
    function step(now) {
      const p = Math.min(1, (now - t0) / d);
      const e = easeInOut(p);
      setViewBox({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      });
      if (p < 1) anim = requestAnimationFrame(step);
      else anim = null;
    }
    anim = requestAnimationFrame(step);
  }

  function setActive(id, mode) {
    activeStage = id;
    document.querySelectorAll('.stage-g').forEach((g) => {
      g.classList.toggle('is-dim', !!id && g.dataset.stage !== id && mode !== 'overview');
      g.classList.toggle('is-active', !!id && g.dataset.stage === id);
      g.classList.toggle('is-focus', !!id && g.dataset.stage === id && mode !== 'overview');
    });
    document.querySelectorAll('.stage-pill').forEach((g) => {
      const on = !id || g.dataset.stage === id;
      g.style.display = on ? '' : 'none';
    });
    document.querySelectorAll('.stage-ends').forEach((g) => {
      g.style.display = id && g.dataset.ends === id ? '' : 'none';
    });
    document.querySelectorAll('.node-g').forEach((g) => {
      g.style.display = id && g.dataset.stage === id ? '' : 'none';
      g.classList.remove('is-hot', 'is-passed', 'is-upcoming');
    });
    document.querySelectorAll('[data-mini]').forEach((p) => {
      p.setAttribute('opacity', !id || p.dataset.mini === id ? '0.9' : '0.18');
      p.setAttribute('stroke-width', id && p.dataset.mini === id ? '3.4' : '2.2');
    });
    const pm = document.getElementById('play-marker');
    if (pm) pm.style.display = 'none';
  }

  function clearProgress() {
    STAGES.forEach((s) => {
      const g = geo[s.id];
      if (!g) return;
      g.path.style.strokeDasharray = '';
      g.path.style.strokeDashoffset = '';
      const halo = g.group.querySelector('.route-halo');
      if (halo) { halo.style.strokeDasharray = ''; halo.style.strokeDashoffset = ''; }
      g.arrows.forEach((a) => { a.group.style.opacity = ''; });
    });
    document.querySelectorAll('.node-g').forEach((n) => {
      n.classList.remove('is-passed', 'is-upcoming', 'is-hot');
      n.style.opacity = '';
    });
    const pm = document.getElementById('play-marker');
    if (pm) pm.style.display = 'none';
  }

  function setProgress(stageId, p) {
    const stage = STAGES.find((s) => s.id === stageId);
    const g = geo[stageId];
    if (!g) return;
    const prog = Math.max(0, Math.min(1, p));
    const dash = g.len;
    g.path.style.strokeDasharray = `${dash} ${dash}`;
    g.path.style.strokeDashoffset = `${dash * (1 - prog)}`;
    const halo = g.group.querySelector('.route-halo');
    if (halo) {
      halo.style.strokeDasharray = `${dash} ${dash}`;
      halo.style.strokeDashoffset = `${dash * (1 - prog)}`;
    }
    g.arrows.forEach((a) => { a.group.style.opacity = a.t <= prog ? '1' : '0'; });

    stage.nodes.forEach((node) => {
      const ng = document.querySelector(`.node-g[data-node="${node.id}"]`);
      if (!ng) return;
      ng.classList.toggle('is-passed', prog >= node._t);
      ng.classList.toggle('is-upcoming', prog < node._t);
      ng.classList.toggle('is-hot', prog >= node._t && prog < node._t + 0.06);
      ng.style.opacity = prog >= node._t ? '1' : '0.46';
    });

    const pm = document.getElementById('play-marker');
    if (pm) {
      const pt = g.path.getPointAtLength(g.len * prog);
      pm.style.display = '';
      pm.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
    }
  }

  function revealStage(stageId) {
    const g = geo[stageId];
    if (!g) return;
    g.path.style.strokeDasharray = '';
    g.path.style.strokeDashoffset = '';
    const halo = g.group.querySelector('.route-halo');
    if (halo) { halo.style.strokeDasharray = ''; halo.style.strokeDashoffset = ''; }
    g.arrows.forEach((a) => { a.group.style.opacity = ''; });
  }

  function init(cb) {
    Object.assign(callbacks, cb || {});
    svg = document.getElementById('map');
    miniSvg = document.getElementById('mini-map');
    svg.innerHTML = '';
    buildDefs(svg);
    layers = {};
    ['terrain', 'routes', 'cities', 'nodes', 'play'].forEach((name) => {
      layers[name] = el('g', { id: 'layer-' + name }, svg);
    });
    buildGrid(layers.terrain);
    buildMountains(layers.terrain);
    buildRivers(layers.terrain);
    buildProvinces(layers.terrain);
    buildRoutes(layers.routes);
    STAGES.forEach((s) => buildStagePill(layers.routes, s));
    buildCities(layers.cities);
    buildNodes(layers.nodes);
    buildPlayMarker(layers.play);
    buildMini();

    cam = overviewCam();
    setViewBox(cam);

    svg.addEventListener('click', (e) => {
      const node = e.target.closest('.node-g');
      if (node) {
        if (callbacks.onNode) callbacks.onNode(node.dataset.stage, node.dataset.node);
        return;
      }
      const hit = e.target.closest('[data-hit="stage"]');
      if (hit && callbacks.onStage) callbacks.onStage(hit.dataset.stage);
    });
    svg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const node = e.target.closest('.node-g');
      if (node && callbacks.onNode) {
        e.preventDefault();
        callbacks.onNode(node.dataset.stage, node.dataset.node);
        return;
      }
      const stage = e.target.closest('.stage-g');
      if (stage && callbacks.onStage) {
        e.preventDefault();
        callbacks.onStage(stage.dataset.stage);
      }
    });

    window.addEventListener('resize', () => {
      if (!cam) return;
      const target = activeStage ? stageCam(activeStage) : overviewCam();
      setViewBox(target);
    });
  }

  window.LCMap = {
    init,
    proj,
    showOverview(animate) {
      setActive(null, 'overview');
      const target = overviewCam();
      if (animate === false) setViewBox(target);
      else animateTo(target, 820);
    },
    focusStage(id, animate) {
      setActive(id, 'stage');
      const target = stageCam(id);
      if (animate === false) setViewBox(target);
      else animateTo(target, 780);
    },
    refit() {
      if (activeStage) setViewBox(stageCam(activeStage));
      else setViewBox(overviewCam());
    },
    setProgress,
    clearProgress,
    revealStage,
    pulseNode(id) {
      document.querySelectorAll('.node-g').forEach((n) => n.classList.toggle('is-hot', n.dataset.node === id));
    },
    zoomBy(f) {
      const cx = cam.x + cam.w / 2;
      const cy = cam.y + cam.h / 2;
      const w = Math.min(3200, Math.max(230, cam.w * f));
      const h = w / (cam.w / cam.h);
      setViewBox({ x: cx - w / 2, y: cy - h / 2, w, h });
    },
    reset() { this.refit(); },
    getStagePoint(id, p) {
      const g = geo[id];
      if (!g) return null;
      const pt = g.path.getPointAtLength(g.len * Math.max(0, Math.min(1, p)));
      return { x: pt.x, y: pt.y, len: g.len };
    },
    getCurrentStage() { return activeStage; },
    getLength(id) { return geo[id] ? geo[id].len : 0; },
    setPresent(v) {
      presentMode = !!v;
      applyLabelScale();
    },
  };
})();
