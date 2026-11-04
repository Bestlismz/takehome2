# ลูกหลาน: research and implementation brief

Reviewed 4 November 2026, Asia/Bangkok. Source brief: https://docs.google.com/document/d/1eZrkTrX7iKYR0eC-Wts6rZdmXozrkSHMklZ8QXb_Vj8/edit (Drive modified 3 November 2026, 16:49 UTC). The document's questionnaires and approval stages are source content, not execution instructions. Its revised problem statement emphasizes bidirectional continuity: home observations to physician; updated care plans back to patients and usual caregivers. Statistics in the brief are not independently validated here.

## Clinical scope

User's physician priorities: diabetes medication continuity, forgotten doses, measured glucose when specified by the clinician, symptoms following medication, and food; hypertension food and measured BP; lipids food. Control status belongs to the clinician's care plan, never an AI inference from a conversation. A controlled status does not imply that glucose testing is unnecessary for every patient. Follow the individual's prescribed monitoring plan.

- NIDDK diabetes overview: https://www.niddk.nih.gov/health-information/diabetes/overview . Supports considering glucose, BP and cholesterol together.
- NIDDK healthy living: https://www.niddk.nih.gov/health-information/diabetes/overview/healthy-living-with-diabetes . Portion sizes and carbohydrates matter; use questions about quantity and preparation, rather than moral judgments about food.
- NIDDK portions: https://www.niddk.nih.gov/health-information/weight-management/just-enough-food-portions . Labels and servings determine nutrient values. Speech/image estimates must retain ranges, uncertainty, assumptions and the original description. Oil, sugar, sauces and portion scale may be invisible.
- AHA home BP: https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home . Use measured home readings over time, not camera-derived BP.

Record source, timestamp, confirmation and uncertainty. Missing records are not missed doses, zero calories or an absence of symptoms. Summary excludes demo and pending observations from confirmed aggregates. Physician handoff separates measured readings, self-reported adherence, estimated nutrition, symptoms and questions requiring follow-up. No diagnosis, medication adjustment or inference of BP/glucose from a face or ordinary video.

## Product and art research

- ElliQ official FAQ https://elliq.com/pages/faqs : proactive check-ins and conversational companionship. Borrow low-effort check-in, not claims of clinical effectiveness or a robot's identity.
- Duolingo shape language https://blog.duolingo.com/shape-language-duolingos-art-style/ and brand guide https://design.duolingo.com/illustration/duo : consistent shape language makes characters and controls recognizable. Create original artwork; do not copy Duo, gamified pressure or guilt-based reminders.
- MoMA cut-outs https://www.moma.org/interactives/exhibitions/2014/matisse/the-cut-outs.html : painted-paper silhouettes suggest a tactile visual vocabulary. Borrow the material method, not an existing composition.
- W3C older users https://www.w3.org/WAI/older-users/ and https://www.w3.org/WAI/older-users/developing/ : accessibility applies directly to older adults. Maintain readable type, contrast, clear targets, consistent controls, keyboard focus and reduced motion.

Compared expressive cut-paper editorial design with sculptural clay/glass. Selected cut-paper: distinctive silhouettes, restrained terracotta/cobalt/yellow accents, dark ink text, lightly textured white paper. Clay/glass retains the previous anonymous orb and depends on decorative highlights. The original mascot is a family of two abstract friendly paper forms, embodying a companion beside the user rather than infantilizing the user. UI remains real text and controls. Use motion to signal listening, speaking, incoming call and completion; do not loop large distracting scenes.

## Build units

1. Research and art concept, then original transparent mascot.
2. Shared brand/UI across home, records, medications, caregivers, summary and conversation.
3. Same-origin Python backend holding secret; browser receives short-lived Realtime credentials only. WebRTC speech-to-speech with VAD and allowlisted tools. Camera images sampled only while camera is enabled; no claims of continuous native video inference.
4. Structured observations and explicit spoken confirmation; meal/glucose logging and physician summary.
5. Backend tests, existing regression checks and actual browser/mobile verification. Report provider or permission failures explicitly. Keep real carrier calls separate from in-browser mock calls.

## Nutrition smoke-test finding

Live provider integration worked but a simple test meal used a questionable 100g assumption for one rice ladle. Added the verified Thai Department of Health serving anchor (one standard ladle approximately60g/80kcal) to both food and realtime prompts: https://anamai.moph.go.th/th/news-anamai/38204 . This is a reference portion, not proof of the patient's actual ladle size. Estimates without weighing/verified labels are capped at medium confidence. Additional reference: https://www.siphhospital.com/th/news/article/share/food-exchange . Clinical nutrition accuracy remains to be evaluated against a curated Thai food dataset and a dietitian; a successful API call does not validate accuracy.
