 /**
 * This code ovewrite the native addEventLitener as well as removeEventLitener
 * to te able to react on any changes. Some people don't like this but it's was the only way
 * for me to get this work.
 */


 if (!hasNativeObjectObserve) {

   window.addEventListener("load", function () {
     window.nativeSetTimeout(executeHooks, 0);
   }, false);


   [window, document, Element.prototype].forEach(function (eventTargetObject) {

     (function () {

       var __addEventListener = eventTargetObject.addEventListener;

       eventTargetObject.addEventListener = function (type, listener, useCapture) {

         if (typeof listener == "function") {

           listener.$$__observerId = listener.$$__observerId || utils.getUID();
           this.$$__observers = this.$$__observers || {};

           if (!this.$$__observers[type]) {
             this.$$__observers[type] = [];
           }

           var callback = function () {
             listener.apply(this, [].slice.call(arguments));
             executeHooks();
           };

           this.$$__observers[type][listener.$$__observerId] = {
             callback: callback,
             useCapture: useCapture
           };
           __addEventListener.call(this, type, callback, useCapture);

         } else {
           __addEventListener.call(this, type, listener, useCapture);
         }

       };

     })();

   });


   [window, document, Element.prototype].forEach(function (eventTargetObject) {
     (function () {
       var __removeEventListener = eventTargetObject.removeEventListener;
       eventTargetObject.removeEventListener = function (type, listener, useCapture) {
         if ((typeof listener == "function") && listener.$$__observerId && this.$$__observers) {
           var listenerId = listener.$$__observerId;
           if (listenerId && this.$$__observers[type]) {
             var observerStore = this.$$__observers[type][listenerId];
             if (observerStore && observerStore.useCapture === useCapture) {
               __removeEventListener.call(this, type, observerStore.callback, useCapture);
             } else {
               __removeEventListener.call(this, type, listener, useCapture);
             }
           } else {
             __removeEventListener.call(this, type, listener, useCapture);
           }
         };
       }
     })();
   });

 }
