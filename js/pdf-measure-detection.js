// Adapted from Guitar Trainer Studio 1e68d3 (AGPL-3.0), 2026-11-24.
// Geometry only. Analyze a modest, zoom-independent grayscale raster of one page.
function horizontalLines(pixels, width, height) {
  const lines = [];
  for (let y = 0; y < height; y++) {
    let start = 0, last = -30, left = 0, right = 0, count = 0;
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x] > 231) continue;
      if (x - last > width * .018) { start = x; count = 0; }
      count++;
      last = x;
      if (x - start > right - left && count > (x-start)*.63) { left = start; right = x; }
    }
    if (right - left < width * .14) continue;
    const previous = lines.at(-1);
    if (previous && previous.end === y - 1 && Math.abs(previous.left - left) < width * .04) {
      previous.end = y;
      if (right - left > previous.right - previous.left) Object.assign(previous, {left, right});
    } else lines.push({start:y, end:y, left, right});
  }
  return lines.map(line => ({...line, y:(line.start + line.end) / 2}));
}

const median = values => values.slice().sort((a,b) => a-b)[Math.floor(values.length/2)];
function findStaves(lines, width) {
  // Dense beams or ledger lines can form shorter parallel runs within a staff.
  lines = lines.filter(line => !lines.some(other => Math.abs(other.y-line.y)<width*.035 &&
    other.right-other.left>(line.right-line.left)*1.42));
  const staves = [];
  for (let i = 0; i + 4 < lines.length; i++) {
    const group = lines.slice(i, i+5);
    const gap = (group[4].y - group[0].y) / 4;
    if (gap < 3 || gap > width * .025) continue;
    const consistent = (line,index) => Math.abs(line.y-group[0].y-index*gap) <= Math.max(1.4,gap*.15) &&
      Math.abs(group[0].right-line.right)<width*.09 && Math.abs(group[0].left-line.left)<width*.09;
    if (!group.every(consistent)) continue;
    if (lines[i+5] && consistent(lines[i+5],5)) group.push(lines[i+5]);
    staves.push({top:Math.round(group[0].y), bottom:Math.round(group.at(-1).y), gap,
      lines:group.length, left:median(group.map(l=>l.left)), right:median(group.map(l=>l.right))});
    i += group.length - 1;
  }
  return staves;
}

function verticals(pixels, width, staff) {
  const columns = [];
  const {left,right,top,bottom} = staff;
  for (let x = left; x <= right; x++) {
    let ink = 0;
    for (let y = top; y <= bottom; y++) if (pixels[y*width+x] < 211) ink++;
    if (ink >= (bottom-top+1)*.93) {
      const last = columns.at(-1);
      if (last && x === last.end + 1) last.end = x;
      else columns.push({start:x,end:x});
    }
  }
  return columns.map(c=>Math.round((c.start+c.end)/2));
}

function cleanBar(pixels,width,height,staff,left,right,previousBar) {
  // Look beside both outer strokes of a double bar. Stems attach to heads
  // or beams, while a genuine barline has whitespace between staff lines.
  const {top,bottom,gap} = staff;
  const side=Math.max(2,Math.round(gap*.35));
  let touching=0, crossing=false, samples=0, mostFrequent=0;
  const profiles=new Map();
  for(let y=Math.max(0,Math.floor(top-gap*.42));y<=Math.min(height-1,bottom+gap*.42);y++) {
    if (Math.abs(y-top-Math.round((y-top)/gap)*gap)<Math.max(1.4,gap*.16)) continue;
    let joinsLeft=true, joinsRight=true;
    for(let dx=0;dx<=side;dx++) {
      if(pixels[y*width+left-dx]>207) joinsLeft=false;
      if(pixels[y*width+right+dx]>207) joinsRight=false;
    }
    if(joinsLeft || joinsRight) touching++;
    if(y<=top || y>=bottom || left!==right) continue;
    if(joinsLeft && joinsRight) crossing=true;
    // In the spaces between staff lines, a bar usually has two parallel
    // edges. Stacked meter digits can cover one column from top to bottom
    // too, but their contours widen and narrow around it.
    let before=0, after=0;
    const limit=Math.ceil(gap);
    while(before<limit && left-before>0 && pixels[y*width+left-before-1]<211) before++;
    while(after<limit && right+after+1<width && pixels[y*width+right+after+1]<211) after++;
    samples++;
    if(pixels[y*width+left]>=211 || before+after>=limit) continue;
    const profile=before*(limit+1)+after;
    const frequency=(profiles.get(profile)??0)+1;
    profiles.set(profile,frequency);
    mostFrequent=Math.max(mostFrequent,frequency);
  }
  const extension=Math.max(3,Math.round(gap*.43));
  const extendsAt = y => y>=0 && y<height && pixels[y*width+left]<180;
  if(extendsAt(top-extension) || extendsAt(bottom+extension)) return false;
  if(right>left) return true;
  // Immediately following a confirmed bar, require a consistent width to
  // distinguish meter digits. Keep the existing tolerance for uneven scans
  // elsewhere. A crossing tie can join both sides of an otherwise clean bar.
  const nearBar=left-previousBar<=gap*2.5;
  if(touching<gap*.34) return !nearBar || mostFrequent>=samples*.6;
  return crossing && samples>0 && mostFrequent>=samples*.78;
}

// MuseScore places a forward repeat after the clefs and meter. Its heavy
// and light strokes and two dots open measure one, inside its printed box.
function hasOpeningRepeatDots(pixels, width, staff, stroke) {
  if (stroke.right === stroke.left || stroke.left-staff.left > staff.gap*12) return false;
  const ink = (x, spaces) => pixels[Math.round(staff.top + spaces*staff.gap)*width + x] < 180;
  for (let x=stroke.right+2; x<=stroke.right+staff.gap*1.4; x++) {
    if (ink(x,1.5) && ink(x,2.5) && !ink(x,1.2) && !ink(x,2.8)) return true;
  }
  return false;
}

export function detectMeasureBoxes(pixels, width, height, page) {
  const staves = findStaves(horizontalLines(pixels,width,height),width);
  for (const staff of staves) staff.columns = verticals(pixels,width,staff);
  const boxes = [];
  for (let i=0;i<staves.length;i++) {
    const upper=staves[i], next=staves[i+1];
    let lower=upper;
    if (next && upper.lines===5 && Math.abs(upper.left-next.left)<upper.gap*3 &&
        next.top-upper.bottom<upper.gap*15) {
      const linked=upper.columns.some(x=>x<upper.left+upper.gap*2 && (() => {
        let ink=0;
        for(let y=upper.bottom;y<=next.top;y++) if(pixels[y*width+x]<220) ink++;
        return ink>=(next.top-upper.bottom+1)*.88;
      })());
      if (next.lines===6 || linked) {lower=next;i++;}
    }
    const gap=upper.gap;
    const strokes=[];
    for(const x of upper.columns) {
      const last=strokes.at(-1);
      if(last && x-last.right<gap*.9) last.right=x;
      else strokes.push({left:x,right:x});
    }
    const inner=[];
    for(const stroke of strokes) {
      if(stroke.left-upper.left<=gap*1.4 || upper.right-stroke.right<=gap*3.8 ||
          (stroke.right>stroke.left && stroke.left-upper.left<gap*9)) continue;
      if (!inner.length && lower !== upper && hasOpeningRepeatDots(pixels,width,upper,stroke) &&
          hasOpeningRepeatDots(pixels,width,lower,stroke)) continue;
      // A nearby stem can sit next to the actual barline in a beamed passage.
      const members=upper.columns.filter(x=>x>=stroke.left && x<=stroke.right);
      const previousBar=inner.at(-1)??upper.left;
      const bar=members.find(x=>lower===upper ? cleanBar(pixels,width,height,upper,x,x,previousBar)
        : lower.columns.some(b=>Math.abs(b-x)<=gap*.55));
      if(bar!==undefined) inner.push(bar);
      else if(lower===upper && stroke.right>stroke.left && cleanBar(pixels,width,height,upper,stroke.left,stroke.right,previousBar)) inner.push(stroke.left);
    }
    const edges=[upper.left];
    for (const x of inner) if (x-edges.at(-1)>gap*1.35) edges.push(x);
    edges.push(upper.right);
    const top=Math.max(0,upper.top-gap*2), bottom=Math.min(height,lower.bottom+lower.gap*1.7);
    for (let j=1;j<edges.length;j++) {
      boxes.push({page,x:edges[j-1]/width,y:top/height,w:(edges[j]-edges[j-1])/width,h:(bottom-top)/height});
    }
  }
  return boxes;
}

export async function detectPdfPage(pdfPage,page) {
  const base=pdfPage.getViewport({scale:1});
  const viewport=pdfPage.getViewport({scale:Math.min(1440/base.width,2400/base.height)});
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
  try {
    const context=canvas.getContext('2d',{willReadFrequently:true});
    await pdfPage.render({canvas,canvasContext:context,viewport}).promise;
    const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
    const gray=new Uint8Array(canvas.width*canvas.height);
    for(let i=0;i<gray.length;i++) gray[i]=(rgba[i*4]+2*rgba[i*4+1]+rgba[i*4+2])/4;
    return detectMeasureBoxes(gray,canvas.width,canvas.height,page);
  } finally {canvas.width=canvas.height=1;}
}
