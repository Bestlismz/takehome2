import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {html,tr,setLanguage} from '../i18n.js';
import {escapeHTML} from '../data.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const home=source.slice(source.indexOf('function homeView()'),source.indexOf('function metric(',source.indexOf('function homeView()')));
function renderHome(plans=[]){
 const context=vm.createContext({html,tr,state:{calendarPlans:plans},dateKey:()=>'2026-11-04',thaiDate:()=>'4 November 2026',esc:escapeHTML,icon:()=>'',orb:()=>'',button:(_,label)=>`<button>${label}</button>`,mealJournal:()=>'',phoneExperience:{homeCard:()=>''},metric:()=>'',glucoseMetric:()=>''});
 vm.runInContext(home,context);
 return context.homeView();
}

test('English home renders translated owned content and preserves a personal Thai appointment',()=>{
 setLanguage('en');
 const empty=renderHome();
 assert.doesNotMatch(empty,/[\u0e00-\u0e7f]/);
 assert.match(empty,/Somjai/);
 assert.match(empty,/Luklaan/);
 const title='นัดคุณแม่ <script>ไม่ใช่โค้ด</script>';
 const withPlan=renderHome([{id:'personal-id',date:'2026-11-04',at:'09:00',title,status:'active'}]);
 assert.match(withPlan,/นัดคุณแม่ &lt;script&gt;ไม่ใช่โค้ด&lt;\/script&gt;/);
 assert.doesNotMatch(withPlan,/<script>/);
 assert.doesNotMatch(withPlan.replace(escapeHTML(title),''),/[\u0e00-\u0e7f]/);
 setLanguage('th');
 assert.match(renderHome(),/สวัสดีค่ะ คุณสมใจ/);
});

test('journal redesign keeps search, selected category and example choice in both languages',()=>{
 const journal=source.slice(source.indexOf('function historyView()'),source.indexOf('function historyResults()',source.indexOf('function historyView()')));
 const context=vm.createContext({html,tr,ui:{filter:'bloodPressure',historyQuery:'บันทึก "ของฉัน" <script>',showDemo:true},esc:escapeHTML,icon:()=>'',button:(_,label)=>`<button>${label}</button>`,historyResults:()=>'<article>บันทึกต้นฉบับของผู้ใช้</article>'});
 vm.runInContext(journal,context);
 try{
  setLanguage('en');const markup=context.historyView();
  assert.match(markup,/Health journal/);
  assert.match(markup,/id="journal-search"/);
  assert.match(markup,/value="bloodPressure" selected/);
  assert.match(markup,/id="journal-demo" type="checkbox" checked/);
  assert.ok(markup.includes(escapeHTML(context.ui.historyQuery)));
  assert.ok(markup.includes('บันทึกต้นฉบับของผู้ใช้'));
  assert.doesNotMatch(markup,/<script>/);
  setLanguage('th');assert.match(context.historyView(),/บันทึกสุขภาพ/);
 }finally{setLanguage('th');}
});
