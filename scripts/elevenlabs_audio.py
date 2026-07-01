#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Arcane Covenant — ElevenLabs SFX pipeline.

Generates the full game audio set via /v1/sound-generation into public/audio/.
"""
import requests, os, sys, time, json

API_KEY = os.environ.get("ELEVENLABS_API_KEY", "").strip()
if not API_KEY:
    sys.exit("ERROR: ELEVENLABS_API_KEY not set")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "public", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

URL = "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
HEADERS = {"xi-api-key": API_KEY, "Content-Type": "application/json"}

# name, prompt, duration, prompt_influence, loop
SOUNDS = [
    ("fireball_cast",    "fantasy fireball spell cast, whoosh of flame ignition with magical shimmer, punchy", 1.0, 0.7, False),
    ("fireball_impact",  "fiery explosion impact, magical fireball hitting stone, deep boom with ember crackle tail", 1.4, 0.7, False),
    ("frost_nova",       "icy frost nova burst, sharp crystalline freeze blast expanding outward, glassy shimmer", 1.4, 0.7, False),
    ("arcane_beam",      "continuous arcane energy beam, humming magical laser with electric crackle, seamless loop", 2.5, 0.6, True),
    ("meteor_incoming",  "massive meteor falling from sky, rising whistle and rumbling descent, ominous", 1.8, 0.7, False),
    ("meteor_impact",    "colossal meteor impact explosion, earth-shattering boom with debris and fire, cinematic", 2.2, 0.75, False),
    ("heal_cast",        "holy healing spell, warm gentle chime with angelic shimmer, soothing magical sparkle", 1.2, 0.65, False),
    ("holy_nova",        "radiant holy nova, warm expanding wave of sacred light with choir-like shimmer", 1.8, 0.65, False),
    ("arrow_shot",       "fantasy bow arrow shot, taut string release with sharp arrow whoosh", 0.7, 0.75, False),
    ("poison_hit",       "toxic poison splash, acidic sizzle with wet bubbling hiss", 1.0, 0.7, False),
    ("shield_slam",      "heavy metal shield slam impact, resonant clang with stone crunch", 1.0, 0.75, False),
    ("warrior_taunt",    "fierce warrior battle shout, short aggressive war cry with metallic ring", 1.2, 0.6, False),
    ("boss_roar",        "monstrous giant boss roar, deep guttural rock monster bellow, terrifying, cavernous", 2.2, 0.7, False),
    ("boss_slam",        "giant stone fist slamming ground, massive earth-shaking impact with rock debris", 1.6, 0.75, False),
    ("boss_cast_dark",   "dark evil magic charging, ominous void energy building with dissonant whispers", 1.8, 0.65, False),
    ("boss_enrage",      "monster enrage power-up, deep demonic growl rising with fiery burst", 2.0, 0.65, False),
    ("hero_death",       "fantasy hero death, dramatic fall with fading magical dissolve, somber", 1.5, 0.6, False),
    ("revive_channel",   "angelic resurrection channeling, soft rising holy energy hum with gentle bells, seamless loop", 3.0, 0.55, True),
    ("revive_complete",  "resurrection complete, triumphant warm burst of holy light with ascending chime", 1.5, 0.65, False),
    ("player_hit",       "flesh impact hit on armor, quick thud with grunt, punchy game damage sound", 0.6, 0.7, False),
    ("victory_stinger",  "epic victory fanfare stinger, triumphant orchestral brass hit with magical shimmer, short", 3.5, 0.6, False),
    ("defeat_stinger",   "somber defeat stinger, dark descending orchestral tones with fading echo, tragic", 3.5, 0.6, False),
    ("ui_click",         "crisp fantasy interface click, subtle stone tick with faint magical ping", 0.5, 0.8, False),
    ("ui_hover",         "very soft fantasy interface hover tick, quiet subtle shimmer", 0.5, 0.8, False),
    ("ui_buy",           "gold coins purchase confirm, satisfying coin clink cascade with magical sparkle", 0.9, 0.75, False),
    ("ui_join",          "magical portal join confirmation, warm mystical whoosh with deep bell", 1.2, 0.65, False),
    ("ambience_arena",   "dark arcane arena ambience, low mystical wind, distant deep hum, faint crystal resonance, sparse ember crackles, seamless loop", 14.0, 0.45, True),
]

def gen(name, prompt, duration, influence, loop):
    out = os.path.join(AUDIO_DIR, f"{name}.mp3")
    if os.path.exists(out) and os.path.getsize(out) > 1000:
        print(f"SKIP {name} (exists)", flush=True)
        return True
    payload = {"text": prompt, "duration_seconds": duration, "prompt_influence": influence}
    if loop:
        payload["loop"] = True
    for attempt in range(4):
        try:
            r = requests.post(URL, headers=HEADERS, json=payload, timeout=180)
            if r.status_code == 200:
                with open(out, "wb") as f:
                    f.write(r.content)
                print(f"OK {name} ({len(r.content)//1024} KB)", flush=True)
                return True
            print(f"ERR {name}: HTTP {r.status_code} {r.text[:160]}", flush=True)
            if r.status_code == 429:
                time.sleep(15)
                continue
            if r.status_code in (401, 402):
                return False
        except requests.RequestException as e:
            print(f"ERR {name}: {e}", flush=True)
        time.sleep(5)
    return False

def main():
    print(f"ElevenLabs SFX pipeline — {len(SOUNDS)} sounds", flush=True)
    ok = 0
    for s in SOUNDS:
        if gen(*s):
            ok += 1
        time.sleep(1.0)
    print(f"AUDIO COMPLETE: {ok}/{len(SOUNDS)}", flush=True)

if __name__ == "__main__":
    main()
