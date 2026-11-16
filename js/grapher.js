import { evaluate, fmt } from './mathcore.js';

const canvas = document.querySelector('#graph-canvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  const input = document.querySelector('#graph-expressions');
  const readout = document.querySelector('#graph-readout');
  const table = document.querySelector('#graph-table');
  let scale = 32, ox = 0, oy = 0, plots = [], points = [], intersections = [], drag = null, trace = true;
  const colors = ['#ff9f0a', '#4b9bff', '#37d399', '#d48cff', '#ff7186'];
  const size = () => { const r = canvas.getBoundingClientRect(), d = devicePixelRatio || 1; canvas.width = Math.max(1, r.width*d); canvas.height = Math.max(1, r.height*d); ctx.setTransform(d,0,0,d,0,0); draw(); };
  const W = () => canvas.clientWidth, H = () => canvas.clientHeight;
  const world = (px,py) => ({ x:(px-W()/2-ox)/scale, y:(H()/2+oy-py)/scale });
  function parse() {
    plots = []; points = []; intersections = [];
    for (const raw of input.value.split(/\n+/).map(s=>s.trim()).filter(Boolean)) {
      if (/^линия\s*:/i.test(raw)) { const ps=raw.replace(/^линия\s*:/i,'').split(';').map(t=>t.match(/([-+\d.,]+)\s*,\s*([-+\d.,]+)/)).filter(Boolean).map(m=>[Number(m[1].replace(',','.')),Number(m[2].replace(',','.'))]); if(ps.length>=2){const [[x1,y1],[x2,y2]]=ps;points.push(...ps);const a=y1-y2,b=x2-x1,c=x1*y2-x2*y1;if(Math.abs(a)+Math.abs(b)>1e-10)plots.push({implicit:{a,b,c},color:colors[plots.length%colors.length],label:`линия через (${x1};${y1}) и (${x2};${y2})`});} continue; }
      if (/^кусочно\s*:/i.test(raw)) { const pieces=raw.replace(/^кусочно\s*:/i,'').split(';').map(t=>{const m=t.trim().match(/x\s*(<=|>=|<|>)\s*(-?\d+(?:[.,]\d+)?)\s*[:=]\s*(.+)/i);return m?{op:m[1],bound:Number(m[2].replace(',','.')),expr:m[3].trim()}:null;}).filter(Boolean); if(pieces.length)plots.push({pieces,color:colors[plots.length%colors.length],label:raw}); continue; }
      if (/^(точки\s*:)/i.test(raw)) {
        for (const item of raw.replace(/^точки\s*:\s*/i,'').split(';')) { const m=item.trim().match(/^([-+\d.,]+)\s*[,;]\s*([-+\d.,]+)$/); if(m) points.push([Number(m[1].replace(',','.')),Number(m[2].replace(',','.'))]); }
        continue;
      }
      const ineq = raw.match(/^(.+?)\s*(<=|>=|<|>)\s*(.+)$/);
      if (ineq && /[xy]/i.test(ineq[1]+ineq[3])) { try { const f=(x,y)=>evaluate(`(${ineq[1]})-(${ineq[3]})`,{x,y}),c=f(0,0),a=f(1,0)-c,b=f(0,1)-c;if(Math.abs(a)+Math.abs(b)>1e-10)plots.push({halfplane:{a,b,c,op:ineq[2]},implicit:{a,b,c},color:colors[plots.length%colors.length],label:raw}); } catch {} continue; }
      const eq = raw.match(/^(.+?)\s*=\s*(.+)$/);
      if (!eq) { plots.push({expr:raw,color:colors[plots.length%colors.length],label:`y = ${raw}`}); continue; }
      const left=eq[1].trim(), right=eq[2].trim();
      if (/^y$/i.test(left)) { plots.push({expr:right,color:colors[plots.length%colors.length],label:raw}); continue; }
      if (/[xy]/i.test(left) && /[xy]/i.test(right)) {
        try {
          const f=(x,y)=>evaluate(`(${left})-(${right})`,{x,y});
          const c=f(0,0), a=f(1,0)-c, b=f(0,1)-c;
          if (Math.abs(a)+Math.abs(b)>1e-10) plots.push({implicit:{a,b,c},color:colors[plots.length%colors.length],label:raw});
        } catch {}
      } else plots.push({expr:right,color:colors[plots.length%colors.length],label:raw});
    }
    for(let i=0;i<plots.length;i++)for(let j=i+1;j<plots.length;j++){const p=plots[i].implicit,q=plots[j].implicit;if(!p||!q)continue;const d=p.a*q.b-q.a*p.b;if(Math.abs(d)<1e-10)continue;const x=(p.b*q.c-q.b*p.c)/d,y=(p.c*q.a-q.c*p.a)/d;if(Number.isFinite(x)&&Number.isFinite(y))intersections.push({x,y,labels:[plots[i].label,plots[j].label]});}
    if(intersections.length)readout.textContent=`Точки пересечения: ${intersections.map(p=>`(${fmt(p.x)}; ${fmt(p.y)})`).join(', ')}`;
    redrawTable(); draw();
  }
  function evalPlot(p,x){if(!p.pieces)return evaluate(p.expr,{x});const branch=p.pieces.find(b=>({'<':x<b.bound,'<=':x<=b.bound,'>':x>b.bound,'>=':x>=b.bound})[b.op]);if(!branch)throw new Error('нет ветви');return evaluate(branch.expr,{x});}
  function draw() {
    const w=W(),h=H(); if(!w||!h) return; ctx.clearRect(0,0,w,h); ctx.fillStyle='#121519';ctx.fillRect(0,0,w,h);
    const step=scale<20?5:scale<45?2:1, cx=w/2+ox, cy=h/2+oy;
    ctx.lineWidth=1; ctx.strokeStyle='#252b32';
    for(let x=((cx% (scale*step))+(scale*step))%(scale*step);x<w;x+=scale*step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=((cy%(scale*step))+(scale*step))%(scale*step);y<h;y+=scale*step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    ctx.strokeStyle='#88919d';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.moveTo(cx,0);ctx.lineTo(cx,h);ctx.stroke();
    ctx.fillStyle='#929ba8';ctx.font='11px system-ui';
    for(let n=Math.ceil((-cx)/scale);n<=(w-cx)/scale;n++) if(n&&n%step===0)ctx.fillText(n,cx+n*scale+2,cy-4);
    for(let n=Math.ceil((cy-h)/scale);n<=(cy)/scale;n++) if(n&&n%step===0)ctx.fillText(n,cx+4,cy-n*scale-2);
    for(const p of plots){
      if(p.halfplane){const {a,b,c,op}=p.halfplane;ctx.save();ctx.globalAlpha=.16;ctx.fillStyle=p.color;ctx.beginPath();if(Math.abs(b)>1e-10){const y0=-(a*world(0,0).x+c)/b, y1=-(a*world(w,0).x+c)/b, py0=cy-y0*scale,py1=cy-y1*scale;const below=(op==='<'||op==='<=')===(b>0);ctx.moveTo(0,py0);ctx.lineTo(w,py1);ctx.lineTo(w,below?h:0);ctx.lineTo(0,below?h:0);}else{const xbound=-c/a,px=cx+xbound*scale,below=(op==='<'||op==='<=')===(a>0);ctx.rect(below?0:px,0,below?px:w-px,h);}ctx.closePath();ctx.fill();ctx.restore();}
      ctx.strokeStyle=p.color;ctx.lineWidth=2.2;ctx.setLineDash(p.halfplane&&(p.halfplane.op==='<'||p.halfplane.op==='>')?[5,4]:[]);ctx.beginPath();let started=false;
      if(p.implicit){const {a,b,c}=p.implicit;if(Math.abs(b)>1e-10){for(let px=0;px<=w;px+=2){const x=world(px,0).x,y=-(a*x+c)/b,py=cy-y*scale;if(Number.isFinite(py)){if(!started){ctx.moveTo(px,py);started=true;}else ctx.lineTo(px,py);}}}else{const px=cx-(-c/a)*scale;ctx.moveTo(px,0);ctx.lineTo(px,h);started=true;}}
      else for(let px=0;px<=w;px+=2){const x=world(px,0).x;let y;try{y=evalPlot(p,x);}catch{started=false;continue;}const py=cy-y*scale;if(!Number.isFinite(py)||Math.abs(py)>h*4){started=false;continue;}if(!started){ctx.moveTo(px,py);started=true;}else ctx.lineTo(px,py);}
      ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle='#ff9f0a';for(const [x,y] of points){ctx.beginPath();ctx.arc(cx+x*scale,cy-y*scale,4,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#ff7186';for(const p of intersections){ctx.beginPath();ctx.arc(cx+p.x*scale,cy-p.y*scale,5,0,Math.PI*2);ctx.fill();}
    if(trace){for(const p of plots.filter(p=>!p.implicit)){const x=world(mouse.x,mouse.y).x;try{const y=evalPlot(p,x),px=cx+x*scale,py=cy-y*scale;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fill();}catch{}}}
  }
  let mouse={x:0,y:0};
  function redrawTable(){if(!plots.length||plots[0].implicit){table.innerHTML='';return;}const p=plots[0],xs=[-2,-1,0,1,2];table.innerHTML=`<b>Таблица значений · ${p.label}</b><div class="table-values">${xs.map(x=>{try{return `<span>x=${x}<br>y=${fmt(evalPlot(p,x))}</span>`}catch{return `<span>x=${x}<br>не опр.</span>`}}).join('')}</div>`;}
  document.querySelector('#graph-draw').addEventListener('click',parse);
  document.querySelectorAll('[data-graph]').forEach(b=>b.addEventListener('click',()=>{input.value=b.dataset.graph.replace(/&lt;/g,'<').replaceAll(String.fromCharCode(92)+'n',String.fromCharCode(10));parse();}));
  document.querySelector('#graph-zoom-in').addEventListener('click',()=>{scale=Math.min(160,scale*1.25);draw();});
  document.querySelector('#graph-zoom-out').addEventListener('click',()=>{scale=Math.max(8,scale/1.25);draw();});
  document.querySelector('#graph-reset').addEventListener('click',()=>{scale=32;ox=oy=0;draw();});
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,ox,oy};});
  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();mouse={x:e.clientX-r.left,y:e.clientY-r.top};if(drag){ox=drag.ox+e.clientX-drag.x;oy=drag.oy+e.clientY-drag.y;}const q=world(mouse.x,mouse.y);readout.textContent=`x = ${fmt(q.x)}, y = ${fmt(q.y)}${plots.some(p=>!p.implicit)?` · ${plots.filter(p=>!p.implicit).map(p=>{try{return `${p.label}: ${fmt(evalPlot(p,q.x))}`}catch{return `${p.label}: не определено`}}).join(' · ')}`:''}`;draw();});
  canvas.addEventListener('pointerup',()=>{drag=null;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();scale=Math.max(8,Math.min(160,scale*(e.deltaY<0?1.1:.9)));draw();},{passive:false});
  window.addEventListener('resize',size); size(); input.value='y = 2x + 1'; parse();
}
