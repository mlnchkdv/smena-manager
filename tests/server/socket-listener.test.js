import test from 'node:test';
import assert from 'node:assert/strict';
import { apiListenOptions } from '../../src/server/socket-listener.js';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

test('single-writer API consumes only its exact named systemd descriptor', () => {
  const options = { platform: 'linux', pid: 123, env: { LISTEN_PID: '123', LISTEN_FDS: '1', LISTEN_FDNAMES: 'smena-http' } };
  assert.deepEqual(apiListenOptions(options), { fd: 3 });
  for (const env of [{ LISTEN_PID: 'other' }, { LISTEN_FDS: '2' }, { LISTEN_FDNAMES: 'other' }])
    assert.throws(() => apiListenOptions({ ...options, env: { ...options.env, ...env } }), /activation contract/);
  assert.throws(() => apiListenOptions({ ...options, platform: 'win32' }), /activation contract/);
  assert.deepEqual(apiListenOptions({ env: { PORT: '3215' } }), { port: 3215, host: '127.0.0.1' });
});

test('inherited Linux listener buffers a POST across writer exit and a failed candidate', { skip: process.platform !== 'linux' }, () => {
  const worker = `
    import http from 'node:http';
    import {apiListenOptions} from ${JSON.stringify(pathToFileURL(path.resolve('src/server/socket-listener.js')).href)};
    import {createGracefulShutdown} from ${JSON.stringify(pathToFileURL(path.resolve('src/server/graceful-shutdown.js')).href)};
    if(process.argv[1]==='invalid')process.exit(3);
    let writes=0;
    const server=http.createServer((req,res)=>{
      if(req.url==='/slow'){res.writeHead(200);res.flushHeaders();return setTimeout(()=>res.end('drained'),200);}
      if(req.method==='POST'){let text='';req.on('data',c=>text+=c);req.on('end',()=>res.end(process.argv[1]+':'+(++writes)+':'+text));}
      else res.end('ready');
    });
    server.listen(apiListenOptions());
    process.on('SIGTERM',createGracefulShutdown(server));
  `;
  // A small POSIX supervisor retains the descriptor, just as systemd does.
  // It never accepts requests itself and uses only a private ephemeral port.
  const supervisor = `
import os, socket, sys, time, signal, threading, urllib.request
listener=socket.socket(); listener.bind(('127.0.0.1',0)); listener.listen(64)
origin='http://127.0.0.1:'+str(listener.getsockname()[1])
children=[]
def start(phase):
    pid=os.fork()
    if pid==0:
        os.dup2(listener.fileno(),3); os.set_inheritable(3,True)
        env=dict(os.environ,LISTEN_PID=str(os.getpid()),LISTEN_FDS='1',LISTEN_FDNAMES='smena-http')
        os.execve(sys.argv[1],[sys.argv[1],'--input-type=module','-e',sys.argv[2],phase],env)
    children.append(pid); return pid
def request(route='/', data=None):
    return urllib.request.urlopen(urllib.request.Request(origin+route,data=data),timeout=8).read().decode()
try:
    old=start('old'); assert request()=='ready'
    slow=[]; started=threading.Event()
    def slow_request():
        response=urllib.request.urlopen(origin+'/slow',timeout=8)
        started.set(); slow.append(response.read().decode())
    t=threading.Thread(target=slow_request); t.start(); assert started.wait(5)
    os.kill(old,signal.SIGTERM); _,status=os.waitpid(old,0); children.remove(old); t.join()
    assert status==0 and slow==['drained']
    result=[]
    t=threading.Thread(target=lambda:result.append(request('/',b'service-write'))); t.start(); time.sleep(.1)
    bad=start('invalid'); _,status=os.waitpid(bad,0); children.remove(bad); assert os.waitstatus_to_exitcode(status)==3
    assert t.is_alive()
    new=start('new'); t.join(); assert result==['new:1:service-write'], result
    os.kill(new,signal.SIGTERM); _,status=os.waitpid(new,0); children.remove(new); assert status==0
    print('buffered POST and drain verified')
finally:
    for pid in children:
        try: os.kill(pid,signal.SIGKILL); os.waitpid(pid,0)
        except ProcessLookupError: pass
    listener.close()
`;
  const result = spawnSync('python3', ['-c', supervisor, process.execPath, worker], { encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /buffered POST and drain verified/);
});
