"""Audio integrity and sample-derived cue timing. No speech-model imports."""
import os
from pathlib import Path
from uuid import uuid4

from english_voice.contract import ReviewError
from english_voice.provenance import file_hash, safe_path


def _metrics(audio, rate):
    import numpy as np
    if type(rate) is not int or not 8000 <= rate <= 192000:
        raise ReviewError('Returned sample rate must be an integer in 8000..192000')
    values = np.asarray(audio)
    if values.ndim != 1 or not values.size or values.dtype.kind not in 'fiu' or not np.isfinite(values).all():
        raise ReviewError('Waveform must be finite, nonempty, numeric and mono')
    values = values.astype(np.float64)
    seconds = len(values) / rate
    metrics = {'sampleCount': len(values), 'sampleRate': rate, 'durationSeconds': seconds,
               'peak': float(np.max(np.abs(values))), 'rms': float(np.sqrt(np.mean(values * values))),
               'pcmRailSamples': int(np.count_nonzero((values <= -1) | (values >= 32767 / 32768)))}
    if not 1 <= seconds < 33:
        raise ReviewError('Suspicious duration: require >=1 and <33 seconds; no automatic replacement', metrics)
    return metrics


def inspect_wav(path: Path) -> dict:
    import soundfile as sf
    path = safe_path(path)
    if not path.is_file():
        raise ReviewError('Missing regular WAV file')
    try:
        info = sf.info(str(path))
        if info.format != 'WAV' or info.subtype != 'PCM_16' or info.channels != 1:
            raise ReviewError('Expected mono WAV PCM_16')
        values, rate = sf.read(str(path), dtype='float64', always_2d=False)
        metrics = _metrics(values, rate)
        if info.frames != metrics['sampleCount'] or metrics['peak'] == 0:
            raise ReviewError('Decoded WAV count mismatch or silence')
        return {**metrics, 'format': 'WAV', 'subtype': 'PCM_16', 'channels': 1,
                'bytes': path.stat().st_size, 'sha256': file_hash(path)}
    except ReviewError:
        raise
    except Exception as exc:
        raise ReviewError(f'WAV decode failed ({type(exc).__name__})') from exc


def write_checked_wav(path: Path, waveform, sample_rate) -> dict:
    import soundfile as sf
    try:
        before = _metrics(waveform, sample_rate)
        if not 0.001 <= before['peak'] <= 1:
            raise ReviewError('Source peak outside 0.001..1; no normalization or clipping allowed', before)
    except ReviewError as exc:
        import numpy as np
        values = np.asarray(waveform)
        if values.ndim == 1 and values.size and values.dtype.kind in 'fiu' and np.isfinite(values).all():
            quarantine = safe_path(path.with_name('rejected-source.npy'))
            # Non-pickled original numeric samples, never a ready WAV/cache reference.
            with quarantine.open('xb') as stream:
                np.save(stream, values, allow_pickle=False)
                stream.flush()
                os.fsync(stream.fileno())
        raise
    path = safe_path(path)
    if path.exists():
        raise ReviewError('Refusing to overwrite audio')
    temporary = path.with_name(f'.audio-{uuid4().hex}.tmp')
    # Preserve an interrupted temporary WAV for manual review.
    with temporary.open('xb') as stream:
        sf.write(stream, waveform, sample_rate, format='WAV', subtype='PCM_16')
        stream.flush()
        os.fsync(stream.fileno())
    after = inspect_wav(temporary)
    if after['sampleCount'] != before['sampleCount'] or after['sampleRate'] != sample_rate:
        raise ReviewError('WAV quantization changed sample count/rate')
    os.replace(temporary, path)
    return {'sourceMetrics': before, 'wav': after, 'technical': 'ready', 'listening': 'pending'}


def build_timeline(cues: list[dict], fps: int = 30) -> dict:
    if type(fps) is not int or fps != 30:
        raise ReviewError('Timeline requires 30 fps')
    cursor = 0
    rows = []
    for cue in cues:
        samples, rate = cue['sampleCount'], cue['sampleRate']
        if type(samples) is not int or samples <= 0 or type(rate) is not int or not 8000 <= rate <= 192000:
            raise ReviewError('Invalid timeline samples/rate')
        frames = (samples * fps + rate - 1) // rate
        rows.append({**cue, 'from': cursor, 'audioFrames': frames,
                     'audioStartFrame': cursor + 6, 'audioEndFrame': cursor + 6 + frames,
                     'durationInFrames': 6 + frames + 15})
        cursor += 6 + frames + 15
    return {'version': 1, 'fps': fps, 'durationInFrames': cursor, 'cues': rows}
