/* Отрисовка экранов и листов. Состояние живёт в App. */
var UI = (function () {

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function money(n) {
    n = Math.round(Number(n) || 0);
    return n.toLocaleString('ru-RU') + ' ₽';
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  function openSheet(id) { document.getElementById(id).hidden = false; }
  function closeSheet(id) { document.getElementById(id).hidden = true; }

  /* ---------- чипы ---------- */

  function chips(list, active, opts) {
    opts = opts || {};
    return list.map(function (o) {
      var on = Array.isArray(active) ? active.indexOf(o.id) >= 0 : active === o.id;
      return '<button class="chip' + (opts.soft ? ' soft' : '') + (on ? ' active' : '') +
        '" data-chip="' + esc(opts.group) + '" data-value="' + esc(o.id) + '">' +
        (o.icon ? o.icon + ' ' : '') + esc(o.name) + '</button>';
    }).join('');
  }

  /* ---------- карточка вещи ---------- */

  function cell(item, opts) {
    opts = opts || {};
    var picked = opts.picked ? ' picked' : '';
    var color = (item.colors && item.colors[0]) || '#ccc';
    return '<div class="cell' + picked + '" data-item="' + esc(item.id) + '">' +
      '<img src="' + (item.thumb || item.image) + '" alt="' + esc(item.name) + '" loading="lazy">' +
      '<span class="dot" style="background:' + esc(color) + '"></span>' +
      (item.status === 'wish' ? '<span class="wish">хочу</span>' : '') +
      '<span class="cap">' + esc(item.name || Tax.catName(item.category)) + '</span>' +
      '</div>';
  }

  /* ---------- карточка образа ---------- */

  function lookCard(outfit, opts) {
    opts = opts || {};
    var cols = Math.min(outfit.items.length, 5);
    var grid = outfit.items.map(function (it) {
      return '<div class="look-slot">' +
        '<img src="' + (it.thumb || it.image) + '" alt="' + esc(it.name) + '">' +
        '<em>' + esc(Tax.catName(it.category)) + '</em></div>';
    }).join('');

    var why = outfit.reasons.map(function (r) {
      return '<span class="why">' + esc(r) + '</span>';
    }).join('');

    var wishNote = outfit.hasWish ? '<span class="why">🛍 есть вещи из списка покупок</span>' : '';

    var actions = opts.saved
      ? '<button class="mini-btn ghost" data-act="unsave" data-id="' + esc(outfit.id) + '">Удалить</button>' +
        '<button class="mini-btn" data-act="open" data-id="' + esc(outfit.id) + '">Открыть</button>'
      : '<button class="mini-btn soft" data-act="save" data-id="' + esc(outfit.id) + '">Сохранить</button>' +
        '<button class="mini-btn" data-act="open" data-id="' + esc(outfit.id) + '">Открыть</button>';

    return '<div class="look" data-look="' + esc(outfit.id) + '">' +
      '<div class="look-top">' +
        '<span class="look-title">' + esc(outfit.title || titleFor(outfit)) + '</span>' +
        '<span class="look-score">' + outfit.score + '/100</span>' +
      '</div>' +
      '<div class="look-grid" style="grid-template-columns:repeat(' + cols + ',1fr)">' + grid + '</div>' +
      '<div class="look-why">' + why + wishNote + '</div>' +
      '<div class="look-foot">' +
        '<span class="price">' + outfit.items.length + ' вещи · <b>' + money(outfit.price) + '</b></span>' +
        '<span class="look-actions">' + actions + '</span>' +
      '</div>' +
    '</div>';
  }

  /* Название образа: по цветам базы, чтобы карточки различались с первого взгляда. */
  function titleFor(outfit) {
    var by = {};
    outfit.items.forEach(function (i) { if (!by[i.category]) by[i.category] = i; });
    var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
    var col = function (i) { return Color.name((i.colors || [])[0] || '#ccc'); };

    if (by.dress) return cap(col(by.dress)) + ' образ с платьем';
    if (by.top && by.bottom) return cap(col(by.top)) + ' верх · ' + col(by.bottom) + ' низ';
    if (by.top) return cap(col(by.top)) + ' верх';
    if (by.bottom) return cap(col(by.bottom)) + ' низ';
    return 'Образ';
  }

  /* ---------- главная ---------- */

  function renderHome(state) {
    var items = state.items;
    var owned = items.filter(function (i) { return i.status !== 'wish'; }).length;
    var wish = items.length - owned;

    document.getElementById('home-stats').innerHTML =
      '<div class="stat"><b>' + items.length + '</b><span>вещей</span></div>' +
      '<div class="stat"><b>' + wish + '</b><span>хочу купить</span></div>' +
      '<div class="stat"><b>' + state.saved.length + '</b><span>сохранённых луков</span></div>';

    document.getElementById('home-sub').textContent =
      items.length ? 'Сезон: ' + Tax.seasonName(Tax.currentSeason()).toLowerCase() : 'Загрузите вещи — соберём образы';

    var host = document.getElementById('home-outfit');
    if (!state.daily) {
      var need = Outfits.missing(items, true);
      host.innerHTML = '<div class="empty"><b>Пока не из чего собрать</b>' +
        (need.length ? 'Не хватает: ' + esc(need.join(', ')) + '.<br>' : '') +
        'Добавьте вещи — образы появятся сами.' +
        '<br><button class="mini-btn" data-act="add">Добавить вещь</button></div>';
    } else {
      host.innerHTML = lookCard(state.daily, {});
    }

    var recent = items.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 12);
    document.getElementById('home-recent').innerHTML = recent.length
      ? recent.map(function (i) { return cell(i); }).join('')
      : '<div class="empty" style="width:100%"><b>Гардероб пуст</b>Нажмите «+» и загрузите скриншоты вещей</div>';

    var ideas = state.homeIdeas || [];
    document.getElementById('home-ideas').innerHTML = ideas.length
      ? ideas.map(function (o) { return lookCard(o, {}); }).join('')
      : '';
  }

  /* ---------- гардероб ---------- */

  function renderCloset(state) {
    var cats = [{ id: 'all', name: 'Всё' }].concat(Tax.CATEGORIES.map(function (c) {
      return { id: c.id, name: c.short, icon: c.icon };
    }));
    document.getElementById('closet-filters').innerHTML = chips(cats, state.filter.category, { group: 'cat' });
    document.getElementById('closet-status').innerHTML = chips([
      { id: 'all', name: 'Все' }, { id: 'own', name: 'Уже есть' }, { id: 'wish', name: 'Хочу купить' }
    ], state.filter.status, { group: 'status', soft: true });

    var list = filtered(state);
    document.getElementById('closet-sub').textContent =
      list.length + ' ' + plural(list.length, 'вещь', 'вещи', 'вещей') +
      (state.selectMode ? ' · режим выбора' : '');

    document.getElementById('closet-grid').innerHTML = list.length
      ? list.map(function (i) {
          return cell(i, { picked: state.selection.indexOf(i.id) >= 0 });
        }).join('')
      : '<div class="empty" style="grid-column:1/-1"><b>Здесь пусто</b>' +
        'Добавьте вещи через «+» — можно сразу несколько скриншотов' +
        '<br><button class="mini-btn" data-act="add">Добавить</button></div>';

    var bar = document.getElementById('select-bar');
    bar.hidden = !state.selectMode;
    document.getElementById('select-count').textContent =
      state.selection.length + ' ' + plural(state.selection.length, 'вещь', 'вещи', 'вещей') + ' выбрано';
  }

  function filtered(state) {
    return state.items.filter(function (i) {
      if (state.filter.category !== 'all' && i.category !== state.filter.category) return false;
      if (state.filter.status === 'own' && i.status === 'wish') return false;
      if (state.filter.status === 'wish' && i.status !== 'wish') return false;
      return true;
    }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }

  /* ---------- образы ---------- */

  function renderLooks(state) {
    document.getElementById('looks-occasion').innerHTML =
      chips(Tax.OCCASIONS, state.looks.occasion, { group: 'occ' });
    document.getElementById('looks-season').innerHTML =
      chips([{ id: 'all', name: 'Любой сезон' }].concat(Tax.SEASONS), state.looks.season || 'all',
        { group: 'season', soft: true }) +
      '<button class="chip soft' + (state.looks.includeWish ? ' active' : '') +
      '" data-chip="wish" data-value="toggle">🛍 С покупками</button>';

    var list = state.looks.list;
    document.getElementById('looks-sub').textContent = list.length
      ? list.length + ' ' + plural(list.length, 'вариант', 'варианта', 'вариантов')
      : 'Подберём из ваших вещей';

    document.getElementById('looks-list').innerHTML = list.length
      ? list.map(function (o) { return lookCard(o, {}); }).join('')
      : '<div class="empty"><b>Не удалось собрать образы</b>' +
        'Попробуйте снять фильтры или добавить вещи: нужен верх с низом (или платье) и обувь.' +
        '<br><button class="mini-btn" data-act="add">Добавить вещь</button></div>';
  }

  /* ---------- сохранённые ---------- */

  function renderSaved(state) {
    document.getElementById('saved-sub').textContent =
      state.saved.length + ' ' + plural(state.saved.length, 'образ', 'образа', 'образов');
    document.getElementById('saved-list').innerHTML = state.saved.length
      ? state.saved.map(function (o) { return lookCard(o, { saved: true }); }).join('')
      : '<div class="empty"><b>Пока ничего не сохранено</b>' +
        'Понравившийся образ на вкладке «Образы» можно сохранить кнопкой «Сохранить».</div>';
  }

  /* ---------- редактор вещи ---------- */

  function renderEditor(draft, isNew) {
    document.getElementById('editor-title').textContent = isNew ? 'Новая вещь' : 'Редактирование';

    var palette = draft.palette || draft.colors || [];
    var swatches = palette.map(function (hex) {
      return '<button class="sw' + (draft.colors[0] === hex ? ' active' : '') +
        '" data-color="' + esc(hex) + '" style="background:' + esc(hex) + '" title="' + esc(Color.name(hex)) + '"></button>';
    }).join('');

    document.getElementById('editor-body').innerHTML =
      '<img class="editor-photo" src="' + draft.image + '" alt="">' +

      '<div class="field"><label>Категория</label><div class="opts">' +
        chips(Tax.CATEGORIES.map(function (c) { return { id: c.id, name: c.short, icon: c.icon }; }),
          draft.category, { group: 'e-cat' }) +
      '</div></div>' +

      '<div class="field"><label>Основной цвет — <span id="e-colorname">' +
        esc(Color.name(draft.colors[0])) + '</span></label>' +
        '<div class="swatches">' + swatches +
        '<label class="sw" style="background:conic-gradient(red,gold,lime,cyan,blue,magenta,red);position:relative;overflow:hidden">' +
          '<input type="color" id="e-color-pick" value="' + esc(draft.colors[0]) +
          '" style="opacity:0;width:100%;height:100%;border:0"></label>' +
        '</div></div>' +

      '<div class="field"><label>Название</label>' +
        '<input type="text" id="e-name" value="' + esc(draft.name) + '" placeholder="Например: белые джинсы мом"></div>' +

      '<div class="field"><label>Сезон</label><div class="opts">' +
        chips(Tax.SEASONS, draft.seasons, { group: 'e-season', soft: true }) +
      '</div></div>' +

      '<div class="field"><label>Стиль</label><div class="opts">' +
        chips(Tax.STYLES, draft.styles, { group: 'e-style', soft: true }) +
      '</div></div>' +

      '<div class="field"><label>Статус</label><div class="opts">' +
        chips([{ id: 'own', name: '✓ Уже есть' }, { id: 'wish', name: '🛍 Хочу купить' }],
          draft.status, { group: 'e-status' }) +
      '</div></div>' +

      '<div class="row2">' +
        '<div class="field"><label>Цена, ₽</label>' +
          '<input type="number" inputmode="numeric" id="e-price" value="' + (draft.price || '') + '" placeholder="3445"></div>' +
        '<div class="field"><label>Бренд / магазин</label>' +
          '<input type="text" id="e-brand" value="' + esc(draft.brand || '') + '" placeholder="Wildberries"></div>' +
      '</div>' +

      '<div class="field"><label>Ссылка на товар</label>' +
        '<input type="url" id="e-link" value="' + esc(draft.link || '') + '" placeholder="https://..."></div>' +

      '<div class="field"><label>Заметка</label>' +
        '<textarea id="e-note" placeholder="Размер, посадка, с чем носить">' + esc(draft.note || '') + '</textarea></div>' +

      (isNew ? '' : '<button class="del-link" data-act="delete-item">Удалить вещь</button>');
  }

  /* ---------- просмотр образа ---------- */

  function renderLookView(outfit, isSaved) {
    document.getElementById('look-save-btn').textContent = isSaved ? 'Сохранено' : 'Сохранить';
    var rows = outfit.items.map(function (it) {
      var price = it.price ? money(it.price) : '';
      var meta = [Tax.catName(it.category), Color.name((it.colors || [])[0] || '#ccc'), price]
        .filter(Boolean).join(' · ');
      return '<div class="lv-item">' +
        '<img src="' + (it.thumb || it.image) + '" alt="">' +
        '<div class="lv-meta"><b>' + esc(it.name || Tax.catName(it.category)) + '</b>' +
          '<span>' + esc(meta) + '</span></div>' +
        (it.link ? '<a class="lv-link" href="' + esc(it.link) + '" target="_blank" rel="noopener">Открыть →</a>' : '') +
      '</div>';
    }).join('');

    var wishTotal = outfit.items
      .filter(function (i) { return i.status === 'wish'; })
      .reduce(function (s, i) { return s + (Number(i.price) || 0); }, 0);

    document.getElementById('look-view-body').innerHTML =
      '<div class="look-grid" style="grid-template-columns:repeat(' + Math.min(outfit.items.length, 3) + ',1fr);margin-bottom:14px">' +
        outfit.items.map(function (it) {
          return '<div class="look-slot"><img src="' + (it.thumb || it.image) + '" alt=""></div>';
        }).join('') +
      '</div>' +
      '<div class="look-why" style="margin-bottom:16px">' +
        '<span class="why">Оценка сочетаемости: ' + outfit.score + '/100</span>' +
        outfit.reasons.map(function (r) { return '<span class="why">' + esc(r) + '</span>'; }).join('') +
      '</div>' +
      rows +
      '<div class="look-foot" style="margin-top:14px">' +
        '<span class="price">Всего: <b>' + money(outfit.price) + '</b>' +
        (wishTotal ? ' · к покупке ' + money(wishTotal) : '') + '</span>' +
      '</div>';
  }

  /* ---------- настройки ---------- */

  function renderSettings(state, usage) {
    var size = usage && usage.used
      ? (usage.used / 1048576).toFixed(1) + ' МБ'
      : '—';
    document.getElementById('settings-body').innerHTML =
      '<div class="field"><label>Данные</label>' +
        '<p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">' +
        'Вещи и фото хранятся только на этом устройстве. Занято: ' + esc(size) + '.' +
        (Store.isFallback() ? '<br><b>Внимание:</b> используется резервное хранилище — делайте экспорт чаще.' : '') +
        '</p>' +
        '<div class="opts">' +
          '<button class="chip" data-act="export">⬇ Экспорт в файл</button>' +
          '<button class="chip" data-act="import">⬆ Импорт из файла</button>' +
        '</div>' +
      '</div>' +
      '<div class="field"><label>Гардероб</label>' +
        '<p style="font-size:13px;color:var(--ink-2);margin-bottom:12px">' +
        state.items.length + ' вещей, ' + state.saved.length + ' сохранённых образов</p>' +
        '<button class="del-link" data-act="wipe">Удалить все данные</button>' +
      '</div>' +
      '<p style="font-size:12px;color:var(--ink-2);text-align:center;margin-top:8px">' +
      'Добавьте приложение на экран «Домой»: Поделиться → На экран «Домой»</p>';
  }

  return {
    esc: esc, money: money, toast: toast, plural: plural,
    openSheet: openSheet, closeSheet: closeSheet,
    renderHome: renderHome, renderCloset: renderCloset, renderLooks: renderLooks,
    renderSaved: renderSaved, renderEditor: renderEditor, renderLookView: renderLookView,
    renderSettings: renderSettings, filtered: filtered, lookCard: lookCard, titleFor: titleFor
  };
})();
