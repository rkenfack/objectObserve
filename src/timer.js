if (!hasNativeObjectObserve) {

  window.nativeSetTimeout = window.setTimeout;
  window.nativeSetInterval = window.setInterval;

  window.setTimeout = function (listener, delay) {
    window.nativeSetTimeout(function () {
      listener.apply(this, [].slice.call(arguments));
      executeHooks();
    }, delay);
  };


  window.setInterval = function (listener, delay) {
    window.nativeSetInterval(function () {
      listener.apply(this, [].slice.call(arguments));
      executeHooks();
    }, delay);
  };

}
