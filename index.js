(function (root, factory) {
  if (typeof define === 'function' && define.amd) define(factory);
  else if (typeof exports !== 'undefined') module.exports = factory();
  else root.Cache = factory();
})(this, function () {
  'use strict';

  var HAS_LS = true;
  var TEST_STRING = '__localStorageTest';

  try {
    localStorage.setItem(TEST_STRING, TEST_STRING);
    if (localStorage.getItem(TEST_STRING) !== TEST_STRING) HAS_LS = false;
    localStorage.removeItem(TEST_STRING);
  } catch (er) {
    HAS_LS = false;
  }

  // data = {v = value, t = creation time, u = last used time, d = duration}
  var Cache = function (options) {
    for (var key in options) this[key] = options[key];

    // Keep a copy of the cache in memory for faster lookups.
    var prefix = this.prefix;
    this.all = Object.keys(this.useLocalStorage ? localStorage : {})
      .reduce(function (all, key) {
        if (key.indexOf(prefix) !== 0) return all;
        all[key] = JSON.parse(localStorage.getItem(key));
        return all;
      }, {});
  };

  var proto = {

    // Prefix all storage with this.
    prefix: 'cache:',

    // Set a default duration of one day.
    defaultDuration: 60 * 60 * 24,

    // Only get/set to memory.
    useLocalStorage: HAS_LS,

    // Set a function that will wrap keys if necessary (think namespacing).
    wrapKey: function (key) { return key; },

    // Prefix + wrap a key.
    normalizeKey: function (key) { return this.prefix + this.wrapKey(key); },

    // Grab a stored value, taking a possible expiration time into account.
    get: function (key, duration) {
      var normalizedKey = this.normalizeKey(key);
      var data = this.all[normalizedKey];
      if (!data) return null;
      if (typeof duration === 'number') duration *= 1000;
      if (duration instanceof Date) duration = duration - Date.now();
      if (duration == null) duration = data.d || this.defaultDuration * 1000;
      if (Date.now() < data.t + duration) {
        this.tap(normalizedKey);
        return data.v;
      }
      this.removeNormalized(normalizedKey);
      return null;
    },

    // Set a value to a key, with an optional expiration date or time to expire.
    // Use a loop to continually attempt to store the value, clearing the oldest
    // value in the case of not enough space and trying again.
    set: function (key, val, duration) {
      if (duration == null) duration = this.defaultDuration;
      if (typeof duration === 'number') duration *= 1000;
      if (duration instanceof Date) duration = duration - Date.now();
      if (duration <= 0) return this.remove(key);
      var data = {v: val, t: Date.now(), d: duration, u: 0};
      return this.save(this.normalizeKey(key), data);
    },

    // Persist to localStorage.
    save: function (normalizedKey, data) {
      this.all[normalizedKey] = data;
      if (this.useLocalStorage) {
        var raw = JSON.stringify(data);
        while (true) {
          try {
            localStorage.setItem(normalizedKey, raw);
            break;
          } catch (er) { if (!this.clearLru()) throw er; }
        }
      }
      return this;
    },

    // Updated the used time of a key.
    tap: function (normalizedKey) {
      var data = this.all[normalizedKey];
      data.u = Date.now();
      return this.save(normalizedKey, data);
    },

    // Remove a key from storage.
    remove: function (key) {
      return this.removeNormalized(this.normalizeKey(key));
    },

    removeNormalized: function (normalizedKey) {
      delete this.all[normalizedKey];
      if (this.useLocalStorage) localStorage.removeItem(normalizedKey);
      return this;
    },

    // Purge all expired values from storage.
    purge: function () {
      for (var normalizedKey in this.all) {
        var data = this.all[normalizedKey];
        if (!data || !data.t || !data.d) return;
        if (Date.now() >= data.t + data.d) this.removeNormalized(normalizedKey);
      }
      return this;
    },

    // Clear all entries from storage.
    clear: function () {
      Object.keys(this.all).forEach(this.removeNormalized, this);
      return this;
    },

    // Clear the oldest key.
    clearLru: function () {
      var all = this.all;
      var lru;
      for (var nk in all) if (!lru || all[nk].u < all[lru].u) lru = nk;
      if (!lru) return false;
      this.removeNormalized(lru.nk);
      return lru;
    },

    // Don't let stale data linger around forever and eat up localStorage space.
    clean: function (duration) {
      if (!duration) duration = this.defaultDuration;
      if (this.get('__lastClean', duration)) return;
      return this.purge().set('__lastClean', true, duration);
    }
  };

  for (var key in proto) Cache.prototype[key] = proto[key];

  return Cache;
});
