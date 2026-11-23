'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const cfg = require('./config');

const { PORTS } = cfg;
const MAX_LOG_BYTES = 10 * 1024 * 1024;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function httpStatus(url, timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.on('error', () => resolve(0));
  });
}

async function waitFor(check, { timeoutMs, label, isAlive }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (isAlive && !isAlive()) {
      throw new Error(`${label} beklenmedik şekilde kapandı`);
    }
    if (await check()) return;
    await sleep(1000);
  }
  throw new Error(`${label} ${Math.round(timeoutMs / 1000)} saniyede açılmadı`);
}

function openLog(logsDir, name) {
  fs.mkdirSync(logsDir, { recursive: true });
  const file = path.join(logsDir, `${name}.log`);
  try {
    if (fs.statSync(file).size > MAX_LOG_BYTES) {
      fs.renameSync(file, file + '.old');
    }
  } catch {}
  return fs.openSync(file, 'a');
}

function logLine(fd, text) {
  try {
    fs.writeSync(fd, `[${new Date().toISOString()}] ${text}\n`);
  } catch {}
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

class ServiceManager extends EventEmitter {
  constructor() {
    super();
    this.p = cfg.paths();
    this.config = cfg.load();
    this.children = new Map();
    this.stopping = false;
    this.status = {};
    this.launcherLog = openLog(this.p.logs, 'launcher');
  }

  log(text) {
    logLine(this.launcherLog, text);
    this.emit('log', text);
  }

  setStatus(name, state, detail = '') {
    this.status[name] = { state, detail };
    this.log(`${name}: ${state}${detail ? ' - ' + detail : ''}`);
    this.emit('status', { ...this.status });
  }

  // Runs a command to completion; output goes to the service log.
  run(name, cmd, args, opts = {}) {
    const fd = openLog(this.p.logs, name);
    logLine(fd, `> ${path.basename(cmd)} ${args.join(' ')}`);
    const res = spawnSync(cmd, args, {
      windowsHide: true,
      stdio: ['ignore', fd, fd],
      timeout: opts.timeout || 10 * 60 * 1000,
      ...opts,
    });
    fs.closeSync(fd);
    return res;
  }

  // Starts a long-running process and restarts it if it dies.
  startProcess(name, cmd, args, opts = {}) {
    const fd = openLog(this.p.logs, name);
    logLine(fd, `> ${path.basename(cmd)} ${args.join(' ')}`);
    const child = spawn(cmd, args, {
      windowsHide: true,
      stdio: ['ignore', fd, fd],
      ...opts,
    });
    const entry = { child, name, cmd, args, opts, alive: true, restarts: 0 };
    const previous = this.children.get(name);
    if (previous) entry.restarts = previous.restarts;
    this.children.set(name, entry);
    child.on('error', (err) => {
      logLine(fd, `başlatılamadı: ${err.message}`);
    });
    child.on('exit', (code, signal) => {
      entry.alive = false;
      logLine(fd, `çıktı: kod=${code} sinyal=${signal}`);
      try {
        fs.closeSync(fd);
      } catch {}
      if (this.stopping || entry.stoppedOnPurpose) return;
      if (entry.restarts >= 5) {
        this.setStatus(name, 'error', 'Defalarca çöktü, günlüklere bakın');
        this.emit('fatal', name);
        return;
      }
      entry.restarts += 1;
      this.setStatus(name, 'restarting', `yeniden başlatılıyor (${entry.restarts})`);
      setTimeout(() => {
        if (!this.stopping) this.startProcess(name, cmd, args, opts);
      }, 3000 * entry.restarts);
    });
    return entry;
  }

  isAlive(name) {
    const e = this.children.get(name);
    return !!(e && e.alive);
  }

  async checkPorts() {
    const busy = [];
    for (const [name, port] of Object.entries(PORTS)) {
      if (name === 'public') continue; // the proxy checks its own port
      if (await portOpen(port)) busy.push(`${name} (${port})`);
    }
    return busy;
  }

  // ---------- PostgreSQL ----------
  pg(tool) {
    return path.join(this.p.pgBin, `${tool}.exe`);
  }

  async startPostgres() {
    this.setStatus('postgres', 'starting');
    const env = { ...process.env, PGPASSWORD: this.config.dbPassword };
    const versionFile = path.join(this.p.pgData, 'PG_VERSION');
    if (!fs.existsSync(versionFile)) {
      fs.mkdirSync(path.dirname(this.p.pgData), { recursive: true });
      fs.rmSync(this.p.pgData, { recursive: true, force: true });
      const pwFile = path.join(this.p.data, 'pw.tmp');
      fs.writeFileSync(pwFile, this.config.dbPassword, 'utf8');
      const res = this.run(
        'postgres',
        this.pg('initdb'),
        [
          '-D',
          this.p.pgData,
          '-U',
          'postgres',
          '-A',
          'scram-sha-256',
          '--pwfile',
          pwFile,
          '-E',
          'UTF8',
          '--locale=C',
        ],
        { env }
      );
      fs.rmSync(pwFile, { force: true });
      if (res.status !== 0) {
        throw new Error('Veritabanı ilk kez hazırlanamadı (initdb)');
      }
      fs.appendFileSync(
        path.join(this.p.pgData, 'postgresql.conf'),
        `\n# sosyalmedya\nport = ${PORTS.postgres}\nlisten_addresses = '127.0.0.1'\nmax_connections = 200\n`
      );
    }

    const status = this.run('postgres', this.pg('pg_ctl'), ['status', '-D', this.p.pgData], { env });
    if (status.status !== 0) {
      const res = this.run(
        'postgres',
        this.pg('pg_ctl'),
        ['start', '-w', '-t', '120', '-D', this.p.pgData, '-l', path.join(this.p.logs, 'postgres-server.log')],
        { env, timeout: 180000 }
      );
      if (res.status !== 0) {
        throw new Error('Veritabanı başlatılamadı');
      }
    }
    await waitFor(() => portOpen(PORTS.postgres), { timeoutMs: 60000, label: 'Veritabanı' });

    // Create the app database once.
    const create = this.run(
      'postgres',
      this.pg('createdb'),
      ['-h', '127.0.0.1', '-p', String(PORTS.postgres), '-U', 'postgres', 'sosyalmedya'],
      { env }
    );
    if (create.status !== 0) {
      const check = spawnSync(
        this.pg('psql'),
        ['-h', '127.0.0.1', '-p', String(PORTS.postgres), '-U', 'postgres', '-d', 'sosyalmedya', '-tAc', 'select 1'],
        { env, windowsHide: true, encoding: 'utf8' }
      );
      if (check.status !== 0) throw new Error('Veritabanı oluşturulamadı');
    }
    this.setStatus('postgres', 'ready');
  }

  stopPostgres() {
    if (!fs.existsSync(path.join(this.p.pgData, 'PG_VERSION'))) return;
    this.run('postgres', this.pg('pg_ctl'), ['stop', '-D', this.p.pgData, '-m', 'fast', '-w', '-t', '60'], {
      timeout: 90000,
    });
  }

  // ---------- Redis ----------
  async startRedis() {
    this.setStatus('redis', 'starting');
    fs.mkdirSync(this.p.redisData, { recursive: true });
    this.startProcess(
      'redis',
      this.p.redis,
      [
        '--port', String(PORTS.redis),
        '--bind', '127.0.0.1',
        '--dir', cfg.slash(this.p.redisData),
        '--save', '60 1',
        '--appendonly', 'no',
        '--protected-mode', 'yes',
      ],
      { cwd: path.dirname(this.p.redis) }
    );
    await waitFor(() => portOpen(PORTS.redis), {
      timeoutMs: 30000,
      label: 'Redis',
      isAlive: () => this.isAlive('redis'),
    });
    this.setStatus('redis', 'ready');
  }

  // ---------- Temporal ----------
  async startTemporal() {
    this.setStatus('temporal', 'starting');
    fs.mkdirSync(path.dirname(this.p.temporalDb), { recursive: true });
    this.startProcess(
      'temporal',
      this.p.temporal,
      [
        'server', 'start-dev',
        '--headless',
        '--ip', '127.0.0.1',
        '--port', String(PORTS.temporal),
        '--http-port', String(PORTS.temporal + 1),
        '--metrics-port', String(PORTS.temporal + 2),
        '--db-filename', this.p.temporalDb,
        '--log-level', 'warn',
        '--dynamic-config-value', 'limit.maxIDLength=255',
        '--dynamic-config-value', 'system.forceSearchAttributesCacheRefreshOnRead=true',
      ],
      { cwd: path.dirname(this.p.temporalDb) }
    );
    await waitFor(() => portOpen(PORTS.temporal), {
      timeoutMs: 90000,
      label: 'Zamanlayıcı (Temporal)',
      isAlive: () => this.isAlive('temporal'),
    });
    this.setStatus('temporal', 'ready');
  }

  // ---------- Database schema ----------
  async migrate() {
    this.setStatus('database', 'starting', 'tablolar kontrol ediliyor');
    const schema = path.join(
      this.p.app,
      'libraries', 'nestjs-libraries', 'src', 'database', 'prisma', 'schema.prisma'
    );
    const hash = hashFile(schema);
    if (this.config.schemaHash === hash) {
      this.setStatus('database', 'ready');
      return;
    }
    const env = cfg.appEnv(this.config);
    const res = await new Promise((resolve) => {
      const fd = openLog(this.p.logs, 'database');
      const child = spawn(
        this.p.node,
        [this.p.prismaCli, 'db', 'push', '--schema', schema, '--skip-generate'],
        { env, cwd: this.p.app, windowsHide: true, stdio: ['ignore', fd, fd] }
      );
      child.on('error', (e) => {
        logLine(fd, e.message);
        resolve(1);
      });
      child.on('exit', (code) => {
        fs.closeSync(fd);
        resolve(code);
      });
    });
    if (res !== 0) throw new Error('Veritabanı tabloları hazırlanamadı');
    this.config.schemaHash = hash;
    cfg.save(this.config);
    this.setStatus('database', 'ready');
  }

  // ---------- Postiz apps ----------
  startApp(name, cwd, args, extraEnv = {}) {
    const env = { ...cfg.appEnv(this.config), ...extraEnv };
    return this.startProcess(name, this.p.node, args, { cwd, env });
  }

  async startPostiz() {
    const apps = path.join(this.p.app, 'apps');
    this.setStatus('backend', 'starting');
    this.setStatus('orchestrator', 'starting');
    this.setStatus('frontend', 'starting');

    this.startApp(
      'backend',
      path.join(apps, 'backend'),
      ['--experimental-require-module', './dist/apps/backend/src/main.js'],
      { PORT: String(PORTS.backend) }
    );
    this.startApp(
      'orchestrator',
      path.join(apps, 'orchestrator'),
      ['--experimental-require-module', './dist/apps/orchestrator/src/main.js'],
      { ORCHESTRATOR_PORT: String(PORTS.orchestrator) }
    );
    this.startApp(
      'frontend',
      path.join(apps, 'frontend'),
      [
        path.join(this.p.app, 'node_modules', 'next', 'dist', 'bin', 'next'),
        'start',
        '-p', String(PORTS.frontend),
        '-H', '127.0.0.1',
      ]
    );

    const waits = [
      waitFor(async () => (await httpStatus(`http://127.0.0.1:${PORTS.backend}/`)) > 0, {
        timeoutMs: 240000,
        label: 'Sunucu (backend)',
      }).then(() => this.setStatus('backend', 'ready')),
      waitFor(async () => (await httpStatus(`http://127.0.0.1:${PORTS.orchestrator}/health/status`, 15000)) === 200, {
        timeoutMs: 240000,
        label: 'Gönderi motoru (orchestrator)',
      }).then(() => this.setStatus('orchestrator', 'ready')),
      waitFor(async () => (await httpStatus(`http://127.0.0.1:${PORTS.frontend}/auth`)) > 0, {
        timeoutMs: 240000,
        label: 'Arayüz (frontend)',
      }).then(() => this.setStatus('frontend', 'ready')),
    ];
    await Promise.all(waits);
  }

  async startAll() {
    this.stopping = false;
    this.log(`başlıyor: ${this.p.root}`);
    for (const dir of [this.p.data, this.p.uploads, this.p.logs]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const busy = await this.checkPorts();
    if (busy.length) {
      // A previous run may have left Postgres behind; that one we can reuse.
      const others = busy.filter((b) => !b.startsWith('postgres'));
      if (others.length) {
        throw new Error(
          `Şu portlar başka bir program tarafından kullanılıyor: ${others.join(', ')}. ` +
            'sosyalmedya zaten açık olabilir; bilgisayarı yeniden başlatıp tekrar deneyin.'
        );
      }
    }
    await this.startPostgres();
    await this.startRedis();
    await this.startTemporal();
    await this.migrate();
    await this.startPostiz();
    this.log('hepsi hazır');
  }

  async restartPostiz() {
    for (const name of ['backend', 'orchestrator', 'frontend']) {
      const e = this.children.get(name);
      if (e && e.alive) {
        e.stoppedOnPurpose = true;
        await killTree(e.child);
      }
      this.children.delete(name);
    }
    this.config = cfg.load();
    await this.startPostiz();
  }

  async stopAll() {
    this.stopping = true;
    const order = ['frontend', 'backend', 'orchestrator', 'temporal', 'redis'];
    for (const name of order) {
      const e = this.children.get(name);
      if (e && e.alive) await killTree(e.child);
    }
    this.stopPostgres();
    this.log('durduruldu');
  }
}

function killTree(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    const timer = setTimeout(resolve, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  });
}

module.exports = { ServiceManager, httpStatus, portOpen, sleep };
