#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Boss voices v3: ENGLISH lines + MONSTER processing (ffmpeg).

TTS (deep voices) -> raw temp -> ffmpeg per-boss monster treatment -> public/audio/voice/.
"""
import requests, os, sys, time, json, subprocess, tempfile

API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
if not API_KEY:
    sys.exit("ERROR: ELEVENLABS_API_KEY not set")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "audio", "voice")
os.makedirs(OUT_DIR, exist_ok=True)
HEADERS = {"xi-api-key": API_KEY, "Content-Type": "application/json"}

voices = requests.get("https://api.elevenlabs.io/v1/voices", headers=HEADERS, timeout=30).json()["voices"]
by_first = {}
for v in voices:
    by_first.setdefault(v["name"].split(" ")[0].strip(" -"), v["voice_id"])

prefs = {
    "golem": ["Brian", "Bill", "George"],
    "lich":  ["Callum", "Daniel", "Eric"],
    "demon": ["Adam", "Harry", "Charlie"],
}
chosen, used = {}, set()
for boss, names in prefs.items():
    vid = next((by_first[n] for n in names if n in by_first and by_first[n] not in used), None)
    if not vid:
        vid = next(v["voice_id"] for v in voices if v["voice_id"] not in used)
    used.add(vid)
    chosen[boss] = vid
print("voices:", json.dumps(chosen), flush=True)

LINES = {
    "golem": {
        "intro":  "Who dares enter my arena? I will turn you all to ash!",
        "phase":  "The mountain awakens! Feel its fury!",
        "enrage": "Burn! All of you, burn!",
        "kill":   "Ashes. Only ashes remain.",
        "death":  "Impossible... the stone... breaks...",
    },
    "lich": {
        "intro":  "Your souls already belong to me, mortals.",
        "phase":  "The void devours you... slowly.",
        "enrage": "Eternity claims you all!",
        "kill":   "So fragile. So useless.",
        "death":  "The void... calls... for me...",
    },
    "demon": {
        "intro":  "Welcome to your own personal hell!",
        "phase":  "This realm burns with my rage!",
        "enrage": "Blood! Fire! Death!",
        "kill":   "Pathetic! Who is next?",
        "death":  "No... I am... eternal...",
    },
}

SETTINGS = {
    "golem": {"stability": 0.3, "similarity_boost": 0.75, "style": 0.7, "use_speaker_boost": True},
    "lich":  {"stability": 0.5, "similarity_boost": 0.75, "style": 0.55, "use_speaker_boost": True},
    "demon": {"stability": 0.25, "similarity_boost": 0.75, "style": 0.8, "use_speaker_boost": True},
}

# tratamiento monstruo por boss (ffmpeg)
FILTERS = {
    # gólem: masa de piedra — pitch muy abajo, lento, graves enormes
    "golem": "asetrate=44100*0.76,aresample=44100,atempo=1.12,bass=g=9,volume=1.15,alimiter=limit=0.95",
    # liche: espectral — pitch algo abajo + eco fantasmal + agudos sibilantes
    "lich": "asetrate=44100*0.86,aresample=44100,atempo=1.08,aecho=0.7:0.55:50|85:0.3|0.18,treble=g=4,volume=1.1",
    # demonio: voz doblada infernal — capa a -30% y capa a -45% mezcladas
    "demon": ("[0:a]asplit=2[a1][a2];"
              "[a1]asetrate=44100*0.70,aresample=44100,atempo=1.25[low];"
              "[a2]asetrate=44100*0.55,aresample=44100,atempo=1.6,volume=0.55[sub];"
              "[low][sub]amix=inputs=2:normalize=0,bass=g=8,volume=1.3,alimiter=limit=0.95"),
}

ok, total = 0, 0
tmpdir = tempfile.mkdtemp()
for boss, lines in LINES.items():
    vid = chosen[boss]
    for key, text in lines.items():
        total += 1
        out = os.path.join(OUT_DIR, f"{boss}_{key}.mp3")
        raw = os.path.join(tmpdir, f"{boss}_{key}_raw.mp3")
        done = False
        for attempt in range(3):
            try:
                r = requests.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128",
                    headers=HEADERS,
                    json={"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": SETTINGS[boss]},
                    timeout=120,
                )
                if r.status_code == 200:
                    with open(raw, "wb") as f:
                        f.write(r.content)
                    done = True
                    break
                print(f"TTS ERR {boss}_{key}: {r.status_code}", flush=True)
                if r.status_code == 429:
                    time.sleep(12)
            except requests.RequestException as e:
                print(f"TTS ERR {boss}_{key}: {e}", flush=True)
                time.sleep(5)
        if not done:
            continue
        # ffmpeg monster pass
        filt = FILTERS[boss]
        cmd = ["ffmpeg", "-y", "-i", raw]
        if boss == "demon":
            cmd += ["-filter_complex", filt]
        else:
            cmd += ["-af", filt]
        cmd += ["-codec:a", "libmp3lame", "-b:a", "128k", out]
        res = subprocess.run(cmd, capture_output=True)
        if res.returncode == 0:
            ok += 1
            print(f"OK {boss}_{key} ({os.path.getsize(out)//1024} KB)", flush=True)
        else:
            print(f"FFMPEG ERR {boss}_{key}: {res.stderr.decode()[-200:]}", flush=True)
print(f"MONSTER VOICES: {ok}/{total}", flush=True)
