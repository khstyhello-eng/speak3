#!/usr/bin/env python3
"""sections.json이 가리키는 모든 소스 JSON을 읽어 오디오를 edge-tts 신경망
음성으로 사전 생성한다.

생성 대상(오디오 키 -> 경로):
  - <id>            -> data/audio/<id>.mp3            (원문 영어, 화자 매핑 음성)
  - <id>-v<N>       -> data/audio/<id>-v<N>.mp3        (변형 영어, N=1..len(variations))
  - ko-<id>         -> data/audio/ko/ko-<id>.mp3       (원문 한국어, SunHi)
  - cue-<id>        -> data/audio/ko/cue-<id>.mp3      (상황 큐 한국어, situationCue 있을 때만)
  - ko-<id>-v<N>    -> data/audio/ko/ko-<id>-v<N>.mp3  (변형 한국어)

멱등성: data/audio/manifest.json에 audio key -> {sha1(text), voice}를 기록.
텍스트 해시와 voice가 이전과 같으면 스킵, 다르면 재생성. 소스에서 사라진
key의 mp3/manifest 항목은 정리한다(고아 정리는 두 디렉터리 모두 스캔).

사용: python3 tools/build_audio.py
"""
import asyncio
import hashlib
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
AUDIO_DIR = DATA_DIR / "audio"
AUDIO_KO_DIR = AUDIO_DIR / "ko"
MANIFEST_PATH = AUDIO_DIR / "manifest.json"

RATE = "-5%"
CONCURRENCY = 5
MAX_RETRIES = 1  # 실패 시 추가로 1회만 재시도

KO_VOICE = "ko-KR-SunHiNeural"

# 화자 -> 음성 명시 매핑 (공적 인물)
EXPLICIT_VOICE = {
    "Barack Obama": "en-US-GuyNeural",
    "Emma Watson": "en-GB-SoniaNeural",
    "Queen Elizabeth II": "en-GB-LibbyNeural",
}

# Suits 화자 중 여성 이름
FEMALE_NAMES = {"Jessica", "Rachel", "Donna", "Jenny", "Edith", "Grammy", "Vanessa", "Nikki"}

VOICE_UNKNOWN = "en-US-AriaNeural"
VOICE_DEFAULT = "en-US-AndrewNeural"  # 그 외 (Harvey, Mike, Louis, Gerald, Trevor 등)


def voice_for_speaker(speaker):
    if speaker in EXPLICIT_VOICE:
        return EXPLICIT_VOICE[speaker]
    if speaker == "Unknown":
        return VOICE_UNKNOWN
    if speaker in FEMALE_NAMES:
        return "en-US-JennyNeural"
    return VOICE_DEFAULT


def sha1(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def load_sentences():
    sections = json.loads((DATA_DIR / "sections.json").read_text(encoding="utf-8"))["sections"]
    source_ids = [sid for sec in sections for sid in sec["sources"]]
    sentences = []
    seen = set()
    for sid in source_ids:
        path = DATA_DIR / f"{sid}.json"
        src = json.loads(path.read_text(encoding="utf-8"))
        for s in src["sentences"]:
            if s["id"] in seen:
                raise ValueError(f"duplicate sentence id across sources: {s['id']}")
            seen.add(s["id"])
            sentences.append(s)
    return sentences


def load_manifest():
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {}


def save_manifest(manifest):
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def build_units(sentences):
    """각 문장에서 생성해야 할 오디오 단위(키/텍스트/음성/경로) 목록을 만든다."""
    units = []
    for s in sentences:
        sid = s["id"]
        voice_en = voice_for_speaker(s.get("speaker"))
        units.append({"key": sid, "text": s["en"], "voice": voice_en, "path": AUDIO_DIR / f"{sid}.mp3"})
        variations = s.get("variations") or []
        for n, v in enumerate(variations, start=1):
            key = f"{sid}-v{n}"
            units.append({"key": key, "text": v["en"], "voice": voice_en, "path": AUDIO_DIR / f"{key}.mp3"})
        units.append({"key": f"ko-{sid}", "text": s["ko"], "voice": KO_VOICE, "path": AUDIO_KO_DIR / f"ko-{sid}.mp3"})
        if s.get("situationCue"):
            key = f"cue-{sid}"
            units.append({"key": key, "text": s["situationCue"], "voice": KO_VOICE, "path": AUDIO_KO_DIR / f"{key}.mp3"})
        for n, v in enumerate(variations, start=1):
            key = f"ko-{sid}-v{n}"
            units.append({"key": key, "text": v["ko"], "voice": KO_VOICE, "path": AUDIO_KO_DIR / f"{key}.mp3"})
    return units


async def synth_one(unit, sem, stats):
    key = unit["key"]
    text = unit["text"]
    voice = unit["voice"]
    out_path = unit["path"]
    attempt = 0
    while True:
        attempt += 1
        try:
            async with sem:
                communicate = edge_tts.Communicate(text, voice, rate=RATE)
                await communicate.save(str(out_path))
            if out_path.stat().st_size < 1024:
                raise RuntimeError(f"output too small ({out_path.stat().st_size} bytes)")
            stats["generated"].append(key)
            return key, True, None
        except Exception as e:  # noqa: BLE001
            if attempt <= MAX_RETRIES:
                await asyncio.sleep(1)
                continue
            stats["failed"].append(key)
            return key, False, str(e)


async def main_async():
    sentences = load_sentences()
    manifest = load_manifest()
    units = build_units(sentences)
    current_keys = {u["key"] for u in units}

    to_generate = []
    skipped = 0
    for u in units:
        digest = sha1(u["text"])
        prev = manifest.get(u["key"])
        mp3_exists = u["path"].exists()
        if prev and prev.get("sha1") == digest and prev.get("voice") == u["voice"] and mp3_exists:
            skipped += 1
            continue
        to_generate.append((u, digest))

    print(f"총 오디오 {len(units)}개 · 스킵(변경 없음) {skipped}개 · 생성 대상 {len(to_generate)}개")

    stats = {"generated": [], "failed": []}
    if to_generate:
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        AUDIO_KO_DIR.mkdir(parents=True, exist_ok=True)
        sem = asyncio.Semaphore(CONCURRENCY)
        tasks = [synth_one(u, sem, stats) for u, _ in to_generate]
        results = await asyncio.gather(*tasks)
        for key, ok, err in results:
            if not ok:
                print(f"  실패: {key} — {err}")

        # manifest는 성공한 것만 갱신
        by_key = {u["key"]: (u, digest) for u, digest in to_generate}
        for key in stats["generated"]:
            u, digest = by_key[key]
            manifest[key] = {"sha1": digest, "voice": u["voice"]}

    # 삭제된 key 정리 (소스에서 사라진 것들 — manifest 항목만, 실제 파일은 아래 고아 정리에서)
    removed = [key for key in list(manifest.keys()) if key not in current_keys]
    for key in removed:
        del manifest[key]

    # data/audio, data/audio/ko 안에 현재 키 집합에 없는 고아 mp3 정리
    if AUDIO_DIR.exists():
        for mp3 in AUDIO_DIR.glob("*.mp3"):
            if mp3.stem not in current_keys:
                mp3.unlink()
    if AUDIO_KO_DIR.exists():
        for mp3 in AUDIO_KO_DIR.glob("*.mp3"):
            if mp3.stem not in current_keys:
                mp3.unlink()

    save_manifest(manifest)

    print(f"생성 {len(stats['generated'])}개 · 스킵 {skipped}개 · 실패 {len(stats['failed'])}개 · 정리 {len(removed)}개")

    if stats["failed"]:
        print("실패한 오디오 키 목록:")
        for key in stats["failed"]:
            print(f"  - {key}")
        return 1
    return 0


def main():
    sys.exit(asyncio.run(main_async()))


if __name__ == "__main__":
    main()
