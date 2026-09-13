/* Справочники: категории, сезоны, стили, поводы. */
var Tax = (function () {

  var CATEGORIES = [
    { id: 'top',     name: 'Верх',            short: 'Верх',      icon: '👕', slot: 'top' },
    { id: 'bottom',  name: 'Низ',             short: 'Низ',       icon: '👖', slot: 'bottom' },
    { id: 'dress',   name: 'Платье / комбинезон', short: 'Платье', icon: '👗', slot: 'dress' },
    { id: 'outer',   name: 'Верхняя одежда',  short: 'Верхняя',   icon: '🧥', slot: 'outer' },
    { id: 'shoes',   name: 'Обувь',           short: 'Обувь',     icon: '👟', slot: 'shoes' },
    { id: 'bag',     name: 'Сумка',           short: 'Сумки',     icon: '👜', slot: 'bag' },
    { id: 'accessory', name: 'Аксессуар',     short: 'Аксессуары',icon: '💍', slot: 'accessory' }
  ];

  var SEASONS = [
    { id: 'winter', name: 'Зима', acc: 'зиму' },
    { id: 'spring', name: 'Весна', acc: 'весну' },
    { id: 'summer', name: 'Лето', acc: 'лето' },
    { id: 'autumn', name: 'Осень', acc: 'осень' }
  ];

  /* formality: 1 — спорт/дом, 5 — вечер. Нужна, чтобы не смешать
     кроссовки с вечерним платьем. */
  var STYLES = [
    { id: 'casual',   name: 'Повседневный', formality: 2 },
    { id: 'sport',    name: 'Спортивный',   formality: 1 },
    { id: 'smart',    name: 'Деловой',      formality: 4 },
    { id: 'evening',  name: 'Вечерний',     formality: 5 },
    { id: 'romantic', name: 'Романтичный',  formality: 3 },
    { id: 'street',   name: 'Уличный',      formality: 2 }
  ];

  var OCCASIONS = [
    { id: 'any',      name: 'Любой повод',  styles: [] },
    { id: 'daily',    name: 'Каждый день',  styles: ['casual', 'street', 'sport'] },
    { id: 'work',     name: 'Работа',       styles: ['smart', 'casual'] },
    { id: 'date',     name: 'Свидание',     styles: ['romantic', 'evening', 'casual'] },
    { id: 'party',    name: 'Вечер',        styles: ['evening', 'romantic'] },
    { id: 'walk',     name: 'Прогулка',     styles: ['casual', 'street', 'sport'] }
  ];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function catName(id) { var c = byId(CATEGORIES, id); return c ? c.short : id; }
  function styleName(id) { var s = byId(STYLES, id); return s ? s.name : id; }
  function seasonName(id) { var s = byId(SEASONS, id); return s ? s.name : id; }
  function seasonAcc(id) { var s = byId(SEASONS, id); return s ? s.acc : id; }

  function currentSeason() {
    var m = new Date().getMonth();
    if (m === 11 || m < 2) return 'winter';
    if (m < 5) return 'spring';
    if (m < 8) return 'summer';
    return 'autumn';
  }

  function formality(styles) {
    if (!styles || !styles.length) return 2.5;
    var sum = 0, n = 0;
    styles.forEach(function (id) {
      var s = byId(STYLES, id);
      if (s) { sum += s.formality; n++; }
    });
    return n ? sum / n : 2.5;
  }

  return {
    CATEGORIES: CATEGORIES, SEASONS: SEASONS, STYLES: STYLES, OCCASIONS: OCCASIONS,
    byId: byId, catName: catName, styleName: styleName, seasonName: seasonName, seasonAcc: seasonAcc,
    currentSeason: currentSeason, formality: formality
  };
})();
