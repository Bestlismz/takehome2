"""Build the English source page and a portable, single-file HTML deck."""
from pathlib import Path
import base64
import json
import re

HERE = Path(__file__).resolve().parent
PITCH = HERE.parent
ROOT = PITCH.parent.parent

translations = {
    'ภาพตัวอย่างถือขวดยา ฉลาก SAMPLE DEMO ONLY': 'Sample photo of a medicine bottle labelled SAMPLE DEMO ONLY',
    'มาสคอตลูกหลาน': 'Luklarn mascot',
    'หน้าจอในโทรศัพท์จำลอง': 'Demo phone navigation',
    'วันนี้ · พื้นที่ดูแลของคุณแม่': 'Today · Mom’s care space',
    'วันนี้เป็นอย่างไรบ้าง<br>เล่าให้ลูกหลานฟังนะ': 'How are you today?<br>Tell me about your day.',
    'วันนี้มีนัดวัดความดัน': 'Blood pressure check today',
    '09:00 · ตามแผนที่ครอบครัวตั้งไว้': '09:00 · Family care plan',
    'บันทึกสุขภาพ': 'Health journal',
    'ตัวอย่างข้อมูล · ไม่ใช่ผู้ป่วยจริง': 'Fictional data · Not a real patient',
    'ความดันที่ยืนยันจากเครื่องวัด': 'Confirmed monitor reading',
    'วันนี้ 09:10 · ผู้ใช้ยืนยันแล้ว': 'Today, 09:10 · User confirmed',
    'ผู้ใช้เล่าว่าทานข้าวต้มปลา': 'Reported eating fish rice soup',
    'มื้อเช้า': 'Breakfast',
    'บันทึกการกินยา': 'Medication check-in',
    'เล่าว่ากินยามื้อเช้าตามแผนแล้ว': 'Reported taking morning medication',
    'ประเด็นติดตาม': 'To follow up',
    'อาการหลังอาหารเย็น': 'Symptoms after dinner',
    'ดูสรุปสำหรับครอบครัว': 'Open family summary',
    'คุยกับลูกหลาน': 'Talk to Luklarn',
    'บทสนทนาจำลอง': 'Sample conversation',
    'เก็บไว้แล้วค่ะ ครอบครัวเปิดดูในสรุปวันนี้ได้เลย': 'Saved. Your family can find it in today’s summary.',
    'ได้เลยค่ะ มื้อเช้าทานข้าวต้มปลา แล้วทานยาตามแผนแล้ว ใช่ไหมคะ': 'Fish rice soup for breakfast, and your morning medicine as planned. Is that right?',
    'เล่าว่าวันนี้ทานอะไร หรือให้ช่วยจำเรื่องไหนได้เลยค่ะ': 'Tell me about your day. I can help you keep track of the little things.',
    'เปิดสรุปวันนี้': 'Open today’s summary',
    'ยืนยันบันทึก': 'Confirm and save',
    'เล่นตัวอย่างบทสนทนา': 'Play a sample conversation',
    'เปิดกล้องจำลอง': 'Open demo camera',
    'คุยพร้อมกล้อง': 'Talk and show',
    'ตัวอย่างการทำงาน · ไม่มีภาพกล้องจริง': 'Demo only · No live camera',
    'ชี้กล้องให้เห็นชื่อยา<br>และข้อความบนฉลาก': 'Show the medicine name<br>and the label clearly.',
    'หากอ่านชื่อยาไม่ชัด ลูกหลานจะถามเพิ่ม และแสดงแหล่งอ้างอิงให้ตรวจค่ะ': 'If the name is unclear, I’ll ask for a closer look and show sources to check.',
    'ลองพูดว่า “ช่วยดูยานี้ให้หน่อย”': 'Try: “Can you check this medicine?”',
    'ตรวจสอบก่อนใช้': 'Review before use',
    'ข้อมูลยาเป็นร่าง ไม่เปลี่ยนคำสั่งยาเอง': 'Draft information. No prescription changes.',
    'กลับไปคุยต่อ': 'Back to our conversation',
    'สาธิตการตรวจฉลาก': 'Try the label check',
    'ปฏิทินดูแลกัน': 'Care calendar',
    'พฤศจิกายน · เดือนตัวอย่าง': 'November · Sample month',
    "['จ','อ','พ','พฤ','ศ','ส','อา'": "['M','T','W','T','F','S','S'",
    '09:00 · วัดความดัน': '09:00 · Blood pressure check',
    'แผนครอบครัว · ยืนยันค่าจากเครื่องวัด': 'Family plan · Confirm monitor reading',
    '18:30 · ถามอาการ': '18:30 · Evening check-in',
    'แผนโทรตัวอย่าง': 'Sample calling plan',
    'พรุ่งนี้ 10:00 · นัดคุยกับลูกสาว': 'Tomorrow, 10:00 · Call daughter',
    'เพิ่มแล้วในเดโมนี้': 'Added to this demo',
    'เพิ่มนัดจำลองแล้ว': 'Demo reminder added',
    'พูดว่า “นัดคุยพรุ่งนี้สิบโมง”': 'Try: “Call tomorrow at ten”',
    'สรุปก่อนพบแพทย์': 'Visit summary',
    'สรุปให้ครอบครัว': 'Family summary',
    'ตัวอย่างข้อมูล · วันนี้': 'Fictional data · Today',
    'มุมมองแพทย์': 'Doctor view',
    'มุมมองลูกหลาน': 'Family view',
    'ข้อมูลพร้อมที่มา': 'Records with sources',
    'วันนี้มีอะไรบ้าง': 'Today at a glance',
    'ผู้ใช้เล่าว่าทานยามื้อเช้าตามแผนแล้ว': 'Reported taking morning medicine as planned',
    'เรื่องยา': 'Medication',
    'ความดัน 128/78 mmHg': 'Blood pressure 128/78 mmHg',
    'เครื่องวัด · วันนี้ 09:10 · ยืนยันแล้ว': 'Monitor · Today, 09:10 · Confirmed',
    'เรื่องที่ติดตามต่อ': 'Next check-in',
    'ถามอาการหลังอาหารเย็น': 'Ask about symptoms after dinner',
    'ตรวจสอบข้อมูลต้นทาง': 'Trace back to the source',
    'บันทึกพร้อมวันเวลา · แยกจากค่าประมาณ': 'Timestamped record · Not an estimate',
    'สลับมุมมองสรุป': 'Switch summary view',
    'สายจำลอง · ไม่โทรออกจริง': 'Simulated call · No real call placed',
    'สวัสดีค่ะ วันนี้เป็นยังไงบ้างคะ<br>ถึงเวลาเล่าเรื่องยาให้ฟังแล้ว': 'Hi, how has your day been?<br>Shall we check in about your medicine?',
    'โทรมาถามไถ่<br>ตามเวลาที่ครอบครัวตั้งไว้': 'Your daily check-in<br>At the time your family chose',
    'จบสายจำลอง': 'End demo call',
    'รับสายจำลอง': 'Answer demo call',
    '1 ใน 5': '1 in 5',
    'คนไทยอายุ 60 ปีขึ้นไป': 'people in Thailand are aged 60+',
    '20.0% ของประชากร · ผลสำรวจปี 2567': '20.0% of the population · 2024 survey',
    'ที่มา: สำนักงานสถิติแห่งชาติ · สำรวจประชากรสูงอายุ 2567': 'Source: Thailand NSO · Survey of Older Persons, 2024',
    'สมาชิกสำหรับครอบครัว': 'Family subscriptions',
    'บทสนทนา บันทึก สรุป และสิทธิ์แชร์<br>ทดสอบราคาและความถี่ใช้ก่อนตั้งแพ็กเกจ': 'Conversations, records, summaries and sharing.<br>Validate pricing and usage before packaging.',
    'ผ่านคลินิกและบริการดูแลที่บ้าน': 'Clinics and home-care partners',
    'บริการตามจำนวนครอบครัวที่ใช้งาน<br>พร้อมช่วยเริ่มต้นและส่งต่องาน': 'Plans based on active households,<br>with onboarding and care handovers.',
    'สมมติฐานโมเดลธุรกิจ · ยังไม่มีรายได้หรือพันธมิตรยืนยัน': 'Business hypotheses · No revenue or confirmed partners yet',
    'ต้นแบบที่สาธิตได้': 'A demonstrable prototype',
    'เสียง + กล้อง + ค้นเว็บ<br>บันทึก PostgreSQL และสรุปที่มีที่มา': 'Voice, camera and web search.<br>PostgreSQL records and source-linked summaries.',
    'ก่อนใช้จริง': 'Next',
    'เตรียมระบบบริการ': 'Prepare for real service',
    'บัญชีและสิทธิ์ผู้ใช้ การทดสอบอุปกรณ์<br>ความปลอดภัย และผู้ให้บริการโทร': 'Accounts, roles and device testing.<br>Safety, privacy and telephony providers.',
    'ร่วมกัน': 'Pilot',
    'นำร่องกับครอบครัว': 'Test with families',
    'วัดการใช้งาน คุณภาพข้อมูล ต้นทุน<br>และความยินดีจ่าย': 'Measure usability, information quality,<br>cost and willingness to pay.',
    'ยังไม่มีผลลัพธ์ทางคลินิกที่พิสูจน์แล้ว<br>ไม่ใช่บริการฉุกเฉิน': 'Clinical outcomes are not yet validated.<br>Not an emergency service.',
    'ดูแลคนที่เรารัก': 'Care for the people we love.',
    'ร่วมออกแบบและทดสอบโครงการนำร่อง': 'Co-design and test a pilot with us.',
    'กดลองในโทรศัพท์ได้ · ข้อมูลและการทำงานจำลอง': 'Try the phone · Fictional data and simulated actions',
    'ไปสไลด์ ': 'Go to slide ',
    'สไลด์ ': 'Slide ',
    'เบราว์เซอร์นี้ไม่อนุญาตเต็มจอ สามารถใช้คำสั่งเต็มจอจากเมนูเบราว์เซอร์ได้': 'Fullscreen is unavailable here. Use your browser’s fullscreen menu instead.',
    'บันทึก': 'Journal', 'ปฏิทิน': 'Calendar', 'สรุป': 'Summary', 'วันนี้': 'Now',
    'ลูกหลาน': 'Luklarn',
}

js = (PITCH / 'pitch.js').read_text()
start = js.index('const slides=[')
end = js.index('\nfunction screen(mode)', start)
content = json.loads((HERE / 'content.json').read_text())
js = js[:start] + 'const slides=' + json.dumps(content, ensure_ascii=False) + ';\n' + js[end:]
# Translate the UI before adding the already-English slide data.
for old in sorted(translations, key=len, reverse=True):
    # Straight apostrophes must be escaped inside JS strings and templates.
    translated = translations[old] if old.startswith("['จ'") else translations[old].replace("'", "\\'")
    js = js.replace(old, translated)
assert not re.search(r'[\u0e00-\u0e7f]', js), 'Untranslated Thai in JavaScript'
js = js.replace("../assets/luklaan-mascot.png", "../../assets/luklaan-mascot.png")
js = js.replace("../assets/medicine-camera-demo.png", "../../assets/medicine-camera-demo.png")
(HERE / 'pitch-en.js').write_text(js)

html = (PITCH / 'index.html').read_text().replace('lang="th"', 'lang="en"')
labels = {'ข้อมูลสาธิต':'Demo data', 'บทพูดประกอบ':'Speaker notes', 'บทพูด (N)':'Speaker notes (N)', 'เต็มหน้าจอ':'Fullscreen', 'เต็มหน้าจอ (F)':'Fullscreen (F)', 'เลือกสไลด์':'Choose a slide', 'สไลด์ก่อนหน้า':'Previous slide', 'สไลด์ถัดไป':'Next slide', 'ลูกหลาน':'Luklarn'}
for old in sorted(labels, key=len, reverse=True):
    html = html.replace(old, labels[old])
html = html.replace('../assets/', '../../assets/').replace('href="pitch.css"','href="../pitch.css"').replace('src="pitch.js"','src="pitch-en.js"')
extra = '''html[lang="en"] .copy h1{font-size:clamp(38px,4.1vw,66px);line-height:1.17;letter-spacing:-1.5px}
html[lang="en"] .copy:has(.stack) h1{font-size:clamp(36px,3.5vw,55px)}
html[lang="en"] .showcase:after{content:'A conversation. A little care.'}
html[lang="en"] .phone h2{font-size:23px;line-height:1.3}
html[lang="en"] .phone-header{font-size:16px}
html[lang="en"] .editorial .stat{font-size:clamp(85px,10vw,150px);letter-spacing:-5px}
html[lang="en"] .feature{grid-template-columns:48px 1fr}
html[lang="en"] .business span{font-size:21px}
@media(max-height:820px) and (min-width:901px){html[lang="en"] .copy:has(.stack) h1{font-size:38px}html[lang="en"] .phone h2{font-size:20px}html[lang="en"] .copy .lead{font-size:17px}}
@media(max-width:900px){html[lang="en"] .copy h1{font-size:38px}html[lang="en"] .copy:has(.stack) h1{font-size:36px}html[lang="en"] .lead{font-size:16px}}
'''
html = html.replace('</head>', '<style>'+extra+'</style>\n</head>')
assert not re.search(r'[\u0e00-\u0e7f]', html)
(HERE / 'index.html').write_text(html)

css = (PITCH / 'pitch.css').read_text().replace('คุยง่าย ดูแลต่อได้','A conversation. A little care.')
portable = html.replace('<link rel="stylesheet" href="../pitch.css">', '<style>'+css+'</style>')
portable = portable.replace('<script type="module" src="pitch-en.js"></script>', '<script type="module">'+js+'</script>')
for name, mime in [('luklaan-mascot.png','image/png'),('favicon.svg','image/svg+xml'),('medicine-camera-demo.png','image/png')]:
    data = 'data:'+mime+';base64,'+base64.b64encode((ROOT/'app/assets'/name).read_bytes()).decode()
    portable = portable.replace('../../assets/'+name, data)
out=ROOT/'output/luklarn-pitch-en.html'
out.parent.mkdir(exist_ok=True)
out.write_text(portable)
assert '../../assets/' not in portable
print(f'{out} ({out.stat().st_size/1024/1024:.1f} MB)')

# Also rebuild the Thai single-file deck with the same bundled assets.
thai = (PITCH/'index.html').read_text()
thai = thai.replace('<link rel="stylesheet" href="pitch.css">', '<style>'+(PITCH/'pitch.css').read_text()+'</style>')
thai = thai.replace('<script type="module" src="pitch.js"></script>', '<script type="module">'+(PITCH/'pitch.js').read_text()+'</script>')
for name, mime in [('luklaan-mascot.png','image/png'),('favicon.svg','image/svg+xml'),('medicine-camera-demo.png','image/png')]:
    data = 'data:'+mime+';base64,'+base64.b64encode((ROOT/'app/assets'/name).read_bytes()).decode()
    thai = thai.replace('../assets/'+name, data)
(ROOT/'output/luklarn-pitch.html').write_text(thai)
print('Thai portable deck rebuilt.')
