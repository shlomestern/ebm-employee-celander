/* A stand-in for Firebase, enough of it for the calendar to run against.
   Everything lives in one localStorage key and changes are shouted to the
   other tabs over a BroadcastChannel, so two instances behave like two
   phones on the same database. Nothing here talks to the internet. */
(function(){
  var KEY = "fakefb:store";
  var chan = null;
  try { chan = new BroadcastChannel("fakefb"); } catch(e){}

  function all(){
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
    catch(e){ return {}; }
  }
  function put(store){
    localStorage.setItem(KEY, JSON.stringify(store));
    if (chan) try { chan.postMessage(Date.now()); } catch(e){}
    fire();
  }

  /* Every live listener, re-run whenever anything changes. Crude and exactly
     right for a test: a hundred documents and a handful of watchers. */
  var live = [];
  function fire(){ live.slice().forEach(function(l){ try { l(); } catch(e){} }); }
  if (chan) chan.onmessage = function(){ fire(); };
  window.addEventListener("storage", function(e){ if (e.key === KEY) fire(); });

  function clone(v){ return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  /* The two sentinels the app uses. They are marked objects that set() and
     update() work out when they land. */
  var UNION = "__fake_union__", DELETE = "__fake_delete__";
  function applyValue(was, v){
    if (v && v.__fake === UNION){
      var list = Array.isArray(was) ? was.slice() : [];
      v.items.forEach(function(x){
        var seen = list.some(function(y){ return JSON.stringify(y) === JSON.stringify(x); });
        if (!seen) list.push(clone(x));
      });
      return list;
    }
    return clone(v);
  }
  function merge(into, patch){
    var out = {};
    Object.keys(into || {}).forEach(function(k){ out[k] = into[k]; });
    Object.keys(patch).forEach(function(k){
      var v = patch[k];
      if (v && v.__fake === DELETE){ delete out[k]; return; }
      out[k] = applyValue(out[k], v);
    });
    return out;
  }
  /* Firestore's update() understands "a.b" as a path into the document. */
  function deepSet(doc, path, v){
    var bits = path.split("."), at = doc;
    for (var i = 0; i < bits.length - 1; i++){
      if (typeof at[bits[i]] !== "object" || at[bits[i]] === null) at[bits[i]] = {};
      at = at[bits[i]];
    }
    var last = bits[bits.length - 1];
    if (v && v.__fake === DELETE) delete at[last];
    else at[last] = applyValue(at[last], v);
  }

  function snapOf(path){
    var d = all()[path];
    return {
      exists: d !== undefined,
      id: path.split("/").pop(),
      data: function(){ return clone(d); }
    };
  }

  function DocRef(path){
    this.path = path;
    this.id = path.split("/").pop();
  }
  DocRef.prototype.get = function(){
    return Promise.resolve(snapOf(this.path));
  };
  DocRef.prototype.set = function(data, opts){
    var store = all();
    store[this.path] = (opts && opts.merge)
      ? merge(store[this.path] || {}, data)
      : merge({}, data);
    put(store);
    return Promise.resolve();
  };
  DocRef.prototype.update = function(patch){
    var store = all();
    if (store[this.path] === undefined)
      return Promise.reject({code: "not-found", message: "No document to update"});
    var doc = clone(store[this.path]);
    Object.keys(patch).forEach(function(k){ deepSet(doc, k, patch[k]); });
    store[this.path] = doc;
    put(store);
    return Promise.resolve();
  };
  DocRef.prototype.delete = function(){
    var store = all();
    delete store[this.path];
    put(store);
    return Promise.resolve();
  };
  DocRef.prototype.onSnapshot = function(next, err){
    var path = this.path, last = null;
    function run(){
      var s = snapOf(path), now = JSON.stringify(s.data());
      if (now === last) return;
      last = now;
      try { next(s); } catch(e){ if (err) err(e); }
    }
    live.push(run);
    setTimeout(run, 0);
    return function(){ var i = live.indexOf(run); if (i >= 0) live.splice(i, 1); };
  };

  function Query(coll, tests){
    this.coll = coll;
    this.tests = tests || [];
  }
  Query.prototype.where = function(field, op, value){
    return new Query(this.coll, this.tests.concat([[field, op, value]]));
  };
  Query.prototype.rows = function(){
    var store = all(), coll = this.coll, tests = this.tests, out = [];
    Object.keys(store).forEach(function(path){
      if (path.indexOf(coll + "/") !== 0) return;
      var d = store[path];
      var ok = tests.every(function(t){
        var v = d[t[0]];
        if (t[1] === "==") return v === t[2];
        if (t[1] === ">=") return v >= t[2];
        if (t[1] === "<=") return v <= t[2];
        if (t[1] === ">")  return v > t[2];
        if (t[1] === "<")  return v < t[2];
        return true;
      });
      if (ok) out.push({id: path.split("/").pop(), data: (function(x){
        return function(){ return clone(x); };
      })(d)});
    });
    return out;
  };
  Query.prototype.get = function(){
    var docs = this.rows();
    return Promise.resolve({docs: docs, size: docs.length, empty: !docs.length});
  };
  Query.prototype.onSnapshot = function(next, err){
    var self = this, last = null;
    function run(){
      var docs = self.rows();
      var now = JSON.stringify(docs.map(function(d){ return [d.id, d.data()]; }));
      if (now === last) return;
      last = now;
      try { next({docs: docs, size: docs.length, empty: !docs.length}); }
      catch(e){ if (err) err(e); }
    }
    live.push(run);
    setTimeout(run, 0);
    return function(){ var i = live.indexOf(run); if (i >= 0) live.splice(i, 1); };
  };

  function Coll(name){ this.name = name; }
  Coll.prototype.doc = function(id){ return new DocRef(this.name + "/" + id); };
  Coll.prototype.where = function(f, o, v){ return new Query(this.name).where(f, o, v); };
  Coll.prototype.get = function(){ return new Query(this.name).get(); };
  Coll.prototype.onSnapshot = function(n, e){ return new Query(this.name).onSnapshot(n, e); };

  function Db(){}
  Db.prototype.collection = function(name){ return new Coll(name); };

  var db = new Db();
  window.firebase = {
    initializeApp: function(){ return {}; },
    firestore: function(){ return db; },
    apps: [{}]
  };
  window.firebase.firestore.FieldValue = {
    arrayUnion: function(){
      return {__fake: UNION, items: Array.prototype.slice.call(arguments)};
    },
    delete: function(){ return {__fake: DELETE}; },
    serverTimestamp: function(){ return new Date().toISOString(); }
  };
  window.firebase.firestore.FieldPath = function(){
    return Array.prototype.slice.call(arguments).join(".");
  };
})();
