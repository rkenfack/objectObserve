import testEnv from "test/setup";

function isNative(fn) {
  return (/\{\s*\[native code\]\s*\}/).test('' + fn);
}


function aChangeMatches(changes, options) {

  var test = function (change) {
    var result = true;
    for (var prop in options) {
      result = result && (options[prop] == change[prop]);
    }
    return result;

  };

  var found = false;
  changes.forEach(function (change) {
    found = found || test(change);
  });


  if (!found) {
    throw new Error('A change matching type: ' + options.type + ', name: ' + options.name + ', newValue: ' + options.newValue + ', oldValue: ' + options.oldValue + ' not found!');
  }
}


describe('Simple Plain object', function () {

  testEnv.defaultInit();

  it("simple add", function (done) {

    var model = {
      a: 3,
      b: 4
    };

    Object.observe(model, function (changes) {
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "c");
      assert.equal(changes[0].object.c, 10);
      assert.equal(changes[0].type, "add");
      done();
    });

    model.c = 10;

  });


  it("simple update", function (done) {

    var model = {
      a: 3,
      b: 4
    };

    Object.observe(model, function (changes) {
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "b");
      assert.equal(changes[0].object.b, 10);
      assert.equal(changes[0].type, "update");
      done();
    });

    model.b = 10;

  });


  it("simple delete", function (done) {

    var model = {
      a: 3,
      b: 4
    };

    Object.observe(model, function (changes) {
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "b");
      assert.isUndefined(changes[0].object.b);
      assert.equal(changes[0].type, "delete");
      done();
    });

    delete model.b;

  });


  it("Multiple callbacks", function (done) {

    var count = 0;

    var model = {
      a: 3,
      b: 4
    };

    var callback1 = function (changes) {
      count++;
      nextTest();
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "b");
      assert.equal(changes[0].object.b, 10);
      assert.equal(changes[0].type, "update");
    };

    var callback2 = function (changes) {
      count++;
      nextTest();
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "b");
      assert.equal(changes[0].object.b, 10);
      assert.equal(changes[0].type, "update");
    };

    var callback3 = function (changes) {
      count++;
      nextTest();
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "b");
      assert.equal(changes[0].object.b, 10);
      assert.equal(changes[0].type, "update");
    };

    var nextTest = function () {
      if (count == 3) {
        done();
      }
    };

    Object.observe(model, callback1);
    Object.observe(model, callback2);
    Object.observe(model, callback3);

    model.b = 10;

  });

  it("Unobserve", function (done) {

    var count = 0;

    var model = {
      a: 3,
      b: 4
    };


    var callback1 = function (changes) {
      count++;
      nextTest();
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "b");
      assert.equal(changes[0].object.b, 10);
      assert.equal(changes[0].type, "update");
    };

    var callback2 = function (changes) {
      count++;
      nextTest();
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "b");
      assert.equal(changes[0].object.b, 10);
      assert.equal(changes[0].type, "update");
    };

    var callback3 = function (changes) {
      count++;
      nextTest();
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "b");
      assert.equal(changes[0].object.b, 10);
      assert.equal(changes[0].type, "update");
    };

    var nextTest = function () {
      if (count == 3) {
        if (!isNative(Object.observe)) {
          Object.unobserve(model, callback1);
          assert.equal(model.$$__observers.listeners.length, 2);
          Object.unobserve(model, callback2);
          assert.equal(model.$$__observers.listeners.length, 1);
          Object.unobserve(model, callback3);
          assert.isUndefined(model.$$__observers);
        }
        done();
      }
    };

    Object.observe(model, callback1);
    Object.observe(model, callback2);
    Object.observe(model, callback3);

    model.b = 10;


  });


});


describe('Complex Plain object', function () {

  testEnv.defaultInit();

  it("Add", function (done) {

    var model = {};

    Object.observe(model, function (changes) {
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "sub");
      assert.equal(changes[0].object.sub.firstname, "Romeo");
      assert.equal(changes[0].object.sub.lastname, "Kenfack Tsakem");
      assert.equal(changes[0].type, "add");
      done();
    });

    model.sub = {
      firstname: "Romeo",
      lastname: "Kenfack Tsakem"
    };

  });


  it("Update", function (done) {

    var model = {
      sub: {
        firstname: "Romeo",
        lastname: "Kenfack Tsakem"
      }
    };

    var toUpdate = {
      firstname: "Romeo",
      lastname: "Kenfack Tsakem"
    };

    Object.observe(model, function (changes) {
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "sub");
      assert.equal(changes[0].object.sub, toUpdate);
      assert.equal(changes[0].type, "update");
      done();
    });

    model.sub = toUpdate;

  });


  it("Delete", function (done) {

    var model = {
      sub: {
        firstname: "Romeo",
        lastname: "Kenfack Tsakem"
      }
    };

    var toUpdate = {
      firstname: "Romeo",
      lastname: "Kenfack Tsakem"
    };

    Object.observe(model, function (changes) {
      assert.equal(changes.length, 1);
      assert.equal(changes[0].name, "sub");
      assert.isUndefined(changes[0].object.sub);
      assert.equal(changes[0].type, "delete");
      done();
    });

    delete model.sub;

  });


});


describe('Array tests', function () {

  it('Should observe arrays', function (done) {
    var handler = function () {},
      subject = [];
    Object.observe(subject, handler);
    Object.unobserve(subject, handler);
    done();
  });

  it('Should notify when a new item is added with push', function (done) {
    var handler = function (changes) {
      Object.unobserve(subject, handler);
      assert.equal(changes.length, 2); // 1 for the change and one for the length change
      aChangeMatches(changes, {
        type: 'add',
        name: '0'
      });
      aChangeMatches(changes, {
        type: 'update',
        name: 'length',
        oldValue: 0
      });
      done();
    },
      subject = [];
    Object.observe(subject, handler);
    subject.push(1);
  });

  it('Should notify when a new item is added with unshift', function (done) {
    var handler = function (changes) {
      Object.unobserve(subject, handler);
      assert.equal(changes.length, 2); // 1 for the change and one for the length change
      aChangeMatches(changes, {
        type: 'add',
        name: '0'
      });
      aChangeMatches(changes, {
        type: 'update',
        name: 'length',
        oldValue: 0
      });
      done();
    },
      subject = [];
    Object.observe(subject, handler);
    subject.unshift(1);
  });

  it('Should notify when a new item is added by next index', function (done) {
    var handler = function (changes) {
      Object.unobserve(subject, handler);
      assert.equal(changes.length, 2); // 1 for the change and one for the length change
      aChangeMatches(changes, {
        type: 'add',
        name: '0'
      });
      aChangeMatches(changes, {
        type: 'update',
        name: 'length',
        oldValue: 0
      });
      done();
    },
      subject = [];
    Object.observe(subject, handler);
    subject[subject.length] = 1;
  });

  it('Should notify when a new item is added by any index', function (done) {
    var handler = function (changes) {
      Object.unobserve(subject, handler);
      assert.equal(changes.length, 2); // 1 for the change and one for the length change
      aChangeMatches(changes, {
        type: 'add',
        name: '5'
      });
      aChangeMatches(changes, {
        type: 'update',
        name: 'length',
        oldValue: 0
      });
      done();
    },
      subject = [];
    Object.observe(subject, handler);
    subject[5] = 1;
  });

  it('Should notify when items are removed from the array using pop', function (done) {
    var handler = function (changes) {
      Object.unobserve(subject, handler);
      assert.equal(changes.length, 2); // 1 for the delete and one for the length change
      aChangeMatches(changes, {
        type: 'delete',
        name: '2',
        oldValue: 3
      });
      aChangeMatches(changes, {
        type: 'update',
        name: 'length',
        oldValue: 3
      });
      done();
    },
      subject = [1, 2, 3];
    Object.observe(subject, handler);
    subject.pop();
  });

  it('Should notify when items are removed from the array using shift', function (done) {
    var handler = function (changes) {
      Object.unobserve(subject, handler);
      assert.equal(changes.length, 4); // 3 for the removal change and 1 for the length change
      aChangeMatches(changes, {
        type: 'update',
        name: '0',
        oldValue: 1
      });
      aChangeMatches(changes, {
        type: 'update',
        name: '1',
        oldValue: 2
      });
      aChangeMatches(changes, {
        type: 'delete',
        name: '2',
        oldValue: 3
      })
      aChangeMatches(changes, {
        type: 'update',
        name: 'length',
        oldValue: 3
      });
      done();
    },
      subject = [1, 2, 3];
    Object.observe(subject, handler);
    subject.shift();
  });

  it('Should notify when items are removed from the array using delete', function (done) {
    var handler = function (changes) {
      Object.unobserve(subject, handler);
      assert.equal(changes.length, 1); // 1 for the delete, no change in length
      aChangeMatches(changes, {
        type: 'delete',
        name: '1',
        oldValue: 2
      })
      done();
    },
      subject = [1, 2, 3];
    Object.observe(subject, handler);
    delete subject[1];
  });

  it('Should notify when items are removed from the array using splice', function (done) {
    var handler = function (changes) {
      Object.unobserve(subject, handler);
      assert.equal(changes.length, 3); // 1 for the change and one for the length change
      aChangeMatches(changes, {
        type: 'update',
        name: '1',
        oldValue: 2
      });
      aChangeMatches(changes, {
        type: 'delete',
        name: '2',
        oldValue: 3
      });
      aChangeMatches(changes, {
        type: 'update',
        name: 'length',
        oldValue: 3
      });
      done();
    },
      subject = [1, 2, 3];
    Object.observe(subject, handler);
    subject.splice(1, 1);
  });

  it('Should notify when an array item is updated', function (done) {
    var handler = function (changes) {
      Object.unobserve(subject, handler);
      assert.equal(changes.length, 1); // 1 for the change and one for the length change
      aChangeMatches(changes, {
        type: 'update',
        name: '1',
        oldValue: 2
      });
      done();
    },
      subject = [1, 2, 3];
    Object.observe(subject, handler);
    subject[1] = 4;
  });
});
