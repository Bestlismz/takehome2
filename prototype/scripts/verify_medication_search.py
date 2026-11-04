"""Opt-in live provider check with a public, fictional medicine-label utterance."""
import argparse
import asyncio
import base64
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from openai import AsyncOpenAI

async def verify(audio=False):
    server.load_local_env()
    question="ช่วยเช็กยาตัวนี้ให้หน่อยค่ะ บนฉลากเขียนว่า เมทฟอร์มิน ห้าร้อยมิลลิกรัม"
    async with AsyncOpenAI(timeout=50,max_retries=0) as client:
        sample=None
        if audio:
            speech=await client.audio.speech.create(model="gpt-4o-mini-tts",voice="coral",input=question,response_format="pcm")
            sample=speech.read()
        async with asyncio.timeout(75):
            async with client.realtime.connect(model=server.session_config()["model"]) as connection:
                config=server.session_config()
                config["output_modalities"]=["audio"] if audio else ["text"]
                config["audio"]["input"]["turn_detection"]=None
                config["audio"]["input"]["format"]={"type":"audio/pcm","rate":24000}
                await connection.session.update(session=config)
                if sample:
                    await connection.input_audio_buffer.append(audio=base64.b64encode(sample).decode())
                    await connection.input_audio_buffer.commit()
                else:
                    await connection.conversation.item.create(item={"type":"message","role":"user","content":[{"type":"input_text","text":question}]})
                await connection.response.create()
                followup=False
                tool_responses=set()
                searched=False
                got_answer=False
                async for event in connection:
                    if event.type=="error":
                        raise RuntimeError("Realtime provider error: "+event.error.message)
                    if event.type=="conversation.item.input_audio_transcription.completed":
                        print(json.dumps({"syntheticInputRecognized":bool(event.transcript)},ensure_ascii=False),flush=True)
                    if event.type=="response.function_call_arguments.done":
                        tool_responses.add(event.response_id)
                        args=json.loads(event.arguments)
                        if event.name=="medication_lookup":
                            result=await asyncio.to_thread(server.handle_api,"/api/medication-lookup",args)
                        elif event.name=="web_search":
                            result=await asyncio.to_thread(server.handle_api,"/api/web-search",args)
                        elif event.name=="app_action" and args.get("action")=="web.search":
                            result=await asyncio.to_thread(server.handle_api,"/api/web-search",{"query":args["text"]})
                        else:
                            raise RuntimeError("Expected a medicine search; selected "+event.name)
                        searched=result.get("ok") is True and bool(result.get("sources"))
                        print(json.dumps({"tool":event.name,"verifiedSearch":searched,"sources":result.get("sources")},ensure_ascii=False),flush=True)
                        await connection.conversation.item.create(item={"type":"function_call_output","call_id":event.call_id,"output":json.dumps(result,ensure_ascii=False)})
                        followup=True
                    if event.type in {"response.output_text.done","response.output_audio_transcript.done"} and searched and event.response_id not in tool_responses:
                        text=getattr(event,"text",None) or getattr(event,"transcript","")
                        got_answer=bool(text)
                        print(json.dumps({"replyAfterSearch":got_answer,"outputMode":"audio" if audio else "text"},ensure_ascii=False),flush=True)
                    if event.type=="response.done":
                        if event.response.status!="completed":
                            details=event.response.status_details
                            print(json.dumps({"responseStatus":event.response.status,"reason":getattr(details,"reason",None)},ensure_ascii=False),flush=True)
                            raise RuntimeError("Realtime response did not complete")
                        if followup:
                            followup=False
                            await connection.response.create()
                        elif searched:
                            if not got_answer:raise RuntimeError("Search succeeded but assistant did not answer")
                            return
    raise RuntimeError("No completed search and answer")

if __name__=="__main__":
    parser=argparse.ArgumentParser(description="Live OpenAI check. Incurs API usage. Uses synthetic public medicine information only.")
    parser.add_argument("--audio",action="store_true",help="Generate a Thai sample with TTS, then test actual audio input and audio reply; no microphone capture")
    args=parser.parse_args()
    asyncio.run(verify(args.audio))
