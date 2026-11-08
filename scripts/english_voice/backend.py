"""Lazy offline Qwen adapter; no inference on import."""
import os
from pathlib import Path

from english_voice.contract import InputError, ReviewError
from english_voice.provenance import SETTINGS


def load_backend(model_dir: Path, context: dict) -> object:
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    import torch
    from qwen_tts import Qwen3TTSModel

    torch.set_num_threads(6)
    torch.set_num_interop_threads(2)
    if torch.get_num_threads() != 6 or torch.get_num_interop_threads() != 2:
        raise InputError('Thread configuration mismatch')
    model = Qwen3TTSModel.from_pretrained(str(model_dir.resolve()), local_files_only=True,
                                        device_map='cpu', dtype=torch.float32, attn_implementation='sdpa')
    if model.model.tts_model_type != 'custom_voice' or model.model.tts_model_size != '1b7':
        raise InputError('Expected 1.7B CustomVoice model')
    if 'ryan' not in {s.lower() for s in model.get_supported_speakers() or []}:
        raise InputError('Ryan is not available')
    if 'english' not in {s.lower() for s in model.get_supported_languages() or []}:
        raise InputError('English is not available')
    if any(p.device.type != 'cpu' or (p.is_floating_point() and p.dtype != torch.float32)
           for p in model.model.parameters()):
        raise InputError('Actual model device/dtype differs from CPU float32')
    pin = {key: value for key, value in SETTINGS.items() if key != 'non_streaming_mode'}
    if model._merge_generate_kwargs(**pin) != pin:
        raise InputError('Effective generation settings differ from pin')
    if getattr(model.model.config, '_attn_implementation', None) != 'sdpa':
        raise InputError('Actual attention implementation differs from SDPA')
    if context['identity']['settings'] != SETTINGS:
        raise InputError('Context settings differ from backend pin')
    return model


def generate_cue(backend, cue: dict, context: dict):
    import torch
    if context['identity']['settings'] != SETTINGS:
        raise InputError('Generation identity mismatch')
    torch.manual_seed(cue['seed'])
    wavs, rate = backend.generate_custom_voice(text=cue['effectiveText'], language=cue['language'],
                                               speaker=cue['speaker'], instruct=cue['effectiveInstruction'], **SETTINGS)
    if len(wavs) != 1:
        raise ReviewError('Expected exactly one returned waveform')
    return wavs[0], rate
