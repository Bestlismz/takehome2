import {describe,thaiDate} from './data.js';
import {photoFromFile} from './media.js';
import {tr} from './i18n.js';

const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tabs=()=>[['plans',tr('แผนยา','Medicine plans')],['handover',tr('ส่งต่อดูแล','Handover')],['review',tr('ทบทวนรายงาน','Report review')],['access',tr('สิทธิ์ครอบครัว','Family access')]];
const statusLabel=value=>({draft:tr('ร่าง ยังไม่ใช้เป็นแผนยา','Draft, not an active medicine plan'),pending_review:tr('รอบุคลากรตรวจสอบ','Awaiting an authorized reviewer'),approved:tr('ตรวจสอบแล้ว','Approved'),rejected:tr('ให้แก้ไขก่อน','Rejected'),open:tr('รอส่งต่อ','Open'),completed:tr('ส่งต่อแล้ว','Completed')})[value] || value;
const blankDraft=()=>({title:'',sourceText:'',medications:[{name:'',dose:'',instructions:'',uncertain:true}],uncertainties:[]});
const field=(label,name,value='',extra='')=>`<label class="care-field">${escape(label)}<input name="${name}" value="${escape(value)}" ${extra}></label>`;
const action=(name,label,id='',className='')=>`<button type="button" class="care-action ${className}" data-workflow-action="${name}"${id?` data-id="${escape(id)}"`:''}>${escape(label)}</button>`;
const reviewerFields=()=>`${field(tr('ชื่อผู้ตรวจสอบ','Reviewer name'),'reviewer','','required maxlength="100" autocomplete="name"')}<label class="care-field">${tr('รหัสผู้ตรวจสอบที่ได้รับอนุญาต','Authorized reviewer code')}<input name="reviewerToken" type="password" required autocomplete="off"></label><label class="care-field">${tr('หมายเหตุ','Note')}<textarea name="note" rows="2" maxlength="1000"></textarea></label>`;

export function draftFromValues(values){
  const get=name=>String(values.get(name) || '').trim();
  const indexes=[...values.keys()].filter(key=>/^medName-\d+$/.test(key)).map(key=>Number(key.split('-')[1])).sort((a,b)=>a-b);
  return {title:get('title'),sourceText:get('sourceText'),medications:indexes.map(index=>({name:get(`medName-${index}`),dose:get(`medDose-${index}`),instructions:get(`medInstructions-${index}`),uncertain:values.has(`medUncertain-${index}`)})),uncertainties:get('uncertainties').split('\n').map(value=>value.trim()).filter(Boolean)};
}

function plansMarkup(state,draft,imageName=''){
  return `<p class="care-workflow-note">${tr('เอกสารเป็นร่างจนกว่าบุคลากรที่ได้รับอนุญาตจะตรวจสอบ ระบบไม่เปลี่ยนยาหรือขนาดยาเอง','Documents stay drafts until an authorized professional reviews them. The system does not change medicines or doses.')}</p><form data-workflow-form="draft" class="care-draft-form"><div class="care-document-intake"><label class="care-file">${tr('เพิ่มภาพเอกสารยา','Add a medicine document image')}<input type="file" name="documentImage" accept="image/jpeg,image/png,image/webp" capture="environment"><small>${tr('JPEG, PNG หรือ WebP ไม่เกิน 15 MB · ส่งให้ OpenAI เมื่อเลือกวิเคราะห์','JPEG, PNG or WebP up to 15 MB · Sent to OpenAI only when you choose Analyze')}</small>${imageName?`<small>${tr('ภาพที่เลือก','Selected image')}: ${escape(imageName)}</small>`:''}</label><label class="care-field">${tr('หรือพิมพ์ข้อความจากเอกสาร','Or enter the document text')}<textarea name="sourceText" rows="3" maxlength="12000">${escape(draft.sourceText)}</textarea></label>${action('extract',tr('ช่วยอ่านเอกสาร','Analyze document'))}</div>${field(tr('ชื่อแผนฉบับนี้','Plan title'),'title',draft.title,'required maxlength="120"')}<div class="care-medication-rows">${draft.medications.map((medicine,index)=>`<fieldset><legend>${tr('รายการยา','Medicine')} ${index+1}</legend>${field(tr('ชื่อยา','Medicine name'),`medName-${index}`,medicine.name,'maxlength="160"')}${field(tr('ขนาดยาที่ระบุ','Dose shown on the document'),`medDose-${index}`,medicine.dose,'maxlength="160"')}<label class="care-field">${tr('วิธีใช้ตามเอกสาร','Document instructions')}<textarea name="medInstructions-${index}" rows="2" maxlength="1000">${escape(medicine.instructions)}</textarea></label><label class="care-check"><input type="checkbox" name="medUncertain-${index}"${medicine.uncertain?' checked':''}>${tr('ข้อมูลรายการนี้ยังไม่ชัดเจน','This medicine information is unclear')}</label></fieldset>`).join('')}</div>${action('add-medicine',tr('เพิ่มรายการยา','Add medicine'))}<label class="care-field">${tr('จุดที่ต้องตรวจสอบ เพิ่มหนึ่งเรื่องต่อบรรทัด','Questions to check, one per line')}<textarea name="uncertainties" rows="2" maxlength="3000">${escape(draft.uncertainties.join('\n'))}</textarea></label><button class="care-action primary" type="submit">${tr('เก็บร่างแผนยา','Save draft')}</button></form><div class="care-section-heading"><h3>${tr('ประวัติแผนยา','Plan versions')}</h3><span>${state.plans?.length || 0} ${tr('ฉบับ','versions')}</span></div>${state.plans?.length?state.plans.slice().reverse().map(plan=>`<article class="care-item"><div class="care-item-title"><h4>${escape(plan.title)}</h4><span>${tr('ฉบับ','Version')} ${escape(plan.version)}</span></div><span class="care-state" data-state="${escape(plan.status)}">${escape(statusLabel(plan.status))}${state.activePlanId===plan.id?` · ${tr('ฉบับที่ใช้อยู่','Active version')}`:''}</span><ul>${(plan.medications || []).map(medicine=>`<li><strong>${escape(medicine.name || tr('ยังไม่ระบุชื่อยา','Medicine name missing'))}</strong> ${escape(medicine.dose)}<small>${escape(medicine.instructions)}${medicine.uncertain?` · ${tr('ยังไม่ชัดเจน','Unclear')}`:''}</small></li>`).join('')}</ul>${plan.uncertainties?.length?`<p class="care-warning">${plan.uncertainties.map(escape).join(' · ')}</p>`:''}<details><summary>${tr('ข้อความต้นทาง','Source text')}</summary><p class="care-source-text">${escape(plan.sourceText)}</p></details>${plan.status==='draft'?`<form data-workflow-form="submit-plan" data-id="${escape(plan.id)}"><label class="care-check"><input type="checkbox" name="caregiverReviewed" required>${tr('ตรวจเทียบกับเอกสารแล้ว พร้อมส่งบุคลากรตรวจสอบ','I checked this draft against the document and am ready to submit it for professional review')}</label><button class="care-action" type="submit">${tr('ส่งตรวจสอบ','Submit for review')}</button></form>`:''}${plan.status==='pending_review'?state.reviewerConfigured?`<details class="care-review-details"><summary>${tr('สำหรับผู้ตรวจสอบที่ได้รับอนุญาต','For an authorized reviewer')}</summary><form data-workflow-form="review-plan" data-id="${escape(plan.id)}">${reviewerFields()}<label class="care-field">${tr('ผลการตรวจสอบ','Decision')}<select name="decision"><option value="rejected">${tr('ให้แก้ไขก่อน','Reject for correction')}</option><option value="approved">${tr('ยืนยันแผนที่ตรวจแล้ว','Approve reviewed plan')}</option></select></label><button class="care-action" type="submit">${tr('บันทึกผลตรวจสอบ','Save review')}</button></form></details>`:`<p class="care-workflow-note">${tr('ยังไม่ตั้งค่าผู้ตรวจสอบที่เซิร์ฟเวอร์ จึงยังเปิดใช้แผนไม่ได้','No authorized reviewer is configured on the server, so the plan cannot be activated.')}</p>`:''}${plan.reviewer?`<p class="care-workflow-note">${tr('ตรวจโดย','Reviewed by')} ${escape(plan.reviewer)} · ${escape(plan.reviewNote || '')}</p>`:''}</article>`).join(''):`<p class="care-empty">${tr('ยังไม่มีร่างแผนยา','No medicine plan drafts yet')}</p>`}`;
}

function handoverMarkup(state){
  return `<p class="care-workflow-note">${tr('จดเรื่องที่ผู้ดูแลคนถัดไปควรรู้ และรับทราบเมื่อส่งต่องานแล้ว','Write what the next caregiver needs to know, then mark the handover complete.')}</p><form data-workflow-form="handover"><label class="care-field">${tr('เรื่องที่ส่งต่อ','Handover note')}<textarea name="text" rows="3" required maxlength="2000"></textarea></label>${field(tr('ผู้รับช่วงดูแล','Next caregiver'),'assignee','','required maxlength="100"')}<button class="care-action primary" type="submit">${tr('เก็บเรื่องส่งต่อ','Save handover')}</button></form>${state.handovers?.length?state.handovers.slice().reverse().map(item=>`<article class="care-item"><div class="care-item-title"><h4>${escape(item.assignee)}</h4><span>${escape(statusLabel(item.status))}</span></div><p class="care-source-text">${escape(item.text)}</p>${item.evidence?`<details><summary>${tr('บันทึกต้นทาง','Source record')}</summary><p>${escape(thaiDate(new Date(item.evidence.occurredAt)))} · ${escape(describe(item.evidence))}</p></details>`:''}${item.status==='open'?action('complete-handover',tr('รับทราบและส่งต่อแล้ว','Mark complete'),item.id):''}</article>`).join(''):`<p class="care-empty">${tr('ยังไม่มีเรื่องส่งต่อ','No handovers yet')}</p>`}`;
}

function reviewMarkup(state,canOpenSummary=false){
  const summaries=state.summaryOptions || [];
  return `<p class="care-workflow-note">${tr('ผลทบทวนผูกกับรายงานฉบับที่เก็บไว้ แยกจากข้อความที่ AI ร่าง ไม่ใช่คำสั่งรักษาใหม่','Reviews are attached to a saved report, separately from the AI draft. They do not create treatment orders.')}</p>${state.reviewerConfigured?`<form data-workflow-form="report-review"><label class="care-field">${tr('รายงานที่เก็บไว้','Saved report')}<select name="id" required><option value="">${tr('เลือกรายงาน','Choose a report')}</option>${summaries.map(report=>`<option value="${escape(report.id)}">${escape(report.kind)} · ${escape(report.createdAt)}</option>`).join('')}</select></label>${canOpenSummary?action('open-selected-summary',tr('เปิดรายงานต้นทาง','Open source report')):''}${reviewerFields()}<label class="care-field">${tr('สถานะการทบทวน','Review decision')}<select name="decision"><option value="reviewed">${tr('ทบทวนแล้ว','Reviewed')}</option><option value="needs_revision">${tr('ต้องตรวจแก้ข้อมูล','Needs revision')}</option></select></label><button class="care-action primary" type="submit"${summaries.length?'':' disabled'}>${tr('บันทึกการทบทวน','Save review')}</button></form>`:`<p class="care-warning">${tr('ยังไม่ตั้งค่ารหัสผู้ตรวจสอบที่เซิร์ฟเวอร์ จึงไม่สามารถยืนยันว่ารายงานผ่านการทบทวนจากบุคลากรได้','No reviewer credential is configured on the server. Reports cannot be marked as professionally reviewed.')}</p>`}${state.reviews?.length?state.reviews.slice().reverse().map(review=>`<article class="care-item"><h4>${escape(review.reviewer)}</h4><p>${review.decision==='reviewed'?tr('ทบทวนแล้ว','Reviewed'):tr('ต้องตรวจแก้ข้อมูล','Needs revision')}</p><p class="care-source-text">${escape(review.note)}</p><small>${tr('รายงานต้นทาง','Source report')} ${escape(review.summaryId)} · ${escape(review.createdAt)}</small>${canOpenSummary?action('open-summary',tr('เปิดรายงานต้นทาง','Open source report'),review.summaryId):''}</article>`).join(''):`<p class="care-empty">${tr('ยังไม่มีผลทบทวนรายงาน','No report reviews yet')}</p>`}`;
}

function accessMarkup(state,shareUrl){
  return `<p class="care-workflow-note">${tr('ลิงก์นี้อ่านได้เฉพาะสรุปครอบครัวและแผนที่ยืนยันแล้ว ผู้ที่มีลิงก์เปิดอ่านได้จนกว่าจะเพิกถอน จัดส่งให้คนที่คุณไว้ใจด้วยตัวเอง','This link can read only the family summary and approved plan. Anyone with it can read until access is revoked. Share it yourself only with someone you trust.')}</p><form data-workflow-form="access">${field(tr('ชื่อผู้รับสิทธิ์','Access label'),'label','','required maxlength="100"')}<button class="care-action primary" type="submit">${tr('สร้างลิงก์อ่านสรุป','Create summary access link')}</button></form>${shareUrl?`<div class="care-share-result"><label class="care-field">${tr('ลิงก์แสดงครั้งนี้เท่านั้น','Link shown only this time')}<input readonly value="${escape(shareUrl)}" aria-label="${tr('ลิงก์อ่านสรุป','Summary access link')}"></label>${action('copy-link',tr('คัดลอกลิงก์','Copy link'))}</div>`:''}${state.grants?.length?state.grants.slice().reverse().map(grant=>`<article class="care-item"><div class="care-item-title"><h4>${escape(grant.label)}</h4><span>${grant.revokedAt?tr('เพิกถอนแล้ว','Revoked'):tr('อ่านสรุปได้','Can read summary')}</span></div>${!grant.revokedAt?action('revoke-access',tr('เพิกถอนสิทธิ์','Revoke access'),grant.id):''}</article>`).join(''):`<p class="care-empty">${tr('ยังไม่มีลิงก์ที่อนุญาต','No access links yet')}</p>`}`;
}

export function careWorkflowMarkup(state={}, {tab='plans',draft=blankDraft(),shareUrl='',shareGrantId=null,busy=false,message='',canOpenSummary=false,imageName=''}={}){
  const content={plans:()=>plansMarkup(state,draft,imageName),handover:()=>handoverMarkup(state),review:()=>reviewMarkup(state,canOpenSummary),access:()=>accessMarkup(state,shareUrl)};
  return `<div class="care-workflow" aria-busy="${busy}"><nav class="care-workflow-tabs" aria-label="${tr('งานดูแลต่อเนื่อง','Care coordination sections')}">${tabs().map(([key,label])=>`<button type="button" data-workflow-tab="${key}" aria-pressed="${tab===key}">${label}</button>`).join('')}</nav><p class="care-workflow-feedback" role="status">${escape(message)}</p><div class="care-workflow-panel">${(content[tab] || content.plans)()}</div>${state.audit?.length?`<details class="care-audit"><summary>${tr('ประวัติการเปลี่ยนแปลง','Change history')}</summary><ol>${state.audit.slice().reverse().slice(0,12).map(item=>`<li>${escape(item.operation || item.event || item.action)} · ${escape(item.createdAt || item.at || '')}</li>`).join('')}</ol></details>`:''}</div>`;
}

export async function documentImageData(file){
  if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>15*1024*1024)throw new Error(tr('เลือกภาพ JPEG, PNG หรือ WebP ไม่เกิน 15 MB ค่ะ','Choose a JPEG, PNG or WebP image up to 15 MB'));
  const image=await photoFromFile(file);
  if(image.length>1_600_000)throw new Error(tr('ภาพยังมีขนาดใหญ่เกินไป กรุณาถ่ายทีละหน้าค่ะ','The image is still too large. Capture one page at a time.'));
  return image;
}

export function mountCareWorkflow(root,{request,extract,onError=()=>{},onOpenSummary,initialTab='plans',shareBase=typeof location==='undefined'?'':location.origin+location.pathname}={}){
  let state={revision:0,plans:[],handovers:[],reviews:[],grants:[],audit:[]},tab=initialTab,draft=blankDraft(),shareUrl='',shareGrantId=null,busy=false,message='',destroyed=false,imageFile;
  const render=()=>{if(!destroyed)root.innerHTML=careWorkflowMarkup(state,{tab,draft,shareUrl,busy,message,canOpenSummary:typeof onOpenSummary==='function',imageName:imageFile?.name || ''});};
  const fail=error=>{message=error.message || tr('ยังทำรายการไม่ได้ค่ะ','The action did not complete');onError(message);};
  async function refresh(){if(destroyed)throw new Error(tr('ปิดหน้านี้แล้ว','This view is closed'));const loaded=await request({operation:'load'});if(!destroyed){state=loaded;render();}return loaded;}
  async function perform(operation,payload={}){
    if(destroyed)throw new Error(tr('ปิดหน้านี้แล้ว','This view is closed'));
    if(busy)throw new Error(tr('กำลังเก็บรายการก่อนหน้าค่ะ','The previous change is still being saved'));
    busy=true;message=tr('กำลังเก็บข้อมูล','Saving');render();
    try{const result=await request({operation,...payload,expectedRevision:state.revision});if(!destroyed){const {accessToken,...loaded}=result;state=loaded;message=tr('เก็บข้อมูลแล้ว','Saved');if(result.accessToken){shareUrl=shareBase+'#family-access='+encodeURIComponent(result.accessToken);shareGrantId=result.grants?.at(-1)?.id || null;}if(operation==='access.revoke' && payload.id===shareGrantId){shareUrl='';shareGrantId=null;}if(operation==='plan.draft'){draft=blankDraft();imageFile=undefined;}}return result;}
    catch(error){fail(error);try{state=await request({operation:'load'});if(shareGrantId && !state.grants?.some(grant=>grant.id===shareGrantId && !grant.revokedAt)){shareUrl='';shareGrantId=null;}}catch{}throw error;}
    finally{busy=false;render();}
  }
  const values=form=>new FormData(form);
  const captureDraft=()=>{const form=root.querySelector('[data-workflow-form="draft"]');if(form)draft=draftFromValues(values(form));};
  async function analyze(){
    captureDraft();
    if(!draft.sourceText.trim() && !imageFile)throw new Error(tr('เพิ่มภาพหรือข้อความจากเอกสารก่อนค่ะ','Add a document image or text first'));
    if(!extract)throw new Error(tr('ยังไม่เชื่อมการอ่านเอกสารค่ะ','Document analysis is not connected'));
    if(busy)throw new Error(tr('กำลังอ่านเอกสารก่อนหน้าค่ะ','The previous document is still being analyzed'));
    busy=true;message=tr('กำลังอ่านเอกสาร ยังไม่บันทึกแผนยา','Reading the document, without saving a medicine plan');render();
    try{
      const image=imageFile?await documentImageData(imageFile):undefined;
      const result=await extract({text:draft.sourceText,...(image?{image}:{})});
      if(destroyed)return {cancelled:true};
      const value=result.draft || result;draft={...blankDraft(),...value,medications:Array.isArray(value.medications)&&value.medications.length?value.medications:blankDraft().medications,uncertainties:Array.isArray(value.uncertainties)?value.uncertainties:[]};
      message=tr('ได้ร่างแล้ว กรุณาตรวจเทียบกับเอกสารก่อนเก็บ','Draft ready. Check it against the document before saving.');
      return {draft};
    }finally{busy=false;render();}
  }
  async function onClick(event){
    const target=event.target.closest('[data-workflow-tab],[data-workflow-action]');if(!target || !root.contains(target))return;
    event.preventDefault();event.stopPropagation();if(busy)return;
    if(target.dataset.workflowTab){captureDraft();tab=target.dataset.workflowTab;message='';render();return;}
    const name=target.dataset.workflowAction;
    try{
      if(name==='open-summary')await onOpenSummary?.(target.dataset.id);
      if(name==='open-selected-summary'){const id=root.querySelector('[data-workflow-form="report-review"] select[name="id"]')?.value;if(id)await onOpenSummary?.(id);}
      if(name==='add-medicine'){captureDraft();draft.medications.push({name:'',dose:'',instructions:'',uncertain:true});render();}
      if(name==='extract')await analyze();
      if(name==='complete-handover')await perform('handover.complete',{id:target.dataset.id});
      if(name==='revoke-access'){shareUrl='';await perform('access.revoke',{id:target.dataset.id});}
      if(name==='copy-link'){if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(shareUrl);else root.querySelector('.care-share-result input')?.select();message=tr('คัดลอกลิงก์แล้ว','Link copied');}
    }catch(error){if(!['complete-handover','revoke-access'].includes(name))fail(error);}finally{busy=false;render();}
  }
  async function onSubmit(event){
    const form=event.target.closest('[data-workflow-form]');if(!form || !root.contains(form))return;
    event.preventDefault();event.stopPropagation();if(busy)return;
    const data=values(form),kind=form.dataset.workflowForm;
    try{
      if(kind==='draft'){draft=draftFromValues(data);await perform('plan.draft',draft);}
      if(kind==='submit-plan')await perform('plan.submit',{id:form.dataset.id,caregiverReviewed:data.has('caregiverReviewed')});
      if(kind==='review-plan' || kind==='report-review')await perform(kind==='review-plan'?'plan.review':'report.review',{id:kind==='review-plan'?form.dataset.id:String(data.get('id')),decision:String(data.get('decision')),reviewer:String(data.get('reviewer')),reviewerToken:String(data.get('reviewerToken')),note:String(data.get('note') || '')});
      if(kind==='handover')await perform('handover.add',{text:String(data.get('text')),assignee:String(data.get('assignee'))});
      if(kind==='access')await perform('access.create',{label:String(data.get('label')),scope:'family_summary'});
    }catch{}
  }
  function onChange(event){if(event.target.name==='documentImage'){imageFile=event.target.files?.[0];message=imageFile?tr('เลือกภาพแล้ว แตะช่วยอ่านเอกสารเพื่อวิเคราะห์','Image selected. Choose Analyze document to continue.'):'';const status=root.querySelector('.care-workflow-feedback');if(status)status.textContent=message;}}
  root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);root.addEventListener('change',onChange);render();
  const ready=refresh().catch(error=>{fail(error);render();});
  return {ready,refresh,perform,analyze,showTab(value){captureDraft();tab=tabs().some(([key])=>key===value)?value:'plans';render();},destroy(){destroyed=true;imageFile=undefined;shareUrl='';root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);root.removeEventListener('change',onChange);}};
}
