'use strict';
globalThis.YCLayout=(()=>{
 function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
 function hash(text){return[...text].reduce((n,c)=>Math.imul(n,31)+c.charCodeAt(0)|0,2166136261)>>>0;}
 function linesFor(text,limit=19){const lines=[''];text.split(' ').forEach(word=>{const i=lines.length-1;if(lines[i]&&lines[i].length+word.length+1>limit)lines.push(word);else lines[i]+=(lines[i]?' ':'')+word;});return lines;}
 function scatterTopics(groups,width,height){
  if(!groups.length)return[];
  const left=18,top=16,right=width-18,bottom=height-78;
  const area=Math.max(1,(right-left)*(bottom-top));
  let unit=Math.sqrt(area*.29/(Math.PI*groups.reduce((sum,g)=>sum+g.companies.length,0)));
  const seed=hash(groups.map(g=>g.id).join('|'));
  for(let attempt=0;attempt<90;attempt++,unit*=.94){
   const rng=random(seed+Math.imul(attempt,2654435761)),placed=[];
   const candidates=groups.map(g=>{
    const labelLines=linesFor(g.name),r=Math.sqrt(g.companies.length)*unit;
    const half=Math.max(r+10,...labelLines.map(line=>line.length*3.55+4));
    return{...g,r,labelLines,half,above:r+10,below:r+23+(labelLines.length-1)*15+4};
   }).sort((a,b)=>b.r-a.r||a.id.localeCompare(b.id));
   for(const g of candidates){
    const minX=left+g.half,maxX=right-g.half,minY=top+g.above,maxY=bottom-g.below;
    if(maxX<minX||maxY<minY)break;
    let accepted=false;
    for(let trial=0;trial<2000;trial++){
     const x=minX+rng()*(maxX-minX),y=minY+rng()*(maxY-minY);
     const box={left:x-g.half,right:x+g.half,top:y-g.above,bottom:y+g.below};
     if(placed.some(p=>!(box.right+12<p.bounds.left||box.left-12>p.bounds.right||box.bottom+12<p.bounds.top||box.top-12>p.bounds.bottom)))continue;
     placed.push({...g,x,y,bounds:box});accepted=true;break;
    }
    if(!accepted)break;
   }
   if(placed.length===groups.length)return groups.map(g=>placed.find(p=>p.id===g.id));
  }
  throw new Error('The map is too small to place readable topic labels.');
 }
 function fitRegions(bounds,labels,width,height){
  const rectangles=bounds.filter(b=>b.flat().every(Number.isFinite));
  if(!rectangles.length)return{x:0,y:0,k:1};
  const padding={left:24,right:24,top:56,bottom:24};
  const availableWidth=Math.max(1,width-padding.left-padding.right),availableHeight=Math.max(1,height-padding.top-padding.bottom);
  function extent(scale){
   const boxes=[...rectangles,...labels.map(g=>[[g.labelX-g.labelWidth/(2*scale),g.labelY-g.labelHeight/(2*scale)],[g.labelX+g.labelWidth/(2*scale),g.labelY+g.labelHeight/(2*scale)]])];
   return{left:Math.min(...boxes.map(b=>b[0][0])),right:Math.max(...boxes.map(b=>b[1][0])),top:Math.min(...boxes.map(b=>b[0][1])),bottom:Math.max(...boxes.map(b=>b[1][1]))};
  }
  let k=1;
  for(let i=0;i<24;i++){const box=extent(k),fit=Math.min(1,availableWidth/Math.max(1,box.right-box.left),availableHeight/Math.max(1,box.bottom-box.top));if(fit>=k-1e-10)break;k=fit;}
  const box=extent(k);
  return{x:padding.left+availableWidth/2-k*(box.left+box.right)/2,y:padding.top+availableHeight/2-k*(box.top+box.bottom)/2,k};
 }
 return Object.freeze({scatterTopics,linesFor,fitRegions});
})();
