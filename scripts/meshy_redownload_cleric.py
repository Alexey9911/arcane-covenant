#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-descarga los GLB del rig del clérigo (task SUCCEEDED, descarga cortada)."""
import requests, os, time

API_KEY = os.environ.get("MESHY_API_KEY", "").strip()
BASE = "https://api.meshy.ai"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT, "public", "models")
RIG_ID = "019f1f79-9286-7f26-8cec-7b8b3bde950b"

def download(url, filepath, tries=4):
    for i in range(tries):
        try:
            r = requests.get(url, timeout=900, stream=True)
            r.raise_for_status()
            tmp = filepath + ".part"
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(chunk_size=65536):
                    f.write(chunk)
            os.replace(tmp, filepath)
            print(f"OK {os.path.basename(filepath)} ({os.path.getsize(filepath)//1048576} MB)", flush=True)
            return True
        except Exception as e:
            print(f"retry {i+1}: {e}", flush=True)
            time.sleep(5)
    return False

t = requests.get(f"{BASE}/openapi/v1/rigging/{RIG_ID}", headers=HEADERS, timeout=60).json()
res = t.get("result", {})
pairs = [
    (res.get("rigged_character_glb_url"), "hero_cleric_rigged.glb"),
    (res.get("basic_animations", {}).get("walking_glb_url"), "hero_cleric_walk.glb"),
    (res.get("basic_animations", {}).get("running_glb_url"), "hero_cleric_run.glb"),
]
ok = 0
for url, name in pairs:
    if url and download(url, os.path.join(MODELS_DIR, name)):
        ok += 1
print(f"CLERIC REDOWNLOAD: {ok}/3", flush=True)
