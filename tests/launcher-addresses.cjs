// Actual server source with a fake listener; no existing server or helper is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'local-web-server.js'), 'utf8');
for (const [env, expectedPort] of [[{},5500],[{PIANO_TRAINER_APP_PORT:'8080'},8080],[{PIANO_TRAINER_APP_HOST:'0.0.0.0'},5500]]) {
    const errors=[], logs=[], handlers={};
    let bound;
    const process = {env};
    vm.runInNewContext(source, {
        __dirname:root, process, console:{log:text=>logs.push(text),error:text=>errors.push(text)},
        require(name) {
            if (name === 'http') return {createServer:()=>({on:(type,fn)=>handlers[type]=fn,listen:(port,host,callback)=>{bound={port,host};callback();}})};
            if (name === 'os') return {networkInterfaces:()=>({test:[{address:'192.0.2.10',family:'IPv4',internal:false}]})};
            return require(name);
        }
    });
    assert.equal(bound.port,expectedPort);
    assert(logs.some(text=>text===`Host computer access: http://127.0.0.1:${expectedPort}/`));
    if (env.PIANO_TRAINER_APP_HOST) assert(logs.some(text=>text.includes(`http://192.0.2.10:${expectedPort}`)));
    handlers.error({code:'EADDRINUSE'});
    assert.equal(process.exitCode,1);assert.match(errors[0],/Live Server/);assert.match(errors[0],/No existing server was stopped/);
}
for (const folder of ['Windows Launchers','Mac Launchers']) {
    for (const name of fs.readdirSync(path.join(root,folder)).filter(name=>name.startsWith('Piano Trainer -'))) {
        const text=fs.readFileSync(path.join(root,folder,name),'utf8');
        assert(text.includes('5500'));assert(text.includes('http://127.0.0.1:'));
        assert(!text.includes('/connection-info'));assert(!text.includes('4818'));
    }
}
assert(fs.readFileSync(path.join(root,'js/led.js'),'utf8').includes('http://127.0.0.1:4818'));
console.log('Launcher addresses: default 5500, overrides, loopback browser URLs, LAN listing, occupied-port reporting and unchanged helper endpoint passed.');
