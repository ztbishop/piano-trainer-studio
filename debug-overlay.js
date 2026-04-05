
(function(){
  function createBox(){
    if(document.getElementById('debug-box')) return;
    const box = document.createElement('div');
    box.id = 'debug-box';
    box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:40%;overflow:auto;background:rgba(0,0,0,0.85);color:#0f0;font-size:11px;padding:6px;z-index:999999;font-family:monospace;';
    document.body.appendChild(box);
  }

  function log(msg){
    createBox();
    const el = document.getElementById('debug-box');
    const line = document.createElement('div');
    line.textContent = new Date().toLocaleTimeString() + " | " + msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  window.__ptDebugLog = log;

  document.addEventListener('visibilitychange', () => {
    log('VISIBILITY: ' + document.visibilityState);
  });

  window.addEventListener('focus', () => log('FOCUS'));
  window.addEventListener('blur', () => log('BLUR'));
  window.addEventListener('pageshow', () => log('PAGESHOW'));

  log('DEBUG INIT');
})();
