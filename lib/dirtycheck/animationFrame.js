import dirtycheck from "lib/dirtycheck/dirtycheck";

export default (function () {

  var hasNativeRequestAninationFrame = false;
  var lastTime = 0;
  var vendors = ['webkit', 'moz'];
  for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
  }

  hasNativeRequestAninationFrame = typeof window.requestAnimationFrame != "undefined";

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function (callback, element) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = window.setTimeout(function () {
          callback(currTime + timeToCall);
        },
        timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    };
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function (id) {
      clearTimeout(id);
    };
  }


  if (!Observer.hasObjectObserve) {

    var requestAnimationFrameNative = window.requestAnimationFrame;
    window.requestAnimationFrame = function (callback, element) {
      var internalCallback = function () {
        callback();
        dirtycheck.executeHooks();
      };
      requestAnimationFrameNative.call(this, internalCallback, element);
    };

    var cancelAnimationFrameNative = window.cancelAnimationFrame;
    window.cancelAnimationFrame = function (id) {
      cancelAnimationFrameNative.apply(this, arguments);
      dirtycheck.executeHooks();
    };

  }

})();
