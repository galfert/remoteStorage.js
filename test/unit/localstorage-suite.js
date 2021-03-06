if(typeof(define) !== 'function') {
  var define = require('amdefine')(module);
}
define(['requirejs'], function(requirejs) {
  var suites = [];

  var NODES_PREFIX = 'remotestorage:cache:nodes:';
  var CHANGES_PREFIX = 'remotestorage:cache:changes:';

  function assertNode(test, path, expected) {
    var node = JSON.parse(localStorage[NODES_PREFIX + path]);
    test.assertAnd(node, expected);
  }

  function assertChange(test, path, expected) {
    var change = JSON.parse(localStorage[CHANGES_PREFIX + path]);
    test.assertAnd(change, expected);
  }

  function assertNoChange(test, path) {
    test.assertTypeAnd(localStorage[CHANGES_PREFIX + path], 'undefined');
  }

  function assertHaveNodes(test, expected) {
    var haveNodes = [];
    var keys = Object.keys(localStorage), kl = keys.length;
    for(var i=0;i<kl;i++) {
      if(keys[i].substr(0, NODES_PREFIX.length) == NODES_PREFIX) {
        haveNodes.push(keys[i].substr(NODES_PREFIX.length));
      }
    }
    test.assertAnd(haveNodes, expected);
  }

  suites.push({
    name: "LocalStorage",
    desc: "localStorage caching layer",
    setup: function(env, test) {
      require('./lib/promising');
      global.RemoteStorage = function() {};
      require('./src/eventhandling');
      if(global.rs_eventhandling) {
        RemoteStorage.eventHandling = global.rs_eventhandling;
      } else {
        global.rs_eventhandling = RemoteStorage.eventHandling;
      }
      require('./src/localstorage');
      test.done();
    },

    beforeEach: function(env, test) {
      global.localStorage = {};

      env.ls = new RemoteStorage.LocalStorage();
      test.done();
    },

    tests: [

      {
        desc: "#get loads a node",
        run: function(env, test) {
          global.localStorage[NODES_PREFIX + '/foo'] = JSON.stringify({
            body: "bar", contentType: "text/plain", revision: "123"
          });
          env.ls.get('/foo').then(function(status, body, contentType, revision) {
            test.assertAnd(status, 200);
            test.assertAnd(body, "bar");
            test.assertAnd(contentType, "text/plain");
            test.assertAnd(revision, "123");
            test.done();
          });
        }
      },

      {
        desc: "#get yields 404 when it doesn't find a node",
        run: function(env, test) {
          env.ls.get('/bar').then(function(status) {
            test.assert(status, 404);
          });
        }
      },

      {
        desc: "#put yields 200",
        run: function(env, test) {
          env.ls.put('/foo', 'bar', 'text/plain').then(function(status) {
            test.assert(status, 200);
          });
        }
      },

      {
        desc: "#put creates a new node",
        run: function(env, test) {
          env.ls.put('/foo/bar/baz', 'bar', 'text/plain').then(function() {
            assertNode(test, '/foo/bar/baz', {
              body: 'bar',
              contentType: 'text/plain',
              path: '/foo/bar/baz'
            });
            test.done();
          });
        }
      },

      {
        desc: "#put updates parent directories",
        run: function(env, test) {
          env.ls.put('/foo/bar/baz', 'bar', 'text/plain').then(function() {

            assertNode(test, '/foo/bar/', {
              body: { baz: true },
              contentType: 'application/json',
              path: '/foo/bar/'
            });

            assertNode(test, '/foo/', {
              body: { 'bar/': true },
              contentType: 'application/json',
              path: '/foo/'
            });

            assertNode(test, '/', {
              body: { 'foo/': true },
              contentType: 'application/json',
              path: '/'
            });

            test.done();
          });
        }
      },

      {
        desc: "#put doesn't overwrite parent directories",
        run: function(env, test) {
          env.ls.put('/foo/bar/baz', 'bar', 'text/plain').then(function() {
            env.ls.put('/foo/bar/buz', 'bla', 'text/plain').then(function() {
              assertNode(test, '/foo/bar/', {
                body: { baz: true, buz: true },
                contentType: 'application/json',
                path: '/foo/bar/'
              });
              test.done();
            });
          });
        }
      },

      {
        desc: "#delete removes the node and empty parents",
        run: function(env, test) {
          env.ls.put('/foo/bar/baz', 'bar', 'text/plain').then(function() {
            assertHaveNodes(test, ['/foo/bar/baz', '/foo/bar/', '/foo/', '/']);
            env.ls.delete('/foo/bar/baz').then(function() {
              assertHaveNodes(test, []);

              test.done();
            });
          });
        }
      },

      {
        desc: "#delete doesn't remove non-empty parents",
        run: function(env, test) {
          env.ls.put('/foo/bar/baz', 'bar', 'text/plain').then(function() {
            env.ls.put('/foo/bla', 'blubb', 'text/plain').then(function() {
              env.ls.delete('/foo/bar/baz').then(function() {
                assertHaveNodes(test, ['/', '/foo/', '/foo/bla']);
                assertNode(test, '/foo/', {
                  body: { bla: true },
                  contentType: 'application/json',
                  path: '/foo/'
                });

                test.done();

              });
            });
          });
        }
      },

      {
        desc: "#put records a change for outgoing changes",
        run: function(env, test) {
          env.ls.put('/foo/bla', 'basdf', 'text/plain').then(function() {
            assertChange(test, '/foo/bla', {
              action: 'PUT',
              path: '/foo/bla'
            });
            test.done();
          });
        }
      },


      {
        desc: "#put doesn't record a change for incoming changes",
        run: function(env, test) {
          env.ls.put('/foo/bla', 'basdf', 'text/plain', true).then(function() {
            assertNoChange(test, '/foo/bla');
            test.done();
          });
        }
      },

      {
        desc: "#delete records a change for outgoing changes",
        run: function(env, test) {
          env.ls.put('/foo/bla', 'basdf', 'text/plain', true).then(function() {
            env.ls.delete('/foo/bla').then(function() {
              assertChange(test, '/foo/bla', {
                action: 'DELETE',
                path: '/foo/bla'
              });
              test.done();
            });
          });
        }
      },

      {
        desc: "#delete doesn't record a change for incoming chnages",
        run: function(env, test) {
          env.ls.put('/foo/bla', 'basfd', 'text/plain', true).then(function() {
            env.ls.delete('/foo/bla', true).then(function() {
              assertNoChange(test, '/foo/bla');
              test.done();
            });
          });
        }
      },

      {
        desc: "#put fires a 'change' with origin=window for outgoing changes",
        timeout: 250,
        run: function(env, test) {
          env.ls.on('change', function(event) {
            test.assert(event, {
              path: '/foo/bla',
              origin: 'window',
              oldValue: undefined,
              newValue: 'basdf'
            });
          })
          env.ls.put('/foo/bla', 'basdf', 'text/plain');
        }
      },

      {
        desc: "#put fires a 'change' with origin=remote for incoming changes",
        run: function(env, test) {
          env.ls.on('change', function(event) {
            test.assert(event, {
              path: '/foo/bla',
              origin: 'remote',
              oldValue: undefined,
              newValue: 'adsf'
            });
          });
          env.ls.put('/foo/bla', 'adsf', 'text/plain', true);
        }
      },

      {
        desc: "#put attaches the oldValue correctly for updates",
        run: function(env, test) {
          var i = 0;
          env.ls.on('change', function(event) {
            i++;
            if(i == 1) {
              test.assertAnd(event, {
                path: '/foo/bla',
                origin: 'remote',
                oldValue: undefined,
                newValue: 'basdf'
              });
            } else if(i == 2) {
              test.assertAnd(event, {
                path: '/foo/bla',
                origin: 'window',
                oldValue: 'basdf',
                newValue: 'fdsab'
              });
              setTimeout(function() {
                test.done();
              }, 0);

            } else {
              console.error("UNEXPECTED THIRD CHANGE EVENT");
              test.result(false);
            }
          });
          env.ls.put('/foo/bla', 'basdf', 'text/plain', true).then(function() {
            env.ls.put('/foo/bla', 'fdsab', 'text/plain');
          });
        }
      }

    ]
  });

  return suites;
});
