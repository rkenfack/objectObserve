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
