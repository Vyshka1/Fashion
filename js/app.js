/* Контроллер приложения: состояние, события, сценарии. */
var App = (function () {

  var state = {
    tab: 'home',
    items: [],
    saved: [],
    filter: { category: 'all', status: 'all' },
    looks: { occasion: 'any', season: null, includeWish: true, list: [], seed: 1 },
    selection: [],
    selectMode: false,
    daily: null,
    homeIdeas: []
  };

  var editorQueue = [];     // очередь черновиков после кадрирования
  var editing = null;       // {draft, isNew}
  var viewing = null;       // открытый образ

  /* ---------- загрузка ---------- */

  function boot() {
    Cropper.init();
    bindEvents();
    Promise.all([Store.items.all(), Store.outfits.all()]).then(function (res) {
      state.items = res[0] || [];
      state.saved = rehydrate(res[1] || []);
      refreshLooks();
      renderAll();
    });
    registerSW();
  }

  function rehydrate(saved) {
    var byId = {};
    state.items.forEach(function (i) { byId[i.id] = i; });
    return saved.map(function (o) {
      var items = (o.itemIds || []).map(function (id) { return byId[id]; }).filter(Boolean);
      return {
        id: o.id, itemIds: o.itemIds, items: items, title: o.title,
        score: o.score, reasons: o.reasons || [], createdAt: o.createdAt,
        price: items.reduce(function (s, i) { return s + (Number(i.price) || 0); }, 0),
        hasWish: items.some(function (i) { return i.status === 'wish'; }),
        missing: (o.itemIds || []).length - items.length
      };
    }).filter(function (o) { return o.items.length; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function renderAll() {
    UI.renderHome(state);
    UI.renderCloset(state);
    UI.renderLooks(state);
    UI.renderSaved(state);
  }

  /* ---------- образы ---------- */

  function refreshLooks() {
    state.looks.list = Outfits.generate(state.items, {
      occasion: state.looks.occasion,
      season: state.looks.season,
      includeWish: state.looks.includeWish,
      seed: state.looks.seed,
      limit: 20
    });

    var day = Math.floor(Date.now() / 86400000);
    var daily = Outfits.generate(state.items, {
      season: Tax.currentSeason(),
      includeWish: true,
      seed: day + state.looks.seed,
      limit: 3
    });
    // если по текущему сезону ничего нет — показываем всесезонные варианты
    if (!daily.length) daily = Outfits.generate(state.items, { includeWish: true, seed: day, limit: 3 });
    state.daily = daily[0] || null;
    state.homeIdeas = daily.slice(1, 3);
  }

  function findOutfit(id) {
    var pools = [state.looks.list, state.homeIdeas, state.saved, state.daily ? [state.daily] : []];
    for (var i = 0; i < pools.length; i++) {
      for (var j = 0; j < pools[i].length; j++) if (pools[i][j].id === id) return pools[i][j];
    }
    return null;
  }

  function saveOutfit(outfit) {
    if (state.saved.some(function (o) { return o.id === outfit.id; })) {
      UI.toast('Уже в сохранённых');
      return;
    }
    var rec = {
      id: outfit.id, itemIds: outfit.itemIds, title: outfit.title || UI.titleFor(outfit),
      score: outfit.score, reasons: outfit.reasons, createdAt: Date.now()
    };
    Store.outfits.put(rec).then(function () {
      state.saved.unshift(rehydrate([rec])[0]);
      UI.renderSaved(state);
      UI.renderHome(state);
      UI.toast('Сохранено в «Луки»');
    });
  }

  function unsaveOutfit(id) {
    Store.outfits.remove(id).then(function () {
      state.saved = state.saved.filter(function (o) { return o.id !== id; });
      UI.renderSaved(state);
      UI.renderHome(state);
      UI.toast('Удалено');
    });
  }

  /* ---------- добавление вещей ---------- */

  function pickFiles() { document.getElementById('file-input').click(); }

  function handleFiles(files) {
    Cropper.open(files, function (crops) {
      var jobs = crops.map(function (c) { return makeDraft(c); });
      Promise.all(jobs).then(function (drafts) {
        editorQueue = drafts;
        nextDraft();
      });
    });
  }

  function makeDraft(crop) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var pal = Color.palette(img, 5);
        resolve({
          id: Store.uid(),
          image: crop.image, thumb: crop.thumb,
          palette: pal, colors: [pal[0]],
          category: 'top', name: '',
          seasons: [], styles: [], status: 'wish',
          price: '', link: '', brand: '', note: '',
          createdAt: Date.now()
        });
      };
      img.onerror = function () {
        resolve({
          id: Store.uid(), image: crop.image, thumb: crop.thumb,
          palette: ['#b9ada2'], colors: ['#b9ada2'], category: 'top', name: '',
          seasons: [], styles: [], status: 'wish', price: '', link: '', brand: '', note: '',
          createdAt: Date.now()
        });
      };
      img.src = crop.image;
    });
  }

  function nextDraft() {
    if (!editorQueue.length) return;
    openEditor(editorQueue.shift(), true);
  }

  function openEditor(draft, isNew) {
    editing = { draft: JSON.parse(JSON.stringify(draft)), isNew: isNew };
    UI.renderEditor(editing.draft, isNew);
    UI.openSheet('editor');
  }

  /* Переносит введённый текст из формы в черновик (без подстановки названия). */
  function syncEditorInputs() {
    if (!editing) return null;
    var d = editing.draft;
    var get = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    d.name = get('e-name');
    d.price = get('e-price');
    d.link = get('e-link');
    d.brand = get('e-brand');
    d.note = get('e-note');
    return d;
  }

  function collectEditor() {
    var d = syncEditorInputs();
    if (!d.name) {
      d.name = Tax.catName(d.category) + ' · ' + Color.name(d.colors[0]);
    }
    return d;
  }

  function saveEditor() {
    var item = collectEditor();
    Store.items.put(item).then(function () {
      var i = state.items.findIndex(function (x) { return x.id === item.id; });
      if (i >= 0) state.items[i] = item; else state.items.push(item);
      UI.closeSheet('editor');
      editing = null;
      refreshLooks();
      renderAll();
      UI.toast(editorQueue.length ? 'Сохранено, следующая вещь…' : 'Вещь добавлена');
      if (editorQueue.length) setTimeout(nextDraft, 250);
    }).catch(function (e) {
      UI.toast('Не удалось сохранить: ' + e.message);
    });
  }

  /* Сохранённые луки, где была удалённая вещь, тоже удаляем — иначе
     останутся образы с дырами. */
  function dropOutfitsWith(ids) {
    var dead = state.saved.filter(function (o) {
      return o.itemIds.some(function (id) { return ids.indexOf(id) >= 0; });
    });
    state.saved = state.saved.filter(function (o) { return dead.indexOf(o) < 0; });
    return Promise.all(dead.map(function (o) { return Store.outfits.remove(o.id); }));
  }

  function deleteItem(id) {
    if (!confirm('Удалить вещь из гардероба?')) return;
    Promise.all([Store.items.remove(id), dropOutfitsWith([id])]).then(function () {
      state.items = state.items.filter(function (x) { return x.id !== id; });
      UI.closeSheet('editor');
      editing = null;
      refreshLooks();
      renderAll();
      UI.toast('Удалено');
    });
  }

  /* ---------- выбор нескольких вещей ---------- */

  function toggleSelectMode(on) {
    state.selectMode = on === undefined ? !state.selectMode : on;
    if (!state.selectMode) state.selection = [];
    UI.renderCloset(state);
  }

  function toggleSelect(id) {
    var i = state.selection.indexOf(id);
    if (i >= 0) state.selection.splice(i, 1); else state.selection.push(id);
    UI.renderCloset(state);
  }

  function buildFromSelection() {
    if (!state.selection.length) { UI.toast('Выберите хотя бы одну вещь'); return; }
    state.looks.list = Outfits.generate(state.items, {
      occasion: state.looks.occasion,
      season: state.looks.season,
      includeWish: true,
      pinnedIds: state.selection.slice(),
      seed: Date.now() % 9999,
      limit: 20
    });
    toggleSelectMode(false);
    UI.renderLooks(state);
    go('looks');
    UI.toast(state.looks.list.length ? 'Собрали образы с этими вещами' : 'С этими вещами образ не собрался');
  }

  function deleteSelection() {
    if (!state.selection.length) return;
    if (!confirm('Удалить ' + state.selection.length + ' ' +
      UI.plural(state.selection.length, 'вещь', 'вещи', 'вещей') + '?')) return;
    var ids = state.selection.slice();
    Promise.all(ids.map(function (id) { return Store.items.remove(id); })
      .concat([dropOutfitsWith(ids)])).then(function () {
      state.items = state.items.filter(function (x) { return ids.indexOf(x.id) < 0; });
      toggleSelectMode(false);
      refreshLooks();
      renderAll();
      UI.toast('Удалено');
    });
  }

  /* ---------- навигация ---------- */

  function go(tab) {
    state.tab = tab;
    document.querySelectorAll('.screen').forEach(function (s) {
      s.hidden = s.dataset.screen !== tab;
    });
    document.querySelectorAll('.tab[data-tab]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    var scroll = document.querySelector('.screen[data-screen="' + tab + '"] .scroll');
    if (scroll) scroll.scrollTop = scroll.scrollTop;
  }

  /* ---------- экспорт / импорт ---------- */

  function exportData() {
    var payload = {
      app: 'fashion-closet', version: 1, exportedAt: new Date().toISOString(),
      items: state.items,
      outfits: state.saved.map(function (o) {
        return { id: o.id, itemIds: o.itemIds, title: o.title, score: o.score,
                 reasons: o.reasons, createdAt: o.createdAt };
      })
    };
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'гардероб-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    UI.toast('Файл сохранён');
  }

  function importData() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = function () {
      var f = inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var data = JSON.parse(fr.result);
          if (!data.items) throw new Error('нет вещей');
          var existing = {};
          state.items.forEach(function (i) { existing[i.id] = true; });
          var added = 0;
          var jobs = data.items.filter(function (i) { return !existing[i.id]; })
            .map(function (i) { added++; state.items.push(i); return Store.items.put(i); });
          (data.outfits || []).forEach(function (o) {
            if (!state.saved.some(function (s) { return s.id === o.id; })) jobs.push(Store.outfits.put(o));
          });
          Promise.all(jobs).then(function () {
            return Store.outfits.all();
          }).then(function (outs) {
            state.saved = rehydrate(outs);
            refreshLooks();
            renderAll();
            UI.toast('Добавлено вещей: ' + added);
          });
        } catch (e) {
          UI.toast('Не получилось прочитать файл');
        }
      };
      fr.readAsText(f);
    };
    inp.click();
  }

  function wipe() {
    if (!confirm('Удалить все вещи и образы без возможности восстановления?')) return;
    Store.clearAll().then(function () {
      state.items = []; state.saved = [];
      refreshLooks();
      renderAll();
      UI.closeSheet('settings');
      UI.toast('Всё очищено');
    });
  }

  /* ---------- события ---------- */

  function bindEvents() {
    document.getElementById('tabbar').addEventListener('click', function (e) {
      var b = e.target.closest('.tab');
      if (!b) return;
      if (b.id === 'btn-add') return pickFiles();
      if (b.dataset.tab) go(b.dataset.tab);
    });

    document.getElementById('file-input').addEventListener('change', function (e) {
      if (e.target.files && e.target.files.length) handleFiles(e.target.files);
      e.target.value = '';
    });

    // общий обработчик кликов
    document.addEventListener('click', function (e) {
      var t = e.target;

      var closeBtn = t.closest('[data-close]');
      if (closeBtn) {
        var id = closeBtn.dataset.close;
        UI.closeSheet(id);
        if (id === 'editor') { editing = null; if (editorQueue.length) setTimeout(nextDraft, 250); }
        return;
      }

      var goto = t.closest('[data-goto]');
      if (goto) return go(goto.dataset.goto);

      var act = t.closest('[data-act]');
      if (act) return handleAction(act.dataset.act, act);

      var sw = t.closest('[data-color]');
      if (sw && editing) return setColor(sw.dataset.color);

      var chip = t.closest('[data-chip]');
      if (chip) return handleChip(chip.dataset.chip, chip.dataset.value, chip);

      var cell = t.closest('[data-item]');
      if (cell) return handleCell(cell.dataset.item);
    });

    document.getElementById('editor-save').addEventListener('click', saveEditor);
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('btn-select-mode').addEventListener('click', function () { toggleSelectMode(); });
    document.getElementById('sel-cancel').addEventListener('click', function () { toggleSelectMode(false); });
    document.getElementById('sel-delete').addEventListener('click', deleteSelection);
    document.getElementById('sel-build').addEventListener('click', buildFromSelection);

    document.getElementById('btn-regen').addEventListener('click', function () {
      state.looks.seed = Math.floor(Math.random() * 100000);
      refreshLooks();
      UI.renderLooks(state);
      UI.toast('Подобрали заново');
    });

    document.getElementById('btn-shuffle-home').addEventListener('click', function () {
      state.looks.seed = Math.floor(Math.random() * 100000);
      refreshLooks();
      UI.renderHome(state);
    });

    document.getElementById('look-save-btn').addEventListener('click', function () {
      if (viewing) saveOutfit(viewing);
    });

    // выбор цвета в редакторе
    document.addEventListener('input', function (e) {
      if (e.target.id === 'e-color-pick' && editing) {
        setColor(e.target.value);
      }
    });

    // вставка из буфера и перетаскивание
    window.addEventListener('paste', function (e) {
      var files = [];
      var items = (e.clipboardData || {}).items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          var f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) handleFiles(files);
    });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
  }

  function setColor(hex) {
    editing.draft.colors[0] = hex;
    var nameEl = document.getElementById('e-colorname');
    if (nameEl) nameEl.textContent = Color.name(hex);
    document.querySelectorAll('#editor-body .sw[data-color]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.color === hex);
    });
  }

  function handleAction(act, el) {
    var id = el.dataset.id;
    switch (act) {
      case 'add': return pickFiles();
      case 'save': {
        var o = findOutfit(id);
        if (o) saveOutfit(o);
        return;
      }
      case 'unsave': return unsaveOutfit(id);
      case 'open': {
        var out = findOutfit(id);
        if (!out) return;
        viewing = out;
        UI.renderLookView(out, state.saved.some(function (s) { return s.id === out.id; }));
        UI.openSheet('look-view');
        return;
      }
      case 'delete-item': return deleteItem(editing.draft.id);
      case 'export': return exportData();
      case 'import': return importData();
      case 'wipe': return wipe();
    }
  }

  function handleChip(group, value, el) {
    function toggleIn(arr) {
      var i = arr.indexOf(value);
      if (i >= 0) arr.splice(i, 1); else arr.push(value);
    }
    switch (group) {
      case 'cat': state.filter.category = value; return UI.renderCloset(state);
      case 'status': state.filter.status = value; return UI.renderCloset(state);
      case 'occ':
        state.looks.occasion = value;
        refreshLooks(); return UI.renderLooks(state);
      case 'season':
        state.looks.season = value === 'all' ? null : value;
        refreshLooks(); return UI.renderLooks(state);
      case 'wish':
        state.looks.includeWish = !state.looks.includeWish;
        refreshLooks(); return UI.renderLooks(state);
      case 'e-cat':
        syncEditorInputs();
        editing.draft.category = value;
        UI.renderEditor(editing.draft, editing.isNew);
        return;
      case 'e-season': toggleIn(editing.draft.seasons); break;
      case 'e-style': toggleIn(editing.draft.styles); break;
      case 'e-status': editing.draft.status = value; break;
      default: return;
    }
    // локальное обновление активных чипов, без перерисовки формы
    var parent = el.parentNode;
    parent.querySelectorAll('[data-chip="' + group + '"]').forEach(function (b) {
      var v = b.dataset.value;
      var on = group === 'e-status'
        ? editing.draft.status === v
        : (group === 'e-season' ? editing.draft.seasons : editing.draft.styles).indexOf(v) >= 0;
      b.classList.toggle('active', on);
    });
  }

  function handleCell(id) {
    if (state.selectMode) return toggleSelect(id);
    var item = state.items.find(function (x) { return x.id === id; });
    if (item) openEditor(item, false);
  }

  function openSettings() {
    Store.usage().then(function (u) {
      UI.renderSettings(state, u);
      UI.openSheet('settings');
    });
  }

  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { state: state, go: go, refreshLooks: refreshLooks };
})();
