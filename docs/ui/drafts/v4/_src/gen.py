#!/usr/bin/env python3
"""CELEBER v4 시안용 사진 생성기 (gpt-image-2).

사용: python3 gen.py jobs.json [job_id ...]
jobs.json: [{"id": "u-front", "prompt": "...", "size": "1024x1536", "refs": ["refcrops/user-front.png"]}]
refs가 있으면 /v1/images/edits(인물 일관성), 없으면 /v1/images/generations.
결과: photos/<id>.png
"""
import base64, json, os, sys, concurrent.futures as cf, urllib.request, uuid, mimetypes, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../../../../.."))


def load_key():
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("OPENAI_API_KEY 없음")


KEY = load_key()
MODEL = os.environ.get("IMG_MODEL", "gpt-image-2")


def multipart(fields, files):
    b = uuid.uuid4().hex
    out = []
    for k, v in fields.items():
        out += [f"--{b}\r\n".encode(), f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode(), str(v).encode(), b"\r\n"]
    for k, path in files:
        ct = mimetypes.guess_type(path)[0] or "image/png"
        out += [f"--{b}\r\n".encode(),
                f'Content-Disposition: form-data; name="{k}"; filename="{os.path.basename(path)}"\r\nContent-Type: {ct}\r\n\r\n'.encode(),
                open(path, "rb").read(), b"\r\n"]
    out.append(f"--{b}--\r\n".encode())
    return b"".join(out), f"multipart/form-data; boundary={b}"


def run(job):
    size = job.get("size", "1024x1536")
    quality = job.get("quality", "high")
    refs = [os.path.join(HERE, r) for r in job.get("refs", [])]
    for attempt in range(3):
        try:
            if refs:
                body, ct = multipart({"model": MODEL, "prompt": job["prompt"], "size": size, "quality": quality, "n": 1},
                                     [("image[]", r) for r in refs])
                req = urllib.request.Request("https://api.openai.com/v1/images/edits", data=body,
                                             headers={"Authorization": f"Bearer {KEY}", "Content-Type": ct})
            else:
                body = json.dumps({"model": MODEL, "prompt": job["prompt"], "size": size, "quality": quality, "n": 1}).encode()
                req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=body,
                                             headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=600) as r:
                d = json.load(r)
            img = base64.b64decode(d["data"][0]["b64_json"])
            out = os.path.join(HERE, "photos", job["id"] + ".png")
            open(out, "wb").write(img)
            return job["id"], "ok"
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:400]
            if e.code in (429, 500, 502, 503):
                time.sleep(5 * (attempt + 1)); continue
            return job["id"], f"HTTP {e.code}: {msg}"
        except Exception as e:  # noqa
            err = repr(e)
            time.sleep(3)
    return job["id"], "failed after retries"


if __name__ == "__main__":
    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    only = set(sys.argv[2:])
    if only:
        jobs = [j for j in jobs if j["id"] in only]
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for jid, status in ex.map(run, jobs):
            print(jid, status, flush=True)
