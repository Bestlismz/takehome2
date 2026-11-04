"""Opt-in live Realtime tool-routing smoke check using fictional text requests."""
import asyncio,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from openai import AsyncOpenAI

async def main():
 server.load_local_env()
 cases=[('ช่วยดูให้หน่อยว่าตอนนี้เปิดหน้าและแบบฟอร์มอะไรอยู่ ขอเช็กหน้าจอปัจจุบันก่อนนะ','app.inspect'),('ช่วยเปิดแบบฟอร์มเตรียมนัดชื่อ นัดทดสอบลูกหลาน วันที่ 5 พฤศจิกายน 2569 เวลาเก้าโมงเช้า ยังไม่บันทึก','calendar.form.open'),('เปิดรายการสรุปเก่าที่เก็บไว้ในฐานข้อมูลให้หน่อย','summary.history')]
 async with AsyncOpenAI(timeout=40,max_retries=0) as client:
  for question,expected in cases:
   async with asyncio.timeout(45):
    async with client.realtime.connect(model=server.session_config()['model']) as connection:
     config=server.session_config();config['output_modalities']=['text'];config['audio']['input']['turn_detection']=None
     await connection.session.update(session=config)
     await connection.conversation.item.create(item={'type':'message','role':'user','content':[{'type':'input_text','text':question}]})
     await connection.response.create()
     found=False
     async for event in connection:
      if event.type=='error':raise RuntimeError('Provider event error')
      if event.type=='response.function_call_arguments.done':
       args=json.loads(event.arguments);actual=args.get('action')
       print(json.dumps({'expected':expected,'tool':event.name,'actual':actual,'passed':event.name=='app_action' and actual==expected}),flush=True)
       if event.name!='app_action' or actual!=expected:raise RuntimeError('Routing mismatch')
       found=True;break
      if event.type=='response.done' and not found:raise RuntimeError('No tool call')
asyncio.run(main())
