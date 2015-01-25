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

var $$__Hooks = [Platform.performMicrotaskCheckpoint];
var hasNativeObjectObserve = Observer.hasObjectObserve;

var maxCheckDuration = 300;
var checkerTheshold = 60;
var checkerTimer = null;
var checkStartTime = null;
var checkDuration = 0;

var checkerStep = function () {
  if (checkDuration < maxCheckDuration) {
    window.nativeSetTimeout(function(){
      $$__Hooks.forEach(function (hook) {
      hook();
    });
    checkerTimer = window.nativeSetTimeout(function () {
      checkerStep();
    }, checkerTheshold);

    checkDuration += checkerTheshold;
    }, 0);

  } else {
    window.clearTimeout(checkerTimer);
    checkerTimer = null;
    checkDuration = 0;
  }
};


var executeHooks = function () {
  if (!hasNativeObjectObserve) {
    if (checkerTimer) {
      checkDuration = 0;
      return;
    } else {
      checkerStep();
    }
  }
};
