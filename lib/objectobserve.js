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
              arrayCopy: model.slice(0),
              arrayLength: model.length
            };

            var i;
            internalCallback = function (splice) {

              model.$$__observers.listeners.forEach(function (listener) {
                var changes = utils.arrayChanges(model.$$__observers.arrayCopy, model);
                var acceptList = listener.acceptList;
                if (acceptList.length > 0) {
                  changes = changes.filter(function (change) {
                    return acceptList.indexOf(change.type) !== -1;
                  });
                }
                listener.listener.call(this, changes);
              });

              dirtycheck.executeHooks();

              if (model.$$__observers) {
                model.$$__observers.arrayLength = model.length;
                model.$$__observers.arrayCopy = model.slice(0);
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
