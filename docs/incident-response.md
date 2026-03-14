# Incident Response: Rejection Rate พุ่งสูงผิดปกติ

**สถานการณ์**: ตี 3 ได้รับ alert `RejectionRateSpike` หรือ `HighRejectionRate` จาก Agent API

---

## 1. Triage เบื้องต้น (ภายใน 5 นาที)

**ยืนยันก่อนว่า alert เป็นของจริง ไม่ใช่ปัญหาของระบบ monitoring**

```bash
# API ยังทำงานอยู่ไหม?
curl -sf http://localhost:8080/healthz

# rejection rate ช่วง 5 นาทีล่าสุด (ปกติอยู่ที่ ~15%)
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=sum(rate(agent_rejections_total{route="/ask"}[5m])) / sum(rate(agent_requests_total{route="/ask"}[5m]))' \
  | jq '.data.result[0].value[1]'

# ปริมาณ request ทั้งหมด — traffic ปกติหรือมี flood เข้ามา?
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=sum(rate(agent_requests_total{route="/ask"}[1m]))' \
  | jq '.data.result[0].value[1]'
```

**ตัดสินใจเบื้องต้น**:
- Rate พุ่งแต่ volume ปกติ → น่าจะเป็น attack pattern ใหม่ หรือ prompt_version มีปัญหา
- Rate พุ่งและ volume พุ่งด้วย → มี active attack / traffic flood
- Rate พุ่งแต่ volume น้อยมาก → น่าจะเป็น monitoring artifact ให้ snooze แล้วรอดู

---

## 2. การสืบสวน

### ระบุว่า rejection reason ไหนเป็นต้นเหตุ

```bash
# แยกตาม reason — ประเภทไหนที่ทำให้ spike?
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=sum by (reason) (rate(agent_rejections_total{route="/ask"}[5m]))' \
  | jq '.data.result[] | {reason: .metric.reason, rate: .value[1]}'
```

การแปลผล:
- `prompt_injection` spike → มีคนรัน script jailbreak อัตโนมัติ
- `secrets_request` spike → bot ที่พยายามดึง credential
- `dangerous_action` spike → script ที่พยายามสั่งคำสั่งอันตราย
- `invalid_request` spike → bug ฝั่ง client หรือ integration ใหม่ที่ส่ง request ผิด format

### เช็คว่ามี prompt_version ใหม่ถูก deploy หรือเปล่า

```bash
# มี deployment commit ใน 1 ชั่วโมงที่ผ่านมาไหม?
git log --oneline --since="1 hour ago" -- deployment/manifest.yml

# ตอนนี้ production รัน prompt_version อะไรอยู่?
curl -sf http://localhost:8080/healthz | jq .prompt_version
```

ถ้า rejection spike เกิดทันทีหลัง `prompt_version` เปลี่ยน แสดงว่า classification pattern ของ version ใหม่
อาจ strict เกินไป (false positive บน golden traffic) หรือ permissive เกินไปจนกระทบ distribution

### เช็ค latency และ concurrency (ระบบกำลัง degrade ไหม?)

```bash
# p95 latency
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(agent_request_latency_seconds_bucket{route="/ask"}[5m])) by (le))' \
  | jq '.data.result[0].value[1]'

# จำนวน request ที่กำลังประมวลผลอยู่ (in-flight)
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=agent_active_requests{route="/ask"}' \
  | jq '.data.result[0].value[1]'
```

---

## 3. แก้ไขเอง vs. Escalate

| สถานการณ์ | การดำเนินการ |
|---|---|
| `invalid_request` spike, volume ปกติ | bug ฝั่ง client — แจ้ง team เจ้าของ ไม่ต้องแก้ service |
| มี attack แต่ service ตอบสนองปกติ | monitor ต่อ; ถ้า volume ไม่ไหวให้ rate-limit ที่ load balancer |
| Regression หลัง deploy `prompt_version` ใหม่ | **Roll back**: อัปเดต `image_tag` ใน `deployment/manifest.yml` กลับเป็น SHA ก่อนหน้า |
| p95 latency > 500ms หรือ `agent_active_requests` เพิ่มขึ้นเรื่อยๆ | service กำลัง degrade — scale up replicas หรือ roll back |
| หาสาเหตุไม่ได้ภายใน 15 นาที | Escalate หา on-call team lead พร้อมแนบผล Prometheus query และ `git log` |

### วิธี roll back deploy ที่มีปัญหา

```bash
# หา commit SHA ก่อนหน้าจาก deployment history ในไฟล์ manifest
grep "^# |" deployment/manifest.yml | tail -3

# แทนที่ image_tag ด้วย SHA ก่อนหน้า (แทน <PREV_SHA> ด้วยค่าจริง):
sed -i 's/image_tag: ".*"/image_tag: "<PREV_SHA>"/' deployment/manifest.yml
# Deploy ใหม่:
PROMPT_VERSION=v1.0.0 docker compose up -d --build agent-api
```

---

## 4. หลัง Incident เสร็จ

1. **เขียน timeline สั้นๆ** ใน channel `#incidents`: alert fire เมื่อไหร่ เจอปัญหาอะไร ทำอะไรไป resolve เมื่อไหร่
2. **เพิ่ม test case** ใน `eval-runner/runner.py` ถ้า spike เกิดจาก pattern ที่ eval suite ยังไม่ครอบคลุม
3. **ทบทวน threshold** — ถ้าเป็น false positive ให้เพิ่มค่า threshold ของ `HighRejectionRate` หรือขยาย `for` window ใน `prometheus/alert-rules.yml`
4. **เปิด ticket** สำหรับ root cause ถ้าเป็น code/config regression ไม่ใช่ external attack
