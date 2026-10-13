"""Prepare the audio: the source file in ref/audio/ → data/audio/audio.wav (for analysis) + audio.m4a (for the preview and the finished video), then run the audio analysis.

    python tools/audio.py            # a single audio file in ref/audio/ is used automatically; with several, name one under audio in project.json
    python tools/audio.py --force    # redo after replacing the audio (also clears the old vocal feature cache)

- audio.wav: 44.1 kHz stereo, 16-bit (read by tools/analyze.py and tools/separate.py)
- audio.m4a: when the source is already AAC (.m4a / .aac) the audio track is copied as is; otherwise it is encoded to AAC 256k
Requires ffmpeg on the PATH.
"""
import subprocess
import sys

from paths import AUDIO, ROOT, ref_audio


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *map(str, args)], check=True)


def main(argv):
    src, force = ref_audio(), '--force' in argv
    AUDIO.mkdir(parents=True, exist_ok=True)
    wav, m4a = AUDIO / 'audio.wav', AUDIO / 'audio.m4a'
    if force:
        for name in ('vocals.wav', 'vocals.m4a', 'vocal_feat.npz'):
            (AUDIO / name).unlink(missing_ok=True)
    if force or not wav.exists():
        ffmpeg('-i', src, '-vn', '-ar', 44100, '-ac', 2, '-c:a', 'pcm_s16le', wav)
        print(f'{src.relative_to(ROOT).as_posix()} → data/audio/audio.wav')
    if force or not m4a.exists():
        codec = ['-c:a', 'copy'] if src.suffix.lower() in ('.m4a', '.aac') else ['-c:a', 'aac', '-b:a', '256k']
        ffmpeg('-i', src, '-vn', *codec, '-movflags', '+faststart', m4a)
        print(f'{src.relative_to(ROOT).as_posix()} → data/audio/audio.m4a')
    subprocess.run([sys.executable, str(ROOT / 'tools' / 'analyze.py')], check=True)


if __name__ == '__main__':
    main(sys.argv[1:])
