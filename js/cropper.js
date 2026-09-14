/* Кадрирование скриншотов: из полного экрана маркетплейса
   оставляем только вещь. Работает пальцем и мышью. */
var Cropper = (function () {

  var wrap, stage, imgEl, box, counter, ratioBtns;
  var queue = [], results = [], idx = 0, onFinish = null, onCancel = null;
  var ratio = 0.8;                 // 4:5 по умолчанию
  var drag = null;
  var MAX_SIDE = 1100, THUMB = 320;

  function init() {
    wrap = document.getElementById('cropper');
    stage = document.getElementById('crop-stage');
    imgEl = document.getElementById('crop-img');
    box = document.getElementById('crop-box');
    counter = document.getElementById('crop-counter');
    ratioBtns = wrap.querySelectorAll('[data-ratio]');

    document.getElementById('crop-cancel').addEventListener('click', cancel);
    document.getElementById('crop-done').addEventListener('click', next);

    ratioBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        ratioBtns.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        ratio = parseFloat(b.dataset.ratio);
        resetBox();
      });
    });

    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', function () { if (!wrap.hidden) clampBox(); });
  }

  function imgRect() {
    var r = imgEl.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  }

  function resetBox() {
    var r = imgRect();
    if (!r.w) return;
    var w, h;
    if (ratio) {
      w = r.w * 0.86;
      h = w / ratio;
      if (h > r.h * 0.9) { h = r.h * 0.9; w = h * ratio; }
    } else {
      w = r.w * 0.86; h = r.h * 0.7;
    }
    setBox(r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
  }

  function setBox(x, y, w, h) {
    box.style.left = x + 'px'; box.style.top = y + 'px';
    box.style.width = w + 'px'; box.style.height = h + 'px';
  }

  function getBox() {
    return {
      x: parseFloat(box.style.left) || 0, y: parseFloat(box.style.top) || 0,
      w: parseFloat(box.style.width) || 0, h: parseFloat(box.style.height) || 0
    };
  }

  function clampBox() {
    var r = imgRect(), b = getBox();
    if (!r.w) return;
    b.w = Math.min(b.w, r.w); b.h = Math.min(b.h, r.h);
    b.x = Math.max(r.x, Math.min(b.x, r.x + r.w - b.w));
    b.y = Math.max(r.y, Math.min(b.y, r.y + r.h - b.h));
    setBox(b.x, b.y, b.w, b.h);
  }

  function point(e) {
    var s = stage.getBoundingClientRect();
    return { x: e.clientX - s.left, y: e.clientY - s.top };
  }

  function onDown(e) {
    var handle = e.target.closest ? e.target.closest('[data-h]') : null;
    var inBox = e.target === box || (e.target.parentNode === box);
    if (!handle && !inBox) return;
    e.preventDefault();
    drag = { handle: handle ? handle.dataset.h : null, start: point(e), box: getBox() };
  }

  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    var p = point(e), dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    var r = imgRect(), b = drag.box, MIN = 60;

    if (!drag.handle) {
      setBox(
        Math.max(r.x, Math.min(b.x + dx, r.x + r.w - b.w)),
        Math.max(r.y, Math.min(b.y + dy, r.y + r.h - b.h)),
        b.w, b.h
      );
      return;
    }

    var x = b.x, y = b.y, w = b.w, h = b.h;
    var east = drag.handle.indexOf('e') >= 0, south = drag.handle.indexOf('s') >= 0;

    if (east) w = b.w + dx; else { w = b.w - dx; x = b.x + dx; }
    if (south) h = b.h + dy; else { h = b.h - dy; y = b.y + dy; }

    if (ratio) {
      // сохраняем пропорции: ведущей считаем большую дельту
      if (Math.abs(dx) > Math.abs(dy)) h = w / ratio; else w = h * ratio;
      if (!east) x = b.x + b.w - w;
      if (!south) y = b.y + b.h - h;
    }

    if (w < MIN) { w = MIN; if (!east) x = b.x + b.w - MIN; }
    if (h < MIN) { h = MIN; if (!south) y = b.y + b.h - MIN; }

    // не выходим за пределы фото
    if (x < r.x) { w -= (r.x - x); x = r.x; if (ratio) h = w / ratio; }
    if (y < r.y) { h -= (r.y - y); y = r.y; if (ratio) w = h * ratio; }
    if (x + w > r.x + r.w) { w = r.x + r.w - x; if (ratio) h = w / ratio; }
    if (y + h > r.y + r.h) { h = r.y + r.h - y; if (ratio) w = h * ratio; }

    setBox(x, y, w, h);
  }

  function onUp() { drag = null; }

  function render(canvas, w, h, quality) {
    return canvas.toDataURL('image/jpeg', quality);
  }

  function crop() {
    var r = imgRect(), b = getBox();
    var scale = imgEl.naturalWidth / r.w;
    var sx = Math.max(0, (b.x - r.x) * scale);
    var sy = Math.max(0, (b.y - r.y) * scale);
    var sw = Math.min(imgEl.naturalWidth - sx, b.w * scale);
    var sh = Math.min(imgEl.naturalHeight - sy, b.h * scale);

    function draw(maxSide, quality) {
      var k = Math.min(1, maxSide / Math.max(sw, sh));
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(sw * k));
      cv.height = Math.max(1, Math.round(sh * k));
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      return { url: cv.toDataURL('image/jpeg', quality), canvas: cv };
    }

    var full = draw(MAX_SIDE, 0.84);
    var thumb = draw(THUMB, 0.72);
    return { image: full.url, thumb: thumb.url };
  }

  function showCurrent() {
    counter.textContent = queue.length > 1 ? (idx + 1) + ' из ' + queue.length : '';
    var url = URL.createObjectURL(queue[idx]);
    imgEl.onload = function () {
      URL.revokeObjectURL(url);
      requestAnimationFrame(resetBox);
    };
    imgEl.src = url;
  }

  function next() {
    if (!imgEl.naturalWidth) return;
    results.push(crop());
    idx++;
    if (idx < queue.length) showCurrent();
    else finish();
  }

  function finish() {
    wrap.hidden = true;
    imgEl.src = '';
    var out = results;
    results = []; queue = []; idx = 0;
    if (onFinish) onFinish(out);
  }

  function cancel() {
    wrap.hidden = true;
    imgEl.src = '';
    results = []; queue = []; idx = 0;
    if (onCancel) onCancel();
  }

  /* files — FileList/массив; done(list of {image, thumb}) */
  function open(files, done, aborted) {
    queue = Array.prototype.slice.call(files).filter(function (f) {
      return /^image\//.test(f.type);
    });
    if (!queue.length) return;
    results = []; idx = 0; onFinish = done; onCancel = aborted || null;
    wrap.hidden = false;
    showCurrent();
  }

  return { init: init, open: open };
})();
