// Private regression candidate: all network calls mocked, no analytics transmitted.
import {check,eq,ok,report,loadPage,settle} from './harness.mjs';
const windows=[]; const page=o=>{const w=loadPage({analyticsConsent:'accepted',...o});windows.push(w);return w;};
const g=(w,id)=>w.document.getElementById(id);
const events=w=>w.dataLayer.map(a=>Array.from(a)).filter(a=>a[0]==='event' && ['calculate_attempt','calculate_error','calculate'].includes(a[1]));
const clear=w=>{w.dataLayer.length=0;};
for(const [fn,calc,field,date] of [['tmCalculate','time_machine','tm-amount','tm-date'],['dcaCalculate','dca','dca-amount','dca-start']]){
 const w=page({url:'https://x.test/?amount=98765&date=2020-01-31&tax=20#tm'});await settle();clear(w);
 g(w,field).value='0'; await w[fn]();
 check(calc+' invalid manual attempt emits only attempt and categorical failure',()=>{const e=events(w);eq(e.length,2);eq(e[0][1],'calculate_attempt');eq(e[1][1],'calculate_error');eq(e[1][2].reason,'invalid_input');eq(e[1][2].calculator,calc);});
 check(calc+' new events contain no inputs or scenario URL',()=>{for(const e of events(w)){eq(e[2].page_location,'https://x.test/');eq(Object.keys(e[2]).sort().join(','),e[1]==='calculate_error'?'calculator,page_location,page_referrer,reason':'calculator,page_location,page_referrer');ok(!JSON.stringify(e).includes('98765'));ok(!JSON.stringify(e).includes('2020-01-31'));}});
 clear(w);await w[fn](true);check(calc+' silent invalid calculation emits nothing',()=>eq(events(w).length,0));
 g(w,field).value='100';g(w,date).value='2020-01-31';clear(w);await w[fn]();check(calc+' success retains original completion event',()=>{const e=events(w);eq(e.map(x=>x[1]).join(','),'calculate_attempt,calculate');});
 clear(w);await w[fn](true);check(calc+' silent successful hydration emits nothing',()=>eq(events(w).length,0));
 // Set the existing quote function to fail deterministically after initialization.
 w.eval('cachedPrice=null; fetchCurrentPrice=async()=>null');clear(w);await w[fn]();
 check(calc+' unavailable live quote is distinct from abandonment',()=>{const e=events(w);eq(e.map(x=>x[1]).join(','),'calculate_attempt,calculate_error');eq(e[1][2].reason,'live_price_unavailable');});
 w.eval('fetchCurrentPrice=async()=>{throw new Error("private arbitrary payload 98765")};');clear(w);await w[fn]();
 check(calc+' exception does not send exception text',()=>{const e=events(w);eq(e.length,2);eq(e[1][2].reason,'calculation_failed');ok(!JSON.stringify(e).includes('private'));});
 // Older pending errors must not appear as a failure after a newer successful attempt.
 w.__rejectOld=null;w.eval('fetchCurrentPrice=()=>new Promise((resolve,reject)=>{window.__rejectOld=reject})');clear(w);const pending=w[fn]();
 w.eval('fetchCurrentPrice=async()=>86603');await w[fn]();w.__rejectOld(new Error('late'));await pending;
 check(calc+' stale rejected attempt emits no false error',()=>{const e=events(w);eq(e.filter(x=>x[1]==='calculate_attempt').length,2);eq(e.filter(x=>x[1]==='calculate').length,1);eq(e.filter(x=>x[1]==='calculate_error').length,0);});
}
{
 const w=page();await settle();w.eval('getHistoricalPrice=()=>null;cachedPrice=86603');clear(w);await w.tmCalculate();
 check('missing purchase history is categorical, never a date payload',()=>eq(events(w).at(-1)[2].reason,'historical_data_unavailable'));
 w.eval('getHistoricalQuote=()=>null;fetchCurrentPrice=async()=>86603');clear(w);await w.dcaCalculate();
 check('DCA no-result history failure is not reported as completion',()=>{eq(events(w).map(x=>x[1]).join(','),'calculate_attempt,calculate_error');eq(events(w).at(-1)[2].reason,'historical_data_unavailable');});
}
for(const w of windows)w.close();report('Failure-funnel contracts');
