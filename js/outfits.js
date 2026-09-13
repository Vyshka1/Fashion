/* Сборка образов: перебор сочетаний + оценка по цвету, сезону и стилю. */
var Outfits = (function () {

  var SLOTS = ['outer', 'top', 'bottom', 'dress', 'shoes', 'bag', 'accessory'];
  var POOL_CAP = 16;   // сколько вещей из категории берём в перебор

  function primary(item) { return (item.colors && item.colors[0]) || '#b9ada2'; }

  function shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function mulberry(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- фильтрация ---------- */

  function seasonFit(item, season) {
    if (!season) return 1;
    if (!item.seasons || !item.seasons.length) return 0.75;   // сезон не указан — считаем всесезонной
    return item.seasons.indexOf(season) >= 0 ? 1 : 0;
  }

  function styleFit(item, styles) {
    if (!styles || !styles.length) return 1;
    if (!item.styles || !item.styles.length) return 0.6;
    for (var i = 0; i < item.styles.length; i++) {
      if (styles.indexOf(item.styles[i]) >= 0) return 1;
    }
    return 0.15;
  }

  /* ---------- оценка ---------- */

  function colorPart(items) {
    var reasons = [], bonus = 0;
    var cols = items.map(primary);
    var sum = 0, n = 0, worst = 1;
    for (var i = 0; i < cols.length; i++) {
      for (var j = i + 1; j < cols.length; j++) {
        var ps = Color.pairScore(cols[i], cols[j]);
        sum += ps; n++;
        if (ps < worst) worst = ps;
      }
    }
    // одна неудачная пара портит весь образ, поэтому худшая пара весит много
    var base = n ? 0.62 * (sum / n) + 0.38 * worst : 0.7;

    // слишком много активных цветов утомляет
    var bright = cols.filter(function (c) { return !Color.isNeutral(c); });
    var uniqBright = [];
    bright.forEach(function (c) {
      var dup = uniqBright.some(function (u) { return Color.hueDiff(Color.hsl(u).h, Color.hsl(c).h) < 22; });
      if (!dup) uniqBright.push(c);
    });
    if (uniqBright.length > 2) base -= 0.14 * (uniqBright.length - 2);

    // перекличка обуви и сумки — классический приём
    var map = {};
    items.forEach(function (it) { map[it.category] = it; });
    if (map.shoes && map.bag && echo(primary(map.shoes), primary(map.bag))) {
      bonus += 0.08; reasons.push('Обувь и сумка в одном тоне');
    }
    if (map.outer && (map.bag || map.shoes)) {
      var partner = map.bag || map.shoes;
      if (echo(primary(map.outer), primary(partner))) {
        bonus += 0.05; reasons.push('Верхняя одежда перекликается с аксессуаром');
      }
    }

    var neutrals = cols.filter(Color.isNeutral).length;
    if (neutrals >= cols.length - 1 && cols.length >= 3) {
      reasons.push('Спокойная нейтральная база');
    } else if (uniqBright.length === 1) {
      reasons.push('Один акцентный цвет — ' + Color.name(uniqBright[0]));
    }
    if (items.length >= 3 && cols.every(function (c) { return Color.isEarth(c) || Color.isNeutral(c); })) {
      var already = reasons.indexOf('Спокойная нейтральная база') >= 0;
      if (!already) reasons.push('Тёплая земляная гамма');
    }

    return { score: Math.max(0, Math.min(1, base + bonus)), reasons: reasons };
  }

  function echo(a, b) {
    var x = Color.hsl(a), y = Color.hsl(b);
    if (Color.isNeutral(a) && Color.isNeutral(b)) return Math.abs(x.l - y.l) < 0.16;
    return Color.hueDiff(x.h, y.h) < 22 && Math.abs(x.l - y.l) < 0.25;
  }

  function seasonPart(items, season) {
    var reasons = [];
    if (!season) {
      // без фильтра: ищем общий сезон у всех вещей
      var common = null;
      items.forEach(function (it) {
        if (!it.seasons || !it.seasons.length) return;
        common = common === null ? it.seasons.slice()
          : common.filter(function (s) { return it.seasons.indexOf(s) >= 0; });
      });
      if (common && common.length) {
        reasons.push('Подходит на ' + Tax.seasonAcc(common[0]));
        return { score: 1, reasons: reasons };
      }
      return { score: common === null ? 0.8 : 0.35, reasons: reasons };
    }
    var sum = 0;
    items.forEach(function (it) { sum += seasonFit(it, season); });
    var sc = sum / items.length;
    if (sc > 0.95) reasons.push('Подходит на ' + Tax.seasonAcc(season));
    return { score: sc, reasons: reasons };
  }

  function stylePart(items, styles) {
    var reasons = [];
    var sum = 0;
    items.forEach(function (it) { sum += styleFit(it, styles); });
    var sc = sum / items.length;

    // разброс по формальности: кроссовки + вечернее платье — мимо
    var forms = items
      .filter(function (it) { return it.styles && it.styles.length; })
      .map(function (it) { return Tax.formality(it.styles); });
    if (forms.length > 1) {
      var spread = Math.max.apply(null, forms) - Math.min.apply(null, forms);
      if (spread > 2) sc -= 0.18 * (spread - 2);
      else if (spread <= 1) reasons.push('Вещи в одном настроении');
    }

    // общий стиль у большинства
    var counts = {};
    items.forEach(function (it) {
      (it.styles || []).forEach(function (s) { counts[s] = (counts[s] || 0) + 1; });
    });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    if (top && counts[top] >= Math.max(2, items.length - 1)) {
      reasons.push('Стиль: ' + Tax.styleName(top).toLowerCase());
    }
    return { score: Math.max(0, Math.min(1, sc)), reasons: reasons };
  }

  function completenessPart(items) {
    var have = {};
    items.forEach(function (it) { have[it.category] = true; });
    var sc = 0.5;
    if (have.shoes) sc += 0.25;
    if (have.bag || have.accessory) sc += 0.15;
    if (have.outer) sc += 0.1;
    return Math.min(1, sc);
  }

  function evaluate(items, opts) {
    opts = opts || {};
    var col = colorPart(items);
    var sea = seasonPart(items, opts.season);
    var sty = stylePart(items, opts.styles);
    var comp = completenessPart(items);

    var raw = 0.42 * col.score + 0.18 * sea.score + 0.26 * sty.score + 0.14 * comp;

    // мягкий бонус: примерка «хочу купить» к тому, что уже есть
    var wish = items.filter(function (i) { return i.status === 'wish'; }).length;
    if (wish > 0 && wish < items.length) raw += 0.03;

    var reasons = col.reasons.concat(sea.reasons, sty.reasons).slice(0, 3);
    // реальные значения raw лежат в 0.34…1.0 — растягиваем их на шкалу 5…98,
    // чтобы разница между образами читалась
    var scaled = (Math.max(0, Math.min(1, raw)) - 0.34) / 0.68;
    return {
      score: Math.max(5, Math.min(98, Math.round(scaled * 100))),
      reasons: reasons
    };
  }

  /* ---------- перебор ---------- */

  function buildPools(items, opts) {
    var pools = {};
    SLOTS.forEach(function (s) { pools[s] = []; });
    items.forEach(function (it) {
      if (!opts.includeWish && it.status === 'wish') return;
      if (opts.season && seasonFit(it, opts.season) === 0) return;
      if (pools[it.category]) pools[it.category].push(it);
    });

    var rnd = opts.rnd || Math.random;
    SLOTS.forEach(function (s) {
      pools[s] = shuffle(pools[s], rnd).sort(function (a, b) {
        return styleFit(b, opts.styles) - styleFit(a, opts.styles);
      }).slice(0, POOL_CAP);
    });
    return pools;
  }

  /* Ранжирует пул по тому, насколько вещь улучшает образ. */
  function rank(base, pool, opts) {
    return pool.map(function (it) {
      return { item: it, score: evaluate(base.concat([it]), opts).score };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  /* Из тройки лучших вариантов берём один — так списки не выглядят
     как один и тот же образ с перестановками. */
  function pickTop(ranked, rnd) {
    if (!ranked.length) return null;
    var r = rnd();
    var i = r < 0.6 ? 0 : (r < 0.85 ? 1 : 2);
    return (ranked[i] || ranked[0]).item;
  }

  /* Насколько уместна верхняя одежда в этом сезоне. */
  function outerChance(season) {
    if (season === 'winter') return 1;
    if (season === 'autumn') return 0.75;
    if (season === 'spring') return 0.45;
    if (season === 'summer') return 0;
    return 0.4;
  }

  function makeOutfit(items, opts) {
    var ev = evaluate(items, opts);
    var ids = items.map(function (i) { return i.id; }).sort();
    return {
      id: ids.join('|'),
      itemIds: ids,
      items: items.slice().sort(function (a, b) {
        return SLOTS.indexOf(a.category) - SLOTS.indexOf(b.category);
      }),
      score: ev.score,
      reasons: ev.reasons,
      price: items.reduce(function (s, i) { return s + (Number(i.price) || 0); }, 0),
      hasWish: items.some(function (i) { return i.status === 'wish'; })
    };
  }

  /* Базовые комбинации: (верх + низ) либо платье. */
  function baseCombos(pools, opts, pinned) {
    var out = [];
    var pinTop = pinned.top, pinBottom = pinned.bottom, pinDress = pinned.dress;

    if (!pinDress) {
      var tops = pinTop ? [pinTop] : pools.top;
      var bottoms = pinBottom ? [pinBottom] : pools.bottom;
      for (var i = 0; i < tops.length; i++) {
        for (var j = 0; j < bottoms.length; j++) out.push([tops[i], bottoms[j]]);
      }
    }
    if (!pinTop && !pinBottom) {
      var dresses = pinDress ? [pinDress] : pools.dress;
      for (var k = 0; k < dresses.length; k++) out.push([dresses[k]]);
    }
    return out;
  }

  /* Достраивает базу до полного образа: обувь + опциональные дополнения. */
  function assemble(base, pools, conf, pinned, shoeIndex) {
    var set = base.slice();

    if (pinned.shoes) {
      set.push(pinned.shoes);
    } else if (pools.shoes.length) {
      var shoes = rank(set, pools.shoes, conf);
      var pick = shoes[Math.min(shoeIndex, shoes.length - 1)];
      if (pick) set.push(pick.item);
    }

    if (pinned.outer) {
      set.push(pinned.outer);
    } else if (pools.outer.length && conf.rnd() < outerChance(conf.season)) {
      var outer = pickTop(rank(set, pools.outer, conf), conf.rnd);
      if (outer) set.push(outer);
    }

    if (pinned.bag) {
      set.push(pinned.bag);
    } else if (pools.bag.length && conf.rnd() < 0.72) {
      var bag = pickTop(rank(set, pools.bag, conf), conf.rnd);
      if (bag) set.push(bag);
    }

    if (pinned.accessory) {
      set.push(pinned.accessory);
    } else if (pools.accessory.length && conf.rnd() < 0.4) {
      var acc = rank(set, pools.accessory, conf)[0];
      // аксессуар добавляем, только если он не портит образ
      if (acc && acc.score >= evaluate(set, conf).score - 2) set.push(acc.item);
    }

    return makeOutfit(set, conf);
  }

  /* Главная функция. opts: {season, occasion, includeWish, pinnedIds, limit, seed} */
  function generate(items, opts) {
    opts = opts || {};
    var occ = Tax.byId(Tax.OCCASIONS, opts.occasion || 'any') || Tax.OCCASIONS[0];
    var conf = {
      season: opts.season || null,
      styles: occ.styles || [],
      includeWish: opts.includeWish !== false,
      rnd: mulberry((opts.seed || 1) * 2654435761 % 2147483647)
    };

    var pinnedIds = opts.pinnedIds || [];
    var pinned = {};
    items.forEach(function (it) {
      if (pinnedIds.indexOf(it.id) >= 0 && !pinned[it.category]) pinned[it.category] = it;
    });

    var pools = buildPools(items, conf);
    // закреплённые вещи участвуют всегда, даже если не прошли фильтр
    Object.keys(pinned).forEach(function (cat) {
      if (pools[cat].indexOf(pinned[cat]) < 0) pools[cat].unshift(pinned[cat]);
    });

    var combos = baseCombos(pools, conf, pinned);
    var results = [], seen = {};

    // на одну базу — до двух вариантов обуви, это заметно расширяет выбор
    var variants = pools.shoes.length > 1 && !pinned.shoes ? 2 : 1;
    for (var v = 0; v < variants; v++) {
      for (var i = 0; i < combos.length; i++) {
        var outfit = assemble(combos[i], pools, conf, pinned, v);
        if (seen[outfit.id]) continue;
        seen[outfit.id] = true;
        outfit.base = combos[i].map(function (x) { return x.id; }).sort().join('+');
        results.push(outfit);
      }
    }

    results.sort(function (a, b) { return b.score - a.score; });
    return diversify(results, opts.limit || 20);
  }

  /* Не показываем десять почти одинаковых образов подряд. */
  function diversify(list, limit) {
    var picked = [], use = {}, baseUse = {};
    for (var i = 0; i < list.length && picked.length < limit; i++) {
      var o = list[i];
      if ((baseUse[o.base] || 0) >= 2) continue;             // не больше двух образов на одну связку верх+низ
      var busy = o.itemIds.some(function (id) { return (use[id] || 0) >= 3; });
      if (busy) continue;
      o.itemIds.forEach(function (id) { use[id] = (use[id] || 0) + 1; });
      baseUse[o.base] = (baseUse[o.base] || 0) + 1;
      picked.push(o);
    }
    // если вариантов мало — добираем чем есть
    if (picked.length < Math.min(limit, list.length)) {
      for (var j = 0; j < list.length && picked.length < limit; j++) {
        if (picked.indexOf(list[j]) < 0) picked.push(list[j]);
      }
      picked.sort(function (a, b) { return b.score - a.score; });
    }
    return picked;
  }

  /* Чего не хватает гардеробу, чтобы собрать образ. */
  function missing(items, includeWish) {
    var have = {};
    items.forEach(function (it) {
      if (!includeWish && it.status === 'wish') return;
      have[it.category] = (have[it.category] || 0) + 1;
    });
    var need = [];
    if (!have.dress && (!have.top || !have.bottom)) {
      if (!have.top) need.push('верх');
      if (!have.bottom) need.push('низ');
    }
    if (!have.shoes) need.push('обувь');
    return need;
  }

  return {
    generate: generate, evaluate: evaluate, makeOutfit: makeOutfit,
    missing: missing, SLOTS: SLOTS
  };
})();
