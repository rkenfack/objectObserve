import dirtycheck from "lib/dirtycheck/dirtycheck";

export default (function() {

  if (!Observer.hasObjectObserve) {

  window.nativeSetTimeout = window.setTimeout;
  window.nativeSetInterval = window.setInterval;

  window.setTimeout = function (listener, delay) {
    window.nativeSetTimeout(function () {
      listener.apply(this, [].slice.call(arguments));
      dirtycheck.executeHooks();
    }, delay);
  };


  window.setInterval = function (listener, delay) {
    window.nativeSetInterval(function () {
      listener.apply(this, [].slice.call(arguments));
      dirtycheck.executeHooks();
    }, delay);
  };

}

})();