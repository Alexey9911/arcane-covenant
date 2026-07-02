#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Demonio v2 riggeable: SIN arma fusionada (la espada rompía la pose estimation).

text-to-image (t-pose, manos vacías) -> multi-image-to-3d -> remesh 60k -> rig -> walk/run.
"""
import requests, time, os, sys

API_KEY = os.environ.get("MESHY_API_KEY", "").strip()
BASE = "https://api.meshy.ai"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT, "public", "models")

PROMPT = ("massive demon lord boss, dark crimson armored muscular body, huge curved horns, "
          "glowing red eyes and molten chest core, clawed EMPTY hands with open palms, no weapons, "
          "no wings, bipedal humanoid, symmetrical, stylized dark fantasy game character, "
          "hand-painted PBR textures, clean silhouette, neutral dark studio background, full body")

def post(ep, payload):
    r = requests.post(f"{BASE}{ep}", headers=HEADERS, json=payload, timeout=60)
    if r.status_code not in (200, 202):
        sys.exit(f"POST {ep} -> {r.status_code}: {r.text[:300]}")
    return r.json()["result"]

def poll(ep, tid, timeout=2400):
    elapsed, delay = 0, 8
    while elapsed < timeout:
        r = requests.get(f"{BASE}{ep}/{tid}", headers=HEADERS, timeout=60)
        r.raise_for_status()
        t = r.json()
        if t["status"] == "SUCCEEDED":
            return t
        if t["status"] in ("FAILED", "CANCELED"):
            sys.exit(f"{ep}/{tid} {t['status']}: {t.get('task_error', {}).get('message', '?')}")
        time.sleep(delay)
        elapsed += delay
        delay = min(delay + 4, 30)
    sys.exit("TIMEOUT")

def download(url, name, tries=4):
    path = os.path.join(MODELS_DIR, name)
    for i in range(tries):
        try:
            r = requests.get(url, timeout=900, stream=True)
            r.raise_for_status()
            tmp = path + ".part"
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(chunk_size=65536):
                    f.write(chunk)
            os.replace(tmp, path)
            print(f"OK {name} ({os.path.getsize(path)//1048576} MB)", flush=True)
            return
        except Exception as e:
            print(f"dl retry {i+1}: {e}", flush=True)
            time.sleep(5)
    sys.exit(f"download failed {name}")

print("1/4 text-to-image...", flush=True)
tti = post("/openapi/v1/text-to-image", {
    "ai_model": "nano-banana-pro", "prompt": PROMPT,
    "generate_multi_view": True, "pose_mode": "t-pose",
})
poll("/openapi/v1/text-to-image", tti, 900)

print("2/4 multi-image-to-3d...", flush=True)
i3d = post("/openapi/v1/multi-image-to-3d", {
    "input_task_id": tti, "should_texture": True, "enable_pbr": True, "ai_model": "latest",
})
poll("/openapi/v1/multi-image-to-3d", i3d)

print("3/4 remesh 60k...", flush=True)
rm = post("/openapi/v2/remesh", {
    "input_task_id": i3d, "target_formats": ["glb"], "topology": "triangle", "target_polycount": 60000,
})
rmt = poll("/openapi/v2/remesh", rm)
download(rmt["model_urls"]["glb"], "boss_demon.glb")

print("4/4 rigging...", flush=True)
rig = post("/openapi/v1/rigging", {"input_task_id": rm, "height_meters": 4.5})
rt = poll("/openapi/v1/rigging", rig)
res = rt["result"]
for url, name in [
    (res.get("rigged_character_glb_url"), "boss_demon_rigged.glb"),
    (res.get("basic_animations", {}).get("walking_glb_url"), "boss_demon_walk.glb"),
    (res.get("basic_animations", {}).get("running_glb_url"), "boss_demon_run.glb"),
]:
    if url:
        download(url, name)

b = requests.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=30).json()
print(f"DEMON V2 DONE. Balance: {b.get('balance')}", flush=True)
