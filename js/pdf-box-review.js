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
    result.splice(index,1,{...box,w:x-box.x,automatic:false},{...box,x,w:box.x+box.w-x,automatic:false});
  } else if(box && action==='join' && boxes[index+1] && sameRow(box,boxes[index+1])) {
    const next=boxes[index+1], y=Math.min(box.y,next.y);
    result.splice(index,2,{...box,y,w:next.x+next.w-box.x,h:Math.max(box.y+box.h,next.y+next.h)-y,automatic:false});
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

// Adapted from Guitar Trainer 85803aa. Build the entire candidate before
// saving. Protected numbers on the same page keep their original geometry.
export function addScoreBoxes(saved, first, proposals, writtenCount) {
  return appendScoreBoxes({...saved}, first, proposals, writtenCount);
}

function appendScoreBoxes(boxes, first, proposals, writtenCount) {
  if (!Number.isInteger(first) || first < 1 || first + proposals.length - 1 > writtenCount)
    return {error: 'The proposed numbering goes past the last written measure (' + writtenCount + ').'};
  for (const [i, box] of proposals.entries()) {
    const number = first + i;
    if (boxes[number] && boxes[number].page !== box.page) {
      return {error: 'Measure ' + number + ' belongs to page ' + boxes[number].page +
        ' and is also proposed on page ' + box.page + '.'};
    }
    boxes[number] ??= box;
  }
  return {boxes};
}

// Number the entire draft in print order. Only an explicit first-number edit
// pins a page; otherwise corrections flow through all subsequent pages.
export function planScoreBoxes(pages, protectedBoxes, starts, writtenCount) {
  const boxes = {...protectedBoxes}, firsts = [];
  const preview = pages.map(() => new Map());
  for (const [n, box] of Object.entries(protectedBoxes)) preview[box.page-1].set(Number(n), box);
  let next = 1, error = '';
  for (const [i, proposals] of pages.entries()) {
    const first = starts[i] ?? next;
    firsts.push(first);
    next = first + proposals.length;
    for (const [j, box] of proposals.entries()) {
      const n = first + j;
      if (!preview[i].has(n)) preview[i].set(n, box);
    }
    if (!error && proposals.length) {
      const result = appendScoreBoxes(boxes, first, proposals, writtenCount);
      if (result.error) error = 'Page ' + (i + 1) + ': ' + result.error;
    }
  }
  return {firsts, preview, boxes, error};
}
