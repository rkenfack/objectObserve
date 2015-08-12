import utils from "lib/utils";

export
default (function () {

  var $$__Hooks = [Platform.performMicrotaskCheckpoint];

  var maxCheckDuration = 300;
  var checkerTheshold = 60;
  var checkDuration = 0;

  var checkerStep = function () {
    $$__Hooks.forEach(function (hook) {
      hook();
    });
  };


  var executeHooks = function () {
    if (!Observer.hasObjectObserve) {
      checkerStep();
    }
  };

  return {

    executeHooks: executeHooks,

    wrapFunction: function (func) {
      return function () {
        func();
        executeHooks();
      };
    }

  };

})();
