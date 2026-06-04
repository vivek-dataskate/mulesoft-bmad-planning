// Transparent Scout cost model. Baseline = measured peerless rows (agilemind proxy for quinn/mira).
// Rates per 1M tokens
const R = { haiku:{i:0.80,o:4.00}, sonnet:{i:3.00,o:15.00}, opus:{i:15.00,o:75.00} };
const cost=(m,bi,bo)=>(bi*R[m].i + bo*R[m].o)/1e6;

// BASELINE (measured billed_input, output, model, duration_s)
const base = [
  ['sage',  'haiku', 2201977,124555, 824],
  ['vera',  'opus',  1238819,145208,1200],
  ['rex',   'sonnet', 558899, 88653, 569],
  ['ivy',   'sonnet', 509015, 47116, 723],
  ['flo',   'opus',   171446, 23375, 236],
  ['hawk',  'opus',   973686, 96135, 825],
  ['petra', 'opus',   726904, 74351, 427],
  ['quinn', 'sonnet',1219784,170185,1565],
  ['mira',  'opus',   555012, 49913, 546],
];

// SCENARIO 1: graph + model right-sizing ONLY (input thinned ~contextRed, output unchanged, cheaper model)
// contextRed = per-turn context shrink from graph+projections (prior-output thinning). turnRed handled in scen2.
const s1 = {
//          model    inFactor(context thinning incl. prior-output projection)  outFactor
  sage:  ['haiku',  2.5, 1.0],
  vera:  ['sonnet', 3.0, 1.0],
  rex:   ['sonnet', 2.5, 1.0],
  ivy:   ['sonnet', 2.0, 1.0],
  flo:   ['sonnet', 2.0, 1.0],
  hawk:  ['sonnet', 3.0, 1.0],
  petra: ['sonnet', 2.5, 1.0],
  quinn: ['sonnet', 3.0, 1.0],
  mira:  ['sonnet', 2.5, 1.0],
};
// SCENARIO 2: FULL (graph + model + split[turn reduction] + output templating by orchestrator)
const s2 = {
//          model    inFactor(context*turns)  outFactor(orchestrator templates boilerplate)
  sage:  ['haiku',  3.75, 0.72],  // split extract/systems/contacts
  vera:  ['sonnet', 6.0,  0.48],  // split profile/vertical/stack + cap research passes
  rex:   ['sonnet', 3.25, 0.67],
  ivy:   ['haiku',  2.4,  0.74],
  flo:   ['sonnet', 2.4,  0.78],
  hawk:  ['sonnet', 5.4,  0.57],  // split urgency/competitive + cap passes
  petra: ['sonnet', 3.25, 0.60],  // orchestrator templates proposal scaffold
  quinn: ['haiku',  4.5,  0.35],  // intake scaffold templated; LLM fills variable fields only
  mira:  ['sonnet', 3.25, 0.60],
};
// time model: duration ~ turns*per-turn-latency. split+thin reduces turns&context => timeFactor
const timeFactor = { sage:0.45, vera:0.30, rex:0.55, ivy:0.55, flo:0.6, hawk:0.4, petra:0.55, quinn:0.4, mira:0.5 };

function run(scn){
  let tC=0,tIn=0,tOut=0,tT=0;
  const rows=[];
  for(const [a,bm,bi,bo,dur] of base){
    const [m,inf,outf]=scn[a];
    const ni=Math.round(bi/inf), no=Math.round(bo*outf);
    const c=cost(m,ni,no); const t=Math.round(dur*(timeFactor[a]||0.5));
    rows.push({a,m,ni,no,c:+c.toFixed(2),t});
    tC+=c; tIn+=ni; tOut+=no; tT+=t;
  }
  return {rows,tC:+tC.toFixed(2),tIn,tOut,tT};
}
function baseTotals(){let c=0,i=0,o=0,t=0;for(const[a,m,bi,bo,d]of base){c+=cost(m,bi,bo);i+=bi;o+=bo;t+=d;}return{c:+c.toFixed(2),i,o,t};}

const b=baseTotals();
console.log('===== BASELINE (measured, all-Opus heavy) =====');
for(const[a,m,bi,bo,d]of base)console.log(`${a.padEnd(6)} ${m.padEnd(6)} in=${(bi/1e6).toFixed(2)}M out=${(bo/1e3).toFixed(0)}K $${cost(m,bi,bo).toFixed(2)} ${d}s`);
console.log(`TOTAL  $${b.c}  in=${(b.i/1e6).toFixed(2)}M out=${(b.o/1e3).toFixed(0)}K  time=${(b.t/60).toFixed(0)}min`);

for(const[name,scn]of [['SCENARIO 1: graph + model only',s1],['SCENARIO 2: FULL (graph+model+split+output-templating)',s2]]){
  const r=run(scn);
  console.log(`\n===== ${name} =====`);
  for(const x of r.rows)console.log(`${x.a.padEnd(6)} ${x.m.padEnd(6)} in=${(x.ni/1e6).toFixed(2)}M out=${(x.no/1e3).toFixed(0)}K $${x.c} ${x.t}s`);
  console.log(`TOTAL  $${r.tC}  in=${(r.tIn/1e6).toFixed(2)}M out=${(r.tOut/1e3).toFixed(0)}K  time=${(r.tT/60).toFixed(0)}min`);
  console.log(`SAVINGS vs baseline: $${(b.c-r.tC).toFixed(2)} (${(100*(b.c-r.tC)/b.c).toFixed(0)}% cheaper), time ${(100*(b.t-r.tT)/b.t).toFixed(0)}% faster`);
}
