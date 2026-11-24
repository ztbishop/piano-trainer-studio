// Adapted from Guitar Trainer Studio 1e68d3 (AGPL-3.0), 2026-11-24.
// Page proposals are in reading order. Changing their geometry or count is
// reversible until the user accepts the page.
function sameRow(a, b) {
  return Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y) > Math.min(a.h,b.h)*.5;
}

export function editPageBoxes(boxes, index, action, x, drawn) {
  const result=boxes.slice(), box=boxes[index];
  if(action==='draw' && drawn) {
    if(box) result[index]=drawn;
    else {
      const next=result.findIndex(b=>sameRow(b,drawn) ? b.x>drawn.x : b.y+b.h/2>drawn.y+drawn.h/2);
      result.splice(next<0?result.length:next,0,drawn);
    }
  } else if(box && action==='split' && x-box.x>=.005 && box.x+box.w-x>=.005) {
    result.splice(index,1,{...box,w:x-box.x},{...box,x,w:box.x+box.w-x});
  } else if(box && action==='join' && boxes[index+1] && sameRow(box,boxes[index+1])) {
    const next=boxes[index+1], y=Math.min(box.y,next.y);
    result.splice(index,2,{...box,y,w:next.x+next.w-box.x,h:Math.max(box.y+box.h,next.y+next.h)-y});
  } else if(box && action==='remove') result.splice(index,1);
  return result;
}

// Replacing one page may release old numbers for the following page. Reject
// the whole change if any requested number belongs to a different page.
export function replacePageBoxes(saved,page,numbers,proposals) {
  if(numbers.length!==proposals.length || !numbers.length || numbers.some(n=>saved[n] && saved[n].page!==page))return null;
  const result=Object.fromEntries(Object.entries(saved).filter(([,box])=>box.page!==page));
  numbers.forEach((n,i)=>{result[n]=proposals[i];});
  return result;
}
