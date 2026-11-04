from pathlib import Path
import json
import sys
import unittest
from unittest.mock import patch

import httpx
from openai import OpenAI

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from web_search import lookup_medication, search_public_web, public_query, public_source, InvalidSearchQuery, UnverifiedSearch


def result():
    return {
        "id": "resp_search_test", "object": "response", "status": "completed",
        "output": [
            {"type": "web_search_call", "status": "completed", "id": "ws_test", "action": {"type": "search", "query": "public question", "sources": [{"type": "url", "url": "https://www.who.int/news"}]}},
            {"type": "message", "id": "msg_test", "status": "completed", "role": "assistant", "content": [{"type": "output_text", "text": "คำตอบจากแหล่งสาธารณะ", "annotations": [{"type": "url_citation", "url": "https://www.who.int/news", "title": "WHO", "start_index": 0, "end_index": 10}]}]},
        ],
    }


class PublicWebSearch(unittest.TestCase):
    def test_real_sdk_serializes_hosted_search_and_keeps_records_out(self):
        calls = []
        def transport(request):
            calls.append(json.loads(request.content))
            return httpx.Response(200, json=result())
        client = OpenAI(api_key="test-only", http_client=httpx.Client(transport=httpx.MockTransport(transport)), max_retries=0)
        try:
            with patch.object(server, "openai_client", return_value=client), patch.dict("os.environ", {"OPENAI_API_KEY": "test-only"}):
                output = server.handle_api("/api/web-search", {"query": "คำแนะนำอาหารผู้สูงอายุล่าสุด"})
            self.assertTrue(output["ok"])
            self.assertEqual(output["sources"], [{"title": "WHO", "url": "https://www.who.int/news"}])
            self.assertEqual(calls[0]["tools"], [{"type": "web_search", "search_context_size": "low"}])
            self.assertEqual(calls[0]["include"], ["web_search_call.action.sources"])
            self.assertEqual(calls[0]["tool_choice"], "required")
            self.assertFalse(calls[0]["store"])
            self.assertEqual(calls[0]["input"], "คำแนะนำอาหารผู้สูงอายุล่าสุด")
            self.assertNotIn("events", calls[0])
            self.assertNotIn("previous_response_id", calls[0])
        finally:
            client.close()

    def test_no_search_failed_search_incomplete_or_uncited_answer_is_not_success(self):
        for response in [
            {"status": "completed", "output": [result()["output"][1]]},
            {**result(), "status": "incomplete"},
            {"status": "completed", "output": [{"type": "web_search_call", "status": "failed"}, result()["output"][1]]},
            {"status": "completed", "output": [{"type": "web_search_call", "status": "completed"}, {"type": "message", "content": [{"type": "output_text", "text": "unsupported"}]}]},
        ]:
            with self.subTest(response=response), self.assertRaises(UnverifiedSearch):
                search_public_web("อาหารผู้สูงอายุ", lambda *_: response)

    def test_consulted_source_is_returned_when_provider_omits_annotations(self):
        response = result()
        response["output"][1]["content"][0]["annotations"] = []
        output = search_public_web("อาหารผู้สูงอายุ", lambda *_: response)
        self.assertEqual(output["sources"], [{"title": "www.who.int", "url": "https://www.who.int/news"}])

    def test_sources_are_deduplicated_and_unsafe_urls_rejected(self):
        response = result()
        response["output"][1]["content"][0]["annotations"] *= 2
        output = search_public_web("อาหารผู้สูงอายุ", lambda *_: response)
        self.assertEqual(len(output["sources"]), 1)
        for url in ["javascript:alert(1)", "https://127.0.0.1/private", "https://localhost/private", "https://u:p@who.int", "https://metadata.google.internal/", "https://hospital.internal/"]:
            with self.subTest(url=url):
                self.assertIsNone(public_source({"url": url}))

    def test_public_years_allowed_but_patient_readings_and_identifiers_rejected(self):
        self.assertEqual(public_query("WHO diabetes guidance 2026"), "WHO diabetes guidance 2026")
        for query in ["", None, "x" * 401, "ชื่อสมใจ อาหาร", "น้ำตาล 65 ทำยังไง", "ความดัน 180/110", "my glucose is 65", "test@example.com", "0812345678", "data:image/jpeg;base64,private"]:
            with self.subTest(query=query), self.assertRaises(InvalidSearchQuery):
                public_query(query)

    def test_public_medicine_names_and_strengths_are_searchable(self):
        for query in ["ชื่อยา metformin 500 mg ใช้ทำอะไร", "ยาเมทฟอร์มิน 500 มิลลิกรัม ข้อมูลกำกับยา", "ชื่อสามัญยา paracetamol 500 mg"]:
            with self.subTest(query=query):
                self.assertEqual(public_query(query),query)

    def test_opened_web_pages_with_null_sources_do_not_break_cited_results(self):
        response=result()
        response["output"].insert(1,{"type":"web_search_call","status":"completed","action":{"type":"open_page","url":"https://medlineplus.gov/","sources":None}})
        output=search_public_web("ชื่อยา metformin 500 มิลลิกรัม",lambda *_:response)
        self.assertTrue(output["ok"])
        self.assertEqual(output["sources"][0]["url"],"https://www.who.int/news")

    def test_medication_lookup_searches_only_public_label_fields(self):
        requests=[]
        def provider(path,body):
            requests.append(body)
            return result()
        output=lookup_medication("Metformin","500 มิลลิกรัม","general",provider)
        self.assertTrue(output["ok"])
        self.assertEqual(output["medication"],{"name":"Metformin","strength":"500 มิลลิกรัม"})
        self.assertIn("Metformin",requests[0]["input"])
        self.assertIn("MedlinePlus",requests[0]["input"])
        self.assertNotIn("records",requests[0])
        self.assertEqual(output["sources"][0]["url"],"https://www.who.int/news")

    def test_medication_lookup_requires_readable_name_and_no_patient_context(self):
        with patch.object(server,"request_openai") as provider:
            for body in [{"name":"ยาตัวนี้","strength":None,"topic":"general"}, {"name":"ชื่อสมใจ","strength":None,"topic":"general"}, {"name":"Metformin","strength":None,"topic":"general","records":[]}, {"name":"Metformin","strength":"0812345678","topic":"general"}]:
                with self.subTest(body=body), self.assertRaises(server.RequestError):
                    server.handle_api("/api/medication-lookup",body)
            provider.assert_not_called()

    def test_endpoint_rejects_extra_patient_context_before_provider(self):
        with patch.object(server, "request_openai") as provider:
            for body in [{"query": "อาหาร", "records": []}, {"query": "อาหาร", "image": "private"}, {"query": "น้ำตาล 65"}]:
                with self.subTest(body=body), self.assertRaises(server.RequestError) as error:
                    server.handle_api("/api/web-search", body)
                self.assertEqual(error.exception.status, 400)
            provider.assert_not_called()

    def test_realtime_exposes_search_without_household_fields(self):
        tool = next(t for t in server.realtime_tools() if t["name"] == "web_search")
        self.assertEqual(tool["parameters"]["required"], ["query"])
        self.assertFalse(tool["parameters"]["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
