// Try several sharpness / floor settings against the cached signals and print what each produces.
// ⚠️ Reads the cache only, so it is instant. The point is to choose the feel with numbers rather than
// re-running twenty minutes of API calls per guess.
const fs = require('fs');
const C = JSON.parse(fs.readFileSync('wallet_signals.json', 'utf8'));
const rows = Object.values(C);
const FACETS = ['NEWBIE','COLLECTOR','DEGEN','BUILDER','OG','WHALE','GHOST'];
const num = k => rows.map(r => r[k] || 0).sort((a,b)=>a-b);
const pop = { eth:num('eth'), txs:num('txs'), rate:num('txRate'), nfts:num('nfts'),
  colls:num('colls'), idle:num('idleDays'), age: rows.filter(r=>r.ageDays).map(r=>r.ageDays).sort((a,b)=>a-b) };
const pct = (a,v) => { let c=0; for (const x of a) if (x<=v) c++; return c/a.length; };
function score(s){
  const P={eth:pct(pop.eth,s.eth),txs:pct(pop.txs,s.txs),age:s.ageDays?pct(pop.age,s.ageDays):0,
    rate:pct(pop.rate,s.txRate),nfts:pct(pop.nfts,s.nfts||0),colls:pct(pop.colls,s.colls||0),
    idle:pct(pop.idle,s.idleDays||0)};
  return {OG:0.80*P.age+0.20*P.txs, NEWBIE:0.65*(1-P.age)+0.35*(1-P.txs),
    DEGEN:0.70*P.rate+0.30*P.txs, WHALE:0.85*P.eth+0.15*P.nfts,
    BUILDER:Math.min(1,0.55*Math.min(1,(s.deploys||0)/3)+0.25*P.rate+0.20*(s.smart?1:0)),
    COLLECTOR:0.55*P.colls+0.45*P.nfts,
    GHOST:0.35*(1-P.rate)+0.30*P.idle+0.20*P.nfts*(1-P.rate)+0.15*(s.noOutbound?1:0)};
}
function run(SHARP, FLOOR){
  const cnt={}; FACETS.forEach(f=>cnt[f]=0); let surp=0;
  for(const r of rows){
    const sc=score(r);
    const vals=FACETS.map(f=>Math.pow(Math.max(0,sc[f]),SHARP));
    const sum=vals.reduce((a,b)=>a+b,0)||1;
    const w=vals.map(v=>(1-FLOOR)*(v/sum)+FLOOR/7);
    let seed=parseInt(r.addr.slice(2,10),16);
    const x=((seed*1664525+1013904223)>>>0)/4294967296;
    let acc=0, pick=FACETS[6];
    for(let i=0;i<7;i++){acc+=w[i]; if(x<=acc){pick=FACETS[i];break;}}
    const lean=FACETS[vals.indexOf(Math.max(...vals))];
    cnt[pick]++; if(pick!==lean) surp++;
  }
  return {cnt, surp: 100*surp/rows.length};
}
console.log('sharp floor | ' + FACETS.map(f=>f.slice(0,4).padStart(5)).join('') + ' |  surpriz');
console.log('-'.repeat(66));
for(const S of [1,2,4,7,12]) for(const F of [0.15,0.07]){
  const r=run(S,F);
  console.log(String(S).padStart(5)+String(F).padStart(6)+' | '+
    FACETS.map(f=>(100*r.cnt[f]/rows.length).toFixed(0).padStart(5)).join('')+' |  %'+r.surp.toFixed(0));
}
