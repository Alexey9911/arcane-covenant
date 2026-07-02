#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Voces de los bosses con ElevenLabs TTS (eleven_multilingual_v2, español).

Cada boss tiene una voz distinta y 5 líneas: intro, phase, enrage, kill, death.
Salida: public/audio/voice/{boss}_{key}.mp3
"""
import requests, os, sys, time, json

API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
if not API_KEY:
    sys.exit("ERROR: ELEVENLABS_API_KEY not set")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "audio", "voice")
os.makedirs(OUT_DIR, exist_ok=True)
HEADERS = {"xi-api-key": API_KEY, "Content-Type": "application/json"}

# (prefs se define más abajo tras listar las voces de la cuenta)
voices = requests.get("https://api.elevenlabs.io/v1/voices", headers=HEADERS, timeout=30).json()["voices"]
# match por primera palabra del nombre ("Brian - Deep, Resonant..." -> "Brian")
by_first = {}
for v in voices:
    first = v["name"].split(" ")[0].strip(" -")
    by_first.setdefault(first, v["voice_id"])
print("voces disponibles:", ", ".join(sorted(by_first.keys())), flush=True)

prefs = {
    "golem": ["Brian", "Bill", "George", "Roger"],      # profunda, resonante
    "lich":  ["Callum", "Daniel", "Eric", "River"],     # rasposa, fría
    "demon": ["Adam", "Harry", "Charlie", "Chris"],     # dominante, feroz
}

chosen = {}
used = set()
for boss, names in prefs.items():
    vid = None
    for n in names:
        if n in by_first and by_first[n] not in used:
            vid = by_first[n]
            used.add(vid)
            break
    if not vid:
        vid = next(v["voice_id"] for v in voices if v["voice_id"] not in used)
        used.add(vid)
    chosen[boss] = vid
print("asignación:", json.dumps(chosen), flush=True)

LINES = {
    "golem": {
        "intro":  "¿Quién osa profanar mi arena? ¡Os convertiré en ceniza!",
        "phase":  "¡La montaña despierta! ¡Sentid su furia!",
        "enrage": "¡Arderéis! ¡Todos arderéis!",
        "kill":   "Cenizas. Solo quedan cenizas.",
        "death":  "Imposible... la piedra... se quiebra...",
    },
    "lich": {
        "intro":  "Vuestras almas ya me pertenecen, mortales.",
        "phase":  "El vacío os devora... lentamente.",
        "enrage": "¡La eternidad os reclama!",
        "kill":   "Qué frágil. Qué inútil.",
        "death":  "El vacío... me llama... a mí...",
    },
    "demon": {
        "intro":  "¡Bienvenidos a vuestro infierno personal!",
        "phase":  "¡Este reino arde con mi ira!",
        "enrage": "¡Sangre! ¡Fuego! ¡Muerte!",
        "kill":   "¡Patético! ¿Quién sigue?",
        "death":  "No... yo soy... eterno...",
    },
}

# ajustes por boss para darle carácter a la voz
SETTINGS = {
    "golem": {"stability": 0.35, "similarity_boost": 0.8, "style": 0.65, "use_speaker_boost": True},
    "lich":  {"stability": 0.55, "similarity_boost": 0.8, "style": 0.5,  "use_speaker_boost": True},
    "demon": {"stability": 0.3,  "similarity_boost": 0.8, "style": 0.75, "use_speaker_boost": True},
}

ok = 0
total = 0
for boss, lines in LINES.items():
    vid = chosen[boss]
    for key, text in lines.items():
        total += 1
        out = os.path.join(OUT_DIR, f"{boss}_{key}.mp3")
        if os.path.exists(out) and os.path.getsize(out) > 1000:
            ok += 1
            print(f"SKIP {boss}_{key}", flush=True)
            continue
        for attempt in range(3):
            try:
                r = requests.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128",
                    headers=HEADERS,
                    json={"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": SETTINGS[boss]},
                    timeout=120,
                )
                if r.status_code == 200:
                    with open(out, "wb") as f:
                        f.write(r.content)
                    ok += 1
                    print(f"OK {boss}_{key} ({len(r.content)//1024} KB)", flush=True)
                    break
                print(f"ERR {boss}_{key}: {r.status_code} {r.text[:150]}", flush=True)
                if r.status_code == 429:
                    time.sleep(12)
                    continue
                break
            except requests.RequestException as e:
                print(f"ERR {boss}_{key}: {e}", flush=True)
                time.sleep(5)
        time.sleep(0.8)
print(f"VOICES COMPLETE: {ok}/{total}", flush=True)
