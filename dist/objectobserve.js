(function(global) {

  var defined = {};

  // indexOf polyfill for IE8
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  function dedupe(deps) {
    var newDeps = [];
    for (var i = 0, l = deps.length; i < l; i++)
      if (indexOf.call(newDeps, deps[i]) == -1)
        newDeps.push(deps[i])
    return newDeps;
  }

  function register(name, deps, declare, execute) {
    if (typeof name != 'string')
      throw "System.register provided no module name";

    var entry;

    // dynamic
    if (typeof declare == 'boolean') {
      entry = {
        declarative: false,
        deps: deps,
        execute: execute,
        executingRequire: declare
      };
    }
    else {
      // ES6 declarative
      entry = {
        declarative: true,
        deps: deps,
        declare: declare
      };
    }

    entry.name = name;

    // we never overwrite an existing define
    if (!(name in defined))
      defined[name] = entry; 

    entry.deps = dedupe(entry.deps);

    // we have to normalize dependencies
    // (assume dependencies are normalized for now)
    // entry.normalizedDeps = entry.deps.map(normalize);
    entry.normalizedDeps = entry.deps;
  }

  function buildGroups(entry, groups) {
    groups[entry.groupIndex] = groups[entry.groupIndex] || [];

    if (indexOf.call(groups[entry.groupIndex], entry) != -1)
      return;

    groups[entry.groupIndex].push(entry);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];

      // not in the registry means already linked / ES6
      if (!depEntry || depEntry.evaluated)
        continue;

      // now we know the entry is in our unlinked linkage group
      var depGroupIndex = entry.groupIndex + (depEntry.declarative != entry.declarative);

      // the group index of an entry is always the maximum
      if (depEntry.groupIndex === undefined || depEntry.groupIndex < depGroupIndex) {

        // if already in a group, remove from the old group
        if (depEntry.groupIndex !== undefined) {
          groups[depEntry.groupIndex].splice(indexOf.call(groups[depEntry.groupIndex], depEntry), 1);

          // if the old group is empty, then we have a mixed depndency cycle
          if (groups[depEntry.groupIndex].length == 0)
            throw new TypeError("Mixed dependency cycle detected");
        }

        depEntry.groupIndex = depGroupIndex;
      }

      buildGroups(depEntry, groups);
    }
  }

  function link(name) {
    var startEntry = defined[name];

    startEntry.groupIndex = 0;

    var groups = [];

    buildGroups(startEntry, groups);

    var curGroupDeclarative = !!startEntry.declarative == groups.length % 2;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      for (var j = 0; j < group.length; j++) {
        var entry = group[j];

        // link each group
        if (curGroupDeclarative)
          linkDeclarativeModule(entry);
        else
          linkDynamicModule(entry);
      }
      curGroupDeclarative = !curGroupDeclarative; 
    }
  }

  // module binding records
  var moduleRecords = {};
  function getOrCreateModuleRecord(name) {
    return moduleRecords[name] || (moduleRecords[name] = {
      name: name,
      dependencies: [],
      exports: {}, // start from an empty module and extend
      importers: []
    })
  }

  function linkDeclarativeModule(entry) {
    // only link if already not already started linking (stops at circular)
    if (entry.module)
      return;

    var module = entry.module = getOrCreateModuleRecord(entry.name);
    var exports = entry.module.exports;

    var declaration = entry.declare.call(global, function(name, value) {
      module.locked = true;
      exports[name] = value;

      for (var i = 0, l = module.importers.length; i < l; i++) {
        var importerModule = module.importers[i];
        if (!importerModule.locked) {
          var importerIndex = indexOf.call(importerModule.dependencies, module);
          importerModule.setters[importerIndex](exports);
        }
      }

      module.locked = false;
      return value;
    });

    module.setters = declaration.setters;
    module.execute = declaration.execute;

    if (!module.setters || !module.execute)
      throw new TypeError("Invalid System.register form for " + entry.name);

    // now link all the module dependencies
    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      var depModule = moduleRecords[depName];

      // work out how to set depExports based on scenarios...
      var depExports;

      if (depModule) {
        depExports = depModule.exports;
      }
      else if (depEntry && !depEntry.declarative) {
        if (depEntry.module.exports && depEntry.module.exports.__esModule)
          depExports = depEntry.module.exports;
        else
          depExports = { 'default': depEntry.module.exports, __useDefault: true };
      }
      // in the module registry
      else if (!depEntry) {
        depExports = load(depName);
      }
      // we have an entry -> link
      else {
        linkDeclarativeModule(depEntry);
        depModule = depEntry.module;
        depExports = depModule.exports;
      }

      // only declarative modules have dynamic bindings
      if (depModule && depModule.importers) {
        depModule.importers.push(module);
        module.dependencies.push(depModule);
      }
      else
        module.dependencies.push(null);

      // run the setter for this dependency
      if (module.setters[i])
        module.setters[i](depExports);
    }
  }

  // An analog to loader.get covering execution of all three layers (real declarative, simulated declarative, simulated dynamic)
  function getModule(name) {
    var exports;
    var entry = defined[name];

    if (!entry) {
      exports = load(name);
      if (!exports)
        throw new Error("Unable to load dependency " + name + ".");
    }

    else {
      if (entry.declarative)
        ensureEvaluated(name, []);

      else if (!entry.evaluated)
        linkDynamicModule(entry);

      exports = entry.module.exports;
    }

    if ((!entry || entry.declarative) && exports && exports.__useDefault)
      return exports['default'];

    return exports;
  }

  function linkDynamicModule(entry) {
    if (entry.module)
      return;

    var exports = {};

    var module = entry.module = { exports: exports, id: entry.name };

    // AMD requires execute the tree first
    if (!entry.executingRequire) {
      for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
        var depName = entry.normalizedDeps[i];
        var depEntry = defined[depName];
        if (depEntry)
          linkDynamicModule(depEntry);
      }
    }

    // now execute
    entry.evaluated = true;
    var output = entry.execute.call(global, function(name) {
      for (var i = 0, l = entry.deps.length; i < l; i++) {
        if (entry.deps[i] != name)
          continue;
        return getModule(entry.normalizedDeps[i]);
      }
      throw new TypeError('Module ' + name + ' not declared as a dependency.');
    }, exports, module);

    if (output)
      module.exports = output;
  }

  /*
   * Given a module, and the list of modules for this current branch,
   *  ensure that each of the dependencies of this module is evaluated
   *  (unless one is a circular dependency already in the list of seen
   *  modules, in which case we execute it)
   *
   * Then we evaluate the module itself depth-first left to right 
   * execution to match ES6 modules
   */
  function ensureEvaluated(moduleName, seen) {
    var entry = defined[moduleName];

    // if already seen, that means it's an already-evaluated non circular dependency
    if (!entry || entry.evaluated || !entry.declarative)
      return;

    // this only applies to declarative modules which late-execute

    seen.push(moduleName);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      if (indexOf.call(seen, depName) == -1) {
        if (!defined[depName])
          load(depName);
        else
          ensureEvaluated(depName, seen);
      }
    }

    if (entry.evaluated)
      return;

    entry.evaluated = true;
    entry.module.execute.call(global);
  }

  // magical execution function
  var modules = {};
  function load(name) {
    if (modules[name])
      return modules[name];

    var entry = defined[name];

    // first we check if this module has already been defined in the registry
    if (!entry)
      throw "Module " + name + " not present.";

    // recursively ensure that the module and all its 
    // dependencies are linked (with dependency group handling)
    link(name);

    // now handle dependency execution in correct order
    ensureEvaluated(name, []);

    // remove from the registry
    defined[name] = undefined;

    var module = entry.module.exports;

    if (!module || !entry.declarative && module.__esModule !== true)
      module = { 'default': module, __useDefault: true };

    // return the defined module object
    return modules[name] = module;
  };

  return function(mains, declare) {

    var System;
    var System = {
      register: register, 
      get: load, 
      set: function(name, module) {
        modules[name] = module; 
      },
      newModule: function(module) {
        return module;
      },
      global: global 
    };
    System.set('@empty', {});

    declare(System);

    for (var i = 0; i < mains.length; i++)
      load(mains[i]);
  }

})(typeof window != 'undefined' ? window : global)
/* (['mainModule'], function(System) {
  System.register(...);
}); */

(['lib/objectobserve'], function(System) {

System.register("npm:core-js@0.9.18/library/modules/$.fw", [], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = function($) {
    $.FW = false;
    $.path = $.core;
    return $;
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.18/library/modules/$.def", ["npm:core-js@0.9.18/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$"),
      global = $.g,
      core = $.core,
      isFunction = $.isFunction;
  function ctx(fn, that) {
    return function() {
      return fn.apply(that, arguments);
    };
  }
  $def.F = 1;
  $def.G = 2;
  $def.S = 4;
  $def.P = 8;
  $def.B = 16;
  $def.W = 32;
  function $def(type, name, source) {
    var key,
        own,
        out,
        exp,
        isGlobal = type & $def.G,
        isProto = type & $def.P,
        target = isGlobal ? global : type & $def.S ? global[name] : (global[name] || {}).prototype,
        exports = isGlobal ? core : core[name] || (core[name] = {});
    if (isGlobal)
      source = name;
    for (key in source) {
      own = !(type & $def.F) && target && key in target;
      if (own && key in exports)
        continue;
      out = own ? target[key] : source[key];
      if (isGlobal && !isFunction(target[key]))
        exp = source[key];
      else if (type & $def.B && own)
        exp = ctx(out, global);
      else if (type & $def.W && target[key] == out)
        !function(C) {
          exp = function(param) {
            return this instanceof C ? new C(param) : C(param);
          };
          exp.prototype = C.prototype;
        }(out);
      else
        exp = isProto && isFunction(out) ? ctx(Function.call, out) : out;
      exports[key] = exp;
      if (isProto)
        (exports.prototype || (exports.prototype = {}))[key] = out;
    }
  }
  module.exports = $def;
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.18/library/modules/$.get-names", ["npm:core-js@0.9.18/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$"),
      toString = {}.toString,
      getNames = $.getNames;
  var windowNames = typeof window == 'object' && Object.getOwnPropertyNames ? Object.getOwnPropertyNames(window) : [];
  function getWindowNames(it) {
    try {
      return getNames(it);
    } catch (e) {
      return windowNames.slice();
    }
  }
  module.exports.get = function getOwnPropertyNames(it) {
    if (windowNames && toString.call(it) == '[object Window]')
      return getWindowNames(it);
    return getNames($.toObject(it));
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.18/library/fn/object/create", ["npm:core-js@0.9.18/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$");
  module.exports = function create(P, D) {
    return $.create(P, D);
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.18/library/fn/object/get-own-property-names", ["npm:core-js@0.9.18/library/modules/$", "npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$");
  require("npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives");
  module.exports = function getOwnPropertyNames(it) {
    return $.getNames(it);
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.18/library/fn/object/define-property", ["npm:core-js@0.9.18/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$");
  module.exports = function defineProperty(it, key, desc) {
    return $.setDesc(it, key, desc);
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.18/library/fn/object/get-own-property-descriptor", ["npm:core-js@0.9.18/library/modules/$", "npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$");
  require("npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives");
  module.exports = function getOwnPropertyDescriptor(it, key) {
    return $.getDesc(it, key);
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.18/library/fn/object/define-properties", ["npm:core-js@0.9.18/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$");
  module.exports = function defineProperties(T, D) {
    return $.setDescs(T, D);
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.18/library/modules/$", ["npm:core-js@0.9.18/library/modules/$.fw"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var global = typeof self != 'undefined' ? self : Function('return this')(),
      core = {},
      defineProperty = Object.defineProperty,
      hasOwnProperty = {}.hasOwnProperty,
      ceil = Math.ceil,
      floor = Math.floor,
      max = Math.max,
      min = Math.min;
  var DESC = !!function() {
    try {
      return defineProperty({}, 'a', {get: function() {
          return 2;
        }}).a == 2;
    } catch (e) {}
  }();
  var hide = createDefiner(1);
  function toInteger(it) {
    return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
  }
  function desc(bitmap, value) {
    return {
      enumerable: !(bitmap & 1),
      configurable: !(bitmap & 2),
      writable: !(bitmap & 4),
      value: value
    };
  }
  function simpleSet(object, key, value) {
    object[key] = value;
    return object;
  }
  function createDefiner(bitmap) {
    return DESC ? function(object, key, value) {
      return $.setDesc(object, key, desc(bitmap, value));
    } : simpleSet;
  }
  function isObject(it) {
    return it !== null && (typeof it == 'object' || typeof it == 'function');
  }
  function isFunction(it) {
    return typeof it == 'function';
  }
  function assertDefined(it) {
    if (it == undefined)
      throw TypeError("Can't call method on  " + it);
    return it;
  }
  var $ = module.exports = require("npm:core-js@0.9.18/library/modules/$.fw")({
    g: global,
    core: core,
    html: global.document && document.documentElement,
    isObject: isObject,
    isFunction: isFunction,
    that: function() {
      return this;
    },
    toInteger: toInteger,
    toLength: function(it) {
      return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0;
    },
    toIndex: function(index, length) {
      index = toInteger(index);
      return index < 0 ? max(index + length, 0) : min(index, length);
    },
    has: function(it, key) {
      return hasOwnProperty.call(it, key);
    },
    create: Object.create,
    getProto: Object.getPrototypeOf,
    DESC: DESC,
    desc: desc,
    getDesc: Object.getOwnPropertyDescriptor,
    setDesc: defineProperty,
    setDescs: Object.defineProperties,
    getKeys: Object.keys,
    getNames: Object.getOwnPropertyNames,
    getSymbols: Object.getOwnPropertySymbols,
    assertDefined: assertDefined,
    ES5Object: Object,
    toObject: function(it) {
      return $.ES5Object(assertDefined(it));
    },
    hide: hide,
    def: createDefiner(0),
    set: global.Symbol ? simpleSet : hide,
    each: [].forEach
  });
  if (typeof __e != 'undefined')
    __e = core;
  if (typeof __g != 'undefined')
    __g = global;
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.4.7/core-js/object/create", ["npm:core-js@0.9.18/library/fn/object/create"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/create"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.4.7/core-js/object/get-own-property-names", ["npm:core-js@0.9.18/library/fn/object/get-own-property-names"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/get-own-property-names"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.4.7/core-js/object/define-property", ["npm:core-js@0.9.18/library/fn/object/define-property"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/define-property"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.4.7/core-js/object/get-own-property-descriptor", ["npm:core-js@0.9.18/library/fn/object/get-own-property-descriptor"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/get-own-property-descriptor"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.4.7/core-js/object/define-properties", ["npm:core-js@0.9.18/library/fn/object/define-properties"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/define-properties"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives", ["npm:core-js@0.9.18/library/modules/$", "npm:core-js@0.9.18/library/modules/$.def", "npm:core-js@0.9.18/library/modules/$.get-names"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$"),
      $def = require("npm:core-js@0.9.18/library/modules/$.def"),
      isObject = $.isObject,
      toObject = $.toObject;
  $.each.call(('freeze,seal,preventExtensions,isFrozen,isSealed,isExtensible,' + 'getOwnPropertyDescriptor,getPrototypeOf,keys,getOwnPropertyNames').split(','), function(KEY, ID) {
    var fn = ($.core.Object || {})[KEY] || Object[KEY],
        forced = 0,
        method = {};
    method[KEY] = ID == 0 ? function freeze(it) {
      return isObject(it) ? fn(it) : it;
    } : ID == 1 ? function seal(it) {
      return isObject(it) ? fn(it) : it;
    } : ID == 2 ? function preventExtensions(it) {
      return isObject(it) ? fn(it) : it;
    } : ID == 3 ? function isFrozen(it) {
      return isObject(it) ? fn(it) : true;
    } : ID == 4 ? function isSealed(it) {
      return isObject(it) ? fn(it) : true;
    } : ID == 5 ? function isExtensible(it) {
      return isObject(it) ? fn(it) : false;
    } : ID == 6 ? function getOwnPropertyDescriptor(it, key) {
      return fn(toObject(it), key);
    } : ID == 7 ? function getPrototypeOf(it) {
      return fn(Object($.assertDefined(it)));
    } : ID == 8 ? function keys(it) {
      return fn(toObject(it));
    } : require("npm:core-js@0.9.18/library/modules/$.get-names").get;
    try {
      fn('z');
    } catch (e) {
      forced = 1;
    }
    $def($def.S + $def.F * forced, 'Object', method);
  });
  global.define = __define;
  return module.exports;
});

System.register("npm:core-js@0.9.18/library/fn/object/keys", ["npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives", "npm:core-js@0.9.18/library/modules/$"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives");
  module.exports = require("npm:core-js@0.9.18/library/modules/$").core.Object.keys;
  global.define = __define;
  return module.exports;
});

System.register("npm:babel-runtime@5.4.7/core-js/object/keys", ["npm:core-js@0.9.18/library/fn/object/keys"], true, function(require, exports, module) {
  var global = System.global,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/keys"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register("lib/utils", [], function (_export) {
  "use strict";

  return {
    setters: [],
    execute: function () {
      _export("default", {

        classToTypeMap: {
          "[object String]": "String",
          "[object Array]": "Array",
          "[object Object]": "Object",
          "[object RegExp]": "RegExp",
          "[object Number]": "Number",
          "[object Boolean]": "Boolean",
          "[object Date]": "Date",
          "[object Function]": "Function",
          "[object Error]": "Error"
        },

        getClass: function getClass(value) {
          // The typeof null and undefined is "object" under IE8
          if (value === undefined) {
            return "Undefined";
          } else if (value === null) {
            return "Null";
          }
          var classString = Object.prototype.toString.call(value);
          return this.classToTypeMap[classString] || classString.slice(8, -1);
        },

        getUID: function getUID() {
          return (new Date().getTime() + "" + Math.floor(Math.random() * 1000000)).substr(0, 18);
        },

        isFunction: function isFunction(obj) {
          return typeof obj === "function";
        },

        equals: function equals(object1, object2) {
          return this.__equals(object1, object2, [], []);
        },

        isObject: function isObject(obj) {
          return Object.prototype.toString.call(obj) == "[object Object]";
        },

        isDate: function isDate(obj) {
          return Object.prototype.toString.call(obj) == "[object Date]";
        },

        camelCase: function camelCase(s) {
          return (s || "").toLowerCase().replace(/(-)\w/g, function (m) {
            return m.toUpperCase().replace(/-/, "");
          });
        },

        hyphenate: function hyphenate(str) {
          return str.replace(/\s/g, "-").toLowerCase();
        },

        __equals: function __equals(object1, object2, aStack, bStack) {
          // Identical objects are equal. `0 === -0`, but they aren't identical.
          // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
          if (object1 === object2) {
            return object1 !== 0 || 1 / object1 == 1 / object2;
          }
          // A strict comparison is necessary because `null == undefined`.
          if (object1 === null || object2 === null) {
            return object1 === object2;
          }
          // Compare `[[Class]]` names.
          var className = Object.prototype.toString.call(object1);
          if (className != Object.prototype.toString.call(object2)) {
            return false;
          }
          switch (className) {
            // Strings, numbers, dates, and booleans are compared by value.
            case "[object String]":
              // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
              // equivalent to `new String("5")`.
              return object1 == String(object2);
            case "[object Number]":
              // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
              // other numeric values.
              return object1 != +object1 ? object2 != +object2 : object1 === 0 ? 1 / object1 == 1 / object2 : object1 == +object2;
            case "[object Date]":
            case "[object Boolean]":
              // Coerce dates and booleans to numeric primitive values. Dates are compared by their
              // millisecond representations. Note that invalid dates with millisecond representations
              // of `NaN` are not equivalent.
              return +object1 == +object2;
            // RegExps are compared by their source patterns and flags.
            case "[object RegExp]":
              return object1.source == object2.source && object1.global == object2.global && object1.multiline == object2.multiline && object1.ignoreCase == object2.ignoreCase;
          }
          if (typeof object1 != "object" || typeof object2 != "object") {
            return false;
          }
          // Assume equality for cyclic structures. The algorithm for detecting cyclic
          // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
          var length = aStack.length;
          while (length--) {
            // Linear search. Performance is inversely proportional to the number of
            // unique nested structures.
            if (aStack[length] == object1) {
              return bStack[length] == object2;
            }
          }
          // Objects with different constructors are not equivalent, but `Object`s
          // from different frames are.
          var aCtor = object1.constructor,
              bCtor = object2.constructor;
          if (aCtor !== bCtor && !(this.isFunction(aCtor) && aCtor instanceof aCtor && this.isFunction(bCtor) && bCtor instanceof bCtor) && ("constructor" in object1 && "constructor" in object2)) {
            return false;
          }
          // Add the first object to the stack of traversed objects.
          aStack.push(object1);
          bStack.push(object2);
          var size = 0,
              result = true;
          // Recursively compare objects and arrays.
          if (className == "[object Array]") {
            // Compare array lengths to determine if a deep comparison is necessary.
            size = object1.length;
            result = size == object2.length;
            if (result) {
              // Deep compare the contents, ignoring non-numeric properties.
              while (size--) {
                if (!(result = this.__equals(object1[size], object2[size], aStack, bStack))) {
                  break;
                }
              }
            }
          } else {
            // Deep compare objects.
            for (var key in object1) {
              if (Object.prototype.hasOwnProperty.call(object1, key)) {
                // Count the expected number of properties.
                size++;
                // Deep compare each member.
                if (!(result = Object.prototype.hasOwnProperty.call(object2, key) && this.__equals(object1[key], object2[key], aStack, bStack))) {
                  break;
                }
              }
            }
            // Ensure that both objects contain the same number of properties.
            if (result) {
              for (key in object2) {
                if (Object.prototype.hasOwnProperty.call(object2, key) && ! size--) {
                  break;
                }
              }
              result = !size;
            }
          }
          // Remove the first object from the stack of traversed objects.
          aStack.pop();
          bStack.pop();

          return result;
        }

      });
    }
  };
});
System.register('lib/dirtycheck/animationFrame', ['lib/dirtycheck/dirtycheck'], function (_export) {
  'use strict';

  var dirtycheck;
  return {
    setters: [function (_libDirtycheckDirtycheck) {
      dirtycheck = _libDirtycheckDirtycheck['default'];
    }],
    execute: function () {
      _export('default', (function () {

        var hasNativeRequestAninationFrame = false;
        var lastTime = 0;
        var vendors = ['webkit', 'moz'];
        for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
          window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
          window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
        }

        hasNativeRequestAninationFrame = typeof window.requestAnimationFrame != 'undefined';

        if (!window.requestAnimationFrame) {
          window.requestAnimationFrame = function (callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function () {
              callback(currTime + timeToCall);
            }, timeToCall);
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
            var internalCallback = function internalCallback() {
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
      })());
    }
  };
});
System.register("lib/dirtycheck/eventListener", ["lib/utils", "lib/dirtycheck/dirtycheck"], function (_export) {
  "use strict";

  var utils, dirtycheck;
  return {
    setters: [function (_libUtils) {
      utils = _libUtils["default"];
    }, function (_libDirtycheckDirtycheck) {
      dirtycheck = _libDirtycheckDirtycheck["default"];
    }],
    execute: function () {
      _export("default", (function () {

        if (!Observer.hasObjectObserve) {

          [window, document, Element.prototype].forEach(function (eventTargetObject) {

            var __addEventListener = eventTargetObject.addEventListener;

            eventTargetObject.addEventListener = function (type, listener, useCapture) {

              useCapture = typeof useCapture == "undefined" ? false : useCapture;

              if (typeof listener == "function") {

                this.$$__observers = this.$$__observers || {};
                if (!this.$$__observers[type]) {
                  this.$$__observers[type] = [];
                }

                var callback = function callback() {
                  listener.apply(this, [].slice.call(arguments));
                  dirtycheck.executeHooks();
                };

                this.$$__observers[type].push({
                  callback: callback,
                  type: type,
                  listener: listener,
                  useCapture: useCapture
                });

                __addEventListener.call(this, type, callback, useCapture);
              }

              __addEventListener.call(this, type, listener, useCapture);
            };
          });

          [window, document, Element.prototype].forEach(function (eventTargetObject) {

            var __removeEventListener = eventTargetObject.removeEventListener;

            eventTargetObject.removeEventListener = function (type, listener, useCapture) {

              var toRemove = [];

              useCapture = typeof useCapture == "undefined" ? false : useCapture;

              if (typeof listener == "function") {

                if (this.$$__observers && this.$$__observers[type]) {

                  this.$$__observers[type].forEach(function (stored) {
                    if (stored.type == type && stored.listener == listener && stored.useCapture == useCapture) {
                      toRemove.push(stored);
                      __removeEventListener.call(this, type, observerStore.callback, useCapture);
                    }
                  });

                  toRemove.forEach(function (observer) {
                    var index = this.$$__observers[type].indexOf(observer);
                    this.$$__observers[type].splice(index, 1);
                  });

                  if (this.$$__observers[type].length === 0) {
                    delete this.$$__observers[type];
                  }
                }
              }

              __removeEventListener.apply(this, arguments);
            };
          });
        }
      })());
    }
  };
});
System.register("lib/dirtycheck/xhr", ["lib/dirtycheck/dirtycheck"], function (_export) {
  "use strict";

  var dirtycheck;
  return {
    setters: [function (_libDirtycheckDirtycheck) {
      dirtycheck = _libDirtycheckDirtycheck["default"];
    }],
    execute: function () {
      _export("default", (function () {

        if (!Observer.hasObjectObserve) {
          (function (send) {
            XMLHttpRequest.prototype.send = function () {
              var readystatechange = this.onreadystatechange;
              var newReadyStateChange = function newReadyStateChange() {
                readystatechange();
                dirtycheck.executeHooks();
              };
              this.onreadystatechange = newReadyStateChange;
              send.apply(this, arguments);
            };
          })(XMLHttpRequest.prototype.send);
        }
      })());
    }
  };
});
System.register("lib/dirtycheck/timers", ["lib/dirtycheck/dirtycheck"], function (_export) {
  "use strict";

  var dirtycheck;
  return {
    setters: [function (_libDirtycheckDirtycheck) {
      dirtycheck = _libDirtycheckDirtycheck["default"];
    }],
    execute: function () {
      _export("default", (function () {

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
      })());
    }
  };
});
System.register('lib/polyfill/object', ['npm:babel-runtime@5.4.7/core-js/object/keys'], function (_export) {
  var _Object$keys;

  return {
    setters: [function (_npmBabelRuntime547CoreJsObjectKeys) {
      _Object$keys = _npmBabelRuntime547CoreJsObjectKeys['default'];
    }],
    execute: function () {
      'use strict';

      _export('default', (function () {

        // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
        if (!_Object$keys) {
          _Object$keys = (function () {
            'use strict';
            var hasOwnProperty = Object.prototype.hasOwnProperty,
                hasDontEnumBug = !({
              toString: null
            }).propertyIsEnumerable('toString'),
                dontEnums = ['toString', 'toLocaleString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'constructor'],
                dontEnumsLength = dontEnums.length;

            return function (obj) {
              if (typeof obj !== 'object' && (typeof obj !== 'function' || obj === null)) {
                throw new TypeError('Object.keys called on non-object');
              }

              var result = [],
                  prop,
                  i;

              for (prop in obj) {
                if (hasOwnProperty.call(obj, prop)) {
                  result.push(prop);
                }
              }

              if (hasDontEnumBug) {
                for (i = 0; i < dontEnumsLength; i++) {
                  if (hasOwnProperty.call(obj, dontEnums[i])) {
                    result.push(dontEnums[i]);
                  }
                }
              }
              return result;
            };
          })();
        }

        if (!Object.changes) {

          Object.changes = function (oldObject, object) {

            var added = {};
            var removed = {};
            var changed = {};

            var internalPrefix = '$$__';
            var prop;

            for (prop in oldObject) {
              if (prop.indexOf(internalPrefix) === 0) {
                continue;
              }
              var newValue = object[prop];
              if (newValue !== undefined && newValue === oldObject[prop]) {
                continue;
              }
              if (!(prop in object)) {
                removed[prop] = undefined;
                continue;
              }
              if (newValue !== oldObject[prop]) {
                changed[prop] = newValue;
              }
            }

            for (prop in object) {
              if (prop.indexOf(internalPrefix) === 0) {
                continue;
              }
              if (prop in oldObject) {
                continue;
              }
              added[prop] = object[prop];
            }

            if (Array.isArray(object) && object.length !== oldObject.length) {
              changed.length = object.length;
            }

            return {
              added: added,
              removed: removed,
              changed: changed
            };
          };
        }
      })());
    }
  };
});
System.register("lib/dirtycheck/dirtycheck", ["lib/utils"], function (_export) {
  "use strict";

  var utils;
  return {
    setters: [function (_libUtils) {
      utils = _libUtils["default"];
    }],
    execute: function () {
      _export("default", (function () {

        var $$__Hooks = [Platform.performMicrotaskCheckpoint];

        var maxCheckDuration = 300;
        var checkerTheshold = 60;
        var checkDuration = 0;

        var checkerStep = function checkerStep() {
          $$__Hooks.forEach(function (hook) {
            hook();
          });
        };

        var executeHooks = function executeHooks() {
          if (!Observer.hasObjectObserve) {
            checkerStep();
          }
        };

        return {

          executeHooks: executeHooks,

          wrapFunction: function wrapFunction(func) {
            return function () {
              func();
              executeHooks();
            };
          }

        };
      })());
    }
  };
});
System.register('lib/observe-js', ['npm:babel-runtime@5.4.7/core-js/object/create', 'npm:babel-runtime@5.4.7/core-js/object/get-own-property-names', 'npm:babel-runtime@5.4.7/core-js/object/define-property', 'npm:babel-runtime@5.4.7/core-js/object/get-own-property-descriptor', 'npm:babel-runtime@5.4.7/core-js/object/define-properties'], function (_export) {
  var _Object$create, _Object$getOwnPropertyNames, _Object$defineProperty, _Object$getOwnPropertyDescriptor, _Object$defineProperties;

  return {
    setters: [function (_npmBabelRuntime547CoreJsObjectCreate) {
      _Object$create = _npmBabelRuntime547CoreJsObjectCreate['default'];
    }, function (_npmBabelRuntime547CoreJsObjectGetOwnPropertyNames) {
      _Object$getOwnPropertyNames = _npmBabelRuntime547CoreJsObjectGetOwnPropertyNames['default'];
    }, function (_npmBabelRuntime547CoreJsObjectDefineProperty) {
      _Object$defineProperty = _npmBabelRuntime547CoreJsObjectDefineProperty['default'];
    }, function (_npmBabelRuntime547CoreJsObjectGetOwnPropertyDescriptor) {
      _Object$getOwnPropertyDescriptor = _npmBabelRuntime547CoreJsObjectGetOwnPropertyDescriptor['default'];
    }, function (_npmBabelRuntime547CoreJsObjectDefineProperties) {
      _Object$defineProperties = _npmBabelRuntime547CoreJsObjectDefineProperties['default'];
    }],
    execute: function () {
      /*
       * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
       * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
       * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
       * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
       * Code distributed by Google as part of the polymer project is also
       * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
       */

      'use strict';

      _export('default', (function (global) {

        'use strict';

        var testingExposeCycleCount = global.testingExposeCycleCount;

        // Detect and do basic sanity checking on Object/Array.observe.

        function detectObjectObserve() {
          if (typeof Object.observe !== 'function' || typeof Array.observe !== 'function') {
            return false;
          }

          var records = [];

          function callback(recs) {
            records = recs;
          }

          var test = {};
          var arr = [];
          Object.observe(test, callback);
          Array.observe(arr, callback);
          test.id = 1;
          test.id = 2;
          delete test.id;
          arr.push(1, 2);
          arr.length = 0;

          Object.deliverChangeRecords(callback);
          if (records.length !== 5) return false;

          if (records[0].type != 'add' || records[1].type != 'update' || records[2].type != 'delete' || records[3].type != 'splice' || records[4].type != 'splice') {
            return false;
          }

          Object.unobserve(test, callback);
          Array.unobserve(arr, callback);

          return true;
        }

        var hasObserve = detectObjectObserve();

        function detectEval() {
          // Don't test for eval if we're running in a Chrome App environment.
          // We check for APIs set that only exist in a Chrome App context.
          if (typeof chrome !== 'undefined' && chrome.app && chrome.app.runtime) {
            return false;
          }

          // Firefox OS Apps do not allow eval. This feature detection is very hacky
          // but even if some other platform adds support for this function this code
          // will continue to work.
          if (typeof navigator != 'undefined' && navigator.getDeviceStorage) {
            return false;
          }

          try {
            var f = new Function('', 'return true;');
            return f();
          } catch (ex) {
            return false;
          }
        }

        var hasEval = detectEval();

        function isIndex(s) {
          return +s === s >>> 0 && s !== '';
        }

        function toNumber(s) {
          return +s;
        }

        function isObject(obj) {
          return obj === Object(obj);
        }

        var numberIsNaN = global.Number.isNaN || function (value) {
          return typeof value === 'number' && global.isNaN(value);
        };

        function areSameValue(left, right) {
          if (left === right) return left !== 0 || 1 / left === 1 / right;
          if (numberIsNaN(left) && numberIsNaN(right)) return true;

          return left !== left && right !== right;
        }

        var createObject = '__proto__' in {} ? function (obj) {
          return obj;
        } : function (obj) {
          var proto = obj.__proto__;
          if (!proto) return obj;
          var newObject = _Object$create(proto);
          _Object$getOwnPropertyNames(obj).forEach(function (name) {
            _Object$defineProperty(newObject, name, _Object$getOwnPropertyDescriptor(obj, name));
          });
          return newObject;
        };

        var identStart = '[$_a-zA-Z]';
        var identPart = '[$_a-zA-Z0-9]';
        var identRegExp = new RegExp('^' + identStart + '+' + identPart + '*' + '$');

        function getPathCharType(char) {
          if (char === undefined) return 'eof';

          var code = char.charCodeAt(0);

          switch (code) {
            case 91: // [
            case 93: // ]
            case 46: // .
            case 34: // "
            case 39: // '
            case 48:
              // 0
              return char;

            case 95: // _
            case 36:
              // $
              return 'ident';

            case 32: // Space
            case 9: // Tab
            case 10: // Newline
            case 13: // Return
            case 160: // No-break space
            case 65279: // Byte Order Mark
            case 8232: // Line Separator
            case 8233:
              // Paragraph Separator
              return 'ws';
          }

          // a-z, A-Z
          if (97 <= code && code <= 122 || 65 <= code && code <= 90) return 'ident';

          // 1-9
          if (49 <= code && code <= 57) return 'number';

          return 'else';
        }

        var pathStateMachine = {
          'beforePath': {
            'ws': ['beforePath'],
            'ident': ['inIdent', 'append'],
            '[': ['beforeElement'],
            'eof': ['afterPath']
          },

          'inPath': {
            'ws': ['inPath'],
            '.': ['beforeIdent'],
            '[': ['beforeElement'],
            'eof': ['afterPath']
          },

          'beforeIdent': {
            'ws': ['beforeIdent'],
            'ident': ['inIdent', 'append']
          },

          'inIdent': {
            'ident': ['inIdent', 'append'],
            '0': ['inIdent', 'append'],
            'number': ['inIdent', 'append'],
            'ws': ['inPath', 'push'],
            '.': ['beforeIdent', 'push'],
            '[': ['beforeElement', 'push'],
            'eof': ['afterPath', 'push']
          },

          'beforeElement': {
            'ws': ['beforeElement'],
            '0': ['afterZero', 'append'],
            'number': ['inIndex', 'append'],
            '\'': ['inSingleQuote', 'append', ''],
            '"': ['inDoubleQuote', 'append', '']
          },

          'afterZero': {
            'ws': ['afterElement', 'push'],
            ']': ['inPath', 'push']
          },

          'inIndex': {
            '0': ['inIndex', 'append'],
            'number': ['inIndex', 'append'],
            'ws': ['afterElement'],
            ']': ['inPath', 'push']
          },

          'inSingleQuote': {
            '\'': ['afterElement'],
            'eof': ['error'],
            'else': ['inSingleQuote', 'append']
          },

          'inDoubleQuote': {
            '"': ['afterElement'],
            'eof': ['error'],
            'else': ['inDoubleQuote', 'append']
          },

          'afterElement': {
            'ws': ['afterElement'],
            ']': ['inPath', 'push']
          }
        };

        function noop() {}

        function parsePath(path) {
          var keys = [];
          var index = -1;
          var c,
              newChar,
              key,
              type,
              transition,
              action,
              typeMap,
              mode = 'beforePath';

          var actions = {
            push: function push() {
              if (key === undefined) return;

              keys.push(key);
              key = undefined;
            },

            append: function append() {
              if (key === undefined) key = newChar;else key += newChar;
            }
          };

          function maybeUnescapeQuote() {
            if (index >= path.length) return;

            var nextChar = path[index + 1];
            if (mode == 'inSingleQuote' && nextChar == '\'' || mode == 'inDoubleQuote' && nextChar == '"') {
              index++;
              newChar = nextChar;
              actions.append();
              return true;
            }
          }

          while (mode) {
            index++;
            c = path[index];

            if (c == '\\' && maybeUnescapeQuote(mode)) continue;

            type = getPathCharType(c);
            typeMap = pathStateMachine[mode];
            transition = typeMap[type] || typeMap['else'] || 'error';

            if (transition == 'error') return; // parse error;

            mode = transition[0];
            action = actions[transition[1]] || noop;
            newChar = transition[2] === undefined ? c : transition[2];
            action();

            if (mode === 'afterPath') {
              return keys;
            }
          }

          return; // parse error
        }

        function isIdent(s) {
          return identRegExp.test(s);
        }

        var constructorIsPrivate = {};

        function Path(parts, privateToken) {
          if (privateToken !== constructorIsPrivate) throw Error('Use Path.get to retrieve path objects');

          for (var i = 0; i < parts.length; i++) {
            this.push(String(parts[i]));
          }

          if (hasEval && this.length) {
            this.getValueFrom = this.compiledGetValueFromFn();
          }
        }

        // TODO(rafaelw): Make simple LRU cache
        var pathCache = {};

        function getPath(pathString) {
          if (pathString instanceof Path) return pathString;

          if (pathString == null || pathString.length == 0) pathString = '';

          if (typeof pathString != 'string') {
            if (isIndex(pathString.length)) {
              // Constructed with array-like (pre-parsed) keys
              return new Path(pathString, constructorIsPrivate);
            }

            pathString = String(pathString);
          }

          var path = pathCache[pathString];
          if (path) return path;

          var parts = parsePath(pathString);
          if (!parts) return invalidPath;

          var path = new Path(parts, constructorIsPrivate);
          pathCache[pathString] = path;
          return path;
        }

        Path.get = getPath;

        function formatAccessor(key) {
          if (isIndex(key)) {
            return '[' + key + ']';
          } else {
            return '["' + key.replace(/"/g, '\\"') + '"]';
          }
        }

        Path.prototype = createObject({
          __proto__: [],
          valid: true,

          toString: function toString() {
            var pathString = '';
            for (var i = 0; i < this.length; i++) {
              var key = this[i];
              if (isIdent(key)) {
                pathString += i ? '.' + key : key;
              } else {
                pathString += formatAccessor(key);
              }
            }

            return pathString;
          },

          getValueFrom: function getValueFrom(obj, directObserver) {
            for (var i = 0; i < this.length; i++) {
              if (obj == null) return;
              obj = obj[this[i]];
            }
            return obj;
          },

          iterateObjects: function iterateObjects(obj, observe) {
            for (var i = 0; i < this.length; i++) {
              if (i) obj = obj[this[i - 1]];
              if (!isObject(obj)) return;
              observe(obj, this[0]);
            }
          },

          compiledGetValueFromFn: function compiledGetValueFromFn() {
            var str = '';
            var pathString = 'obj';
            str += 'if (obj != null';
            var i = 0;
            var key;
            for (; i < this.length - 1; i++) {
              key = this[i];
              pathString += isIdent(key) ? '.' + key : formatAccessor(key);
              str += ' &&\n     ' + pathString + ' != null';
            }
            str += ')\n';

            var key = this[i];
            pathString += isIdent(key) ? '.' + key : formatAccessor(key);

            str += '  return ' + pathString + ';\nelse\n  return undefined;';
            return new Function('obj', str);
          },

          setValueFrom: function setValueFrom(obj, value) {
            if (!this.length) return false;

            for (var i = 0; i < this.length - 1; i++) {
              if (!isObject(obj)) return false;
              obj = obj[this[i]];
            }

            if (!isObject(obj)) return false;

            obj[this[i]] = value;
            return true;
          }
        });

        var invalidPath = new Path('', constructorIsPrivate);
        invalidPath.valid = false;
        invalidPath.getValueFrom = invalidPath.setValueFrom = function () {};

        var MAX_DIRTY_CHECK_CYCLES = 1000;

        function dirtyCheck(observer) {
          var cycles = 0;
          while (cycles < MAX_DIRTY_CHECK_CYCLES && observer.check_()) {
            cycles++;
          }
          if (testingExposeCycleCount) global.dirtyCheckCycleCount = cycles;

          return cycles > 0;
        }

        function objectIsEmpty(object) {
          for (var prop in object) return false;
          return true;
        }

        function diffIsEmpty(diff) {
          return objectIsEmpty(diff.added) && objectIsEmpty(diff.removed) && objectIsEmpty(diff.changed);
        }

        function diffObjectFromOldObject(object, oldObject) {
          var added = {};
          var removed = {};
          var changed = {};

          for (var prop in oldObject) {
            var newValue = object[prop];

            if (newValue !== undefined && newValue === oldObject[prop]) continue;

            if (!(prop in object)) {
              removed[prop] = undefined;
              continue;
            }

            if (newValue !== oldObject[prop]) changed[prop] = newValue;
          }

          for (var prop in object) {
            if (prop in oldObject) continue;

            added[prop] = object[prop];
          }

          if (Array.isArray(object) && object.length !== oldObject.length) changed.length = object.length;

          return {
            added: added,
            removed: removed,
            changed: changed
          };
        }

        var eomTasks = [];

        function runEOMTasks() {
          if (!eomTasks.length) return false;

          for (var i = 0; i < eomTasks.length; i++) {
            eomTasks[i]();
          }
          eomTasks.length = 0;
          return true;
        }

        var runEOM = hasObserve ? (function () {
          var eomObj = {
            pingPong: true
          };
          var eomRunScheduled = false;

          Object.observe(eomObj, function () {
            runEOMTasks();
            eomRunScheduled = false;
          });

          return function (fn) {
            eomTasks.push(fn);
            if (!eomRunScheduled) {
              eomRunScheduled = true;
              eomObj.pingPong = !eomObj.pingPong;
            }
          };
        })() : (function () {
          return function (fn) {
            eomTasks.push(fn);
          };
        })();

        var observedObjectCache = [];

        function newObservedObject() {
          var observer;
          var object;
          var discardRecords = false;
          var first = true;

          function callback(records) {
            if (observer && observer.state_ === OPENED && !discardRecords) observer.check_(records);
          }

          return {
            open: function open(obs) {
              if (observer) throw Error('ObservedObject in use');

              if (!first) Object.deliverChangeRecords(callback);

              observer = obs;
              first = false;
            },
            observe: function observe(obj, arrayObserve) {
              object = obj;
              if (arrayObserve) Array.observe(object, callback);else Object.observe(object, callback);
            },
            deliver: function deliver(discard) {
              discardRecords = discard;
              Object.deliverChangeRecords(callback);
              discardRecords = false;
            },
            close: function close() {
              observer = undefined;
              Object.unobserve(object, callback);
              observedObjectCache.push(this);
            }
          };
        }

        /*
         * The observedSet abstraction is a perf optimization which reduces the total
         * number of Object.observe observations of a set of objects. The idea is that
         * groups of Observers will have some object dependencies in common and this
         * observed set ensures that each object in the transitive closure of
         * dependencies is only observed once. The observedSet acts as a write barrier
         * such that whenever any change comes through, all Observers are checked for
         * changed values.
         *
         * Note that this optimization is explicitly moving work from setup-time to
         * change-time.
         *
         * TODO(rafaelw): Implement "garbage collection". In order to move work off
         * the critical path, when Observers are closed, their observed objects are
         * not Object.unobserve(d). As a result, it's possible that if the observedSet
         * is kept open, but some Observers have been closed, it could cause "leaks"
         * (prevent otherwise collectable objects from being collected). At some
         * point, we should implement incremental "gc" which keeps a list of
         * observedSets which may need clean-up and does small amounts of cleanup on a
         * timeout until all is clean.
         */

        function getObservedObject(observer, object, arrayObserve) {
          var dir = observedObjectCache.pop() || newObservedObject();
          dir.open(observer);
          dir.observe(object, arrayObserve);
          return dir;
        }

        var observedSetCache = [];

        function newObservedSet() {
          var observerCount = 0;
          var observers = [];
          var objects = [];
          var rootObj;
          var rootObjProps;

          function observe(obj, prop) {
            if (!obj) return;

            if (obj === rootObj) rootObjProps[prop] = true;

            if (objects.indexOf(obj) < 0) {
              objects.push(obj);
              Object.observe(obj, callback);
            }

            observe(Object.getPrototypeOf(obj), prop);
          }

          function allRootObjNonObservedProps(recs) {
            for (var i = 0; i < recs.length; i++) {
              var rec = recs[i];
              if (rec.object !== rootObj || rootObjProps[rec.name] || rec.type === 'setPrototype') {
                return false;
              }
            }
            return true;
          }

          function callback(recs) {
            if (allRootObjNonObservedProps(recs)) return;

            var observer;
            for (var i = 0; i < observers.length; i++) {
              observer = observers[i];
              if (observer.state_ == OPENED) {
                observer.iterateObjects_(observe);
              }
            }

            for (var i = 0; i < observers.length; i++) {
              observer = observers[i];
              if (observer.state_ == OPENED) {
                observer.check_();
              }
            }
          }

          var record = {
            object: undefined,
            objects: objects,
            open: function open(obs, object) {
              if (!rootObj) {
                rootObj = object;
                rootObjProps = {};
              }

              observers.push(obs);
              observerCount++;
              obs.iterateObjects_(observe);
            },
            close: function close(obs) {
              observerCount--;
              if (observerCount > 0) {
                return;
              }

              for (var i = 0; i < objects.length; i++) {
                Object.unobserve(objects[i], callback);
                Observer.unobservedCount++;
              }

              observers.length = 0;
              objects.length = 0;
              rootObj = undefined;
              rootObjProps = undefined;
              observedSetCache.push(this);
            }
          };

          return record;
        }

        var lastObservedSet;

        function getObservedSet(observer, obj) {
          if (!lastObservedSet || lastObservedSet.object !== obj) {
            lastObservedSet = observedSetCache.pop() || newObservedSet();
            lastObservedSet.object = obj;
          }
          lastObservedSet.open(observer, obj);
          return lastObservedSet;
        }

        var UNOPENED = 0;
        var OPENED = 1;
        var CLOSED = 2;
        var RESETTING = 3;

        var nextObserverId = 1;

        function Observer() {
          this.state_ = UNOPENED;
          this.callback_ = undefined;
          this.target_ = undefined; // TODO(rafaelw): Should be WeakRef
          this.directObserver_ = undefined;
          this.value_ = undefined;
          this.id_ = nextObserverId++;
        }

        Observer.prototype = {
          open: function open(callback, target) {
            if (this.state_ != UNOPENED) throw Error('Observer has already been opened.');

            addToAll(this);
            this.callback_ = callback;
            this.target_ = target;
            this.connect_();
            this.state_ = OPENED;
            return this.value_;
          },

          close: function close() {
            if (this.state_ != OPENED) return;

            removeFromAll(this);
            this.disconnect_();
            this.value_ = undefined;
            this.callback_ = undefined;
            this.target_ = undefined;
            this.state_ = CLOSED;
          },

          deliver: function deliver() {
            if (this.state_ != OPENED) return;

            dirtyCheck(this);
          },

          report_: function report_(changes) {
            try {
              this.callback_.apply(this.target_, changes);
            } catch (ex) {
              Observer._errorThrownDuringCallback = true;
              console.error('Exception caught during observer callback: ' + (ex.stack || ex));
            }
          },

          discardChanges: function discardChanges() {
            this.check_(undefined, true);
            return this.value_;
          }
        };

        var collectObservers = !hasObserve;
        var allObservers;
        Observer._allObserversCount = 0;

        if (collectObservers) {
          allObservers = [];
        }

        function addToAll(observer) {
          Observer._allObserversCount++;
          if (!collectObservers) return;

          allObservers.push(observer);
        }

        function removeFromAll(observer) {
          Observer._allObserversCount--;
        }

        var runningMicrotaskCheckpoint = false;

        global.Platform = global.Platform || {};

        global.Platform.performMicrotaskCheckpoint = function () {
          if (runningMicrotaskCheckpoint) return;

          if (!collectObservers) return;

          runningMicrotaskCheckpoint = true;

          var cycles = 0;
          var anyChanged, toCheck;

          do {
            cycles++;
            toCheck = allObservers;
            allObservers = [];
            anyChanged = false;

            for (var i = 0; i < toCheck.length; i++) {
              var observer = toCheck[i];
              if (observer.state_ != OPENED) continue;

              if (observer.check_()) anyChanged = true;

              allObservers.push(observer);
            }
            if (runEOMTasks()) anyChanged = true;
          } while (cycles < MAX_DIRTY_CHECK_CYCLES && anyChanged);

          if (testingExposeCycleCount) global.dirtyCheckCycleCount = cycles;

          runningMicrotaskCheckpoint = false;
        };

        if (collectObservers) {
          global.Platform.clearObservers = function () {
            allObservers = [];
          };
        }

        function ObjectObserver(object) {
          Observer.call(this);
          this.value_ = object;
          this.oldObject_ = undefined;
        }

        ObjectObserver.prototype = createObject({
          __proto__: Observer.prototype,

          arrayObserve: false,

          connect_: function connect_(callback, target) {
            if (hasObserve) {
              this.directObserver_ = getObservedObject(this, this.value_, this.arrayObserve);
            } else {
              this.oldObject_ = this.copyObject(this.value_);
            }
          },

          copyObject: function copyObject(object) {
            var copy = Array.isArray(object) ? [] : {};
            for (var prop in object) {
              copy[prop] = object[prop];
            };
            if (Array.isArray(object)) copy.length = object.length;
            return copy;
          },

          check_: function check_(changeRecords, skipChanges) {
            var diff;
            var oldValues;
            if (hasObserve) {
              if (!changeRecords) return false;

              oldValues = {};
              diff = diffObjectFromChangeRecords(this.value_, changeRecords, oldValues);
            } else {
              oldValues = this.oldObject_;
              diff = diffObjectFromOldObject(this.value_, this.oldObject_);
            }

            if (diffIsEmpty(diff)) return false;

            if (!hasObserve) this.oldObject_ = this.copyObject(this.value_);

            this.report_([diff.added || {}, diff.removed || {}, diff.changed || {}, function (property) {
              return oldValues[property];
            }]);

            return true;
          },

          disconnect_: function disconnect_() {
            if (hasObserve) {
              this.directObserver_.close();
              this.directObserver_ = undefined;
            } else {
              this.oldObject_ = undefined;
            }
          },

          deliver: function deliver() {
            if (this.state_ != OPENED) return;

            if (hasObserve) this.directObserver_.deliver(false);else dirtyCheck(this);
          },

          discardChanges: function discardChanges() {
            if (this.directObserver_) this.directObserver_.deliver(true);else this.oldObject_ = this.copyObject(this.value_);

            return this.value_;
          }
        });

        function ArrayObserver(array) {
          if (!Array.isArray(array)) throw Error('Provided object is not an Array');
          ObjectObserver.call(this, array);
        }

        ArrayObserver.prototype = createObject({

          __proto__: ObjectObserver.prototype,

          arrayObserve: true,

          copyObject: function copyObject(arr) {
            return arr.slice();
          },

          check_: function check_(changeRecords) {
            var splices;
            if (hasObserve) {
              if (!changeRecords) return false;
              splices = projectArraySplices(this.value_, changeRecords);
            } else {
              splices = calcSplices(this.value_, 0, this.value_.length, this.oldObject_, 0, this.oldObject_.length);
            }

            if (!splices || !splices.length) return false;

            if (!hasObserve) this.oldObject_ = this.copyObject(this.value_);

            this.report_([splices]);
            return true;
          }
        });

        ArrayObserver.applySplices = function (previous, current, splices) {
          splices.forEach(function (splice) {
            var spliceArgs = [splice.index, splice.removed.length];
            var addIndex = splice.index;
            while (addIndex < splice.index + splice.addedCount) {
              spliceArgs.push(current[addIndex]);
              addIndex++;
            }

            Array.prototype.splice.apply(previous, spliceArgs);
          });
        };

        function PathObserver(object, path) {
          Observer.call(this);

          this.object_ = object;
          this.path_ = getPath(path);
          this.directObserver_ = undefined;
        }

        PathObserver.prototype = createObject(_Object$defineProperties({
          __proto__: Observer.prototype,

          connect_: function connect_() {
            if (hasObserve) this.directObserver_ = getObservedSet(this, this.object_);

            this.check_(undefined, true);
          },

          disconnect_: function disconnect_() {
            this.value_ = undefined;

            if (this.directObserver_) {
              this.directObserver_.close(this);
              this.directObserver_ = undefined;
            }
          },

          iterateObjects_: function iterateObjects_(observe) {
            this.path_.iterateObjects(this.object_, observe);
          },

          check_: function check_(changeRecords, skipChanges) {
            var oldValue = this.value_;
            this.value_ = this.path_.getValueFrom(this.object_);
            if (skipChanges || areSameValue(this.value_, oldValue)) return false;

            this.report_([this.value_, oldValue, this]);
            return true;
          },

          setValue: function setValue(newValue) {
            if (this.path_) this.path_.setValueFrom(this.object_, newValue);
          }
        }, {
          path: {
            get: function () {
              return this.path_;
            },
            configurable: true,
            enumerable: true
          }
        }));

        function CompoundObserver(reportChangesOnOpen) {
          Observer.call(this);

          this.reportChangesOnOpen_ = reportChangesOnOpen;
          this.value_ = [];
          this.directObserver_ = undefined;
          this.observed_ = [];
        }

        var observerSentinel = {};

        CompoundObserver.prototype = createObject({
          __proto__: Observer.prototype,

          connect_: function connect_() {
            if (hasObserve) {
              var object;
              var needsDirectObserver = false;
              for (var i = 0; i < this.observed_.length; i += 2) {
                object = this.observed_[i];
                if (object !== observerSentinel) {
                  needsDirectObserver = true;
                  break;
                }
              }

              if (needsDirectObserver) this.directObserver_ = getObservedSet(this, object);
            }

            this.check_(undefined, !this.reportChangesOnOpen_);
          },

          disconnect_: function disconnect_() {
            for (var i = 0; i < this.observed_.length; i += 2) {
              if (this.observed_[i] === observerSentinel) this.observed_[i + 1].close();
            }
            this.observed_.length = 0;
            this.value_.length = 0;

            if (this.directObserver_) {
              this.directObserver_.close(this);
              this.directObserver_ = undefined;
            }
          },

          addPath: function addPath(object, path) {
            if (this.state_ != UNOPENED && this.state_ != RESETTING) throw Error('Cannot add paths once started.');

            var path = getPath(path);
            this.observed_.push(object, path);
            if (!this.reportChangesOnOpen_) return;
            var index = this.observed_.length / 2 - 1;
            this.value_[index] = path.getValueFrom(object);
          },

          addObserver: function addObserver(observer) {
            if (this.state_ != UNOPENED && this.state_ != RESETTING) throw Error('Cannot add observers once started.');

            this.observed_.push(observerSentinel, observer);
            if (!this.reportChangesOnOpen_) return;
            var index = this.observed_.length / 2 - 1;
            this.value_[index] = observer.open(this.deliver, this);
          },

          startReset: function startReset() {
            if (this.state_ != OPENED) throw Error('Can only reset while open');

            this.state_ = RESETTING;
            this.disconnect_();
          },

          finishReset: function finishReset() {
            if (this.state_ != RESETTING) throw Error('Can only finishReset after startReset');
            this.state_ = OPENED;
            this.connect_();

            return this.value_;
          },

          iterateObjects_: function iterateObjects_(observe) {
            var object;
            for (var i = 0; i < this.observed_.length; i += 2) {
              object = this.observed_[i];
              if (object !== observerSentinel) this.observed_[i + 1].iterateObjects(object, observe);
            }
          },

          check_: function check_(changeRecords, skipChanges) {
            var oldValues;
            for (var i = 0; i < this.observed_.length; i += 2) {
              var object = this.observed_[i];
              var path = this.observed_[i + 1];
              var value;
              if (object === observerSentinel) {
                var observable = path;
                value = this.state_ === UNOPENED ? observable.open(this.deliver, this) : observable.discardChanges();
              } else {
                value = path.getValueFrom(object);
              }

              if (skipChanges) {
                this.value_[i / 2] = value;
                continue;
              }

              if (areSameValue(value, this.value_[i / 2])) continue;

              oldValues = oldValues || [];
              oldValues[i / 2] = this.value_[i / 2];
              this.value_[i / 2] = value;
            }

            if (!oldValues) return false;

            // TODO(rafaelw): Having observed_ as the third callback arg here is
            // pretty lame API. Fix.
            this.report_([this.value_, oldValues, this.observed_]);
            return true;
          }
        });

        function identFn(value) {
          return value;
        }

        function ObserverTransform(observable, getValueFn, setValueFn, dontPassThroughSet) {
          this.callback_ = undefined;
          this.target_ = undefined;
          this.value_ = undefined;
          this.observable_ = observable;
          this.getValueFn_ = getValueFn || identFn;
          this.setValueFn_ = setValueFn || identFn;
          // TODO(rafaelw): This is a temporary hack. PolymerExpressions needs this
          // at the moment because of a bug in it's dependency tracking.
          this.dontPassThroughSet_ = dontPassThroughSet;
        }

        ObserverTransform.prototype = {
          open: function open(callback, target) {
            this.callback_ = callback;
            this.target_ = target;
            this.value_ = this.getValueFn_(this.observable_.open(this.observedCallback_, this));
            return this.value_;
          },

          observedCallback_: function observedCallback_(value) {
            value = this.getValueFn_(value);
            if (areSameValue(value, this.value_)) return;
            var oldValue = this.value_;
            this.value_ = value;
            this.callback_.call(this.target_, this.value_, oldValue);
          },

          discardChanges: function discardChanges() {
            this.value_ = this.getValueFn_(this.observable_.discardChanges());
            return this.value_;
          },

          deliver: function deliver() {
            return this.observable_.deliver();
          },

          setValue: function setValue(value) {
            value = this.setValueFn_(value);
            if (!this.dontPassThroughSet_ && this.observable_.setValue) return this.observable_.setValue(value);
          },

          close: function close() {
            if (this.observable_) this.observable_.close();
            this.callback_ = undefined;
            this.target_ = undefined;
            this.observable_ = undefined;
            this.value_ = undefined;
            this.getValueFn_ = undefined;
            this.setValueFn_ = undefined;
          }
        };

        var expectedRecordTypes = {
          add: true,
          update: true,
          'delete': true
        };

        function diffObjectFromChangeRecords(object, changeRecords, oldValues) {
          var added = {};
          var removed = {};

          for (var i = 0; i < changeRecords.length; i++) {
            var record = changeRecords[i];
            if (!expectedRecordTypes[record.type]) {
              console.error('Unknown changeRecord type: ' + record.type);
              console.error(record);
              continue;
            }

            if (!(record.name in oldValues)) oldValues[record.name] = record.oldValue;

            if (record.type == 'update') continue;

            if (record.type == 'add') {
              if (record.name in removed) delete removed[record.name];else added[record.name] = true;

              continue;
            }

            // type = 'delete'
            if (record.name in added) {
              delete added[record.name];
              delete oldValues[record.name];
            } else {
              removed[record.name] = true;
            }
          }

          for (var prop in added) added[prop] = object[prop];

          for (var prop in removed) removed[prop] = undefined;

          var changed = {};
          for (var prop in oldValues) {
            if (prop in added || prop in removed) continue;

            var newValue = object[prop];
            if (oldValues[prop] !== newValue) changed[prop] = newValue;
          }

          return {
            added: added,
            removed: removed,
            changed: changed
          };
        }

        function newSplice(index, removed, addedCount) {
          return {
            index: index,
            removed: removed,
            addedCount: addedCount
          };
        }

        var EDIT_LEAVE = 0;
        var EDIT_UPDATE = 1;
        var EDIT_ADD = 2;
        var EDIT_DELETE = 3;

        function ArraySplice() {}

        ArraySplice.prototype = {

          // Note: This function is *based* on the computation of the Levenshtein
          // "edit" distance. The one change is that "updates" are treated as two
          // edits - not one. With Array splices, an update is really a delete
          // followed by an add. By retaining this, we optimize for "keeping" the
          // maximum array items in the original array. For example:
          //
          //   'xxxx123' -> '123yyyy'
          //
          // With 1-edit updates, the shortest path would be just to update all seven
          // characters. With 2-edit updates, we delete 4, leave 3, and add 4. This
          // leaves the substring '123' intact.
          calcEditDistances: function calcEditDistances(current, currentStart, currentEnd, old, oldStart, oldEnd) {
            // "Deletion" columns
            var rowCount = oldEnd - oldStart + 1;
            var columnCount = currentEnd - currentStart + 1;
            var distances = new Array(rowCount);

            // "Addition" rows. Initialize null column.
            for (var i = 0; i < rowCount; i++) {
              distances[i] = new Array(columnCount);
              distances[i][0] = i;
            }

            // Initialize null row
            for (var j = 0; j < columnCount; j++) distances[0][j] = j;

            for (var i = 1; i < rowCount; i++) {
              for (var j = 1; j < columnCount; j++) {
                if (this.equals(current[currentStart + j - 1], old[oldStart + i - 1])) distances[i][j] = distances[i - 1][j - 1];else {
                  var north = distances[i - 1][j] + 1;
                  var west = distances[i][j - 1] + 1;
                  distances[i][j] = north < west ? north : west;
                }
              }
            }

            return distances;
          },

          // This starts at the final weight, and walks "backward" by finding
          // the minimum previous weight recursively until the origin of the weight
          // matrix.
          spliceOperationsFromEditDistances: function spliceOperationsFromEditDistances(distances) {
            var i = distances.length - 1;
            var j = distances[0].length - 1;
            var current = distances[i][j];
            var edits = [];
            while (i > 0 || j > 0) {
              if (i == 0) {
                edits.push(EDIT_ADD);
                j--;
                continue;
              }
              if (j == 0) {
                edits.push(EDIT_DELETE);
                i--;
                continue;
              }
              var northWest = distances[i - 1][j - 1];
              var west = distances[i - 1][j];
              var north = distances[i][j - 1];

              var min;
              if (west < north) min = west < northWest ? west : northWest;else min = north < northWest ? north : northWest;

              if (min == northWest) {
                if (northWest == current) {
                  edits.push(EDIT_LEAVE);
                } else {
                  edits.push(EDIT_UPDATE);
                  current = northWest;
                }
                i--;
                j--;
              } else if (min == west) {
                edits.push(EDIT_DELETE);
                i--;
                current = west;
              } else {
                edits.push(EDIT_ADD);
                j--;
                current = north;
              }
            }

            edits.reverse();
            return edits;
          },

          /**
           * Splice Projection functions:
           *
           * A splice map is a representation of how a previous array of items
           * was transformed into a new array of items. Conceptually it is a list of
           * tuples of
           *
           *   <index, removed, addedCount>
           *
           * which are kept in ascending index order of. The tuple represents that at
           * the |index|, |removed| sequence of items were removed, and counting forward
           * from |index|, |addedCount| items were added.
           */

          /**
           * Lacking individual splice mutation information, the minimal set of
           * splices can be synthesized given the previous state and final state of an
           * array. The basic approach is to calculate the edit distance matrix and
           * choose the shortest path through it.
           *
           * Complexity: O(l * p)
           *   l: The length of the current array
           *   p: The length of the old array
           */
          calcSplices: function calcSplices(current, currentStart, currentEnd, old, oldStart, oldEnd) {
            var prefixCount = 0;
            var suffixCount = 0;

            var minLength = Math.min(currentEnd - currentStart, oldEnd - oldStart);
            if (currentStart == 0 && oldStart == 0) prefixCount = this.sharedPrefix(current, old, minLength);

            if (currentEnd == current.length && oldEnd == old.length) suffixCount = this.sharedSuffix(current, old, minLength - prefixCount);

            currentStart += prefixCount;
            oldStart += prefixCount;
            currentEnd -= suffixCount;
            oldEnd -= suffixCount;

            if (currentEnd - currentStart == 0 && oldEnd - oldStart == 0) return [];

            if (currentStart == currentEnd) {
              var splice = newSplice(currentStart, [], 0);
              while (oldStart < oldEnd) splice.removed.push(old[oldStart++]);

              return [splice];
            } else if (oldStart == oldEnd) return [newSplice(currentStart, [], currentEnd - currentStart)];

            var ops = this.spliceOperationsFromEditDistances(this.calcEditDistances(current, currentStart, currentEnd, old, oldStart, oldEnd));

            var splice = undefined;
            var splices = [];
            var index = currentStart;
            var oldIndex = oldStart;
            for (var i = 0; i < ops.length; i++) {
              switch (ops[i]) {
                case EDIT_LEAVE:
                  if (splice) {
                    splices.push(splice);
                    splice = undefined;
                  }

                  index++;
                  oldIndex++;
                  break;
                case EDIT_UPDATE:
                  if (!splice) splice = newSplice(index, [], 0);

                  splice.addedCount++;
                  index++;

                  splice.removed.push(old[oldIndex]);
                  oldIndex++;
                  break;
                case EDIT_ADD:
                  if (!splice) splice = newSplice(index, [], 0);

                  splice.addedCount++;
                  index++;
                  break;
                case EDIT_DELETE:
                  if (!splice) splice = newSplice(index, [], 0);

                  splice.removed.push(old[oldIndex]);
                  oldIndex++;
                  break;
              }
            }

            if (splice) {
              splices.push(splice);
            }
            return splices;
          },

          sharedPrefix: function sharedPrefix(current, old, searchLength) {
            for (var i = 0; i < searchLength; i++) if (!this.equals(current[i], old[i])) return i;
            return searchLength;
          },

          sharedSuffix: function sharedSuffix(current, old, searchLength) {
            var index1 = current.length;
            var index2 = old.length;
            var count = 0;
            while (count < searchLength && this.equals(current[--index1], old[--index2])) count++;

            return count;
          },

          calculateSplices: function calculateSplices(current, previous) {
            return this.calcSplices(current, 0, current.length, previous, 0, previous.length);
          },

          equals: function equals(currentValue, previousValue) {
            return currentValue === previousValue;
          }
        };

        var arraySplice = new ArraySplice();

        function calcSplices(current, currentStart, currentEnd, old, oldStart, oldEnd) {
          return arraySplice.calcSplices(current, currentStart, currentEnd, old, oldStart, oldEnd);
        }

        function intersect(start1, end1, start2, end2) {
          // Disjoint
          if (end1 < start2 || end2 < start1) return -1;

          // Adjacent
          if (end1 == start2 || end2 == start1) return 0;

          // Non-zero intersect, span1 first
          if (start1 < start2) {
            if (end1 < end2) return end1 - start2; // Overlap
            else return end2 - start2; // Contained
          } else {
            // Non-zero intersect, span2 first
            if (end2 < end1) return end2 - start1; // Overlap
            else return end1 - start1; // Contained
          }
        }

        function mergeSplice(splices, index, removed, addedCount) {

          var splice = newSplice(index, removed, addedCount);

          var inserted = false;
          var insertionOffset = 0;

          for (var i = 0; i < splices.length; i++) {
            var current = splices[i];
            current.index += insertionOffset;

            if (inserted) continue;

            var intersectCount = intersect(splice.index, splice.index + splice.removed.length, current.index, current.index + current.addedCount);

            if (intersectCount >= 0) {
              // Merge the two splices

              splices.splice(i, 1);
              i--;

              insertionOffset -= current.addedCount - current.removed.length;

              splice.addedCount += current.addedCount - intersectCount;
              var deleteCount = splice.removed.length + current.removed.length - intersectCount;

              if (!splice.addedCount && !deleteCount) {
                // merged splice is a noop. discard.
                inserted = true;
              } else {
                var removed = current.removed;

                if (splice.index < current.index) {
                  // some prefix of splice.removed is prepended to current.removed.
                  var prepend = splice.removed.slice(0, current.index - splice.index);
                  Array.prototype.push.apply(prepend, removed);
                  removed = prepend;
                }

                if (splice.index + splice.removed.length > current.index + current.addedCount) {
                  // some suffix of splice.removed is appended to current.removed.
                  var append = splice.removed.slice(current.index + current.addedCount - splice.index);
                  Array.prototype.push.apply(removed, append);
                }

                splice.removed = removed;
                if (current.index < splice.index) {
                  splice.index = current.index;
                }
              }
            } else if (splice.index < current.index) {
              // Insert splice here.

              inserted = true;

              splices.splice(i, 0, splice);
              i++;

              var offset = splice.addedCount - splice.removed.length;
              current.index += offset;
              insertionOffset += offset;
            }
          }

          if (!inserted) splices.push(splice);
        }

        function createInitialSplices(array, changeRecords) {
          var splices = [];

          for (var i = 0; i < changeRecords.length; i++) {
            var record = changeRecords[i];
            switch (record.type) {
              case 'splice':
                mergeSplice(splices, record.index, record.removed.slice(), record.addedCount);
                break;
              case 'add':
              case 'update':
              case 'delete':
                if (!isIndex(record.name)) continue;
                var index = toNumber(record.name);
                if (index < 0) continue;
                mergeSplice(splices, index, [record.oldValue], 1);
                break;
              default:
                console.error('Unexpected record type: ' + JSON.stringify(record));
                break;
            }
          }

          return splices;
        }

        function projectArraySplices(array, changeRecords) {
          var splices = [];

          createInitialSplices(array, changeRecords).forEach(function (splice) {
            if (splice.addedCount == 1 && splice.removed.length == 1) {
              if (splice.removed[0] !== array[splice.index]) splices.push(splice);

              return;
            };

            splices = splices.concat(calcSplices(array, splice.index, splice.index + splice.addedCount, splice.removed, 0, splice.removed.length));
          });

          return splices;
        }

        global.Observer = Observer;
        global.Observer.runEOM_ = runEOM;
        global.Observer.observerSentinel_ = observerSentinel; // for testing.
        global.Observer.hasObjectObserve = hasObserve;
        global.ArrayObserver = ArrayObserver;
        global.ArrayObserver.calculateSplices = function (current, previous) {
          return arraySplice.calculateSplices(current, previous);
        };

        global.ArraySplice = ArraySplice;
        global.ObjectObserver = ObjectObserver;
        global.PathObserver = PathObserver;
        global.CompoundObserver = CompoundObserver;
        global.Path = Path;
        global.ObserverTransform = ObserverTransform;
      })(typeof global !== 'undefined' && global && typeof module !== 'undefined' && module ? global : undefined || window));
    }
  };
});
System.register("lib/objectobserve", ["npm:babel-runtime@5.4.7/core-js/object/keys", "lib/observe-js", "lib/dirtycheck/dirtycheck", "lib/dirtycheck/animationFrame", "lib/dirtycheck/eventListener", "lib/dirtycheck/xhr", "lib/dirtycheck/timers", "lib/polyfill/object", "lib/utils"], function (_export) {
  var _Object$keys, observejs, dirtycheck, animationFrame, eventListener, xhr, timers, objectPolyfills, utils;

  return {
    setters: [function (_npmBabelRuntime547CoreJsObjectKeys) {
      _Object$keys = _npmBabelRuntime547CoreJsObjectKeys["default"];
    }, function (_libObserveJs) {
      observejs = _libObserveJs["default"];
    }, function (_libDirtycheckDirtycheck) {
      dirtycheck = _libDirtycheckDirtycheck["default"];
    }, function (_libDirtycheckAnimationFrame) {
      animationFrame = _libDirtycheckAnimationFrame["default"];
    }, function (_libDirtycheckEventListener) {
      eventListener = _libDirtycheckEventListener["default"];
    }, function (_libDirtycheckXhr) {
      xhr = _libDirtycheckXhr["default"];
    }, function (_libDirtycheckTimers) {
      timers = _libDirtycheckTimers["default"];
    }, function (_libPolyfillObject) {
      objectPolyfills = _libPolyfillObject["default"];
    }, function (_libUtils) {
      utils = _libUtils["default"];
    }],
    execute: function () {
      /**
       * Normalizing observe-js behaviour to fit the spec of Object.observe
       *
       * @author Romeo Kenfack Tsakem <tsakem@yahoo.fr>
       *
       * Browser support : from IE9
       */
      "use strict";

      _export("default", (function () {

        if (!Observer.hasObjectObserve) {

          if (!Object.observe) {

            Object.getNotifier = function (targetObject) {
              return {
                notify: function notify(notification) {
                  var observers = targetObject.$$__observers || {};
                  for (var observer in observers) {
                    observers[observer].callback.call(observers[observer].scope, notification);
                  }
                }
              };
            };

            var isRecordValid = function isRecordValid(type, acceptList) {
              return acceptList.length === 0 || acceptList.indexOf(type) != -1;
            };

            Object.observe = function (model, callback, acceptList) {

              acceptList = acceptList || [];

              if (!model.$$__observers) {

                var internalCallback = null;
                var type = null;

                if (Array.isArray(model)) {

                  model.$$__observers = {
                    observer: new ArrayObserver(model),
                    listeners: [],
                    arrayCopy: JSON.parse(JSON.stringify(model)),
                    arrayLength: model.length
                  };

                  var i;
                  internalCallback = function (splice) {

                    var acceptList;
                    var changes = [];

                    model.$$__observers.listeners.forEach(function (listener) {

                      changes = [];
                      acceptList = listener.acceptList;

                      splice.forEach(function (spl) {

                        if (model.length < model.$$__observers.arrayLength) {

                          if (isRecordValid("update", acceptList)) {
                            for (i = spl.index; i < model.length; i++) {
                              changes[i - spl.index] = {
                                name: "" + i,
                                object: model,
                                oldValue: model.$$__observers.arrayCopy[i],
                                type: "update"
                              };
                            }
                          }

                          if (isRecordValid("delete", acceptList)) {
                            var removedStart = model.length;
                            spl.removed.forEach(function (removed, index) {
                              changes[changes.length] = {
                                name: "" + (removedStart + index),
                                object: model,
                                oldValue: model.$$__observers.arrayCopy[removedStart + index],
                                type: "delete"
                              };
                            });
                          }
                        } else if (model.length > model.$$__observers.arrayLength) {

                          if (isRecordValid("add", acceptList)) {
                            var offset = model.length - model.$$__observers.arrayLength;
                            for (i = model.$$__observers.arrayLength - 1; i <= model.length; i++) {
                              if (model[i] !== undefined) {
                                changes[changes.length] = {
                                  name: i + "",
                                  object: model,
                                  type: "add"
                                };
                              }
                            }
                          }
                        } else {

                          var changeStart = splice.index;
                          var type = null;
                          for (i = 0; i < spl.addedCount; i++) {
                            type = model[spl.index + i] === undefined ? "delete" : "update";
                            if (isRecordValid(type, acceptList)) {
                              changes[changes.length] = {
                                name: spl.index + i + "",
                                object: model,
                                oldValue: model.$$__observers.arrayCopy[spl.index + i],
                                type: type
                              };
                            }
                          }
                        }
                      });

                      if (isRecordValid("update", acceptList)) {
                        if (model.length != model.$$__observers.arrayLength) {
                          changes[changes.length] = {
                            name: "length",
                            object: model,
                            oldValue: model.$$__observers.arrayCopy.length,
                            type: "update"
                          };
                        }
                      }

                      listener.listener.call(this, changes);
                    });

                    dirtycheck.executeHooks();

                    if (model.$$__observers) {
                      model.$$__observers.arrayLength = model.length;
                      model.$$__observers.arrayCopy = JSON.parse(JSON.stringify(model));
                    }
                  };
                } else if (utils.isObject(model)) {

                  model.$$__observers = {
                    observer: new ObjectObserver(model),
                    listeners: []
                  };

                  internalCallback = function (added, removed, changed, getOldValueFn) {

                    var acceptList;
                    var changes = [];

                    model.$$__observers.listeners.forEach(function (listener) {

                      acceptList = listener.acceptList;
                      changes = [];

                      if (isRecordValid("add", acceptList)) {
                        _Object$keys(added).forEach(function (addedKey) {
                          changes[changes.length] = {
                            name: addedKey,
                            object: model,
                            type: "add"
                          };
                        });
                      }

                      if (isRecordValid("update", acceptList)) {
                        _Object$keys(changed).forEach(function (changedKey) {
                          changes[changes.length] = {
                            name: changedKey,
                            object: model,
                            oldValue: getOldValueFn(changedKey),
                            type: "update"
                          };
                        });
                      }

                      if (isRecordValid("delete", acceptList)) {
                        _Object$keys(removed).forEach(function (removedKey) {
                          changes[changes.length] = {
                            name: removedKey,
                            object: model,
                            oldValue: getOldValueFn(removedKey),
                            type: "delete"
                          };
                        });
                      }

                      listener.listener.call(this, changes);
                      dirtycheck.executeHooks();
                    });
                  };
                } else {

                  if (!utils.isDate(model)) {
                    throw new Error("TypeError: Object.observe cannot observe non-object");
                  }
                }

                if (internalCallback) {
                  model.$$__observers.observer.open(internalCallback);
                }
              }

              model.$$__observers.listeners.push({
                listener: callback,
                acceptList: acceptList
              });

              return model;
            };

            Object.unobserve = function (model, callback) {

              var toRemove = [];

              if (model.$$__observers && model.$$__observers.listeners && model.$$__observers.listeners.length > 0) {

                model.$$__observers.listeners.forEach(function (listener) {
                  if (listener.listener == callback) {
                    toRemove.push(listener);
                  }
                });

                toRemove.forEach(function (rm) {
                  var index = model.$$__observers.listeners.indexOf(rm);
                  model.$$__observers.listeners.splice(index, 1);
                });

                if (model.$$__observers.listeners.length === 0) {
                  model.$$__observers.observer.close();
                  delete model.$$__observers;
                }
              }

              return model;
            };
          }
        }
      })());
    }
  };
});
});
//# sourceMappingURL=objectobserve.js.map