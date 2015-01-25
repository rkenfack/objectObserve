
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


(function () {

  /**
  * Normalizing observe-js behaviour to fit the spec of Object.observe
  * I have also added Object.watch/Object.unwatch for path observation
  *
  */

  /**
    ######################### Object.observe START ###################################
    Browser support : from IE9
    */
  if (!hasNativeObjectObserve) {

    if (!Object.observe) {


      Object.getNotifier = function(targetObject) {
        return {
          notify : function(notification) {
            var observers = targetObject.$$__observers || {};
            for(var observer in observers) {
              observers[observer].callback.call(observers[observer].scope, notification);
            }
          }
        };
      };


      var isRecordValid = function (type, acceptList) {
        return (acceptList.length == 0) || (acceptList.indexOf(type) != -1)
      };


      Object.observe = function (model, callback, acceptList) {

        var changes = [];
        var internalCallback = null;
        var observer = null;
        acceptList = acceptList || [];

        callback.$$__observerId = callback.$$__observerId || utils.getUID();
        model.$$__observers = model.$$__observers || {};

        if (Array.isArray(model)) {

          var modelLength = model.length;
          observer = new ArrayObserver(model);
          var arrayCopy = JSON.parse(JSON.stringify(model));

          internalCallback = function (splice) {

            splice = splice[0];

            if (model.length < modelLength) {

              if (isRecordValid("update", acceptList)) {
                for (var i = splice.index; i < model.length; i++) {
                  changes[i - splice.index] = {
                    name: "" + i,
                    object: model,
                    oldValue: arrayCopy[i],
                    type: "update"
                  };
                }
              }

              if (isRecordValid("delete", acceptList)) {
                var removedStart = model.length;
                splice.removed.forEach(function (removed, index) {
                  changes[changes.length] = {
                    name: "" + (removedStart + index),
                    object: model,
                    oldValue: arrayCopy[removedStart + index],
                    type: "delete"
                  }
                });
              }

            } else if (model.length > modelLength) {

              if (isRecordValid("add", acceptList)) {
                for (var i = 0; i < splice.addedCount; i++) {
                  changes[changes.length] = {
                    name: (splice.index + i),
                    object: model,
                    type: "add"
                  };
                }
              }

            } else {

              var changeStart = splice.index;
              var type = null;

              for (var i = 0; i < splice.addedCount; i++) {

                type = model[splice.index + i] === undefined ? "delete" : "update";

                if (isRecordValid(type, acceptList)) {
                  changes[changes.length] = {
                    name: (splice.index + i) + "",
                    object: model,
                    oldValue: arrayCopy[splice.index + i],
                    type: type
                  };
                }
              }

            }

            if (isRecordValid("update", acceptList)) {
              if (model.length != modelLength) {
                changes[changes.length] = {
                  name: "length",
                  object: model,
                  oldValue: arrayCopy.length,
                  type: "update"
                }
              }
            }

            callback.call(this, changes);
            executeHooks();
          }

        } else if (utils.isObject(model)) {

          changes = []
          observer = new ObjectObserver(model);

          internalCallback = function (added, removed, changed, getOldValueFn) {

            if (isRecordValid("add", acceptList)) {
              Object.keys(added).forEach(function (addedKey) {
                changes[changes.length] = {
                  name: addedKey,
                  object: model,
                  type: "add"
                }
              });
            }

            if (isRecordValid("update", acceptList)) {
              Object.keys(changed).forEach(function (changedKey) {
                changes[changes.length] = {
                  name: changedKey,
                  object: model,
                  oldValue: getOldValueFn(changedKey),
                  type: "update"
                }
              });
            }

            if (isRecordValid("delete", acceptList)) {
              Object.keys(removed).forEach(function (removedKey) {
                changes[changes.length] = {
                  name: removedKey,
                  object: model,
                  oldValue: getOldValueFn(removedKey),
                  type: "delete"
                }
              });
            }

            callback.call(this, changes);
            executeHooks();

          };

        }

        if (internalCallback && observer) {

          model.$$__observers[callback.$$__observerId] = {
            callback: internalCallback,
            scope : this,
            observer: observer
          };
          observer.open(internalCallback);
        } else {
          if (!utils.isDate(model)) {
            throw new Error("TypeError: Object.observe cannot observe non-object");
          }

        }
        return model;
      };


      Object.unobserve = function (model, callback) {
        var observerId = callback.$$__observerId;
        if (model.$$__observers && callback.$$__observerId && model.$$__observers[observerId]) {
          model.$$__observers[observerId].observer.close();
        }
        return model;
      };

    }

  }




  /**
  ######################### Object.observe END ###################################
  */

  Object.watch = function (obj, path, callback) {

    callback.$$__observerId = callback.$$__observerId || utils.getUID();
    obj.$$__observers = obj.$$__observers || {};

    internalCallback = function () {
      callback.apply(this, [path].slice.call(arguments));
      executeHooks();
    };

    var observer = new PathObserver(obj, path);
    obj.$$__observers[callback.$$__observerId] = {
      callback: internalCallback,
      observer: observer,
      path: path
    };

    observer.open(internalCallback);

    return obj;

  };


  Object.unwatch = function (obj, path, callback) {
    var observerId = callback.$$__observerId;
    if (obj.$$__observers && callback.$$__observerId) {
      var store = obj.$$__observers[observerId];
      if (store && path == store.path) {
        obj.$$__observers[observerId].observer.close();
      }
    }
    return obj;
  };


})();
