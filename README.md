# objectObserve
A polyfill the Object.observe() based on the Polymer observe-js library

## Example
```
// A user model
var user = {
  id: 0,
  name: 'Brendan Eich',
  title: 'Mr.'
};

// Create a greeting for the user
function updateGreeting() {
  user.greeting = 'Hello, ' + user.title + ' ' + user.name + '!';
}
updateGreeting();

Object.observe(user, function(changes) {
  changes.forEach(function(change) {
    // Any time name or title change, update the greeting
    if (change.name === 'name' || change.name === 'title') {
      updateGreeting();
    }
  });
});

```

## Custom change type

```
// A point on a 2D plane
var point = {x: 0, y: 0, distance: 0};

function setPosition(pt, x, y) {
  // Performing a custom change
  Object.getNotifier(pt).performChange('reposition', function() {
    var oldDistance = pt.distance;
    pt.x = x;
    pt.y = y;
    pt.distance = Math.sqrt(x * x + y * y);
    return {oldDistance: oldDistance};
  });
}

Object.observe(point, function(changes) {
  console.log('Distance change: ' + (point.distance - changes[0].oldDistance));
}, ['reposition']);

setPosition(point, 3, 4);

```

## Browser support

The polyfill supports all major browser including IE9
