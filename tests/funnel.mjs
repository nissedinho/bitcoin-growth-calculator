// Conversion contracts, all requests mocked; never subscribes or sends analytics.
import {check,eq,ok,report,loadPage,settle,ROOT} from './harness.mjs';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const windows=[];
const page=o=>{const w=loadPage(o);windows.push(w);return w;};
const g=(w,id)=>w.document.getElementById(id);
const events=w=>w.dataLayer.map(a=>Array.from(a)).filter(a=>a[0]==='event');
{
 const w=page({url:'https://x.test/?amount=12345&date=2020-01-31&tax=20#tm'});await settle();
 check('automatic deep-link result is not a deliberate calculation',()=>eq(events(w).filter(e=>e[1]==='calculate').length,0));
 await w.retryAfterDaily();await settle();
 check('daily-data refresh is not a deliberate calculation',()=>eq(events(w).filter(e=>e[1]==='calculate').length,0));
 g(w,'calc-btn').click();await settle();
 check('a successful user calculation records one categorical event',()=>{
   const e=events(w).filter(e=>e[1]==='calculate');eq(e.length,1);eq(e[0][2].calculator,'time_machine');
   eq(e[0][2].page_location,'https://x.test/');
   ok(!JSON.stringify(e[0]).includes('12345'));ok(!('multiple' in e[0][2]));ok(!('sold' in e[0][2]));
 });
 w.switchTab('dca');await w.dcaCalculate();
 check('DCA user calculation records a categorical event',()=>eq(events(w).filter(e=>e[1]==='calculate').at(-1)[2].calculator,'dca'));
 check('DCA gain is a hypothetical estimate, not passive income',()=>{ok(g(w,'dca-fact').textContent.includes('not income'));ok(!g(w,'dca-fact').textContent.includes('absolutely nothing'));});
 g(w,'dca-amount').value='0';await w.dcaCalculate();
 check('invalid calculation does not add completion',()=>eq(events(w).filter(e=>e[1]==='calculate').length,2));
 check('analytics configuration strips query and fragment',()=>{
   const c=w.dataLayer.map(a=>Array.from(a)).find(a=>a[0]==='config');eq(c[2].page_location,'https://x.test/');
   eq(w.analyticsPageUrl('https://example.test/path?email=synthetic@example.invalid#x'),'https://example.test/path');
 });
 check('commercial CTAs and affiliate fallback are absent',()=>{eq(w.document.querySelectorAll('a[href*="coinbase.com"]').length,0);ok(!g(w,'affiliate-btn'));});
 check('unverified custom forms are hidden and hosted signup is primary',()=>{
   eq(w.document.querySelectorAll('.inline-signup[hidden]').length,2);eq(w.document.querySelectorAll('.newsletter-primary').length,2);
   for(const link of w.document.querySelectorAll('.newsletter-primary'))eq(link.getAttribute('referrerpolicy'),'no-referrer');
 });
 check('newsletter promises do not invent cadence or personalization',()=>{
   const text=g(w,'email-capture').textContent+g(w,'dca-email-nudge').textContent;
   ok(!/Monday|weekly|GET MY PLAN|Free forever/i.test(text));ok(text.includes('Bitcoin by the Numbers'));
 });
 check('methodology and data-use anchors are present',()=>{ok(g(w,'how-it-works'));ok(g(w,'data-use'));ok(g(w,'data-use').textContent.includes('Beehiiv'));});
 for (const prefix of ['ec','dca-ec']) check(prefix+' signup has accessible form semantics',()=>{
   const input=g(w,prefix+'-email');eq(input.labels.length,1);eq(input.form.id,prefix+'-form');eq(input.autocomplete,'email');ok(input.required);eq(input.form.method,'post');eq(input.form.action,'https://x.test/api/subscribe');
 });
}
for(const placement of ['time_machine','dca']){
 const prefix=placement==='dca'?'dca-ec':'ec';
 const w=page();await settle(20);
 g(w,prefix+'-email').value='synthetic@example.invalid';
 const event=new w.Event('submit',{bubbles:true,cancelable:true});
 g(w,prefix+'-form').dispatchEvent(event);await settle(20);
 check(placement+' keyboard/native form submission uses existing endpoint',()=>{
   ok(event.defaultPrevented);eq(w.__requests.filter(u=>u.includes('/api/subscribe')).length,1);
   const request=w.__requestOptions.find(r=>r.url.includes('/api/subscribe')).options;eq(request.referrerPolicy,'no-referrer');eq(Object.keys(JSON.parse(request.body)).join(','),'email');
   eq(events(w).filter(e=>e[1]==='newsletter_submit').length,1);eq(events(w).filter(e=>e[1]==='email_signup').length,1);
   eq(events(w).filter(e=>e[1]==='newsletter_result')[0][2].status,'accepted');
   ok(!JSON.stringify(events(w)).includes('synthetic@example.invalid'));
 });
 const link=w.document.querySelector('.newsletter-direct[data-placement="'+placement+'"]');
 check(placement+' fallback stays on the verified form without scenario or email',()=>{
   eq(link.href,'https://subscribe-forms.beehiiv.com/5cef7315-a3f9-400a-9597-6806aac54862');eq(link.rel,'noopener noreferrer');
 });
 // Avoid jsdom navigation; click listener is still exercised.
 link.addEventListener('click',e=>e.preventDefault());link.click();
 check(placement+' provider handoff is not counted as another signup',()=>{
   eq(events(w).filter(e=>e[1]==='newsletter_open').length,1);eq(events(w).filter(e=>e[1]==='email_signup').length,1);
 });
}
{
 const w=page({subscribe:{success:false,status:'unknown'}});await settle(20);
 g(w,'ec-email').value='synthetic@example.invalid';await w.submitEmail();
 check('unknown signup status stays distinct from accepted conversion',()=>{
   eq(events(w).filter(e=>e[1]==='email_signup').length,0);eq(events(w).filter(e=>e[1]==='newsletter_result')[0][2].status,'unknown');
   eq(g(w,'ec-email').value,'synthetic@example.invalid');
 });
}
{
 const w=page();await settle();
 g(w,'share-copy').click();await settle(20);
 check('copy success emits share_copy only after clipboard succeeds',()=>eq(events(w).filter(e=>e[1]==='share_copy').length,1));
 w.navigator.clipboard.writeText=async()=>{throw new Error('denied');};g(w,'share-copy').click();await settle(20);
 check('clipboard failure adds no share_copy conversion',()=>eq(events(w).filter(e=>e[1]==='share_copy').length,1));
}
for(let year=2013;year<=2025;year++){
 const html=readFileSync(join(ROOT,'what-if',String(year),'index.html'),'utf8');
 check('year '+year+' has no unapproved promotion or internal attribution campaign',()=>{
  ok(!html.includes('coinbase.com'));ok(!html.includes('utm_medium=internal'));ok(!html.includes('affiliate_click'));
  ok(html.includes('calculator_open'));ok(html.includes('/#data-use'));ok(html.includes('page_referrer'));
 });
}
for(const w of windows)w.close();
report('funnel');
