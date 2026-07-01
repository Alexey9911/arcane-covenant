#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Remesh de todos los modelos a polycount de juego + re-rig de humanoides.

Flujo por modelo: remesh(i3d_id) -> download {key}.glb.
Para riggeables: rigging(input_task_id=remesh_id) -> download _rigged/_walk/_run.
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
with open(STATUS_FILE) as f:
    STATUS = json.load(f)

# key -> (polycount, rig_height o None)
TARGETS = {
    "hero_mage":    (28000, 1.75),
    "hero_warrior": (28000, 1.85),
    "hero_cleric":  (28000, 1.75),
    "hero_ranger":  (28000, 1.75),
    "boss_golem":   (55000, 4.0),
    "boss_lich":    (55000, None),
    "boss_demon":   (60000, None),  # pose estimation falló antes; queda estático
}

_lock = threading.Lock()

def log(msg):
    with _lock:
        print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def api_post_try(paths, payload):
    last = None
    for ep in paths:
        r = requests.post(f"{BASE}{ep}", headers=HEADERS, json=payload, timeout=60)
        if r.status_code in (200, 202):
            return r.json()["result"], ep
        last = f"{ep} -> {r.status_code}: {r.text[:200]}"
    raise RuntimeError(last)

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
            log(f"  poll transient: {e}")
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
            return os.path.getsize(filepath)
        except Exception as e:
            log(f"  dl retry {i+1} {os.path.basename(filepath)}: {e}")
            time.sleep(5)
    raise RuntimeError(f"download failed {filepath}")

def process(key, polycount, rig_height):
    try:
        src = STATUS[key]["i3d_id"]
        log(f"{key}: remesh -> {polycount}")
        remesh_id, ep = api_post_try(["/openapi/v2/remesh", "/openapi/v1/remesh"], {
            "input_task_id": src,
            "target_formats": ["glb"],
            "topology": "triangle",
            "target_polycount": polycount,
        })
        endpoint = ep
        task = poll(endpoint, remesh_id)
        glb = task["model_urls"].get("glb")
        size = download(glb, os.path.join(MODELS_DIR, f"{key}.glb"))
        log(f"{key}: remeshed GLB {size//1048576} MB (consumed {task.get('consumed_credits')})")

        if rig_height:
            log(f"{key}: rigging remeshed...")
            try:
                rig_id, _ = api_post_try(["/openapi/v1/rigging"], {
                    "input_task_id": remesh_id, "height_meters": rig_height,
                })
            except RuntimeError as e:
                log(f"{key}: rig by task failed ({e}); trying model_url")
                rig_id, _ = api_post_try(["/openapi/v1/rigging"], {
                    "model_url": glb, "height_meters": rig_height,
                })
            rt = poll("/openapi/v1/rigging", rig_id)
            res = rt["result"]
            for url, name in [
                (res.get("rigged_character_glb_url"), f"{key}_rigged.glb"),
                (res.get("basic_animations", {}).get("walking_glb_url"), f"{key}_walk.glb"),
                (res.get("basic_animations", {}).get("running_glb_url"), f"{key}_run.glb"),
            ]:
                if url:
                    download(url, os.path.join(MODELS_DIR, name))
            log(f"{key}: RIGGED OK (consumed {rt.get('consumed_credits')})")
        log(f"{key}: DONE")
    except Exception as e:
        log(f"{key}: ERROR {str(e)[:300]}")

def main():
    threads = []
    for key, (pc, h) in TARGETS.items():
        t = threading.Thread(target=process, args=(key, pc, h), daemon=True)
        threads.append(t)
        t.start()
        time.sleep(3)
    for t in threads:
        t.join()
    b = requests.get(f"{BASE}/openapi/v1/balance", headers=HEADERS, timeout=30).json()
    log(f"ALL DONE. Balance: {b.get('balance')}")

if __name__ == "__main__":
    main()
