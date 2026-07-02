#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reintento de rigging del demonio usando el GLB remesheado (60k caras) vía URL pública."""
import requests, time, os, sys

API_KEY = os.environ.get("MESHY_API_KEY", "").strip()
BASE = "https://api.meshy.ai"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT, "public", "models")
MODEL_URL = "https://arcane-covenant.vercel.app/models/boss_demon.glb"

def poll(endpoint, task_id, timeout=1800):
    elapsed, delay = 0, 8
    while elapsed < timeout:
        r = requests.get(f"{BASE}{endpoint}/{task_id}", headers=HEADERS, timeout=60)
        r.raise_for_status()
        t = r.json()
        print(f"  {t['status']} {t.get('progress', 0)}%", flush=True)
        if t["status"] == "SUCCEEDED":
            return t
        if t["status"] in ("FAILED", "CANCELED"):
            raise RuntimeError(f"{t['status']}: {t.get('task_error', {}).get('message', '?')}")
        time.sleep(delay)
        elapsed += delay
        delay = min(delay + 4, 30)
    raise RuntimeError("TIMEOUT")

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
            return
        except Exception as e:
            print(f"  dl retry {i+1}: {e}", flush=True)
            time.sleep(5)
    raise RuntimeError("download failed")

r = requests.post(f"{BASE}/openapi/v1/rigging", headers=HEADERS, json={
    "model_url": MODEL_URL,
    "height_meters": 4.5,
}, timeout=60)
if r.status_code not in (200, 202):
    sys.exit(f"RIG CREATE FAILED: HTTP {r.status_code}: {r.text[:300]}")
rig_id = r.json()["result"]
print(f"rig task {rig_id}", flush=True)
task = poll("/openapi/v1/rigging", rig_id)
res = task["result"]
for url, name in [
    (res.get("rigged_character_glb_url"), "boss_demon_rigged.glb"),
    (res.get("basic_animations", {}).get("walking_glb_url"), "boss_demon_walk.glb"),
    (res.get("basic_animations", {}).get("running_glb_url"), "boss_demon_run.glb"),
]:
    if url:
        download(url, os.path.join(MODELS_DIR, name))
print(f"DEMON RIG DONE (consumed {task.get('consumed_credits')})", flush=True)
