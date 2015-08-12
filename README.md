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

## Browser support

The polyfill supports all major browser including IE9
