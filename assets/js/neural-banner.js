
(()=>{
const root=document.getElementById('neural-banner');
if(!root)return;
const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');
if(!ctx)return;
const state={accent:'#93406f',height:96};
const motion=matchMedia('(prefers-reduced-motion: reduce)'),dt=.001,N=40,NE=32,shown=14,windowSeconds=2,capacity=4096;
function rng(seed){return()=>{seed=(1664525*seed+1013904223)>>>0;return(seed+.5)/4294967296;};}
const rand=rng(719),ouRand=rng(341027),privateRand=Array.from({length:N},(_,i)=>rng(92821+7919*i));
const normal=random=>Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
const targets=Array.from({length:N},(_,j)=>Array.from({length:N},(_,i)=>i).filter(i=>i!==j&&rand()<.2));
const v=Float64Array.from({length:N},()=>rand()*.4),exc=new Float64Array(N),inh=new Float64Array(N),ref=new Int32Array(N),bias=Float64Array.from({length:N},()=>.50+rand()*.08);
const inputHistory=new Float64Array(capacity),events=Array.from({length:shown},()=>[]),de=Math.exp(-dt/.008),di=Math.exp(-dt/.012),aOU=Math.exp(-dt/.08),sigmaOU=Math.sqrt(1-aOU*aOU),gain=.7;
let ou=normal(ouRand),stepCount=0,clock=0;
const inputAmplitude=t=>.04+.96*.5*(1-Math.cos(2*Math.PI*(t-.5)/4));
function advance(){
 const time=stepCount*dt,fired=[];ou=aOU*ou+sigmaOU*normal(ouRand);
 const input=2.8*inputAmplitude(time)*Math.max(0,ou-.35);inputHistory[stepCount%capacity]=input;
 for(let j=0;j<N;j++){
  const noise=normal(privateRand[j]);exc[j]*=de;inh[j]*=di;if(ref[j]>0){ref[j]--;continue;}
  const tau=j<NE?.02:.01;
  v[j]+=dt/tau*(-v[j]+bias[j]+input+exc[j]-inh[j])+.22*Math.sqrt(dt/tau)*noise;
  if(v[j]>=1){v[j]=0;ref[j]=2;fired.push(j);if(j<shown)events[j].push(time);}
 }
 for(const j of fired)for(const i of targets[j]){if(j<NE)exc[i]+=.6*gain;else inh[i]+=1.8*gain;}
 stepCount++;
 if(stepCount%100===0){const cutoff=stepCount*dt-windowSeconds-.2;for(const row of events){let n=0;while(n<row.length&&row[n]<cutoff)n++;if(n)row.splice(0,n);}}
}
// Warm up the network, then fill the initial viewing window.
for(let k=0;k<2500;k++)advance();clock=(stepCount-1)*dt;
function inputAt(t){const f=Math.max(0,t/dt),i=Math.floor(f),a=f-i;const last=stepCount-1;const left=inputHistory[Math.min(i,last)%capacity],right=inputHistory[Math.min(i+1,last)%capacity];return left+(right-left)*a;}
function draw(){
 const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const d=Math.min(devicePixelRatio||1,2),pw=Math.round(w*d),ph=Math.round(h*d);
 if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
 ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
 const left=2,right=w-2,span=right-left,first=clock-windowSeconds;
 for(let j=0;j<shown;j++){
  const gap=(h-20)/shown,y=10+(j+.5)*gap,half=Math.min(2,gap*.35);ctx.beginPath();ctx.strokeStyle=state.accent;ctx.globalAlpha=.45+(j%3)*.20;ctx.lineWidth=1.15;
  for(const t of events[j]){if(t<first||t>clock)continue;const x=left+(t-first)/windowSeconds*span;ctx.moveTo(x,y-half);ctx.lineTo(x,y+half);}ctx.stroke();
 }
 ctx.globalAlpha=1;
}
let visible=true,last=null,frame=0;
function tick(now){
 frame=0;if(!visible||document.hidden||motion.matches){last=null;return;}
 if(last!==null){clock+=Math.min((now-last)/1000,.1)*.15;while((stepCount-1)*dt<clock)advance();}
 last=now;draw();frame=requestAnimationFrame(tick);
}
function resume(){if(visible&&!document.hidden&&!motion.matches&&!frame){last=null;frame=requestAnimationFrame(tick);}}
function pause(){if(frame)cancelAnimationFrame(frame);frame=0;last=null;}
new ResizeObserver(draw).observe(canvas);draw();
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)resume();else pause();}).observe(canvas);
document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
motion.addEventListener('change',()=>motion.matches?pause():resume());resume();
})();
