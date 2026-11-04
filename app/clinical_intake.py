"""Structured transcription boundaries. No diagnosis or treatment-plan activation."""
import math


def obj(properties):
    return {"type":"object","additionalProperties":False,"properties":properties,"required":list(properties)}


MEDICATION_DOCUMENT_SCHEMA = obj({
    "title":{"type":"string"}, "sourceText":{"type":"string"},
    "medications":{"type":"array","items":obj({"name":{"type":"string"},"dose":{"type":"string"},"instructions":{"type":"string"},"uncertain":{"type":"boolean"}})},
    "uncertainties":{"type":"array","items":{"type":"string"}}
})
BLOOD_PRESSURE_DISPLAY_SCHEMA = obj({
    "visible":{"type":"boolean"},
    "systolic":{"type":["number","null"]},"diastolic":{"type":["number","null"]},"pulse":{"type":["number","null"]},
    "unit":{"type":["string","null"],"enum":["mmHg","kPa",None]},
    "uncertainties":{"type":"array","items":{"type":"string"}}
})


def validate_medication_draft(draft):
    if not isinstance(draft,dict) or not isinstance(draft.get('medications'),list) or not isinstance(draft.get('uncertainties'),list):
        raise ValueError('ยังอ่านเอกสารยาได้ไม่ครบค่ะ')
    if len(draft['medications'])>30:
        raise ValueError('เอกสารมีรายการยามากเกินไป กรุณาแบ่งหน้าแล้วลองใหม่ค่ะ')
    result={'title':str(draft.get('title',''))[:150],'sourceText':str(draft.get('sourceText',''))[:6000],'medications':[], 'uncertainties':[str(v)[:300] for v in draft['uncertainties'][:20]]}
    for item in draft['medications']:
        if not isinstance(item,dict):raise ValueError('รายการยาไม่ถูกต้องค่ะ')
        row={key:str(item.get(key,'')).strip()[:limit] for key,limit in [('name',150),('dose',120),('instructions',500)]}
        row['uncertain']=item.get('uncertain') is not False or not all(row.values())
        result['medications'].append(row)
    if not result['medications'] and not result['uncertainties']:
        result['uncertainties']=['ยังไม่พบรายการยาที่อ่านได้']
    return result


def validate_blood_pressure_display(result):
    if not isinstance(result,dict) or result.get('visible') is not True or result.get('unit') not in {'mmHg','kPa'} or result.get('uncertainties')!=[]:
        raise ValueError('ยังอ่านหน้าจอเครื่องวัดไม่ชัด กรุณาจัดภาพใหม่ค่ะ')
    values=[result.get('systolic'),result.get('diastolic')]
    if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in values):
        raise ValueError('ยังอ่านค่าความดันไม่ครบค่ะ')
    factor=7.50062 if result['unit']=='kPa' else 1
    systolic,diastolic=[round(v*factor,1) for v in values]
    if not 40<=systolic<=300 or not 20<=diastolic<=200 or diastolic>=systolic:
        raise ValueError('ตรวจค่าความดันบนและล่างจากหน้าจออีกครั้งค่ะ')
    pulse=result.get('pulse')
    if pulse is not None and (isinstance(pulse,bool) or not isinstance(pulse,(int,float)) or not math.isfinite(pulse) or not 20<=pulse<=240):
        raise ValueError('ตัวเลขชีพจรบนหน้าจอยังไม่ชัดค่ะ')
    return {'systolic':systolic,'diastolic':diastolic,'unit':'mmHg','pulse':pulse,'provenance':'camera-cuff-display','timeBasis':'received'}
