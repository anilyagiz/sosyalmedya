// Preloaded into every Node process the app starts (NODE_OPTIONS=--require).
// Postiz servers call listen(port) without a host, which binds every network
// interface and makes Windows show a firewall prompt. On the desktop nothing
// needs to be reachable from outside this computer, so a listen() without a
// host is pinned to 127.0.0.1.
'use strict';
const net = require('net');

const originalListen = net.Server.prototype.listen;

function isPort(value) {
  return (
    typeof value === 'number' ||
    (typeof value === 'string' && value !== '' && /^\d+$/.test(value))
  );
}

net.Server.prototype.listen = function (...args) {
  const first = args[0];
  if (isPort(first)) {
    const second = args[1];
    if (second === undefined || second === null || typeof second === 'function' || typeof second === 'number') {
      args.splice(1, second === undefined || second === null ? 1 : 0, '127.0.0.1');
    }
  } else if (first && typeof first === 'object' && !Array.isArray(first) && first.port !== undefined && !first.path && !first.host) {
    args[0] = { ...first, host: '127.0.0.1' };
  }
  return originalListen.apply(this, args);
};
