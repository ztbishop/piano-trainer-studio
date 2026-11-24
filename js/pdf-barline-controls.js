// A handle belongs to two touching boxes. Their outside edges stay pinned.
export function sharedBarline(left,right) {
  if(!right || left.page!==right.page || Math.abs(left.x+left.w-right.x)>.002) return null;
  const top=Math.max(left.y,right.y), bottom=Math.min(left.y+left.h,right.y+right.h);
  const end=Math.min(1,right.x+right.w);
  const min=Math.max(0,left.x)+.005, max=end-.005;
  if(bottom-top<=Math.min(left.h,right.h)*.5 || min>=max || right.x<min || right.x>max) return null;
  return {min,max,end,y:(top+bottom)/2};
}

export function moveBarline(left,right,range,x) {
  const edge=Math.min(range.max,Math.max(range.min,x));
  return [{...left,w:edge-left.x},{...right,x:edge,w:range.end-edge}];
}

export function barlineHandle(sheet,left,right,leftEl,rightEl,label,apply) {
  const range=sharedBarline(left,right);
  if(!range)return null;
  const handle=document.createElement('button');
  handle.type='button';handle.className='pdf-barline';
  handle.setAttribute('role','slider');
  handle.setAttribute('aria-label',label);
  handle.title=label+' · Drag or use the left and right arrow keys';
  const percent=value=>(value*100).toFixed(3);
  handle.setAttribute('aria-valuemin',percent(range.min));handle.setAttribute('aria-valuemax',percent(range.max));
  handle.style.top=percent(range.y)+'%';
  let pointer=null, offset=0;
  const coordinate=e=>(e.clientX-sheet.getBoundingClientRect().left)/sheet.getBoundingClientRect().width;
  function preview(a,b) {
    leftEl.style.width=a.w*100+'%';
    rightEl.style.left=b.x*100+'%';rightEl.style.width=b.w*100+'%';
    handle.style.left=b.x*100+'%';
    handle.setAttribute('aria-valuenow',percent(b.x));
  }
  function commit(x) {
    const [a,b]=moveBarline(left,right,range,x);
    preview(a,b);
    if(b.x===right.x)return;
    left=a;right=b;apply(a,b);
  }
  preview(left,right);
  handle.onpointerdown=e=>{
    if(e.button!==0 || !e.isPrimary)return;
    e.stopPropagation();pointer=e.pointerId;offset=right.x-coordinate(e);
    handle.setPointerCapture(pointer);
  };
  handle.onpointermove=e=>{
    if(e.pointerId===pointer)preview(...moveBarline(left,right,range,coordinate(e)+offset));
  };
  handle.onpointerup=e=>{
    if(e.pointerId!==pointer)return;
    pointer=null;commit(coordinate(e)+offset);
  };
  handle.onlostpointercapture=handle.onpointercancel=()=>{pointer=null;preview(left,right);};
  handle.onkeydown=e=>{
    if(e.key!=='ArrowLeft' && e.key!=='ArrowRight')return;
    e.preventDefault();e.stopPropagation();
    commit(right.x+(e.key==='ArrowLeft'?-1:1)/sheet.getBoundingClientRect().width);
  };
  return handle;
}
