import utils from "lib/utils";
import dirtycheck from "lib/dirtycheck/dirtycheck";

export default (function () {


  if (!Observer.hasObjectObserve) {

    [window, document, Element.prototype].forEach(function (eventTargetObject) {

      var __addEventListener = eventTargetObject.addEventListener;

      eventTargetObject.addEventListener = function (type, listener, useCapture) {

        useCapture = typeof useCapture == "undefined" ? false : useCapture;

        if (typeof listener == "function") {

          this.$$__observers = this.$$__observers || {};
          if (!this.$$__observers[type]) {
            this.$$__observers[type] = [];
          }

          var callback = function () {
            listener.apply(this, [].slice.call(arguments));
            dirtycheck.executeHooks();
          };

          this.$$__observers[type].push({
            callback: callback,
            type: type,
            listener: listener,
            useCapture: useCapture
          });

          __addEventListener.call(this, type, callback, useCapture);

        }

        __addEventListener.call(this, type, listener, useCapture);

      };


    });


    [window, document, Element.prototype].forEach(function (eventTargetObject) {


      var __removeEventListener = eventTargetObject.removeEventListener;

      eventTargetObject.removeEventListener = function (type, listener, useCapture) {

        var toRemove = [];

        useCapture = typeof useCapture == "undefined" ? false : useCapture;

        if (typeof listener == "function") {

          if (this.$$__observers && this.$$__observers[type]) {

            this.$$__observers[type].forEach(function (stored) {
              if ((stored.type == type) && (stored.listener == listener) && (stored.useCapture == useCapture)) {
                toRemove.push(stored);
                __removeEventListener.call(this, type, observerStore.callback, useCapture);
              }
            });

            toRemove.forEach(function (observer) {
              var index = this.$$__observers[type].indexOf(observer);
              this.$$__observers[type].splice(index, 1);
            });

            if (this.$$__observers[type].length === 0) {
              delete this.$$__observers[type];
            }
          }
        }

        __removeEventListener.apply(this, arguments);

      };

    });

  }


})();
