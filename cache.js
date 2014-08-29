(function (root, factory) {
  if (typeof define === 'function' && define.amd) define(factory);
  else if (typeof exports !== 'undefined') module.exports = factory();
  else root.Cache = factory();
})(this, function () {
  'use strict';

  var localStorage = typeof window === 'undefined' ? null : window.localStorage;

  // data = {v = value, t = creation time, u = last used time, d = duration}
  var Cache = function (options) {
    for (var key in options) this[key] = options[key];

    // Keep a copy of the cache in memory for faster lookups.
    var prefix = this.prefix;
    this.all = Object.keys(localStorage || {}).reduce(function (all, key) {
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

    // Set a function that will wrap keys if necessary (think namespacing).
    wrapKey: function (key) { return key; },

    // Prefix + wrap a key.
    normalizeKey: function (key) { return this.prefix + this.wrapKey(key); },

    // Grab a stored value, taking a possible expiration time into account.
    get: function (key, duration) {
      key = this.normalizeKey(key);
      var data = this.all[key];
      if (!data) return null;
      if (typeof duration === 'number') duration *= 1000;
      if (duration instanceof Date) duration = duration - Date.now();
      if (duration == null) duration = data.d || this.defaultDuration * 1000;
      if (Date.now() < data.t + duration) {
        this.tap(key);
        return data.v;
      }
      this.removeNormalized(key);
      return null;
    },

    // Set a value to a key, with an optional expiration date or time to expire.
    // Use a loop to continually attempt to store the value, clearing the oldest
    // value in the case of not enough space and trying again.
    set: function (key, val, duration) {
      if (duration == null) duration = this.defaultDuration;
      if (typeof duration === 'number') duration *= 1000;
      if (duration instanceof Date) duration = duration - Date.now();
      if (duration === 0) return;
      var data = {v: val, t: Date.now(), d: duration, u: 0};
      return this.save(this.normalizeKey(key), data);
    },

    // Persist to localStorage.
    save: function (key, data) {
      this.all[key] = data;
      if (localStorage) {
        try { localStorage.setItem(key, JSON.stringify(data)); }
        catch (er) {
          if (!this.clearLru()) throw er;
          this.save(key, data);
        }
      }
      return this;
    },

    // Updated the used time of a key.
    tap: function (key) {
      var data = this.all[key];
      data.u = Date.now();
      return this.save(key, data);
    },

    // Remove a key from storage.
    remove: function (key) {
      return this.removeNormalized(this.prefix + this.wrapKey(key));
    },

    removeNormalized: function (key) {
      delete this.all[key];
      if (localStorage) localStorage.removeItem(key);
      return this;
    },

    // Purge all expired values from storage.
    purge: function () {
      for (var key in this.all) {
        var data = this.all[key];
        if (!data || !data.t || !data.d) return;
        if (Date.now() >= data.t + data.d) this.removeNormalized(key);
      }
      return this;
    },

    // Clear all entries from storage.
    clear: function () {
      Object.keys(this.all).forEach(this.removeNormalized);
    },

    // Clear the oldest key.
    clearLru: function () {
      var all = this.all;
      var lru;
      for (var key in all) if (!lru || all[key].u < all[lru].u) lru = key;
      if (!lru) return false;
      this.removeNormalized(lru.key);
      return lru;
    },

    // Don't let stale data linger around forever and eat up localStorage space.
    clean: function (duration) {
      if (!duration) duration = this.defaultDuration;
      if (this.get('purged', duration)) return;
      this.purge().set('purged', true, duration);
    }
  };

  for (var key in proto) Cache.prototype[key] = proto[key];

  return Cache;
});
