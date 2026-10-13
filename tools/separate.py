"""Demucs vocal separation → data/audio/vocals.wav (used only for aligning the lyrics; not part of the finished video).
Optional: without it lyric-tool estimates from the full mix directly, just less accurately.

    python tools/separate.py
demucs is installed inside the workspace, in data/pydeps/ (not into the system Python; it reuses the torch already on this machine):
    pip install --no-cache-dir --no-deps --target data/pydeps demucs julius einops openunmix dora-search omegaconf \
        antlr4-python3-runtime treetable retrying submitit cloudpickle
(--no-cache-dir: pip leaves no download cache in the user's home directory.)
The model (about 80 MB) is downloaded by demucs on the first run into data/models/ inside the workspace: torch's cache directory (TORCH_HOME) is pointed there below,
instead of the default location under the user's home directory.
"""

import os
import sys

from paths import AUDIO, MODELS, PYDEPS, ROOT, config

os.environ['TORCH_HOME'] = str(MODELS)          # models are downloaded into the workspace (no data leaves the workspace); must be set before torch.hub is used
sys.path.insert(0, str(ROOT / config()['pydeps']) if config().get('pydeps') else str(PYDEPS))

import numpy as np  # noqa: E402
import torch  # noqa: E402
from scipy.io import wavfile  # noqa: E402
from demucs.apply import apply_model  # noqa: E402
from demucs.pretrained import get_model  # noqa: E402

sr, x = wavfile.read(AUDIO / 'audio.wav')
model = get_model('htdemucs')
model.eval()
wav = torch.from_numpy(x.T.astype(np.float32) / 32768)
if sr != model.samplerate:
    raise SystemExit(f'need {model.samplerate} Hz, got {sr}')
ref = wav.mean(0)
w = (wav - ref.mean()) / ref.std()
with torch.no_grad():
    out = apply_model(model, w[None], shifts=1, split=True, overlap=.25, progress=True)[0]
out = out * ref.std() + ref.mean()
v = out[model.sources.index('vocals')].numpy().T
wavfile.write(AUDIO / 'vocals.wav', sr, (np.clip(v, -1, 1) * 32767).astype(np.int16))
for stale in ('vocal_feat.npz', 'vocals.m4a'):          # caches computed from the old vocals (or from the full mix) are now stale
    (AUDIO / stale).unlink(missing_ok=True)
print('saved data/audio/vocals.wav (next, run python lyric-tool/lyrics.py --prepare)')
