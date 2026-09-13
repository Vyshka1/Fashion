/* Локальное хранилище: IndexedDB, с откатом на localStorage.
   Ничего не уходит в сеть — все вещи и фото лежат на устройстве. */
var Store = (function () {

  var DB_NAME = 'fashion-closet', DB_VER = 1, db = null, useLS = false;
  var LS_KEY = 'fashion-closet-fallback';

  function openDB() {
    return new Promise(function (resolve) {
      if (db) return resolve(db);
      if (!window.indexedDB) { useLS = true; return resolve(null); }
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); }
      catch (e) { useLS = true; return resolve(null); }

      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('outfits')) d.createObjectStore('outfits', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { useLS = true; resolve(null); };
      // Safari в приватном режиме может «зависнуть» на open
      setTimeout(function () { if (!db) { useLS = true; resolve(null); } }, 2500);
    });
  }

  function lsRead() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || { items: [], outfits: [], meta: {} }; }
    catch (e) { return { items: [], outfits: [], meta: {} }; }
  }
  function lsWrite(data) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); return true; }
    catch (e) { return false; }
  }

  function tx(storeName, mode, fn) {
    return openDB().then(function (d) {
      if (!d) return fn(null);
      return new Promise(function (resolve, reject) {
        var t = d.transaction(storeName, mode);
        var req = fn(t.objectStore(storeName));
        t.oncomplete = function () { resolve(req && req.result); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function all(storeName) {
    if (useLS) return Promise.resolve(lsRead()[storeName] || []);
    return tx(storeName, 'readonly', function (os) {
      return os ? os.getAll() : null;
    }).then(function (r) {
      if (r) return r;
      useLS = true;
      return lsRead()[storeName] || [];
    });
  }

  function put(storeName, obj) {
    if (useLS) {
      var data = lsRead(), list = data[storeName] || (data[storeName] = []);
      var i = list.findIndex(function (x) { return x.id === obj.id; });
      if (i >= 0) list[i] = obj; else list.push(obj);
      if (!lsWrite(data)) return Promise.reject(new Error('Хранилище переполнено'));
      return Promise.resolve(obj);
    }
    return tx(storeName, 'readwrite', function (os) { return os.put(obj); })
      .then(function () { return obj; });
  }

  function remove(storeName, id) {
    if (useLS) {
      var data = lsRead();
      data[storeName] = (data[storeName] || []).filter(function (x) { return x.id !== id; });
      lsWrite(data);
      return Promise.resolve();
    }
    return tx(storeName, 'readwrite', function (os) { return os.delete(id); });
  }

  function clearAll() {
    if (useLS) { lsWrite({ items: [], outfits: [], meta: {} }); return Promise.resolve(); }
    return Promise.all(['items', 'outfits'].map(function (s) {
      return tx(s, 'readwrite', function (os) { return os.clear(); });
    }));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* Оценка занятого места — чтобы вовремя предложить экспорт. */
  function usage() {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (e) {
        return { used: e.usage || 0, quota: e.quota || 0 };
      }).catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  return {
    items: {
      all: function () { return all('items'); },
      put: function (o) { return put('items', o); },
      remove: function (id) { return remove('items', id); }
    },
    outfits: {
      all: function () { return all('outfits'); },
      put: function (o) { return put('outfits', o); },
      remove: function (id) { return remove('outfits', id); }
    },
    clearAll: clearAll, uid: uid, usage: usage,
    isFallback: function () { return useLS; }
  };
})();
