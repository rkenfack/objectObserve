export default (function() {

  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
if (!Object.keys) {
  Object.keys = (function () {
    'use strict';
    var hasOwnProperty = Object.prototype.hasOwnProperty,
      hasDontEnumBug = !({
        toString: null
      }).propertyIsEnumerable('toString'),
      dontEnums = [
        'toString',
        'toLocaleString',
        'valueOf',
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'constructor'
      ],
      dontEnumsLength = dontEnums.length;

    return function (obj) {
      if (typeof obj !== 'object' && (typeof obj !== 'function' || obj === null)) {
        throw new TypeError('Object.keys called on non-object');
      }

      var result = [],
        prop, i;

      for (prop in obj) {
        if (hasOwnProperty.call(obj, prop)) {
          result.push(prop);
        }
      }

      if (hasDontEnumBug) {
        for (i = 0; i < dontEnumsLength; i++) {
          if (hasOwnProperty.call(obj, dontEnums[i])) {
            result.push(dontEnums[i]);
          }
        }
      }
      return result;
    };
  }());
}


if (!Object.changes) {

  Object.changes = function (oldObject, object) {

    var added = {};
    var removed = {};
    var changed = {};

    var internalPrefix = "$$__";
    var prop;

    for (prop in oldObject) {
      if (prop.indexOf(internalPrefix) === 0) {
        continue;
      }
      var newValue = object[prop];
      if (newValue !== undefined && newValue === oldObject[prop]) {
        continue;
      }
      if (!(prop in object)) {
        removed[prop] = undefined;
        continue;
      }
      if (newValue !== oldObject[prop]) {
        changed[prop] = newValue;
      }
    }

    for (prop in object) {
      if (prop.indexOf(internalPrefix) === 0) {
        continue;
      }
      if (prop in oldObject) {
        continue;
      }
      added[prop] = object[prop];
    }

    if (Array.isArray(object) && object.length !== oldObject.length) {
      changed.length = object.length;
    }

    return {
      added: added,
      removed: removed,
      changed: changed
    };
  };
}


})();