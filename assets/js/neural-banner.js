// Brunel-type finite network; retuned parameters for SI-like / AI-like alternation.
'use strict';
class BrunelNetwork {
  constructor(options = {}) {
    this.p = { N: 2500, CE: 200, J: .5, g: 6, eta: .9, dt: .1, delay: 1.5, tau: 20, threshold: 20, reset: 10, refractory: 2, recurrentScale: 1, seed: 719, ...options };
    const p = this.p, N = p.N;
    this.NE = Math.round(.8 * N);
    this.CI = Math.round(p.CE / 4);
    this.stepCount = 0;
    this.decay = Math.exp(-p.dt / p.tau);
    this.delaySteps = Math.round(p.delay / p.dt);
    this.ringLength = this.delaySteps + 1;
    this.pending = new Float64Array(N * this.ringLength);
    this.v = new Float64Array(N);
    this.ref = new Int32Array(N);
    this.noiseSeeds = new Uint32Array(N);
    this.fired = new Int32Array(N);
    let seed = p.seed >>> 0;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + .5) / 4294967296; };
    const lists = Array.from({ length: N }, () => []), marks = new Int32Array(N);
    for (let target = 0; target < N; target++) {
      const stamp = target + 1;
      for (let type = 0; type < 2; type++) {
        const count = type ? this.CI : p.CE, offset = type ? this.NE : 0, size = type ? N - this.NE : this.NE;
        let added = 0;
        while (added < count) {
          const source = offset + Math.floor(rand() * size);
          if (source === target || marks[source] === stamp) continue;
          marks[source] = stamp; lists[source].push(target); added++;
        }
      }
      this.v[target] = rand() * p.threshold;
      this.noiseSeeds[target] = (92821 + 7919 * target) >>> 0;
    }
    this.targets = lists.map(row => Int32Array.from(row));
    this.setParameters({ g: p.g, eta: p.eta });
    const sampleCount = options.sampleCount || 50;
    this.sampleIndices = Array.from({ length: sampleCount }, (_, i) => Math.floor((i + .5) * this.NE / sampleCount));
    this.sampleMap = new Int32Array(N); this.sampleMap.fill(-1);
    this.sampleIndices.forEach((neuron, row) => { this.sampleMap[neuron] = row; });
    this.events = Array.from({ length: sampleCount }, () => []);
    this.onStep = null;
  }
  setParameters({ g, eta }) {
    const p = this.p;
    if (g !== undefined) p.g = g;
    if (eta !== undefined) p.eta = eta;
    // Superposition of CE independent Poisson afferents, sampled exactly per bin.
    this.externalRate = p.eta * p.threshold / (p.J * p.tau / 1000);
    const lambda = this.externalRate * p.dt / 1000;
    const cdf = []; let probability = Math.exp(-lambda), cumulative = probability;
    cdf.push(cumulative);
    for (let n = 1; cumulative < 1 - 1e-14; n++) { probability *= lambda / n; cumulative += probability; cdf.push(cumulative); }
    cdf[cdf.length - 1] = 1;
    this.poissonCDF = Float64Array.from(cdf);
  }
  step() {
    const p = this.p, N = p.N, k = this.stepCount, offset = (k % this.ringLength) * N;
    let count = 0;
    for (let i = 0; i < N; i++) {
      let seed = this.noiseSeeds[i]; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; this.noiseSeeds[i] = seed;
      const u = (seed + .5) / 4294967296; let poisson = 0;
      while (u > this.poissonCDF[poisson]) poisson++;
      const synaptic = this.pending[offset + i]; this.pending[offset + i] = 0;
      if (this.ref[i] > 0) { this.ref[i]--; continue; }
      this.v[i] = this.v[i] * this.decay + p.J * poisson + synaptic;
      if (this.v[i] >= p.threshold) {
        this.v[i] = p.reset; this.ref[i] = Math.round(p.refractory / p.dt);
        this.fired[count++] = i;
        const row = this.sampleMap[i]; if (row >= 0) this.events[row].push(k * p.dt / 1000);
      }
    }
    const delivery = ((k + this.delaySteps) % this.ringLength) * N;
    for (let j = 0; j < count; j++) {
      const source = this.fired[j], weight = p.recurrentScale * (source < this.NE ? p.J : -p.g * p.J), targets = this.targets[source];
      for (let n = 0; n < targets.length; n++) this.pending[delivery + targets[n]] += weight;
    }
    if (this.onStep) this.onStep(k, this.fired, count);
    this.stepCount++;
    return count;
  }
}

(()=>{
  const root=document.getElementById('neural-banner');
  if(!root)return;
  const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)return;
  const regimes=[{name:'SI-like',g:4.5,eta:.8},{name:'AI-like',g:5,eta:2}];
  const network=new BrunelNetwork({N:2500,CE:200,J:.5,...regimes[0],sampleCount:100});
  const motion=matchMedia('(prefers-reduced-motion: reduce)'),windowSeconds=.3,displayRows=64,phaseMs=800;
  const rows=Array.from({length:displayRows},(_,i)=>Math.floor((i+.5)*network.events.length/displayRows));
  for(let k=0;k<1000/network.p.dt;k++)network.step();
  const regimeOrigin=network.stepCount;
  let currentRegime=0,clock=(network.stepCount-1)*network.p.dt/1000,last=null,frame=0,visible=true;
  function advance(){
    const elapsed=(network.stepCount-regimeOrigin)*network.p.dt;
    const index=Math.floor((elapsed+1e-7)/phaseMs)%regimes.length;
    if(index!==currentRegime){currentRegime=index;network.setParameters(regimes[index]);}
    network.step();
  }
  function prune(){
    const cutoff=clock-windowSeconds-.1;
    for(const events of network.events){let n=0;while(n<events.length&&events[n]<cutoff)n++;if(n)events.splice(0,n);}
  }
  function draw(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    const d=Math.min(devicePixelRatio||1,2),pw=Math.round(w*d),ph=Math.round(h*d);
    if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
    const first=clock-windowSeconds,left=2,span=w-4,gap=(h-14)/displayRows;
    ctx.strokeStyle='#93406f';ctx.lineWidth=1.25;
    for(let j=0;j<displayRows;j++){
      const y=7+(j+.5)*gap,half=Math.min(1.4,gap*.34);
      ctx.globalAlpha=.72+(j%3)*.12;ctx.beginPath();
      for(const t of network.events[rows[j]]){
        if(t<first||t>clock)continue;
        const x=left+(t-first)/windowSeconds*span;ctx.moveTo(x,y-half);ctx.lineTo(x,y+half);
      }
      ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  function tick(now){
    frame=0;if(!visible||document.hidden||motion.matches){last=null;return;}
    if(last!==null){
      clock+=Math.min((now-last)/1000,.1)*.05;
      while((network.stepCount-1)*network.p.dt/1000<clock)advance();
      prune();
    }
    last=now;draw();frame=requestAnimationFrame(tick);
  }
  function pause(){if(frame)cancelAnimationFrame(frame);frame=0;last=null;}
  function resume(){if(visible&&!document.hidden&&!motion.matches&&!frame){last=null;frame=requestAnimationFrame(tick);}}
  new ResizeObserver(draw).observe(canvas);prune();draw();
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)resume();else pause();}).observe(canvas);
  document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
  motion.addEventListener('change',()=>motion.matches?pause():resume());resume();
})();
