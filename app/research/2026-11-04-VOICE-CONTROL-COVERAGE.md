# ขอบเขตการควบคุมแอปด้วยเสียง

ตรวจจาก `app-command-catalog.json`, `executeAppAction` ใน `app.js`, `realtime-client.js` และตัวควบคุม UI เมื่อ 4 พฤศจิกายน 2026

เลือกใช้คำสั่งตามงานใน registry เดิม เพราะเส้นทางนี้ตรวจค่า รอเสียงยืนยัน และรอการเก็บข้อมูลก่อนตอบว่าสำเร็จ การเพิ่มตัวคลิก DOM ทั่วไปจะสร้างอีกเส้นทางที่อาจข้ามกติกาเหล่านี้ การแสดงงานจึงบอกสิ่งที่ระบบทำจริงกับรายการที่เลือก ไม่สร้างภาพจำลองว่า AI กำลังกดปุ่ม

## ช่องว่างที่แก้

- `app.inspect` อ่านหน้าปัจจุบัน หน้าต่างย่อย สถานะหน้าคุย กล้อง รายการที่เลือก และค่าฟอร์มจากรายการชื่อช่องที่อนุญาต ไม่อ่าน DOM ทั้งหน้า ไม่ส่งภาพหรือไฟล์เป็นข้อความบริบท
- `calendar.form.open` เปิดฟอร์มเพิ่มหรือแก้นัด พร้อมร่างชื่อ วัน เวลา และรายละเอียด ยังไม่เขียนฐานข้อมูล
- `summary.history` คืนรายการสรุปที่เก็บจริงให้ AI เลือก id ได้
- `summary.read` คืนเนื้อหาและหลักฐานของฉบับที่เลือก พร้อมแสดงฉบับนั้นใน UI ไม่เดาเนื้อหาเก่าจากบันทึกปัจจุบัน
- การโหลดสรุปล้มเหลวส่ง error กลับ tool แทนข้อความสำเร็จ
- ปุ่มตั้งค่าและคำสั่ง `profile.open` ใช้หน้าต่างเดียวกัน
- บริบทใช้ id ของ record editor ที่เปิดจริง แทน id ที่เคยเลือกไว้

## กลุ่มงานและเส้นทาง

| กลุ่มงาน | คำสั่ง |
|---|---|
| เปิดหน้าและอ่านหน้าที่เลือก | `navigate`, `app.inspect`, `dialog.close` |
| ประวัติ | `history.filter`, `record.list`, `record.edit`, `record.update`, `record.delete` |
| บันทึกสุขภาพ | `record.open`, `record_observation`, `health.confirm`, `health.cancel`, `glucose.talk`, `meal.open`, `meal.talk`, `meal.estimate` |
| นัดหมาย | `calendar.select`, `calendar.move`, `calendar.form.open`, `calendar.list`, `calendar.add`, `calendar.update`, `calendar.cancel` |
| ยาและกิจวัตร | `dose.take`, `dose.undo`, `reminder.snooze`, `activity.set` |
| สรุป | `report.preview`, `report.print`, `summary.generate`, `summary.history`, `summary.read` |
| ครอบครัวและแผน | `care.sharing`, `sharing.set`, `care_plan.open`, `care_plan.set`, `alert.acknowledge` |
| โทรสาธิต | `call_plan.open`, `call_plan.set`, `mock_call.schedule`, `mock_call.cancel`, `mock_call.preview`, `mock_call.accept`, `mock_call.decline` |
| กล้องและภาพ | `camera.open`, `camera.close`, `camera.switch`, `camera.capture`, `image.choose` |
| ความรู้และเว็บ | `knowledge.sources`, `knowledge.lookup`, `web.search`, `medication.lookup` |
| เสียงและหน้าคุย | `audio.settings`, `audio.profile`, `voice.repeat`, `voice.mute`, `voice.unmute`, `conversation.minimize`, `conversation.restore`, `conversation.end` |
| ตั้งค่าและงานที่กำลังทำ | `display.large_text`, `profile.open`, `about.open`, `activity.open`, `activity.close`, `storage.retry`, `storage.latest` |

รายการนี้ยืนยันว่ามีคำสั่งตามกลุ่มงาน ไม่ได้ยืนยันว่าโมเดลจะตีความทุกประโยคได้ถูกต้อง การทดสอบ executor ครอบคลุมเพิ่มนัด รอยืนยัน แก้ ยกเลิก อ่านสรุป และกรณีโหลดสรุปล้มเหลว การทดสอบคำพูดจริงใช้ [บทพูดทดสอบ](../VOICE-TEST-SCRIPT.md)

สิทธิ์ระบบ การเลือกไฟล์ และการยืนยันหน้าต่างพิมพ์ยังต้องอาศัยผู้ใช้ ไมค์ที่พักแล้วรับคำสั่งเปิดตัวเองไม่ได้ การโทรและการแบ่งปันยังเป็นสาธิต การเชื่อม MCP ภายนอกต้องมีการตั้งค่าแหล่งจริง ไม่มีคำสั่งเสียงให้เพิ่มแหล่ง arbitrary หรือเรียก JavaScript ตามอำเภอใจ
