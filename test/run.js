(function() {
  document.addEventListener("DOMContentLoaded", function() {
    mocha.run(function(err) {
      if(err) {
        console.log(err);
      }
    });
  }, false);
})();