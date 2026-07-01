#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Arcane Covenant — Meshy asset pipeline (stage 1).

Per model: text-to-image (nano-banana-pro, multi-view, t-pose) -> multi-image-to-3d
(chained via input_task_id, textured + PBR) -> download GLB into public/models/.

Runs all models concurrently, writes progress to scripts/meshy_status.json.
"""
import requests, time, os, sys, json, threading

API_KEY = os.environ.get("MESHY_API_KEY", "").strip()
if not API_KEY:
    sys.exit("ERROR: MESHY_API_KEY not set")

BASE = "https://api.meshy.ai"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT, "public", "models")
STATUS_FILE = os.path.join(ROOT, "scripts", "meshy_status.json")
os.makedirs(MODELS_DIR, exist_ok=True)

STYLE = ("stylized dark fantasy game character, hand-painted PBR textures, "
         "clean silhouette, high quality game asset, neutral dark studio background, full body")

MODELS = [
    {"key": "hero_mage",    "pose": "t-pose", "prompt": f"fire mage hero, ember orange and charcoal black hooded robes with glowing orange runes, ornate wooden staff with fire crystal, {STYLE}"},
    {"key": "hero_warrior", "pose": "t-pose", "prompt": f"knight tank hero, heavy steel-blue plate armor with glowing blue trim, large tower shield on back and one-handed warhammer, {STYLE}"},
    {"key": "hero_cleric",  "pose": "t-pose", "prompt": f"holy cleric hero, white and gold ornate robes with golden trim, glowing golden mace and holy tome, {STYLE}"},
    {"key": "hero_ranger",  "pose": "t-pose", "prompt": f"elven ranger hero, dark green leather armor with hood and glowing green accents, ornate recurve bow, {STYLE}"},
    {"key": "boss_golem",   "pose": "t-pose", "prompt": f"massive bipedal lava golem boss, cracked obsidian rock body with glowing magma veins and molten core in chest, huge stone fists, {STYLE}"},
    {"key": "boss_lich",    "pose": "t-pose", "prompt": f"undead lich sorcerer boss, tattered dark violet robes, glowing cyan void energy in ribcage and eye sockets, floating crown, skeletal hands, {STYLE}"},
    {"key": "boss_demon",   "pose": "t-pose", "prompt": f"massive demon lord boss, dark crimson armored muscular body, huge curved horns, glowing red eyes and chest core, flaming greatsword, {STYLE}"},
]

_lock = threading.Lock()
_status = {m["key"]: {"stage": "queued"} for m in MODELS}

def save_status():
    with _lock:
        with open(STATUS_FILE, "w") as f:
            json.dump(_status, f, indent=2)

def upd(key, **kw):
    with _lock:
        _status[key].update(kw)
    save_status()
    print(f"[{time.strftime('%H:%M:%S')}] {key}: {kw}", flush=True)

def api_post(endpoint, payload, retries=5):
    delay = 5
    for i in range(retries):
        r = requests.post(f"{BASE}{endpoint}", headers=HEADERS, json=payload, timeout=60)
        if r.status_code in (429,) or r.status_code >= 500:
            time.sleep(delay); delay = min(delay * 2, 60); continue
        r.raise_for_status()
        return r.json()["result"]
    raise RuntimeError(f"POST {endpoint} failed after {retries} retries: {r.status_code} {r.text[:200]}")

def poll(endpoint, task_id, timeout=1800):
    elapsed, delay = 0, 8
    while elapsed < timeout:
        try:
            r = requests.get(f"{BASE}{endpoint}/{task_id}", headers=HEADERS, timeout=60)
            r.raise_for_status()
            t = r.json()
            if t["status"] == "SUCCEEDED":
                return t
            if t["status"] in ("FAILED", "CANCELED"):
                raise RuntimeError(f"{endpoint}/{task_id} {t['status']}: {t.get('task_error', {}).get('message', '?')}")
        except requests.RequestException as e:
            print(f"  poll error ({e}), retrying", flush=True)
        time.sleep(delay)
        elapsed += delay
        delay = min(delay + 4, 30)
    raise RuntimeError(f"{endpoint}/{task_id} TIMEOUT after {timeout}s")

def download(url, filepath):
    r = requests.get(url, timeout=600, stream=True)
    r.raise_for_status()
    with open(filepath, "wb") as f:
        for chunk in r.iter_content(chunk_size=65536):
            f.write(chunk)
    return os.path.getsize(filepath)

def run_model(m):
    key = m["key"]
    try:
        # 1. text-to-image multi-view
        upd(key, stage="text-to-image")
        tti_id = api_post("/openapi/v1/text-to-image", {
            "ai_model": "nano-banana-pro",
            "prompt": m["prompt"],
            "generate_multi_view": True,
            "pose_mode": m["pose"],
        })
        upd(key, tti_id=tti_id)
        poll("/openapi/v1/text-to-image", tti_id, timeout=900)
        # 2. multi-image-to-3d chained
        upd(key, stage="image-to-3d")
        i3d_id = api_post("/openapi/v1/multi-image-to-3d", {
            "input_task_id": tti_id,
            "should_texture": True,
            "enable_pbr": True,
            "ai_model": "latest",
        })
        upd(key, i3d_id=i3d_id)
        task = poll("/openapi/v1/multi-image-to-3d", i3d_id, timeout=2400)
        # 3. download GLB
        upd(key, stage="downloading")
        out = os.path.join(MODELS_DIR, f"{key}.glb")
        size = download(task["model_urls"]["glb"], out)
        upd(key, stage="done", glb=f"public/models/{key}.glb", size_mb=round(size / 1048576, 2),
            consumed=task.get("consumed_credits"))
    except Exception as e:
        upd(key, stage="error", error=str(e)[:300])

def main():
    print(f"Meshy pipeline start — {len(MODELS)} models, key {API_KEY[:8]}...", flush=True)
    save_status()
    threads = [threading.Thread(target=run_model, args=(m,), daemon=True) for m in MODELS]
    for t in threads:
        t.start()
        time.sleep(2)  # stagger creates to be gentle on rate limits
    for t in threads:
        t.join()
    ok = sum(1 for v in _status.values() if v.get("stage") == "done")
    print(f"PIPELINE COMPLETE: {ok}/{len(MODELS)} models done", flush=True)
    try:
        b = requests.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=30).json()
        print(f"Remaining balance: {b.get('balance')}", flush=True)
    except Exception:
        pass

if __name__ == "__main__":
    main()
