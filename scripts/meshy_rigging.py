#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Arcane Covenant — Meshy stage 2: auto-rigging + walk/run animations.

Reads i3d task IDs from scripts/meshy_status.json, rigs humanoid models and
downloads rigged.glb + walking.glb + running.glb into public/models/.
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
RIG_STATUS_FILE = os.path.join(ROOT, "scripts", "meshy_rig_status.json")

with open(STATUS_FILE) as f:
    STATUS = json.load(f)

# key -> height_meters (informa la escala del esqueleto)
TARGETS = {
    "hero_mage": 1.75,
    "hero_warrior": 1.85,
    "hero_cleric": 1.75,
    "hero_ranger": 1.75,
    "boss_golem": 4.0,
    "boss_demon": 4.5,
}

_lock = threading.Lock()
_rig = {k: {"stage": "queued"} for k in TARGETS}

def save():
    with _lock:
        with open(RIG_STATUS_FILE, "w") as f:
            json.dump(_rig, f, indent=2)

def upd(key, **kw):
    with _lock:
        _rig[key].update(kw)
    save()
    print(f"[{time.strftime('%H:%M:%S')}] {key}: {kw}", flush=True)

def api_post(endpoint, payload, retries=5):
    delay = 5
    r = None
    for _ in range(retries):
        r = requests.post(f"{BASE}{endpoint}", headers=HEADERS, json=payload, timeout=60)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(delay); delay = min(delay * 2, 60); continue
        r.raise_for_status()
        return r.json()["result"]
    raise RuntimeError(f"POST {endpoint} failed: {r.status_code} {r.text[:200]}")

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
                raise RuntimeError(f"{t['status']}: {t.get('task_error', {}).get('message', '?')}")
        except requests.RequestException as e:
            print(f"  poll error ({e}), retrying", flush=True)
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
    return os.path.getsize(filepath)

def run_rig(key, height):
    try:
        src = STATUS.get(key, {}).get("i3d_id")
        if not src:
            upd(key, stage="error", error="no i3d_id in status file")
            return
        upd(key, stage="rigging")
        rig_id = api_post("/openapi/v1/rigging", {"input_task_id": src, "height_meters": height})
        upd(key, rig_id=rig_id)
        task = poll("/openapi/v1/rigging", rig_id, timeout=1800)
        res = task["result"]
        upd(key, stage="downloading")
        files = {}
        pairs = [
            (res.get("rigged_character_glb_url"), f"{key}_rigged.glb"),
            (res.get("basic_animations", {}).get("walking_glb_url"), f"{key}_walk.glb"),
            (res.get("basic_animations", {}).get("running_glb_url"), f"{key}_run.glb"),
        ]
        for url, name in pairs:
            if url:
                size = download(url, os.path.join(MODELS_DIR, name))
                files[name] = round(size / 1048576, 2)
        upd(key, stage="done", files=files, consumed=task.get("consumed_credits"))
    except Exception as e:
        upd(key, stage="error", error=str(e)[:300])

def main():
    print(f"Meshy rigging start — {len(TARGETS)} models", flush=True)
    save()
    threads = [threading.Thread(target=run_rig, args=(k, h), daemon=True) for k, h in TARGETS.items()]
    for t in threads:
        t.start()
        time.sleep(2)
    for t in threads:
        t.join()
    ok = sum(1 for v in _rig.values() if v.get("stage") == "done")
    print(f"RIGGING COMPLETE: {ok}/{len(TARGETS)}", flush=True)
    try:
        b = requests.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=30).json()
        print(f"Remaining balance: {b.get('balance')}", flush=True)
    except Exception:
        pass

if __name__ == "__main__":
    main()
