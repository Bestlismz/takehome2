"""Create a live Realtime voice sample using a fictional, nonmedical prompt."""
import argparse
import asyncio
import base64
import json
from pathlib import Path
import sys
import wave
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from voice_style import delivery_for
from openai import AsyncOpenAI

async def preview(destination,sample,language="th"):
    server.load_local_env()
    config=server.session_config(language=language)
    config['audio']['input']['turn_detection']=None
    config['audio']['output']['format']={'type':'audio/pcm','rate':24000}
    chunks=bytearray();transcript=''
    async with AsyncOpenAI(timeout=50,max_retries=0) as client:
        async with asyncio.timeout(60):
            async with client.realtime.connect(model=config['model']) as connection:
                await connection.session.update(session=config)
                async for event in connection:
                    if event.type=='error':raise RuntimeError(event.error.message)
                    if event.type=='session.updated':break
                if sample=='greeting':
                    await connection.response.create(response={'instructions':delivery_for(language)['greetingInstructions']})
                else:
                    await connection.conversation.item.create(item={'type':'message','role':'assistant','content':[{'type':'output_text','text':'Hi, I am Luklaan, your AI companion. How are you feeling today?' if language=='en' else 'สวัสดีค่ะ หนูเป็นผู้ช่วยลูกหลานนะคะ วันนี้เป็นยังไงบ้าง'}]})
                    await connection.conversation.item.create(item={'type':'message','role':'user','content':[{'type':'input_text','text':'Can you keep me company for a little while?' if language=='en' else 'อยู่เป็นเพื่อนหน่อย คุยเรื่องอะไรก็ได้'}]})
                    await connection.response.create()
                async for event in connection:
                    if event.type=='error':raise RuntimeError(event.error.message)
                    if event.type=='response.output_audio.delta':chunks.extend(base64.b64decode(event.delta))
                    if event.type=='response.output_audio_transcript.done':transcript=event.transcript
                    if event.type=='response.function_call_arguments.done':raise RuntimeError('Unexpected tool in nonmedical voice sample')
                    if event.type=='response.done':
                        if event.response.status!='completed':raise RuntimeError('Voice sample did not finish')
                        break
    if not chunks or not transcript:raise RuntimeError('No voice sample returned')
    destination=Path(destination).resolve();destination.parent.mkdir(parents=True,exist_ok=True)
    with wave.open(str(destination),'wb') as output:
        output.setnchannels(1);output.setsampwidth(2);output.setframerate(24000);output.writeframes(chunks)
    metadata={'sample':sample,'language':language,'voice':config['audio']['output']['voice'],'transcript':transcript,'path':str(destination)}
    destination.with_suffix('.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
    print(json.dumps(metadata,ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Opt-in OpenAI API usage. Generates a fictional voice sample; does not record microphone audio.')
    parser.add_argument('--output',required=True)
    parser.add_argument('--sample',choices=['greeting','conversation'],default='greeting')
    parser.add_argument('--language',choices=['th','en'],default='th')
    args=parser.parse_args()
    asyncio.run(preview(args.output,args.sample,args.language))
