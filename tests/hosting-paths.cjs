// Actual bootstrap and version display in isolated mocks; no browser data.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),bootstrap=html.match(/<script>([\s\S]*?)<\/script>/)[1],manifest=JSON.parse(read('site.webmanifest'));
for(const href of ['http://127.0.0.1:5500/index.html','http://localhost:8080/','http://127.0.0.1:5500/nested/index.html','https://www.pianotrainerstudio.com/','https://ztbishop.github.io/piano-trainer-studio/']) {
 for(const response of [{version:'1.3.2'},{},null]) {
  const writes=[],requests=[];
  const context={window:{},document:{write:text=>writes.push(text)},XMLHttpRequest:class {
   open(method,url){requests.push(new URL(url,href));} setRequestHeader(){}
   send(){if(!response)throw Error('offline');this.status=200;this.responseText=JSON.stringify(response);}
  }};
  vm.runInNewContext(bootstrap,context);
  assert.equal(requests.length,1);assert.equal(requests[0].pathname,new URL('version.json',href).pathname);
  assert.equal(context.window.__PT_ASSET_VERSION__,response?.version||'1.3.1');assert.equal(writes.length,3);
  assert(writes.every(text=>text.includes('?v='+context.window.__PT_ASSET_VERSION__)));
 }
 const folder=new URL('./',href),manifestUrl=new URL('site.webmanifest',folder);
 assert.equal(new URL(manifest.start_url,manifestUrl).href,folder.href);assert.equal(new URL(manifest.scope,manifestUrl).href,folder.href);
 for(const icon of manifest.icons){assert(new URL(icon.src,manifestUrl).pathname.startsWith(folder.pathname));assert(fs.existsSync(path.join(root,icon.src)));}
}
const led=read('js/led.js'),version={},context=vm.createContext({APP_VERSION:'test-version',document:{getElementById:()=>version}});
vm.runInContext(led.slice(led.indexOf('function initAboutControls'),led.indexOf('function hasAcceptedWledDdpWarning')),context);
context.initAboutControls();assert.equal(version.textContent,'Version: test-version');
assert(!led.includes('checkForUpdates'));assert(!bootstrap.includes('localStorage'));assert(!html.includes('btn-check-updates'));
assert.match(html,/https:\/\/github.com\/ztbishop\/piano-trainer-studio\/releases\/latest/);
console.log('Hosting: deployment-relative version/cache URLs, offline fallback, manifests/icons, version label and release link passed.');
