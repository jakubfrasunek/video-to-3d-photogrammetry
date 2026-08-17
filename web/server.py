#!/usr/bin/env python3
"""Local browser UI for video → Apple Object Capture."""

from __future__ import annotations

import argparse
import json
import queue
import re
import shutil
import subprocess
import threading
import time
import uuid
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
WEB = Path(__file__).resolve().parent
STATIC = WEB / "static"
LIBRARY = Path.home() / "Projects" / "Video to 3D Photogrammetry"
APP_META = LIBRARY / ".app"
SWIFT_SCRIPT = ROOT / "scripts" / "ProcessObjectCapture.swift"
EXPORT_SCRIPT = ROOT / "scripts" / "ExportModelPreview.swift"
LIMITS_SCRIPT = ROOT / "scripts" / "ObjectCaptureLimits.swift"

QUALITY_TO_DETAIL = {
    "preview": "preview",
    "small": "reduced",
    "medium": "medium",
    "full": "full",
    "profi": "raw",
}

QUALITY_WEIGHT = {
    "preview": 0.22,
    "small": 0.42,
    "medium": 1.0,
    "full": 2.6,
    "profi": 6.5,
}

ESTIMATE_BASE_SEC = 180.0
ESTIMATE_PHOTO_REF = 80
ESTIMATE_PHOTO_EXP = 1.35

STAGE_LABELS = {
    "preprocessing": "preprocessing",
    "imagealignment": "imagealignment",
    "pointcloudgeneration": "pointcloudgeneration",
    "meshgeneration": "meshgeneration",
    "texturemapping": "texturemapping",
    "optimization": "optimization",
}

ETA_SEC_RE = re.compile(r"^ETA_SEC\s+([0-9.]+)")
STAGE_RE = re.compile(r"^STAGE\s+(\S+)")


class Cancelled(Exception):
    pass

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".obj": "text/plain; charset=utf-8",
    ".mtl": "text/plain; charset=utf-8",
    ".usdz": "model/vnd.usdz+zip",
    ".json": "application/json; charset=utf-8",
}

PROGRESS_RE = re.compile(
    r"\[(?:=|-)+\]\s+(\d+)\s*%(?:\s+elapsed\s+(\S+))?"
)

STATUS_FROM_LINE = (
    ("input loaded", "photos_loaded"),
    ("automatic downsampling", "downsampling"),
    ("invalid sample", "skip_bad_frame"),
    ("skipped sample", "skip_frame"),
    ("model written", "saving_model"),
    ("done in", "finishing_export"),
    ("stitching incomplete", "stitching_incomplete"),
)


def which(name: str) -> str | None:
    return shutil.which(name)


def is_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def run_json(cmd: list[str]) -> dict:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "command failed").strip()
        raise RuntimeError(err)
    return json.loads(result.stdout)


def parse_rate(value: str | None) -> float:
    if not value or value in {"0/0", "N/A"}:
        return 0.0
    if "/" in value:
        num, den = value.split("/", 1)
        try:
            denom = float(den)
            return float(num) / denom if denom else 0.0
        except ValueError:
            return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def format_duration(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    m, s = divmod(total, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}h {m:02d}m {s:02d}s"
    if m:
        return f"{m}m {s:02d}s"
    return f"{s}s"


def slugify(name: str) -> str:
    text = re.sub(r"[^\w\s\-]+", "", name.strip(), flags=re.UNICODE)
    text = re.sub(r"[\s_]+", "-", text).strip("-.")
    return (text[:80] or "project").lower()


def unique_project_id(stem: str) -> str:
    base = slugify(stem)
    if not (LIBRARY / base / "project.json").exists() and not (LIBRARY / base).exists():
        return base
    for index in range(2, 1000):
        candidate = f"{base}-{index}"
        if not (LIBRARY / candidate).exists():
            return candidate
    return f"{base}-{uuid.uuid4().hex[:6]}"


def ensure_library() -> None:
    LIBRARY.mkdir(parents=True, exist_ok=True)
    APP_META.mkdir(parents=True, exist_ok=True)


def analyze_video(path: Path) -> dict:
    data = run_json(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ]
    )
    video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
    if not video:
        raise RuntimeError("no_video_track")

    fps = parse_rate(video.get("avg_frame_rate") or video.get("r_frame_rate"))
    duration = float(video.get("duration") or data.get("format", {}).get("duration") or 0)
    if duration <= 0:
        raise RuntimeError("duration_unreadable")
    raw_frames = video.get("nb_frames")
    if raw_frames and raw_frames != "N/A":
        frames = int(raw_frames)
    else:
        frames = int(round(duration * fps)) if fps and duration else 0

    size = int(data.get("format", {}).get("size") or path.stat().st_size)
    return {
        "filename": path.name,
        "path": str(path),
        "duration_sec": duration,
        "duration_label": format_duration(duration),
        "fps": round(fps, 3),
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "frame_count": frames,
        "codec": video.get("codec_name") or "unknown",
        "size_bytes": size,
        "suggested_photos": suggested_photo_count(duration, frames),
    }


def suggested_photo_count(duration: float, frames: int) -> int:
    if frames and frames < 20:
        return max(1, frames)
    guess = int(round(max(duration, 1) * 2.5))
    return max(40, min(160, guess, frames or guess))


def take_even_subset(files: list[Path], count: int) -> list[Path]:
    if count <= 0 or len(files) <= count:
        return files
    if count == 1:
        keep = {0}
    else:
        keep = {round(i * (len(files) - 1) / (count - 1)) for i in range(count)}
    for index, path in enumerate(files):
        if index not in keep:
            path.unlink(missing_ok=True)
    return [files[i] for i in sorted(keep)]


def ensure_poster(job: Job) -> Path | None:
    if not job.dir or not job.source_path or not job.source_path.is_file():
        return None
    poster = job.dir / "poster.jpg"
    if poster.is_file() and poster.stat().st_size > 0:
        return poster
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(job.source_path),
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(poster),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode == 0 and poster.is_file() and poster.stat().st_size > 0:
        return poster
    poster.unlink(missing_ok=True)
    return None


def stop_proc(proc: subprocess.Popen | None) -> None:
    if not proc or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=4)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=2)


def extract_frames(
    video: Path,
    out_dir: Path,
    count: int,
    duration: float,
    on_progress,
    job: Job | None = None,
) -> int:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    fps = count / max(duration, 0.001)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-i",
        str(video),
        "-vf",
        f"fps={fps:.6f}",
        "-q:v",
        "2",
        str(out_dir / "frame_%04d.jpg"),
        "-progress",
        "pipe:1",
        "-nostats",
    ]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    if job:
        job.attach_proc(proc)
    assert proc.stdout is not None
    last_percent = -1
    try:
        for raw in proc.stdout:
            if job and job.cancel_event.is_set():
                stop_proc(proc)
                raise Cancelled()
            line = raw.strip()
            if line.startswith("out_time_ms="):
                try:
                    elapsed_ms = int(line.split("=", 1)[1])
                except ValueError:
                    continue
                percent = min(99, int(elapsed_ms / max(duration, 0.001) / 10))
                if percent != last_percent:
                    last_percent = percent
                    on_progress(percent)
            elif line == "progress=end":
                on_progress(100)
        if proc.wait() != 0:
            if job and job.cancel_event.is_set():
                raise Cancelled()
            raise RuntimeError("extract_failed")
    finally:
        if job:
            job.attach_proc(None)

    frames = sorted(out_dir.glob("frame_*.jpg"))
    frames = take_even_subset(frames, count)
    if not frames:
        raise RuntimeError("no_frames")
    return len(frames)


def read_process_chunks(proc: subprocess.Popen[bytes], on_text):
    assert proc.stdout is not None
    buf = b""
    while True:
        chunk = proc.stdout.read(256)
        if not chunk:
            break
        buf += chunk
        while True:
            split_at = -1
            for sep in (b"\r", b"\n"):
                idx = buf.find(sep)
                if idx != -1 and (split_at == -1 or idx < split_at):
                    split_at = idx
            if split_at == -1:
                break
            line = buf[:split_at].decode("utf-8", errors="replace").strip()
            buf = buf[split_at + 1 :]
            if line:
                on_text(line)
    leftover = buf.decode("utf-8", errors="replace").strip()
    if leftover:
        on_text(leftover)


def reconstruct(
    images_dir: Path,
    output_usdz: Path,
    detail: str,
    on_text,
    job: Job | None = None,
) -> None:
    output_usdz.parent.mkdir(parents=True, exist_ok=True)
    if output_usdz.exists():
        output_usdz.unlink()
    cmd = [
        "swift",
        str(SWIFT_SCRIPT),
        str(images_dir),
        str(output_usdz),
        detail,
        "sequential",
        "high",
        "masking-off",
    ]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
    )
    if job:
        job.attach_proc(proc)
    try:
        read_process_chunks(proc, on_text)
        if proc.wait() != 0:
            if job and job.cancel_event.is_set():
                raise Cancelled()
            raise RuntimeError("reconstruct_failed")
        if not output_usdz.exists():
            raise RuntimeError("usdz_missing")
    finally:
        if job:
            job.attach_proc(None)


def export_preview(model_path: Path, preview_dir: Path) -> bool:
    if preview_dir.exists():
        shutil.rmtree(preview_dir)
    preview_dir.mkdir(parents=True)
    result = subprocess.run(
        ["swift", str(EXPORT_SCRIPT), str(model_path), str(preview_dir / "model.obj")],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0 and (preview_dir / "model.obj").is_file()


def applescript_string(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def pick_video_paths(prompt: str | None = None) -> list[Path]:
    safe = applescript_string(prompt or "Choose one or more videos")
    script = f"""
set theFiles to (choose file with prompt "{safe}" of type {{"public.movie", "mp4", "mov", "m4v"}} with multiple selections allowed)
set output to ""
repeat with f in theFiles
    set output to output & POSIX path of f & linefeed
end repeat
return output
"""
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        timeout=600,
    )
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "").strip()
        if "User canceled" in message or not message:
            raise RuntimeError("file_pick_cancelled")
        raise RuntimeError(message)
    paths = []
    for line in result.stdout.splitlines():
        text = line.strip()
        if not text:
            continue
        path = Path(text)
        if path.is_file():
            paths.append(path.resolve())
    if not paths:
        raise RuntimeError("no_video_selected")
    return paths


def import_videos(paths: list[Path]) -> list[Job]:
    jobs = []
    for path in paths:
        job = STORE.create()
        materialize_project(job, path)
        job.analysis = analyze_video(job.source_path)
        job.analysis["output_dir"] = str(job.dir)
        job.status = "analyzed"
        persist_job(job)
        ensure_poster(job)
        jobs.append(job)
    return jobs


def friendly_status(line: str) -> str | None:
    lower = line.lower()
    for needle, label in STATUS_FROM_LINE:
        if needle in lower:
            return label
    return None


class Job:
    def __init__(self, job_id: str, directory: Path | None = None):
        self.id = job_id
        self.dir = directory
        self.name = job_id
        self.created_at = time.time()
        self.original_path: str | None = None
        self.source_path: Path | None = None
        self.output_dir: Path | None = directory
        self.frames_dir: Path | None = None
        self.preview_dir: Path | None = None
        self.analysis: dict | None = None
        self.status = "created"
        self.error: str | None = None
        self.quality: str | None = None
        self.photo_count: int | None = None
        self.extracted_count = 0
        self.model_path: Path | None = None
        self.preview_ready = False
        self.variants: list[dict] = []
        self.events: list[dict] = []
        self.subscribers: list[queue.Queue] = []
        self.lock = threading.Lock()
        self.started_at: float | None = None
        self.cancel_event = threading.Event()
        self.current_proc: subprocess.Popen | None = None

    def snapshot(self) -> dict:
        with self.lock:
            variants = [public_variant(item) for item in self.variants]
            return {
                "id": self.id,
                "name": self.name,
                "status": self.status,
                "error": self.error,
                "analysis": self.analysis,
                "quality": self.quality,
                "photo_count": self.photo_count,
                "extracted_count": self.extracted_count,
                "output_dir": str(self.dir) if self.dir else None,
                "library_path": str(LIBRARY),
                "original_path": self.original_path,
                "created_at": self.created_at,
                "model_ready": self.model_path is not None and self.model_path.exists(),
                "model_bytes": self.model_path.stat().st_size if self.model_path and self.model_path.exists() else 0,
                "preview_ready": self.preview_ready,
                "started_at": self.started_at,
                "variants": variants,
                "models": variants,
                "max_images": max_input_images(),
            }

    def emit(self, event: dict) -> None:
        with self.lock:
            self.events.append(event)
            self.events[:] = self.events[-200:]
            subs = list(self.subscribers)
        for sub in subs:
            sub.put(event)

    def subscribe(self) -> queue.Queue:
        sub: queue.Queue = queue.Queue()
        with self.lock:
            self.subscribers.append(sub)
            history = list(self.events)
        for event in history:
            sub.put(event)
        return sub

    def unsubscribe(self, sub: queue.Queue) -> None:
        with self.lock:
            if sub in self.subscribers:
                self.subscribers.remove(sub)

    def attach_proc(self, proc: subprocess.Popen | None) -> None:
        with self.lock:
            self.current_proc = proc

    def request_cancel(self) -> None:
        self.cancel_event.set()
        with self.lock:
            proc = self.current_proc
        stop_proc(proc)


class JobStore:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self) -> Job:
        job = Job(uuid.uuid4().hex[:10])
        with self._lock:
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def put(self, job: Job) -> None:
        with self._lock:
            self._jobs[job.id] = job

    def rekey(self, old_id: str, job: Job) -> None:
        with self._lock:
            self._jobs.pop(old_id, None)
            self._jobs[job.id] = job

    def any_processing(self) -> bool:
        with self._lock:
            return any(job.status == "processing" for job in self._jobs.values())

    def remove(self, job_id: str) -> None:
        with self._lock:
            self._jobs.pop(job_id, None)


STORE = JobStore()
TIMING_PATH = APP_META / "timing.json"
LIMITS_PATH = APP_META / "limits.json"
_LIMITS_CACHE: dict | None = None
_LIMITS_LOCK = threading.Lock()


class EtaSmoother:
    def __init__(self, seed: float | None = None):
        self.value = seed

    def update(self, seconds: float) -> float:
        if seconds < 0:
            return self.value if self.value is not None else 0.0
        if self.value is None:
            self.value = seconds
        else:
            limited = min(max(seconds, self.value * 0.55), self.value * 1.45)
            self.value = 0.72 * self.value + 0.28 * limited
        return self.value


def default_timing() -> dict:
    return {"machine_factor": 1.0, "samples": []}


def load_timing() -> dict:
    if not TIMING_PATH.is_file():
        return default_timing()
    try:
        data = json.loads(TIMING_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default_timing()
    factor = data.get("machine_factor", 1.0)
    try:
        factor = min(4.0, max(0.35, float(factor)))
    except (TypeError, ValueError):
        factor = 1.0
    samples = data.get("samples") if isinstance(data.get("samples"), list) else []
    return {"machine_factor": factor, "samples": samples[-30:]}


def pixel_factor(width: int | None, height: int | None) -> float:
    area = max(1, int(width or 1920) * int(height or 1080))
    return min(2.2, max(0.7, area / (1920 * 1080)))


def estimate_seconds(
    quality: str,
    photos: int,
    analysis: dict | None = None,
    reuse_frames: bool = False,
    machine_factor: float | None = None,
) -> dict:
    weight = QUALITY_WEIGHT.get(quality, 1.0)
    factor = load_timing()["machine_factor"] if machine_factor is None else machine_factor
    info = analysis or {}
    px = pixel_factor(info.get("width"), info.get("height"))
    count = max(2, int(photos or 2))
    extract = 0.0 if reuse_frames else 2.0 + count * 0.05
    scale = (count / ESTIMATE_PHOTO_REF) ** ESTIMATE_PHOTO_EXP
    reconstruct = ESTIMATE_BASE_SEC * weight * scale * factor * px
    preview = 6.0 + weight * 8.0
    return {
        "extract_sec": round(extract, 1),
        "reconstruct_sec": round(reconstruct, 1),
        "preview_sec": round(preview, 1),
        "total_sec": round(extract + reconstruct + preview, 1),
        "machine_factor": factor,
    }


def record_timing(quality: str, photos: int, analysis: dict | None, elapsed: float, reuse_frames: bool) -> None:
    if elapsed < 8:
        return
    raw = estimate_seconds(quality, photos, analysis, reuse_frames, machine_factor=1.0)
    predicted = max(raw["total_sec"], 1.0)
    observed = elapsed / predicted
    timing = load_timing()
    factor = 0.55 * timing["machine_factor"] + 0.45 * min(4.0, max(0.35, observed))
    timing["machine_factor"] = round(factor, 3)
    timing["samples"].append(
        {
            "quality": quality,
            "photos": photos,
            "elapsed_sec": round(elapsed, 1),
            "predicted_sec": round(predicted, 1),
        }
    )
    timing["samples"] = timing["samples"][-30:]
    TIMING_PATH.write_text(json.dumps(timing, ensure_ascii=False, indent=2), encoding="utf-8")


def empty_limits() -> dict:
    return {
        "supported": None,
        "maximumNumberOfInputImages": None,
        "maximumInputImageDimension": None,
        "source": None,
    }


def query_object_capture_limits() -> dict:
    if not LIMITS_SCRIPT.exists() or not which("swift"):
        raise RuntimeError("Object Capture limits script is unavailable.")
    result = subprocess.run(
        ["swift", str(LIMITS_SCRIPT)],
        capture_output=True,
        text=True,
        check=False,
        timeout=90,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "limits failed").strip())
    line = (result.stdout or "").strip().splitlines()[-1]
    data = json.loads(line)
    count = int(data.get("maximumNumberOfInputImages") or 0)
    if count < 2:
        raise RuntimeError("PhotogrammetrySession.limits did not return a photo cap.")
    dimension = int(data.get("maximumInputImageDimension") or 0)
    return {
        "supported": bool(data.get("supported")),
        "maximumNumberOfInputImages": count,
        "maximumInputImageDimension": dimension or None,
        "source": "photogrammetry_session.limits",
    }


def get_limits() -> dict:
    global _LIMITS_CACHE
    with _LIMITS_LOCK:
        if _LIMITS_CACHE and _LIMITS_CACHE.get("maximumNumberOfInputImages"):
            return _LIMITS_CACHE
        if LIMITS_PATH.is_file():
            try:
                data = json.loads(LIMITS_PATH.read_text(encoding="utf-8"))
                if int(data.get("maximumNumberOfInputImages") or 0) >= 2:
                    data["source"] = data.get("source") or "photogrammetry_session.limits"
                    _LIMITS_CACHE = data
                    return data
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                pass
    try:
        data = query_object_capture_limits()
    except Exception:
        return empty_limits()
    with _LIMITS_LOCK:
        _LIMITS_CACHE = data
        try:
            LIMITS_PATH.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass
    return data


def max_input_images() -> int | None:
    try:
        value = int(get_limits().get("maximumNumberOfInputImages") or 0)
    except (TypeError, ValueError):
        return None
    return value if value >= 2 else None


def estimate_payload() -> dict:
    timing = load_timing()
    limits = get_limits()
    return {
        "base_reconstruct_sec": ESTIMATE_BASE_SEC,
        "photo_ref": ESTIMATE_PHOTO_REF,
        "photo_exp": ESTIMATE_PHOTO_EXP,
        "quality_weight": QUALITY_WEIGHT,
        "machine_factor": timing["machine_factor"],
        "max_images": limits.get("maximumNumberOfInputImages"),
        "max_image_dimension": limits.get("maximumInputImageDimension"),
        "supported": limits.get("supported"),
        "limits_source": limits.get("source"),
        "library_path": str(LIBRARY),
    }


def public_variant(item: dict) -> dict:
    model = Path(item["model_path"]) if item.get("model_path") else None
    return {
        "id": item["id"],
        "quality": item.get("quality"),
        "photo_count": item.get("photo_count"),
        "extracted_count": item.get("extracted_count") or 0,
        "preview_ready": bool(item.get("preview_ready")),
        "model_bytes": model.stat().st_size if model and model.exists() else 0,
        "model_name": model.name if model else None,
    }


def find_variant(job: Job, variant_id: str) -> dict | None:
    for item in job.variants:
        if item.get("id") == variant_id:
            return item
    return None


def next_variant_id(job: Job, quality: str, photo_count: int) -> str:
    base = f"{quality}-{photo_count}"
    existing = {item.get("id") for item in job.variants}
    if base not in existing:
        return base
    index = 2
    while f"{base}-{index}" in existing:
        index += 1
    return f"{base}-{index}"


def persist_job(job: Job) -> None:
    if not job.dir:
        return
    payload = {
        "id": job.id,
        "name": job.name,
        "status": job.status,
        "error": job.error,
        "analysis": job.analysis,
        "quality": job.quality,
        "photo_count": job.photo_count,
        "extracted_count": job.extracted_count,
        "source_path": str(job.source_path) if job.source_path else None,
        "original_path": job.original_path,
        "created_at": job.created_at,
        "updated_at": time.time(),
        "output_dir": str(job.dir),
        "frames_dir": str(job.frames_dir) if job.frames_dir else None,
        "preview_dir": str(job.preview_dir) if job.preview_dir else None,
        "model_path": str(job.model_path) if job.model_path else None,
        "preview_ready": job.preview_ready,
        "started_at": job.started_at,
        "variants": job.variants,
    }
    (job.dir / "project.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def job_from_payload(data: dict, directory: Path | None = None) -> Job:
    folder = directory or (Path(data["output_dir"]) if data.get("output_dir") else LIBRARY / data["id"])
    job = Job(data["id"], folder)
    job.name = data.get("name") or data["id"]
    job.status = data.get("status") or "created"
    job.error = data.get("error")
    job.analysis = data.get("analysis")
    job.quality = data.get("quality")
    job.photo_count = data.get("photo_count")
    job.extracted_count = data.get("extracted_count") or 0
    job.source_path = Path(data["source_path"]) if data.get("source_path") else None
    job.original_path = data.get("original_path")
    job.created_at = float(data.get("created_at") or time.time())
    job.output_dir = folder
    job.frames_dir = Path(data["frames_dir"]) if data.get("frames_dir") else None
    job.preview_dir = Path(data["preview_dir"]) if data.get("preview_dir") else None
    job.model_path = Path(data["model_path"]) if data.get("model_path") else None
    job.preview_ready = bool(data.get("preview_ready"))
    job.started_at = float(data["started_at"]) if data.get("started_at") else None
    job.variants = list(data.get("variants") or data.get("models") or [])
    if job.analysis:
        job.analysis["output_dir"] = str(folder)
        if job.source_path:
            job.analysis["path"] = str(job.source_path)
            job.analysis["filename"] = job.source_path.name
    return job


def restore_job(job_id: str) -> Job | None:
    existing = STORE.get(job_id)
    if existing:
        return existing
    path = LIBRARY / job_id / "project.json"
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    job = job_from_payload(data, LIBRARY / job_id)
    if job.status == "processing":
        job.status = "error"
        job.error = "server_restarted"
        persist_job(job)
    STORE.put(job)
    return job


def list_projects() -> list[dict]:
    ensure_library()
    items = []
    for folder in LIBRARY.iterdir():
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        manifest = folder / "project.json"
        if not manifest.is_file():
            continue
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        job = restore_job(data.get("id") or folder.name)
        if not job:
            continue
        snap = job.snapshot()
        poster = ensure_poster(job)
        items.append(
            {
                "id": snap["id"],
                "name": snap["name"],
                "status": snap["status"],
                "created_at": snap["created_at"],
                "filename": (snap.get("analysis") or {}).get("filename"),
                "model_count": len(snap["variants"]),
                "variants": snap["variants"],
                "poster": bool(poster),
            }
        )
    items.sort(key=lambda item: item.get("created_at") or 0, reverse=True)
    return items


def materialize_project(job: Job, source: Path, original: Path | None = None) -> Job:
    ensure_library()
    old_id = job.id
    project_id = unique_project_id(source.stem)
    folder = LIBRARY / project_id
    folder.mkdir(parents=True)
    (folder / "models").mkdir()
    (folder / "previews").mkdir()
    dest = folder / source.name
    if source.resolve() != dest.resolve():
        shutil.copy2(source, dest)
    job.id = project_id
    job.name = source.stem
    job.dir = folder
    job.output_dir = folder
    job.source_path = dest
    job.original_path = str((original or source).resolve())
    job.created_at = time.time()
    STORE.rekey(old_id, job)
    return job


def delete_project(job: Job) -> None:
    if job.status == "processing":
        raise RuntimeError("project_busy")
    if job.dir and job.dir.exists() and is_under(job.dir, LIBRARY):
        shutil.rmtree(job.dir)
    STORE.remove(job.id)


def delete_model(job: Job, model_id: str) -> None:
    if job.status == "processing":
        raise RuntimeError("project_busy")
    variant = find_variant(job, model_id)
    if not variant:
        raise RuntimeError("model_missing")
    model = Path(variant["model_path"]) if variant.get("model_path") else None
    preview = Path(variant["preview_dir"]) if variant.get("preview_dir") else None
    if model and model.exists() and is_under(model, LIBRARY):
        model.unlink()
    if preview and preview.exists() and is_under(preview, LIBRARY):
        shutil.rmtree(preview)
    job.variants = [item for item in job.variants if item.get("id") != model_id]
    if job.model_path and model and job.model_path == model:
        latest = job.variants[-1] if job.variants else None
        job.model_path = Path(latest["model_path"]) if latest and latest.get("model_path") else None
        job.preview_dir = Path(latest["preview_dir"]) if latest and latest.get("preview_dir") else None
        job.preview_ready = bool(latest and latest.get("preview_ready"))
        job.quality = latest.get("quality") if latest else job.quality
        job.photo_count = latest.get("photo_count") if latest else job.photo_count
    persist_job(job)


def process_job(job: Job, quality: str, photo_count: int) -> None:
    detail = QUALITY_TO_DETAIL[quality]
    job.quality = quality
    job.photo_count = photo_count
    job.started_at = time.time()
    job.status = "processing"
    job.error = None
    job.cancel_event.clear()
    with job.lock:
        job.events.clear()
    persist_job(job)
    job.emit({"type": "stage", "stage": "extract", "percent": 0, "status_key": "extracting_frames"})

    try:
        if not job.source_path or not job.analysis or not job.dir:
            raise RuntimeError("pick_analyze_first")

        job.output_dir = job.dir
        (job.dir / "models").mkdir(exist_ok=True)
        (job.dir / "previews").mkdir(exist_ok=True)
        job.frames_dir = job.dir / f"frames-{photo_count}"
        job.emit({"type": "output", "output_dir": str(job.dir)})

        def on_extract(percent: int):
            job.emit({"type": "progress", "stage": "extract", "percent": percent, "status_key": "extracting_frames"})

        existing_frames = sorted(job.frames_dir.glob("frame_*.jpg")) if job.frames_dir.exists() else []
        reuse_frames = len(existing_frames) >= photo_count
        guess = estimate_seconds(quality, photo_count, job.analysis, reuse_frames=reuse_frames)
        job.emit(
            {
                "type": "estimate",
                "stage": "extract",
                "eta_sec": guess["total_sec"],
                "extract_sec": guess["extract_sec"],
                "reconstruct_sec": guess["reconstruct_sec"],
                "status_key": "estimate_total",
                "status_args": {"duration": format_duration(guess["total_sec"])},
            }
        )
        if reuse_frames:
            extracted = len(existing_frames)
            on_extract(100)
        else:
            extracted = extract_frames(
                job.source_path,
                job.frames_dir,
                photo_count,
                job.analysis["duration_sec"],
                on_extract,
                job,
            )
        job.extracted_count = extracted
        if job.cancel_event.is_set():
            raise Cancelled()
        reconstruct_left = guess["reconstruct_sec"] + guess["preview_sec"]
        job.emit(
            {
                "type": "stage",
                "stage": "reconstruct",
                "percent": 0,
                "eta_sec": reconstruct_left,
                "status_key": "starting_object_capture",
                "extracted_count": extracted,
            }
        )

        variant_id = next_variant_id(job, quality, photo_count)
        job.model_path = job.dir / "models" / f"{variant_id}.usdz"
        saw_percent = False
        eta = EtaSmoother(reconstruct_left)

        def on_text(line: str):
            nonlocal saw_percent
            eta_match = ETA_SEC_RE.match(line)
            if eta_match:
                remaining = eta.update(float(eta_match.group(1)))
                job.emit(
                    {
                        "type": "progress",
                        "stage": "reconstruct",
                        "eta_sec": round(remaining),
                    }
                )
                return
            stage_match = STAGE_RE.match(line)
            if stage_match:
                key = re.sub(r".*\.", "", stage_match.group(1)).lower()
                status = STAGE_LABELS.get(key)
                if status:
                    job.emit({"type": "status", "stage": "reconstruct", "status_key": status})
                return
            match = PROGRESS_RE.search(line)
            if match:
                saw_percent = True
                payload = {
                    "type": "progress",
                    "stage": "reconstruct",
                    "percent": int(match.group(1)),
                    "elapsed": match.group(2),
                }
                if eta.value is not None:
                    payload["eta_sec"] = round(eta.value)
                job.emit(payload)
                return
            status = friendly_status(line)
            if status:
                job.emit({"type": "status", "stage": "reconstruct", "status_key": status})

        watchdog = threading.Timer(
            8.0,
            lambda: None
            if saw_percent
            else job.emit(
                {
                    "type": "status",
                    "stage": "reconstruct",
                    "status_key": "preparing_object_capture",
                }
            ),
        )
        watchdog.daemon = True
        watchdog.start()
        try:
            reconstruct(job.frames_dir, job.model_path, detail, on_text, job)
        finally:
            watchdog.cancel()
        if job.cancel_event.is_set():
            raise Cancelled()

        job.emit({"type": "status", "stage": "preview", "status_key": "preparing_preview", "percent": 100})
        job.preview_dir = job.dir / "previews" / variant_id
        job.preview_ready = export_preview(job.model_path, job.preview_dir)
        job.variants.append(
            {
                "id": variant_id,
                "quality": quality,
                "photo_count": photo_count,
                "extracted_count": extracted,
                "model_path": str(job.model_path),
                "preview_dir": str(job.preview_dir),
                "preview_ready": job.preview_ready,
            }
        )

        elapsed_sec = time.time() - (job.started_at or time.time())
        record_timing(quality, photo_count, job.analysis, elapsed_sec, reuse_frames)
        elapsed = format_duration(elapsed_sec)
        job.status = "done"
        persist_job(job)
        job.emit(
            {
                "type": "done",
                "stage": "done",
                "percent": 100,
                "status_key": "done_in",
                "status_args": {"elapsed": elapsed},
                "model_bytes": job.model_path.stat().st_size,
                "preview_ready": job.preview_ready,
                "output_dir": str(job.output_dir),
                "variants": [public_variant(item) for item in job.variants],
            }
        )
    except Cancelled:
        if job.model_path and job.model_path.exists() and not any(
            item.get("model_path") == str(job.model_path) for item in job.variants
        ):
            job.model_path.unlink()
            job.model_path = None
        job.status = "done" if job.variants else "analyzed"
        job.error = None
        persist_job(job)
        job.emit({"type": "cancelled", "status_key": "cancelled"})
    except Exception as exc:
        job.status = "error"
        job.error = str(exc)
        persist_job(job)
        job.emit({"type": "error", "status_key": str(exc), "status": str(exc), "message": str(exc)})


class Handler(BaseHTTPRequestHandler):
    server_version = "VideoTo3D/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[ui] {self.address_string()} {fmt % args}")

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, message: str, status: int = 400) -> None:
        self._json({"error": message, "error_key": message}, status)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _job(self, job_id: str) -> Job | None:
        job = restore_job(job_id)
        if not job:
            self._error("project_missing", 404)
        return job

    def _library_file(self, path: Path, download: str | None = None) -> None:
        if not is_under(path, LIBRARY):
            return self._error("forbidden_path", 403)
        return self._serve_file(path, download)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path in {"/", "/index.html"}:
            return self._serve_file(STATIC / "index.html")
        if path in {"/styles.css", "/app.js", "/viewer.js", "/i18n.js"}:
            return self._serve_file(STATIC / path.lstrip("/"))
        if path.startswith("/vendor/"):
            return self._serve_file(STATIC / "vendor" / Path(path).name)

        if path == "/api/health":
            payload = {
                "ok": True,
                "ffmpeg": bool(which("ffmpeg") and which("ffprobe")),
                "swift": bool(which("swift")),
                "object_capture_script": SWIFT_SCRIPT.exists(),
                "bind": "127.0.0.1",
            }
            payload.update(estimate_payload())
            return self._json(payload)

        if path == "/api/projects":
            return self._json({"library_path": str(LIBRARY), "projects": list_projects()})

        parts = path.strip("/").split("/")
        if parts[:2] == ["api", "projects"] and len(parts) >= 3:
            job = self._job(parts[2])
            if not job:
                return
            if len(parts) == 3:
                return self._json(job.snapshot())
            if parts[3] == "poster":
                poster = ensure_poster(job)
                if not poster:
                    return self._error("poster_missing", 404)
                return self._library_file(poster)
            if parts[3] == "events":
                return self._sse(job)
            if parts[3] == "models" and len(parts) >= 6:
                variant = find_variant(job, parts[4])
                if not variant:
                    return self._error("model_missing", 404)
                if parts[5] == "download":
                    model = Path(variant["model_path"])
                    if not model.is_file():
                        return self._error("model_not_ready", 404)
                    return self._library_file(model, download=model.name)
                if parts[5] == "preview" and len(parts) == 7:
                    preview_dir = Path(variant["preview_dir"]) if variant.get("preview_dir") else None
                    if not preview_dir:
                        return self._error("preview_not_ready", 404)
                    target = preview_dir / Path(parts[6]).name
                    if not target.is_file():
                        return self._error("preview_file_missing", 404)
                    return self._library_file(target)

        self._error("not_found", 404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        parts = path.strip("/").split("/")

        if path == "/api/projects":
            job = STORE.create()
            return self._json({"id": job.id, "library_path": str(LIBRARY)})

        if path == "/api/library/reveal":
            ensure_library()
            return self._open_path(None, LIBRARY, reveal=False)

        if path == "/api/projects/import":
            try:
                body = self._read_json()
                jobs = import_videos(pick_video_paths(body.get("picker_prompt")))
            except Exception as exc:
                return self._error(str(exc), 400)
            return self._json({"projects": [job.snapshot() for job in jobs]})

        if parts[:2] == ["api", "projects"] and len(parts) >= 4:
            job = self._job(parts[2])
            if not job:
                return
            action = parts[3]
            if action == "analyze":
                return self._analyze(job)
            if action == "process":
                return self._process(job)
            if action == "cancel":
                return self._cancel(job)
            if action == "reveal":
                return self._open_path(job, job.dir, reveal=True)
            if action == "models" and len(parts) >= 6 and parts[5] == "open":
                variant = find_variant(job, parts[4])
                if not variant:
                    return self._error("model_missing", 404)
                return self._open_path(job, Path(variant["model_path"]))

        self._error("not_found", 404)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        parts = unquote(parsed.path).strip("/").split("/")
        if parts[:2] == ["api", "projects"] and len(parts) == 4 and parts[3] == "video":
            job = self._job(parts[2])
            if not job:
                return
            return self._upload(job)
        self._error("not_found", 404)

    def do_DELETE(self) -> None:
        parts = unquote(urlparse(self.path).path).strip("/").split("/")
        if parts[:2] != ["api", "projects"] or len(parts) < 3:
            return self._error("not_found", 404)
        job = self._job(parts[2])
        if not job:
            return
        if len(parts) == 3:
            try:
                delete_project(job)
            except Exception as exc:
                return self._error(str(exc), 400)
            return self._json({"ok": True})
        if len(parts) == 5 and parts[3] == "models":
            try:
                delete_model(job, parts[4])
            except Exception as exc:
                return self._error(str(exc), 400)
            return self._json(job.snapshot())
        self._error("not_found", 404)

    def _analyze(self, job: Job) -> None:
        if not job.source_path:
            return self._error("video_not_selected")
        try:
            job.analysis = analyze_video(job.source_path)
            if job.dir:
                job.analysis["output_dir"] = str(job.dir)
            job.status = "analyzed"
            persist_job(job)
            ensure_poster(job)
            self._json(job.snapshot())
        except Exception as exc:
            self._error(str(exc), 400)

    def _upload(self, job: Job) -> None:
        filename = Path(self.headers.get("X-Filename") or "video.mp4").name
        length = self.headers.get("Content-Length")
        if not length:
            return self._error("missing_content_length")
        ensure_library()
        old_id = job.id
        project_id = unique_project_id(Path(filename).stem)
        folder = LIBRARY / project_id
        folder.mkdir(parents=True)
        (folder / "models").mkdir()
        (folder / "previews").mkdir()
        dest = folder / filename
        remaining = int(length)
        with dest.open("wb") as handle:
            while remaining > 0:
                chunk = self.rfile.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                handle.write(chunk)
                remaining -= len(chunk)
        job.id = project_id
        job.name = Path(filename).stem
        job.dir = folder
        job.output_dir = folder
        job.source_path = dest
        job.original_path = filename
        job.created_at = time.time()
        job.status = "uploaded"
        STORE.rekey(old_id, job)
        persist_job(job)
        ensure_poster(job)
        self._json({"id": job.id, "filename": filename, "size_bytes": dest.stat().st_size})

    def _cancel(self, job: Job) -> None:
        if job.status != "processing":
            return self._error("nothing_running")
        job.request_cancel()
        self._json({"ok": True, "id": job.id, "status": "cancelling"})

    def _process(self, job: Job) -> None:
        if job.status == "processing":
            return self._error("already_processing")
        if STORE.any_processing():
            return self._error("wait_current")
        try:
            body = self._read_json()
        except json.JSONDecodeError:
            return self._error("invalid_json")
        quality = body.get("quality") or "medium"
        if quality not in QUALITY_TO_DETAIL:
            return self._error("unknown_quality")
        try:
            photo_count = int(body.get("photo_count") or 0)
        except (TypeError, ValueError):
            return self._error("invalid_photo_count")
        if not job.analysis:
            return self._error("analyze_first")
        max_photos = max(1, int(job.analysis["frame_count"] or photo_count))
        hardware_max = max_input_images()
        if hardware_max:
            max_photos = min(max_photos, hardware_max)
        photo_count = max(2, min(photo_count, max_photos))
        thread = threading.Thread(target=process_job, args=(job, quality, photo_count), daemon=True)
        thread.start()
        self._json(
            {
                "ok": True,
                "id": job.id,
                "photo_count": photo_count,
                "estimate": estimate_seconds(quality, photo_count, job.analysis),
            }
        )

    def _open_path(self, job: Job | None, path: Path | None, reveal: bool = False) -> None:
        if not path or not path.exists():
            return self._error("path_missing", 404)
        if path != LIBRARY and not is_under(path, LIBRARY):
            return self._error("forbidden_path", 403)
        cmd = ["open", "-R", str(path)] if reveal else ["open", str(path)]
        subprocess.Popen(cmd)
        self._json({"ok": True})

    def _sse(self, job: Job) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        sub = job.subscribe()
        try:
            while True:
                try:
                    event = sub.get(timeout=15)
                    payload = json.dumps(event, ensure_ascii=False)
                    self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
                    self.wfile.flush()
                    if event.get("type") in {"done", "error"}:
                        break
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
        except BrokenPipeError:
            pass
        finally:
            job.unsubscribe(sub)

    def _serve_file(self, path: Path, download: str | None = None) -> None:
        if not path.is_file():
            return self._error("file_missing", 404)
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", MIME.get(path.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        if download:
            self.send_header("Content-Disposition", f'attachment; filename="{download}"')
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    parser = argparse.ArgumentParser(description="Lokální UI pro Apple Object Capture")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8741)
    parser.add_argument("--open", action="store_true", help="Otevřít prohlížeč")
    args = parser.parse_args()

    ensure_library()
    threading.Thread(target=get_limits, daemon=True).start()

    missing = [name for name in ("ffmpeg", "ffprobe", "swift") if not which(name)]
    if missing:
        print("Chybí nástroje:", ", ".join(missing))
        if "ffmpeg" in missing or "ffprobe" in missing:
            print("  brew install ffmpeg")

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{args.host}:{args.port}"
    print(f"Video to 3D Photogrammetry: {url}", flush=True)
    print(f"Knihovna: {LIBRARY}", flush=True)
    print("Vše běží lokálně. Ctrl+C ukončí server.", flush=True)
    if args.open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nKončím.")
        server.shutdown()


if __name__ == "__main__":
    main()
