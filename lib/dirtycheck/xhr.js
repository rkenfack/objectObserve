import dirtycheck from "lib/dirtycheck/dirtycheck";

export default (function() {

  if (!Observer.hasObjectObserve) {
   (function (send) {
     XMLHttpRequest.prototype.send = function () {
       var readystatechange = this.onreadystatechange;
       var newReadyStateChange = function () {
         readystatechange();
         dirtycheck.executeHooks();
       };
       this.onreadystatechange = newReadyStateChange;
       send.apply(this, arguments);
     };
   })(XMLHttpRequest.prototype.send);
 }

})();