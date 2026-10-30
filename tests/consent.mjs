import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
// Consent contracts use jsdom without external resource loading: no live telemetry.
import {check,eq,ok,report,loadPage,settle,ROOT} from './harness.mjs';
const windows=[]; const page=o=>{const w=loadPage(o);windows.push(w);return w;};
const events=w=>w.dataLayer.map(a=>Array.from(a));
const g=(w,id)=>w.document.getElementById(id);
const key='bgc.analytics-consent.v1';
{
 const w=page();await settle(20);
 check('first visit has no analytics tag or commands',()=>{eq(g(w,'analytics-tag'),null);eq(w.dataLayer.length,0);eq(w['ga-disable-G-T29BL3EPHL'],true);eq(g(w,'analytics-choice').hidden,false);});
 w.gtag('event','synthetic');await w.tmCalculate();
 check('pre-consent interactions are dropped',()=>eq(w.dataLayer.length,0));
 g(w,'analytics-reject').click();
 check('reject saves choice with no tag or queue',()=>{eq(w.localStorage.getItem(key),'rejected');eq(g(w,'analytics-tag'),null);eq(w.dataLayer.length,0);eq(g(w,'analytics-choice').hidden,true);});
 g(w,'analytics-settings').click();
 check('settings reopens equal choices and focuses acceptance',()=>{eq(g(w,'analytics-choice').hidden,false);eq(w.document.activeElement.id,'analytics-accept');eq(g(w,'analytics-accept').className,g(w,'analytics-reject').className);});
 g(w,'analytics-accept').click();
 check('accept inserts only one tag and persists explicit choice',()=>{eq(w.localStorage.getItem(key),'accepted');eq(w.document.querySelectorAll('#analytics-tag').length,1);eq(w['ga-disable-G-T29BL3EPHL'],false);});
 const n=w.dataLayer.length;g(w,'analytics-accept').click();
 check('repeated acceptance does not reload or duplicate config',()=>{eq(w.dataLayer.length,n);eq(w.document.querySelectorAll('#analytics-tag').length,1);});
 w.gtag('event','synthetic');
 check('post-consent event queues normally',()=>eq(events(w).at(-1)[1],'synthetic'));
 w.document.cookie='_ga=synthetic; path=/';w.document.cookie='_ga_T29BL3EPHL=synthetic; path=/';w.document.cookie='unrelated=keep; path=/';
 // jsdom reports navigation unsupported; synchronous disable, cleanup and event rejection are independently asserted.
 g(w,'analytics-withdraw').click();w.gtag('event','after-withdrawal');
 check('withdraw immediately disables, drops queue and removes tag',()=>{eq(w['ga-disable-G-T29BL3EPHL'],true);eq(w.dataLayer.length,0);eq(g(w,'analytics-tag'),null);eq(w.localStorage.getItem(key),'rejected');});
 check('withdraw clears only analytics cookies',()=>{ok(!w.document.cookie.includes('_ga'));ok(w.document.cookie.includes('unrelated=keep'));});
}
for (const state of ['rejected','accepted','unknown']) {
 const w=page({analyticsConsent:state,url:'https://x.test/?amount=secret#date=private'});await settle(20);
 check('reload with '+state+' respects stored preference',()=>{eq(Boolean(g(w,'analytics-tag')),state==='accepted');eq(w['ga-disable-G-T29BL3EPHL'],state!=='accepted');eq(g(w,'analytics-choice').hidden,state!=='unknown');});
 if(state==='accepted')check('accepted config is sanitized and advertising signals off',()=>{const c=events(w).find(a=>a[0]==='config')[2];eq(c.page_location,'https://x.test/');eq(c.allow_google_signals,false);eq(c.allow_ad_personalization_signals,false);ok(!JSON.stringify(events(w)).includes('secret'));});
}
const mainSource=readFileSync(join(ROOT,'index.html'),'utf8');
check('shared secondary-page consent controller matches main exactly',()=>{eq(readFileSync(join(ROOT,'analytics-consent.js'),'utf8'),mainSource.match(/<!-- Optional analytics:[\s\S]*?<script>([\s\S]*?)<\/script>/)[1].trimStart());});
for(const name of ['faq',...readdirSync(join(ROOT,'what-if')).map(y=>'what-if/'+y)]) {
 const source=readFileSync(join(ROOT,name,'index.html'),'utf8');
 check(name+' has only consent-controlled analytics',()=>{ok(source.includes('<script defer src="/analytics-consent.js"></script>'));ok(!source.includes('googletagmanager.com'));ok(!source.includes("gtag('config'"));});
}
check('year generator preserves consent controller',()=>{const source=readFileSync(join(ROOT,'scripts/generate_year_pages.py'),'utf8');ok(source.includes('/analytics-consent.js'));ok(!source.includes('googletagmanager.com'));});
for(const w of windows)w.close();report('Consent contracts');
