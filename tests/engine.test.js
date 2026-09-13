/* Проверка логики без браузера: цвета и сборка образов.
   Запуск:  node tests/engine.test.js   */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

const ctx = {
  // Color.palette работает с canvas; в тестах он не нужен — подменяем заглушкой
  document: { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) },
  console, Math, Date, Object, Array, Number, String, JSON
};
vm.createContext(ctx);
['js/color.js', 'js/taxonomy.js', 'js/outfits.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, f));
const { Color, Tax, Outfits } = ctx;

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failed++; };

/* ---------- цвета ---------- */
console.log('\nНазвания цветов');
[
  ['#f7f7f7', 'белый'], ['#111111', 'чёрный'], ['#f2e8db', 'кремовый'],
  ['#714536', 'коричневый'], ['#271917', 'шоколадный'], ['#c0392b', 'красный'],
  ['#b5651d', 'терракотовый'], ['#0e1c2f', 'тёмно-синий'], ['#2d4154', 'джинсовый'],
  ['#4a7a3a', 'зелёный'], ['#c9a227', 'горчичный']
].forEach(([hex, want]) => ok(Color.name(hex) === want, hex + ' → ' + Color.name(hex)));

console.log('\nСочетаемость');
ok(Color.isNeutral('#ffffff') && Color.isNeutral('#101010') && Color.isNeutral('#e8e2d8'),
  'белый, чёрный и бежевый — нейтральные');
ok(!Color.isNeutral('#c0392b'), 'красный не нейтральный');
ok(Color.pairScore('#ffffff', '#714536') > 0.7, 'белый + коричневый — хорошая пара');
ok(Color.pairScore('#714536', '#8b5e3c') > 0.7, 'два земляных тона дружат');
ok(Color.pairScore('#c2461f', '#5ac21f') < 0.5, 'оранжевый + кислотно-зелёный — спорно');
ok(Color.pairScore('#ffffff', '#000000') > Color.pairScore('#c2461f', '#5ac21f'),
  'контраст нейтралей лучше цветового клеша');

/* ---------- гардероб для проверки сборки ---------- */
let n = 0;
const item = (o) => Object.assign({
  id: 'i' + (++n), name: 'вещь', colors: ['#cccccc'], seasons: [], styles: [],
  status: 'own', price: 0, createdAt: Date.now()
}, o);

const wardrobe = [
  item({ name: 'белые джинсы', category: 'bottom', colors: ['#f2efe9'], seasons: ['spring', 'summer'], styles: ['casual'], price: 3445, status: 'wish' }),
  item({ name: 'синие джинсы', category: 'bottom', colors: ['#2d4154'], seasons: ['autumn', 'spring'], styles: ['casual', 'smart'], price: 5014 }),
  item({ name: 'коричневые брюки', category: 'bottom', colors: ['#714536'], seasons: ['autumn', 'winter'], styles: ['smart'], price: 3319 }),
  item({ name: 'серая футболка', category: 'top', colors: ['#4d4d4d'], seasons: ['spring', 'summer', 'autumn'], styles: ['casual'], price: 900 }),
  item({ name: 'молочный свитер', category: 'top', colors: ['#f2e8db'], seasons: ['autumn', 'winter'], styles: ['casual', 'romantic'], price: 2600 }),
  item({ name: 'кружевное боди', category: 'top', colors: ['#171717'], seasons: ['autumn', 'spring'], styles: ['evening', 'romantic'], price: 1900 }),
  item({ name: 'лоферы', category: 'shoes', colors: ['#271917'], seasons: ['spring', 'autumn'], styles: ['smart', 'casual'], price: 2735, status: 'wish' }),
  item({ name: 'кроссовки', category: 'shoes', colors: ['#7d4a2b'], seasons: ['spring', 'autumn'], styles: ['street', 'sport'], price: 1850 }),
  item({ name: 'ботильоны', category: 'shoes', colors: ['#111111'], seasons: ['autumn', 'winter'], styles: ['evening', 'smart'], price: 4200 }),
  item({ name: 'коричневая сумка', category: 'bag', colors: ['#5b3722'], styles: ['casual', 'smart'], price: 3100 }),
  item({ name: 'кожаная куртка', category: 'outer', colors: ['#4a2f22'], seasons: ['autumn', 'spring'], styles: ['street'], price: 8900 })
];

const gen = (opts) => Outfits.generate(wardrobe, Object.assign({ limit: 12 }, opts));

console.log('\nСборка образов');
const any = gen({ occasion: 'any', seed: 7 });
ok(any.length > 0, 'образы собираются: ' + any.length);
ok(any.every(o => {
  const cats = o.items.map(i => i.category);
  return cats.includes('dress') || (cats.includes('top') && cats.includes('bottom'));
}), 'в каждом образе есть база: верх с низом или платье');
ok(any.every(o => new Set(o.items.map(i => i.category)).size === o.items.length),
  'из категории берётся только одна вещь');
ok(any.every(o => o.score >= 0 && o.score <= 100), 'оценка в границах 0…100');
ok(new Set(any.map(o => o.id)).size === any.length, 'дублей нет');
ok(any.every(o => o.price === o.items.reduce((s, i) => s + i.price, 0)), 'цена образа считается верно');
ok(any[0].score >= any[any.length - 1].score, 'список отсортирован по оценке');

const autumn = gen({ season: 'autumn', seed: 3 });
ok(autumn.every(o => o.items.every(i => !i.seasons.length || i.seasons.includes('autumn'))),
  'сезонный фильтр соблюдается');

const summer = gen({ season: 'summer', seed: 3 });
ok(summer.every(o => !o.items.some(i => i.category === 'outer')),
  'летом верхнюю одежду не предлагаем');

const owned = gen({ includeWish: false, seed: 5 });
ok(owned.length > 0 && owned.every(o => o.items.every(i => i.status !== 'wish')),
  'режим «только то, что уже есть» работает');

const pinned = gen({ pinnedIds: ['i1'], seed: 2 });
ok(pinned.length > 0 && pinned.every(o => o.itemIds.includes('i1')),
  'закреплённая вещь входит в каждый образ');

const evening = gen({ occasion: 'party', seed: 11 });
ok(evening.some(o => o.items.some(i => i.styles.includes('evening'))),
  'для вечера подбираются вечерние вещи');

const sameSeed = gen({ occasion: 'any', seed: 7 });
ok(JSON.stringify(sameSeed.map(o => o.id)) === JSON.stringify(any.map(o => o.id)),
  'один и тот же seed даёт тот же результат');
ok(JSON.stringify(gen({ occasion: 'any', seed: 42 }).map(o => o.id)) !== JSON.stringify(any.map(o => o.id)),
  'кнопка «обновить» даёт другую подборку');

console.log('\nОценка и подсказки');
const good = Outfits.evaluate([
  { category: 'top', colors: ['#f2e8db'], seasons: ['autumn'], styles: ['casual'] },
  { category: 'bottom', colors: ['#714536'], seasons: ['autumn'], styles: ['casual'] },
  { category: 'shoes', colors: ['#271917'], seasons: ['autumn'], styles: ['casual'] }
], { season: 'autumn', styles: ['casual'] });
const bad = Outfits.evaluate([
  { category: 'top', colors: ['#c2461f'], seasons: ['summer'], styles: ['sport'] },
  { category: 'bottom', colors: ['#5ac21f'], seasons: ['winter'], styles: ['evening'] },
  { category: 'shoes', colors: ['#1f6ac2'], seasons: ['winter'], styles: ['sport'] }
], { season: 'autumn', styles: ['smart'] });
ok(good.score > bad.score + 20, 'удачный образ заметно обгоняет неудачный (' + good.score + ' против ' + bad.score + ')');
ok(good.reasons.length > 0, 'к образу есть пояснения: ' + good.reasons.join(' · '));

ok(Outfits.missing([wardrobe[3]], true).includes('обувь'), 'подсказывает, что не хватает обуви');
ok(Outfits.missing(wardrobe, true).length === 0, 'полному гардеробу ничего не нужно');

console.log('\nСправочники');
ok(Tax.seasonAcc('spring') === 'весну', 'сезон в винительном падеже');
ok(Tax.formality(['sport']) < Tax.formality(['evening']), 'спорт менее формален, чем вечер');
ok(['winter', 'spring', 'summer', 'autumn'].includes(Tax.currentSeason()), 'текущий сезон определяется');

console.log(failed ? '\nПРОВАЛЕНО проверок: ' + failed + '\n' : '\nВсе проверки пройдены\n');
process.exit(failed ? 1 : 0);
