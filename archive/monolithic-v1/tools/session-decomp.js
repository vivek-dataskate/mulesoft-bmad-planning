const fs=require('fs');
const f=process.argv[2];
const lines=fs.readFileSync(f,'utf8').split('\n').filter(Boolean);
let asstTurns=0, sumIn=0, sumOut=0, sumCacheRead=0, sumCacheCreate=0;
let toolResultBytes=0, webFetchBytes=0, toolResultCount=0, webFetchCount=0, userTextBytes=0;
let firstUsage=null, lastUsage=null;
for(const l of lines){
  let o; try{o=JSON.parse(l);}catch{continue;}
  const m=o.message||o;
  if(o.type==='assistant' && m && m.usage){
    asstTurns++;
    const u=m.usage;
    sumIn+=u.input_tokens||0; sumOut+=u.output_tokens||0;
    sumCacheRead+=u.cache_read_input_tokens||0; sumCacheCreate+=u.cache_creation_input_tokens||0;
    if(!firstUsage)firstUsage=u; lastUsage=u;
  }
  // measure tool_result payloads (web fetch HTML lands here)
  const content = m && m.content;
  if(Array.isArray(content)){
    for(const c of content){
      if(c.type==='tool_result'){
        toolResultCount++;
        const txt=typeof c.content==='string'?c.content:JSON.stringify(c.content||'');
        toolResultBytes+=txt.length;
      }
      if(c.type==='tool_use' && /fetch|web|search/i.test(c.name||'')){
        webFetchCount++;
      }
    }
  }
}
const tok=b=>Math.round(b/4); // ~4 chars/token
console.log('assistant turns (LLM calls):', asstTurns);
console.log('SUM input_tokens (uncached):', sumIn.toLocaleString());
console.log('SUM cache_read tokens      :', sumCacheRead.toLocaleString());
console.log('SUM cache_create tokens    :', sumCacheCreate.toLocaleString());
console.log('SUM output_tokens          :', sumOut.toLocaleString());
console.log('--- orchestrate billed input = in + cache_create + cache_read*0.1 ---');
const billedIn = sumIn + sumCacheCreate + Math.round(sumCacheRead*0.1);
console.log('=> billed input approx     :', billedIn.toLocaleString());
console.log('tool_result payloads count :', toolResultCount, '~tokens:', tok(toolResultBytes).toLocaleString());
console.log('tool_use fetch/web/search  :', webFetchCount);
console.log('last turn context window   :', (lastUsage? (lastUsage.input_tokens+ (lastUsage.cache_read_input_tokens||0)+(lastUsage.cache_creation_input_tokens||0)) : 0).toLocaleString(),'tokens');
