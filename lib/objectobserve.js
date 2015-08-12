/**
 * Normalizing observe-js behaviour to fit the spec of Object.observe
 *
 * @author Romeo Kenfack Tsakem <tsakem@yahoo.fr>
 *
 * Browser support : from IE9
 */
import observejs from "lib/observe-js";
import dirtycheck from "lib/dirtycheck/dirtycheck";
import animationFrame from "lib/dirtycheck/animationFrame";
import eventListener from "lib/dirtycheck/eventListener";
import xhr from "lib/dirtycheck/xhr";
import timers from "lib/dirtycheck/timers";
import objectPolyfills from "lib/polyfill/object";
import utils from "lib/utils";

export default (function () {

  if (!Observer.hasObjectObserve) {

    if (!Object.observe) {


      Object.getNotifier = function (targetObject) {

        return {

          notify : function (notification) {
            var observers = targetObject.$$__observers || {};
            for (var observer in observers) {
              observers[observer].callback.call(observers[observer].scope, notification);
            }
          },

          performChange : function(type, performFooChangeFn) {
            var notification = performFooChangeFn.call(this);
            if(typeof notification != "undefined") {
              notification.type = type;
              this.notify(notification);
            }
          }

        };

      };


      var isRecordValid = function (type, acceptList) {
        return (acceptList.length === 0) || (acceptList.indexOf(type) != -1);
      };

      Object.observe = function (model, callback, acceptList) {

        acceptList = acceptList || [];

        if (!model.$$__observers) {

          var internalCallback = null;
          var type = null;

          if (Array.isArray(model)) {

            model.$$__observers = {
              observer: new ArrayObserver(model),
              listeners: [],
              arrayCopy: JSON.parse(JSON.stringify(model)),
              arrayLength: model.length
            };

            var i;
            internalCallback = function (splice) {

              var acceptList;
              var changes = [];

              model.$$__observers.listeners.forEach(function (listener) {

                changes = [];
                acceptList = listener.acceptList;

                splice.forEach(function (spl) {

                  if (model.length < model.$$__observers.arrayLength) {

                    if (isRecordValid("update", acceptList)) {
                      for (i = spl.index; i < model.length; i++) {
                        changes[i - spl.index] = {
                          name: "" + i,
                          object: model,
                          oldValue: model.$$__observers.arrayCopy[i],
                          type: "update"
                        };
                      }
                    }

                    if (isRecordValid("delete", acceptList)) {
                      var removedStart = model.length;
                      spl.removed.forEach(function (removed, index) {
                        changes[changes.length] = {
                          name: "" + (removedStart + index),
                          object: model,
                          oldValue: model.$$__observers.arrayCopy[removedStart + index],
                          type: "delete"
                        };
                      });
                    }

                  } else if (model.length > model.$$__observers.arrayLength) {

                    if (isRecordValid("add", acceptList)) {
                      var offset = model.length - model.$$__observers.arrayLength;
                      for (i = model.$$__observers.arrayLength - 1; i <= model.length; i++) {
                        if (model[i] !== undefined) {
                          changes[changes.length] = {
                            name: i + "",
                            object: model,
                            type: "add"
                          };
                        }
                      }
                    }

                  } else {

                    var changeStart = splice.index;
                    var type = null;
                    for (i = 0; i < spl.addedCount; i++) {
                      type = model[spl.index + i] === undefined ? "delete" : "update";
                      if (isRecordValid(type, acceptList)) {
                        changes[changes.length] = {
                          name: (spl.index + i) + "",
                          object: model,
                          oldValue: model.$$__observers.arrayCopy[spl.index + i],
                          type: type
                        };
                      }
                    }
                  }

                });

                if (isRecordValid("update", acceptList)) {
                  if (model.length != model.$$__observers.arrayLength) {
                    changes[changes.length] = {
                      name: "length",
                      object: model,
                      oldValue: model.$$__observers.arrayCopy.length,
                      type: "update"
                    };
                  }
                }

                listener.listener.call(this, changes);

              });


              dirtycheck.executeHooks();

              if (model.$$__observers) {
                model.$$__observers.arrayLength = model.length;
                model.$$__observers.arrayCopy = JSON.parse(JSON.stringify(model));
              }

            };

          } else if (utils.isObject(model)) {

            model.$$__observers = {
              observer: new ObjectObserver(model),
              listeners: []
            };

            internalCallback = function (added, removed, changed, getOldValueFn) {

              var acceptList;
              var changes = [];

              model.$$__observers.listeners.forEach(function (listener) {

                acceptList = listener.acceptList;
                changes = [];

                if (isRecordValid("add", acceptList)) {
                  Object.keys(added).forEach(function (addedKey) {
                    changes[changes.length] = {
                      name: addedKey,
                      object: model,
                      type: "add"
                    };
                  });
                }

                if (isRecordValid("update", acceptList)) {
                  Object.keys(changed).forEach(function (changedKey) {
                    changes[changes.length] = {
                      name: changedKey,
                      object: model,
                      oldValue: getOldValueFn(changedKey),
                      type: "update"
                    };
                  });
                }

                if (isRecordValid("delete", acceptList)) {
                  Object.keys(removed).forEach(function (removedKey) {
                    changes[changes.length] = {
                      name: removedKey,
                      object: model,
                      oldValue: getOldValueFn(removedKey),
                      type: "delete"
                    };
                  });
                }

                listener.listener.call(this, changes);
                dirtycheck.executeHooks();
              });

            };


          } else {

            if (!utils.isDate(model)) {
              throw new Error("TypeError: Object.observe cannot observe non-object");
            }
          }

          if (internalCallback) {
            model.$$__observers.observer.open(internalCallback);
          }

        }

        model.$$__observers.listeners.push({
          listener: callback,
          acceptList: acceptList
        });

        return model;

      };


      Object.unobserve = function (model, callback) {

        var toRemove = [];

        if (model.$$__observers && model.$$__observers.listeners && model.$$__observers.listeners.length > 0) {

          model.$$__observers.listeners.forEach(function (listener) {
            if (listener.listener == callback) {
              toRemove.push(listener);
            }
          });

          toRemove.forEach(function (rm) {
            var index = model.$$__observers.listeners.indexOf(rm);
            model.$$__observers.listeners.splice(index, 1);
          });

          if (model.$$__observers.listeners.length === 0) {
            model.$$__observers.observer.close();
            delete model.$$__observers;
          }

        }

        return model;
      };

    }

  }

})();
