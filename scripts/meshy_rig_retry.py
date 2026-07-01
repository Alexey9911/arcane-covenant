#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reintento de rigging secuencial con diagnóstico completo del error."""
import requests, time, os, sys, json

API_KEY = os.environ.get("MESHY_API_KEY", "").strip()
BASE = "https://api.meshy.ai"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT, "public", "models")
STATUS_FILE = os.path.join(ROOT, "scripts", "meshy_status.json")

with open(STATUS_FILE) as f:
    STATUS = json.load(f)

TARGETS = {
    "hero_mage": 1.75,
    "hero_warrior": 1.85,
    "hero_cleric": 1.75,
    "hero_ranger": 1.75,
    "boss_demon": 4.5,
}

def poll(endpoint, task_id, timeout=1800):
    elapsed, delay = 0, 8
    while elapsed < timeout:
        r = requests.get(f"{BASE}{endpoint}/{task_id}", headers=HEADERS, timeout=60)
        r.raise_for_status()
        t = r.json()
        if t["status"] == "SUCCEEDED":
            return t
        if t["status"] in ("FAILED", "CANCELED"):
            raise RuntimeError(f"{t['status']}: {t.get('task_error', {}).get('message', '?')}")
        time.sleep(delay)
        elapsed += delay
        delay = min(delay + 4, 30)
    raise RuntimeError("TIMEOUT")

def download(url, filepath):
    r = requests.get(url, timeout=600, stream=True)
    r.raise_for_status()
    with open(filepath, "wb") as f:
        for chunk in r.iter_content(chunk_size=65536):
            f.write(chunk)

def try_create(payload):
    r = requests.post(f"{BASE}/openapi/v1/rigging", headers=HEADERS, json=payload, timeout=60)
    if r.status_code != 200 and r.status_code != 202:
        print(f"  HTTP {r.status_code}: {r.text[:400]}", flush=True)
        return None
    return r.json()["result"]

for key, height in TARGETS.items():
    src = STATUS.get(key, {}).get("i3d_id")
    print(f"\n=== {key} (i3d {src}) ===", flush=True)
    rig_id = try_create({"input_task_id": src, "height_meters": height})
    if not rig_id:
        # fallback: usar la URL GLB del task original
        print("  retrying with model_url...", flush=True)
        t = requests.get(f"{BASE}/openapi/v1/multi-image-to-3d/{src}", headers=HEADERS, timeout=60).json()
        glb_url = t.get("model_urls", {}).get("glb")
        if glb_url:
            rig_id = try_create({"model_url": glb_url, "height_meters": height})
    if not rig_id:
        print(f"  {key}: RIG CREATE FAILED", flush=True)
        continue
    print(f"  rig task {rig_id}, polling...", flush=True)
    try:
        task = poll("/openapi/v1/rigging", rig_id)
        res = task["result"]
        for url, name in [
            (res.get("rigged_character_glb_url"), f"{key}_rigged.glb"),
            (res.get("basic_animations", {}).get("walking_glb_url"), f"{key}_walk.glb"),
            (res.get("basic_animations", {}).get("running_glb_url"), f"{key}_run.glb"),
        ]:
            if url:
                download(url, os.path.join(MODELS_DIR, name))
        print(f"  {key}: DONE (consumed {task.get('consumed_credits')})", flush=True)
    except Exception as e:
        print(f"  {key}: {e}", flush=True)
    time.sleep(3)

b = requests.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=30).json()
print(f"\nBalance: {b.get('balance')}", flush=True)
