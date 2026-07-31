#!/usr/bin/env python3
"""sections.json이 가리키는 모든 소스 JSON을 읽어 각 문장 en을
data/audio/<id>.mp3로 edge-tts 신경망 음성으로 사전 생성한다.

멱등성: data/audio/manifest.json에 id -> {sha1(en), voice}를 기록.
en 해시와 voice가 이전과 같으면 스킵, 다르면 재생성. 소스에서 사라진
id의 mp3/manifest 항목은 정리한다.

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
MANIFEST_PATH = AUDIO_DIR / "manifest.json"

RATE = "-5%"
CONCURRENCY = 5
MAX_RETRIES = 1  # 실패 시 추가로 1회만 재시도

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


async def synth_one(sentence, voice, sem, stats):
    sid = sentence["id"]
    en = sentence["en"]
    out_path = AUDIO_DIR / f"{sid}.mp3"
    attempt = 0
    while True:
        attempt += 1
        try:
            async with sem:
                communicate = edge_tts.Communicate(en, voice, rate=RATE)
                await communicate.save(str(out_path))
            if out_path.stat().st_size < 1024:
                raise RuntimeError(f"output too small ({out_path.stat().st_size} bytes)")
            stats["generated"].append(sid)
            return sid, True, None
        except Exception as e:  # noqa: BLE001
            if attempt <= MAX_RETRIES:
                await asyncio.sleep(1)
                continue
            stats["failed"].append(sid)
            return sid, False, str(e)


async def main_async():
    sentences = load_sentences()
    manifest = load_manifest()
    current_ids = {s["id"] for s in sentences}

    to_generate = []
    skipped = 0
    for s in sentences:
        sid = s["id"]
        voice = voice_for_speaker(s.get("speaker"))
        digest = sha1(s["en"])
        prev = manifest.get(sid)
        mp3_exists = (AUDIO_DIR / f"{sid}.mp3").exists()
        if prev and prev.get("sha1") == digest and prev.get("voice") == voice and mp3_exists:
            skipped += 1
            continue
        to_generate.append((s, voice, digest))

    print(f"총 문장 {len(sentences)}개 · 스킵(변경 없음) {skipped}개 · 생성 대상 {len(to_generate)}개")

    stats = {"generated": [], "failed": []}
    if to_generate:
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        sem = asyncio.Semaphore(CONCURRENCY)
        tasks = [synth_one(s, voice, sem, stats) for s, voice, _ in to_generate]
        results = await asyncio.gather(*tasks)
        for sid, ok, err in results:
            if not ok:
                print(f"  실패: {sid} — {err}")

        # manifest는 성공한 것만 갱신
        by_id = {s["id"]: (s, voice, digest) for s, voice, digest in to_generate}
        for sid in stats["generated"]:
            s, voice, digest = by_id[sid]
            manifest[sid] = {"sha1": digest, "voice": voice}

    # 삭제된 id 정리 (소스에서 사라진 것들)
    removed = [sid for sid in list(manifest.keys()) if sid not in current_ids]
    for sid in removed:
        mp3 = AUDIO_DIR / f"{sid}.mp3"
        if mp3.exists():
            mp3.unlink()
        del manifest[sid]

    # data/audio 안에 manifest에 없는 고아 mp3도 정리
    if AUDIO_DIR.exists():
        for mp3 in AUDIO_DIR.glob("*.mp3"):
            sid = mp3.stem
            if sid not in current_ids:
                mp3.unlink()

    save_manifest(manifest)

    print(f"생성 {len(stats['generated'])}개 · 스킵 {skipped}개 · 실패 {len(stats['failed'])}개 · 정리 {len(removed)}개")

    if stats["failed"]:
        print("실패한 id 목록:")
        for sid in stats["failed"]:
            print(f"  - {sid}")
        return 1
    return 0


def main():
    sys.exit(asyncio.run(main_async()))


if __name__ == "__main__":
    main()
