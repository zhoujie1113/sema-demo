/* Sema Demo 展示站：读取 projects.json 中列出的目录，解析各目录下的 sema.yaml 并渲染。 */
(function () {
  'use strict';

  // 仓库地址：用于顶部 GitHub 链接与详情页「查看源码」。
  var REPO_URL = 'https://github.com/zhoujie1113/sema-demo';
  var BRANCH = 'main';
  // 卡片实时预览的渲染尺寸（与 site.css 中 .card-cover iframe 保持一致）
  var PREVIEW_W = 1280, PREVIEW_H = 720;

  var $ = function (id) { return document.getElementById(id); };

  // 生图模型标签前的小图标（内联 SVG，不依赖外部资源）
  var ICON_IMAGE = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5.8" cy="6.5" r="1.1" fill="currentColor"/><path d="M2.5 11.5l3.2-3 2.3 2.1 2.2-2.4 3.3 3.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  var ICON_CLOCK = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.8V8l2.3 1.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function modelChip(icon, name, title) {
    return '<code class="model" title="' + esc(title) + '">' + icon + esc(name) + '</code>';
  }
  var views = { gallery: $('view-gallery'), detail: $('view-detail'), error: $('view-error') };
  var projects = null;   // { id -> meta }
  var order = [];        // 显示顺序
  var previewObserver = null;
  var view = loadPref();   // { sort: 'default'|'duration'|'name', tag: '' }

  $('repo-link').href = REPO_URL;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
    window.scrollTo(0, 0);
  }

  function normalize(id, raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var entry = raw.entry || 'index.html';
    return {
      id: id,
      name: raw.name || id,
      description: raw.description || '',
      author: raw.author || '',
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      model: raw.model || '',
      imageModel: raw.image_model || raw.imageModel || '',
      duration: raw.duration ? String(raw.duration) : '',
      durationMin: parseMinutes(raw.duration),
      run: raw.run || '',
      url: raw.url || '',
      prompt: typeof raw.prompt === 'string' ? raw.prompt.trim() : '',
      cover: raw.cover ? id + '/' + raw.cover : '',   // 可选：填写后用静态图代替实时预览
      entry: id + '/' + entry
    };
  }

  // “约 20 分钟” / “1 小时 10 分” / “45min” -> 分钟数，解析不出返回 Infinity（排序时放最后）
  function parseMinutes(v) {
    if (v == null) return Infinity;
    var str = String(v), h = str.match(/(\d+(?:\.\d+)?)\s*(小时|h)/i), m = str.match(/(\d+(?:\.\d+)?)\s*(分钟|分|min)/i);
    if (!h && !m) { var n = str.match(/\d+(?:\.\d+)?/); return n ? parseFloat(n[0]) : Infinity; }
    return (h ? parseFloat(h[1]) * 60 : 0) + (m ? parseFloat(m[1]) : 0);
  }

  function loadPref() {
    var d = { sort: 'default', tag: '' };
    try { var v = JSON.parse(localStorage.getItem('sema-demo:view') || '{}'); if (v.sort) d.sort = v.sort; if (v.tag) d.tag = v.tag; } catch (_) {}
    return d;
  }
  function savePref() { try { localStorage.setItem('sema-demo:view', JSON.stringify(view)); } catch (_) {} }

  // 根据当前筛选与排序得到要显示的项目 id 列表；“最新”即 projects.json 的顺序（新项目放最前）
  function visibleOrder() {
    var ids = order.filter(function (id) { return !view.tag || projects[id].tags.indexOf(view.tag) >= 0; });
    var idx = {}; order.forEach(function (id, i) { idx[id] = i; });
    var cmp = {
      duration: function (a, b) { return a.durationMin - b.durationMin; },
      name: function (a, b) { return a.name.localeCompare(b.name, 'zh-Hans-CN'); }
    }[view.sort] || function () { return 0; };
    return ids.sort(function (x, y) { return cmp(projects[x], projects[y]) || idx[x] - idx[y]; });
  }

  function renderToolbar() {
    var bar = $('toolbar');
    bar.hidden = order.length < 2;
    var tags = [];
    order.forEach(function (id) { projects[id].tags.forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
    if (view.tag && tags.indexOf(view.tag) < 0) view.tag = '';
    $('tag-filter').innerHTML = [''].concat(tags).map(function (t) {
      return '<button type="button" data-tag="' + esc(t) + '" aria-pressed="' + (view.tag === t) + '">' + (t ? esc(t) : '全部') + '</button>';
    }).join('');
    bar.querySelectorAll('[data-sort]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.sort === view.sort)); });
  }

  function loadProject(id) {
    return fetch(id + '/sema.yaml', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(id + '/sema.yaml ' + r.status); return r.text(); })
      .then(function (text) { return normalize(id, jsyaml.load(text)); })
      .catch(function (err) { console.warn('[sema-demo] 读取失败', id, err); return null; });
  }

  function loadAll() {
    if (projects) return Promise.resolve(projects);
    return fetch('projects.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('projects.json ' + r.status); return r.json(); })
      .then(function (ids) { return Promise.all(ids.map(loadProject)); })
      .then(function (list) {
        projects = {};
        list.forEach(function (p) { if (p) { projects[p.id] = p; order.push(p.id); } });
        return projects;
      });
  }

  /* ---------- 画廊 ---------- */

  function renderGallery() {
    var box = $('cards');
    renderToolbar();
    if (!order.length) { box.innerHTML = '<p class="muted">暂无项目。在 projects.json 中加入目录名即可展示。</p>'; return; }
    var ids = visibleOrder();
    if (!ids.length) { box.innerHTML = '<p class="muted">没有带「' + esc(view.tag) + '」标签的项目。</p>'; return; }
    box.innerHTML = ids.map(function (id) {
      var p = projects[id];
      var cover = p.cover
        ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy">'
        : '<iframe src="' + esc(p.entry) + '" title="' + esc(p.name) + ' 实时预览" tabindex="-1" loading="lazy" aria-hidden="true"></iframe>';
      return '<article class="card" data-id="' + esc(id) + '" tabindex="0">' +
        '<div class="card-cover">' + cover + '<span class="cover-badge">点击全屏体验</span></div>' +
        '<div class="card-body">' +
          '<div class="card-head">' +
            '<h2><a href="#/' + esc(id) + '">' + esc(p.name) + '</a></h2>' +
            '<div class="card-actions">' +
              '<button class="btn copy" type="button" data-project="' + esc(id) + '">复制提示词</button>' +
            '</div>' +
          '</div>' +
          '<p>' + esc(p.description) + '</p>' +
          '<div class="card-meta">' +
            p.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') +
            (p.model ? modelChip('', p.model, '对话模型') : '') +
            (p.imageModel ? modelChip(ICON_IMAGE, p.imageModel, '生图模型') : '') +
            (p.duration ? modelChip(ICON_CLOCK, p.duration, '生成用时') : '') +
          '</div>' +
        '</div></article>';
    }).join('');
    fitPreviews();
  }

  // 按卡片实际宽度缩放预览 iframe
  function fitPreviews() {
    var covers = document.querySelectorAll('.card-cover');
    covers.forEach(function (c) {
      var f = c.querySelector('iframe'); if (!f) return;
      f.style.transform = 'scale(' + (c.clientWidth / PREVIEW_W) + ')';
    });
    if (!previewObserver && window.ResizeObserver) {
      previewObserver = new ResizeObserver(fitPreviews);
    }
    if (previewObserver) covers.forEach(function (c) { previewObserver.observe(c); });
  }

  function clearGallery() {
    if (previewObserver) previewObserver.disconnect();
    $('cards').innerHTML = '';   // 卸载预览 iframe，离开画廊后不再占用资源
  }

  /* ---------- 详情 ---------- */

  function renderDetail(p) {
    document.title = p.name + ' · Sema Demo';
    $('d-name').textContent = p.name;
    $('d-desc').textContent = p.description;
    $('d-tags').innerHTML = p.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    $('d-author').textContent = p.author ? '作者：' + p.author : '';
    $('d-model').textContent = p.model || '—';
    $('d-image-model').innerHTML = ICON_IMAGE + esc(p.imageModel || '—');
    $('d-duration').textContent = p.duration || '—';
    $('d-run').textContent = p.run || '（未填写）';
    $('d-url-line').hidden = !p.url;
    $('d-url').textContent = p.url; $('d-url').href = p.url;
    $('d-source').href = REPO_URL + '/tree/' + BRANCH + '/' + p.id;
    $('d-prompt').textContent = p.prompt || '（未填写）';
    $('d-open').href = p.entry;
    var frame = $('d-frame');
    if (frame.getAttribute('src') !== p.entry) frame.src = p.entry;
  }

  // 从卡片进入：先显示详情，再在同一次用户手势内申请全屏，最后更新地址
  function openProject(id) {
    clearGallery();
    renderDetail(projects[id]);
    show('detail');
    enterFullscreen();
    if (location.hash !== '#/' + id) location.hash = '#/' + id;
    $('d-frame').focus();
  }

  function enterFullscreen() {
    var el = views.detail;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || document.fullscreenElement) return;
    try { var r = req.call(el); if (r && r.catch) r.catch(function () {}); } catch (_) {}
  }
  function exitFullscreen() {
    if (!document.fullscreenElement) return;
    var ex = document.exitFullscreen || document.webkitExitFullscreen;
    try { var r = ex.call(document); if (r && r.catch) r.catch(function () {}); } catch (_) {}
  }
  function syncFullscreenBtn() {
    var on = !!document.fullscreenElement;
    $('d-fullscreen').textContent = on ? '退出全屏' : '全屏';
  }

  /* ---------- 路由 ---------- */

  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    loadAll().then(function () {
      if (!hash) {
        document.title = 'Sema Demo';
        exitFullscreen();
        $('d-frame').removeAttribute('src');
        renderGallery();
        show('gallery');
      } else if (projects[hash]) {
        clearGallery();
        renderDetail(projects[hash]);
        show('detail');
      } else {
        document.title = 'Sema Demo';
        exitFullscreen();
        $('error-msg').textContent = '目录「' + hash + '」不在 projects.json 中，或其 sema.yaml 无法读取。';
        show('error');
      }
    }).catch(function (err) {
      $('cards').innerHTML = '<p class="muted">加载失败：' + esc(err.message) + '</p>';
      show('gallery');
    });
  }

  /* ---------- 事件 ---------- */

  // 复制按钮：data-copy 指向元素 id，data-project 复制该项目的提示词
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.copy');
    if (!btn) return;
    e.stopPropagation();
    var text = btn.dataset.copy ? $(btn.dataset.copy).textContent
             : btn.dataset.project && projects[btn.dataset.project] ? projects[btn.dataset.project].prompt : '';
    var label = btn.textContent;
    var done = function () { btn.textContent = '已复制'; setTimeout(function () { btn.textContent = label; }, 1500); };
    var settled = false;
    var finish = function (useFallback) { if (settled) return; settled = true; if (useFallback) fallbackCopy(text); done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { finish(false); }, function () { finish(true); });
      setTimeout(function () { finish(true); }, 600);
    } else { finish(true); }
  });
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
  }

  // 点击卡片（除复制按钮外的任何位置）进入全屏演示
  $('cards').addEventListener('click', function (e) {
    if (e.target.closest('.copy')) return;
    var card = e.target.closest('.card'); if (!card) return;
    e.preventDefault();
    openProject(card.dataset.id);
  });
  $('cards').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target.closest('.card'); if (!card || e.target !== card) return;
    e.preventDefault();
    openProject(card.dataset.id);
  });

  // 工具条：标签筛选与排序
  $('toolbar').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sort) view.sort = b.dataset.sort;
    else if ('tag' in b.dataset) view.tag = b.dataset.tag;
    else return;
    savePref();
    clearGallery();
    renderGallery();
  });

  $('d-fullscreen').addEventListener('click', function () {
    document.fullscreenElement ? exitFullscreen() : enterFullscreen();
  });
  document.addEventListener('fullscreenchange', syncFullscreenBtn);
  document.addEventListener('webkitfullscreenchange', syncFullscreenBtn);

  $('d-reload').addEventListener('click', function () {
    var f = $('d-frame'); var src = f.getAttribute('src'); f.src = 'about:blank';
    setTimeout(function () { f.src = src; }, 0);
  });
  $('d-toggle').addEventListener('click', function () {
    var panel = $('d-panel'); var on = panel.hidden; panel.hidden = !on;
    this.setAttribute('aria-pressed', String(on));
  });

  window.addEventListener('hashchange', route);
  route();
})();
