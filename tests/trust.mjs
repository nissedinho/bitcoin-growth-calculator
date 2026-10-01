// Deterministic accuracy and failure-path regressions. No external requests.
import { check, eq, near, ok, report, loadPage, settle, ROOT } from './harness.mjs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const require=createRequire(import.meta.url);
const g=(w,id)=>w.document.getElementById(id);
const windows=[];
function page(opts){const w=loadPage(opts); windows.push(w);return w;}

{
  const w=page();await settle();
  check('month-end uses its own anchor, not the next month',()=>eq(w.getHistoricalPrice('2020-03-31'),6425));
  check('next day interpolates forward from March close continuously',()=>near(w.getHistoricalPrice('2020-04-01'),6425+(8630-6425)/30,1e-8));
  check('January year-page anchor matches the calculator',()=>eq(w.getHistoricalPrice('2020-01-31'),9350));
  check('leap day uses February month-end anchor',()=>eq(w.getHistoricalPrice('2020-02-29'),8600));
  check('impossible and unavailable dates are rejected',()=>{
    eq(w.getHistoricalPrice('2020-02-31'),null);eq(w.getHistoricalPrice('2012-01-01'),null);eq(w.getHistoricalPrice('2030-01-01'),null);
  });
  check('legacy precision is disclosed',()=>ok(/estimate/.test(w.getHistoricalQuote('2020-03-31').method)));
  check('month-end DCA clamps then returns to original day',()=>{
    const dates=w.purchaseDates(new w.Date('2024-01-31T12:00:00Z'),new w.Date('2024-04-30T20:00:00Z'),'monthly').map(d=>d.toISOString().slice(0,10));
    eq(dates.join(','),'2024-01-31,2024-02-29,2024-03-31,2024-04-30');
  });
  check('daily/weekly schedules stay UTC across DST',()=>{
    const dates=w.purchaseDates(new w.Date('2024-03-08T12:00:00Z'),new w.Date('2024-03-22T20:00:00Z'),'weekly');
    eq(dates.map(d=>d.toISOString()).join(','),'2024-03-08T12:00:00.000Z,2024-03-15T12:00:00.000Z,2024-03-22T12:00:00.000Z');
  });
  g(w,'tm-amount').value='1000';g(w,'tm-date').value='2020-03-31';g(w,'tm-sell-date').value='2021-11-10';g(w,'tm-tax').value='20';await w.tmCalculate();
  g(w,'share-x').click();
  check('Time Machine X intent includes the restorable result',()=>{
    const link=new URL(new URL(w.__opened[0]).searchParams.get('url'));
    eq(link.pathname,'/s');eq(link.searchParams.get('date'),'2020-03-31');eq(link.searchParams.get('sell'),'2021-11-10');eq(link.searchParams.get('tax'),'20');
    ok(!new URL(w.__opened[0]).searchParams.get('text').includes('today'),'historical sale must not be called today');
  });
  g(w,'dca-start').value='2024-01-31';await w.dcaCalculate();g(w,'dca-share-x').click();
  check('DCA X intent includes date, amount, frequency and invested total',()=>{
    const link=new URL(new URL(w.__opened[0]).searchParams.get('url'));
    eq(link.searchParams.get('tab'),'dca');eq(link.searchParams.get('date'),'2024-01-31');eq(link.searchParams.get('freq'),'monthly');ok(+link.searchParams.get('inv')>0);
  });
}
{
  const w=page({now:'2024-03-31T21:00:00Z',price:50,daily:{'2024-01-31':100,'2024-02-29':40,'2024-03-31':50}});await settle();
  w.switchTab('dca');
  let captured;w.drawChart=(labels,invested,values)=>{captured={labels,invested,values};};
  w.dcaDisplay(100,new w.Date('2024-01-31T12:00:00Z'),'monthly',50);
  check('DCA chart marks holdings at their historical price',()=>{
    near(captured.values[0],100,0.001);near(captured.values[1],140,0.001);near(captured.values[2],275,0.001);
    eq(captured.labels.at(-1),'Current');near(captured.values.at(-1),275,0.001);
  });
  check('chart is rendered after result visibility, and redraws after tab changes',()=>{
    let seen=false;w.drawChart=()=>{seen=g(w,'dca-result').classList.contains('active') && g(w,'panel-dca').classList.contains('active');};
    w.dcaDisplay(100,new w.Date('2024-01-31T12:00:00Z'),'monthly',50);ok(seen,'chart drawn hidden');
    seen=false;w.switchTab('tm');w.switchTab('dca');ok(seen,'chart not redrawn after tab return');
  });
  check('missing daily quote is labelled carried-forward',()=>{
    const q=w.getHistoricalQuote('2024-02-01');eq(q.price,100);ok(q.method.includes('carried'));eq(q.asOf,'2024-01-31');
  });
}
{
  const w=page({priceOk:false});await settle();
  await w.tmCalculate();await w.dcaCalculate();
  check('failed current quote never displays a zero-valued result',()=>{
    ok(!g(w,'tm-result').classList.contains('active'));ok(!g(w,'dca-result').classList.contains('active'));ok(/current price/.test(g(w,'tm-error').textContent));
  });
  g(w,'tm-sell-date').value='2021-01-31';await w.tmCalculate();
  check('historical sell-date calculation survives live quote failure',()=>ok(g(w,'tm-result').classList.contains('active')));
}
for (const placement of ['time_machine','dca']) {
  for (const scenario of [
    {name:'confirmed',subscribe:{success:true},expected:1},
    {name:'provider failure',subscribe:{success:false},subscribeOk:false,expected:0},
    {name:'ambiguous',subscribe:{},expected:0},
    {name:'provider unknown',subscribe:{success:false,status:'unknown'},expected:0},
    {name:'network failure',subscribeReject:true,expected:0}
  ]) {
    const w=page(scenario);await settle(20);
    // Override the inline analytics helper for assertions; do not send analytics.
    const events=[];w.track=(...args)=>events.push(args);
    const prefix=placement==='dca'?'dca-ec':'ec';g(w,prefix+'-email').value='synthetic@example.invalid';
    await w.submitSignup(placement);
    check(`${placement} ${scenario.name} reports truthful signup status`,()=>{
      eq(events.filter(e=>e[0]==='email_signup').length,scenario.expected);
      ok(g(w,prefix+'-status').textContent.includes(scenario.expected?'accepted':'could not confirm'));
      eq(g(w,prefix+'-submit').disabled,false);
      eq(g(w,prefix+'-email').value,scenario.expected?'':'synthetic@example.invalid');
    });
  }
}

{
  const share=require(join(ROOT,'api/share.js'));let body='';
  const res={setHeader(){},status(){return res;},send(x){body=x;}};
  share({url:'/s?amount=1000&date=2020-03-31&sell=2021-11-10&tax=20&value=5000'},res);
  check('share redirect restores tax and does not call an old snapshot today',()=>{
    ok(body.includes('tax=20'));ok(!body.includes(' today'));ok(body.includes('estimated'));
  });
}

// Exercise generated page JavaScript, including unavailable quote handling.
for(const quoteOk of [true,false]) {
  const dom=new JSDOM(readFileSync(join(ROOT,'what-if/2020/index.html'),'utf8'),{
    runScripts:'dangerously',url:'https://x.test/what-if/2020/',beforeParse(w){
      w.fetch=async()=>({ok:quoteOk,json:async()=>({price:84637,asOf:'2026-10-01T21:00:00Z'})});
    }
  });
  await settle(20);
  check('year page '+(quoteOk?'refreshes body with stable metadata':'shows an honest unavailable state'),()=>{
    const d=dom.window.document;
    ok(!d.title.includes('$'));
    if(quoteOk){eq(d.getElementById('hero-val').textContent,'$9,052');ok(d.getElementById('quote-status').textContent.includes('2026-10-01'));}
    else {eq(d.getElementById('hero-val').textContent,'—');ok(d.getElementById('quote-status').textContent.includes('unavailable'));}
  });
  dom.window.close();
}

// Resolve the DCA permalink request before the default price prefetch.
{
  const pending=[];
  const w=page({url:'https://x.test/?tab=dca&amount=100&start=2020-01-31&freq=monthly#dca',priceQueue:pending});
  await settle(20);
  check('DCA deep link requests have both entered the controlled queue',()=>eq(pending.length,2));
  const response={ok:true,json:async()=>({price:84637,asOf:'2026-10-01T21:00:00Z'})};
  pending[1](response);await settle(20);pending[0](response);await settle(20);
  check('late prefetch cannot overwrite DCA deep link',()=>{ok(w.location.search.includes('tab=dca'));ok(w.location.search.includes('start=2020-01-31'));ok(g(w,'panel-dca').classList.contains('active'));});
  // Also create a hidden Time Machine result, then refresh daily prices.
  w.switchTab('tm');await w.tmCalculate();w.switchTab('dca');await w.dcaCalculate();
  w.retryAfterDaily();await settle(20);
  check('daily refresh preserves the visible DCA scenario',()=>ok(w.location.search.includes('tab=dca')));
}

// Serverless functions use mocked fetch and synthetic addresses only.
const subscribe=require(join(ROOT,'api/subscribe.js'));
const price=require(join(ROOT,'api/price.js'));
const originalFetch=globalThis.fetch;
async function call(handler,req,responses){
  let i=0;globalThis.fetch=async()=>{const x=responses[i++];if(x instanceof Error)throw x;if(!x)throw new Error('unexpected fetch');return x;};
  const result={};const res={setHeader(){},status(n){result.status=n;return res;},json(body){result.body=body;return res;}};
  await handler(req,res);return {...result,calls:i};
}
const form={ok:true,text:async()=>'<input name="authenticity_token" value="synthetic-token">',headers:{get:()=>null,getSetCookie:()=>[]}};
try{
  for(const status of [400,403,422,429]){
    const got=await call(subscribe,{method:'POST',body:{email:'synthetic@example.invalid'}},[form,{ok:false,status}]);
    check(`subscription provider ${status} does not produce success`,()=>{eq(got.status,502);eq(got.body.success,false);});
  }
  for(const data of [{success:false},{success:true,error:'invalid'},{success:true,errors:['invalid']}]){
    const got=await call(subscribe,{method:'POST',body:{email:'synthetic@example.invalid'}},[form,{ok:true,status:200,json:async()=>data}]);
    check('ambiguous or negative provider JSON fails closed '+JSON.stringify(data),()=>eq(got.body.success,false));
  }
  for(const response of [{ok:false,status:302},{ok:false,status:500},{ok:true,status:200,json:async()=>({})},{ok:true,status:200,json:async()=>{throw new Error('html');}},new Error('timeout')]) {
    const got=await call(subscribe,{method:'POST',body:{email:'synthetic@example.invalid'}},[form,response]);
    check('ambiguous POST result preserves uncertainty without claiming success',()=>{eq(got.status,202);eq(got.body.status,'unknown');eq(got.body.success,false);ok(got.body.message.includes('inbox'));});
  }
  const success=await call(subscribe,{method:'POST',body:{email:'synthetic@example.invalid'}},[form,{ok:true,status:200,json:async()=>({success:true})}]);
  check('explicit provider acceptance succeeds',()=>{eq(success.status,200);eq(success.body.success,true);});
  const blocked=await call(subscribe,{method:'POST',body:{email:'synthetic@example.invalid'}},[{ok:false,status:403}]);
  check('blocked form is not submitted',()=>{eq(blocked.calls,1);eq(blocked.status,502);});
  const invalid=await call(subscribe,{method:'POST',body:{email:{}}},[]);
  check('non-string email is rejected without a provider call',()=>{eq(invalid.status,400);eq(invalid.calls,0);});
  const quote=await call(price,{},[{ok:true,json:async()=>({bitcoin:{usd:123,last_updated_at:1700000000}})}]);
  check('quote includes provider freshness timestamp',()=>{eq(quote.body.price,123);eq(quote.body.asOf,'2023-11-14T22:13:20.000Z');});
  const bad=await call(price,{},[{ok:true,json:async()=>({bitcoin:{usd:0}})}]);
  check('non-positive quote is rejected',()=>eq(bad.status,502));
}finally{globalThis.fetch=originalFetch;windows.forEach(w=>w.close());}
report('trust');
