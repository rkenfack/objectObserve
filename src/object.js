/**

The MIT License (MIT)

Copyright (c) 2015 Romeo Kenfack Tsakem
Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
nd/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
ortions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
IMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

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
};


if (!Object.changes) {

  Object.changes = function (oldObject, object) {

    var added = {};
    var removed = {};
    var changed = {};

    var internalPrefix = "$$__";

    for (var prop in oldObject) {
      if (prop.indexOf(internalPrefix) == 0) {
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

    for (var prop in object) {
      if (prop.indexOf(internalPrefix) == 0) {
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
  }
}
