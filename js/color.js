/* Работа с цветом: извлечение палитры из фото, названия оттенков,
   оценка сочетаемости по кругу Иттена. */
var Color = (function () {

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
    }).join('');
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2, d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }

  function hsl(hex) {
    var c = hexToRgb(hex);
    return rgbToHsl(c[0], c[1], c[2]);
  }

  /* Нейтральные оттенки (белый, чёрный, серый, бежевый, хаки, деним-серый)
     сочетаются практически со всем. */
  function isNeutral(hex) {
    var c = hsl(hex);
    if (c.s < 0.14) return true;              // серая шкала
    if (c.l > 0.88) return true;              // почти белый
    if (c.l < 0.13) return true;              // почти чёрный
    // бежевый / кремовый / песочный
    if (c.h >= 20 && c.h <= 55 && c.s < 0.42 && c.l > 0.6) return true;
    return false;
  }

  /* Земляные тона (коричневый, шоколад, терракота) — вторая «база». */
  function isEarth(hex) {
    var c = hsl(hex);
    // приглушённые тёплые тона; яркий алый (высокая насыщенность) сюда не попадает
    return c.h >= 0 && c.h <= 45 && c.l <= 0.6 && c.s >= 0.12 && c.s <= 0.58;
  }

  function isDenim(hex) {
    var c = hsl(hex);
    return c.h >= 195 && c.h <= 245 && c.l >= 0.18 && c.l <= 0.62;
  }

  var NAMES = [
    [10,  'красный'],   [30,  'терракотовый'], [42,  'оранжевый'],
    [56,  'горчичный'], [68,  'жёлтый'],       [85,  'салатовый'],
    [150, 'зелёный'],   [185, 'бирюзовый'],    [210, 'голубой'],
    [245, 'синий'],     [275, 'фиолетовый'],   [305, 'сиреневый'],
    [335, 'розовый'],   [360, 'красный']
  ];

  /* В тёмном варианте оттенок читается как базовый тон:
     тёмно-голубой человек назовёт тёмно-синим. */
  var DARK = {
    'голубой': 'синий', 'салатовый': 'зелёный', 'сиреневый': 'фиолетовый',
    'бирюзовый': 'зелёный', 'терракотовый': 'коричневый', 'горчичный': 'коричневый',
    'оранжевый': 'коричневый', 'жёлтый': 'горчичный', 'розовый': 'бордовый'
  };

  function name(hex) {
    var c = hsl(hex);
    if (c.l > 0.92) return 'белый';
    // очень тёмный, но с различимым тоном — это не чёрный, а глубокий оттенок
    if (c.l < 0.06 || (c.l < 0.13 && c.s < 0.2)) return 'чёрный';
    if (c.s < 0.1) return c.l > 0.62 ? 'светло-серый' : 'серый';
    if (c.h >= 18 && c.h <= 58) {
      if (c.l > 0.82 && c.s < 0.62) return 'кремовый';
      if (c.l > 0.6 && c.s < 0.45) return 'бежевый';
    }
    if (isEarth(hex)) return c.l < 0.32 ? 'шоколадный' : 'коричневый';
    if (isDenim(hex) && c.s < 0.5) return 'джинсовый';
    var base = 'цветной';
    for (var i = 0; i < NAMES.length; i++) {
      if (c.h <= NAMES[i][0]) { base = NAMES[i][1]; break; }
    }
    if (c.l > 0.74) return 'светло-' + base;
    if (c.l < 0.3) return 'тёмно-' + (DARK[base] || base);
    return base;
  }

  /* Разница оттенков по кругу, 0..180 */
  function hueDiff(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  /* Оценка сочетаемости двух цветов: -1 (спорно) … 1 (отлично) */
  function pairScore(h1, h2) {
    var n1 = isNeutral(h1), n2 = isNeutral(h2);
    var a = hsl(h1), b = hsl(h2);

    if (n1 && n2) {
      // две нейтрали: чем больше разница в светлоте, тем выразительнее
      var dl = Math.abs(a.l - b.l);
      return dl > 0.28 ? 0.95 : 0.7;
    }
    if (n1 || n2) return 0.85;                    // нейтраль + цвет — всегда безопасно

    // земляная гамма дружит сама с собой
    if (isEarth(h1) && isEarth(h2)) return 0.9;
    // джинса — условная нейтраль
    if (isDenim(h1) || isDenim(h2)) return 0.75;

    var d = hueDiff(a.h, b.h);
    if (d < 18)  return Math.abs(a.l - b.l) > 0.2 ? 0.9 : 0.72; // монохром
    if (d < 45)  return 0.8;                                     // родственные
    if (d < 80)  return 0.25;                                    // рискованно
    if (d < 120) return 0.45;                                    // триада
    if (d < 150) return 0.3;
    return 0.7;                                                  // контрастная пара
  }

  /* Два оттенка визуально «один и тот же цвет»? */
  function near(a, b) {
    if (a.s < 0.12 && b.s < 0.12) return Math.abs(a.l - b.l) < 0.13;   // серая шкала
    return hueDiff(a.h, b.h) < 22 && Math.abs(a.l - b.l) < 0.16 && Math.abs(a.s - b.s) < 0.28;
  }

  /* Доминирующие цвета вещи на фото.
     Скриншот маркетплейса — это интерфейс, фон и сама вещь. Считаем, что
     вещь пользователь оставил в середине кадра: главный вес у центра,
     цвета, живущие в основном по краям, отбрасываются как фон,
     а мелкие яркие пятна (плашки «РАСПРОДАЖА») отсекаются по площади. */
  function palette(img, count) {
    count = count || 5;
    var S = 56;
    var cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, S, S);
    var data;
    try { data = ctx.getImageData(0, 0, S, S).data; }
    catch (e) { return ['#b9ada2']; }

    var buckets = {};
    var totalAll = 0, totalMid = 0, totalRing = 0;

    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var px = i / 4, x = px % S, y = Math.floor(px / S);
      var nx = (x + 0.5) / S - 0.5, ny = (y + 0.5) / S - 0.5;
      var key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
      var bk = buckets[key] || (buckets[key] = { r: 0, g: 0, b: 0, all: 0, mid: 0, ring: 0 });

      bk.r += r; bk.g += g; bk.b += b; bk.all++; totalAll++;
      if (Math.abs(nx) < 0.26 && Math.abs(ny) < 0.3) { bk.mid++; totalMid++; }
      else if (Math.abs(nx) > 0.38 || Math.abs(ny) > 0.4) { bk.ring++; totalRing++; }
    }
    if (!totalAll) return ['#b9ada2'];

    var list = Object.keys(buckets).map(function (key) {
      var bk = buckets[key];
      var hex = rgbToHex(bk.r / bk.all, bk.g / bk.all, bk.b / bk.all);
      return { hex: hex, c: hsl(hex), all: bk.all, mid: bk.mid, ring: bk.ring };
    });

    // Складки и тени дробят один цвет на десяток оттенков — собираем обратно,
    // иначе однотонная вещь проигрывает пёстрому фону.
    list.sort(function (a, b) { return b.all - a.all; });
    var clusters = [];
    list.forEach(function (o) {
      for (var k = 0; k < clusters.length; k++) {
        var cl = clusters[k];
        // сравниваем с исходным (самым массивным) оттенком кластера:
        // иначе кластер «поплывёт» и склеит полкартинки в один цвет
        if (near(cl.seed, o.c)) {
          var t = cl.all + o.all;
          var rgbA = hexToRgb(cl.hex), rgbB = hexToRgb(o.hex);
          cl.hex = rgbToHex(
            (rgbA[0] * cl.all + rgbB[0] * o.all) / t,
            (rgbA[1] * cl.all + rgbB[1] * o.all) / t,
            (rgbA[2] * cl.all + rgbB[2] * o.all) / t
          );
          cl.c = hsl(cl.hex);
          cl.all = t; cl.mid += o.mid; cl.ring += o.ring;
          return;
        }
      }
      clusters.push({ hex: o.hex, c: o.c, seed: o.c, all: o.all, mid: o.mid, ring: o.ring });
    });

    clusters.forEach(function (cl) {
      var midShare = totalMid ? cl.mid / totalMid : 0;
      var allShare = cl.all / totalAll;
      var ringShare = totalRing ? cl.ring / totalRing : 0;

      var w = 0.75 * midShare + 0.25 * allShare;
      // держится по краям, а в центре его нет — это фон, а не вещь
      if (ringShare > 0.1 && ringShare > midShare * 1.2) w *= 0.2;
      // студийная подложка и глухая тень редко бывают самой вещью
      if (cl.c.l > 0.9 && cl.c.s < 0.09) w *= 0.7;
      if (cl.c.l < 0.06) w *= 0.85;
      // ткань обычно насыщеннее, чем интерфейс и асфальт вокруг
      w *= 0.6 + 0.7 * cl.c.s;
      // цветные плашки и мелкие детали не должны становиться цветом вещи
      if (allShare < 0.02) w *= 0.15;

      cl.weight = w;
    });

    clusters.sort(function (a, b) { return b.weight - a.weight; });
    return clusters.slice(0, count).map(function (o) { return o.hex; });
  }

  return {
    hexToRgb: hexToRgb, rgbToHex: rgbToHex, hsl: hsl,
    isNeutral: isNeutral, isEarth: isEarth, isDenim: isDenim,
    name: name, hueDiff: hueDiff, pairScore: pairScore, palette: palette
  };
})();
