"""Strict operator input and the single canonical JSON/hash authority."""
import hashlib
import json
import re
from pathlib import Path


class InputError(ValueError):
    pass


class ReviewError(RuntimeError):
    def __init__(self, message, diagnostics=None):
        super().__init__(message)
        self.diagnostics = diagnostics



IDS = re.compile(r"[A-Za-z0-9_-]{1,64}", re.ASCII)
PRESET_IDS = {"clear-explainer", "warm-story", "engaging-hook"}


def canonical_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(value) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InputError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def _constant(value):
    raise InputError(f"Nonfinite JSON number: {value}")


def read_json(path: Path) -> dict:
    try:
        data = path.read_bytes()
        if len(data) > 2_000_000:
            raise InputError('JSON exceeds 2 MB limit')
        result = json.loads(data.decode('utf-8'), object_pairs_hook=_pairs,
                            parse_constant=_constant)
        canonical_bytes(result)
        return result
    except (OSError, UnicodeError, ValueError, OverflowError) as exc:
        raise InputError(f"Cannot read valid UTF-8 JSON ({path.name}): {exc}") from exc


def keys(value, required, optional=()):
    if type(value) is not dict or not set(required) <= value.keys() or value.keys() - set(required) - set(optional):
        raise InputError(f"Expected object keys {sorted(required)}, optional {sorted(optional)}")


def safe_id(value):
    if type(value) is not str or not IDS.fullmatch(value):
        raise InputError('ID must match ASCII [A-Za-z0-9_-]{1,64}')
    # Windows reserves device filenames even with extensions.
    if value.upper() in {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)), *(f'LPT{i}' for i in range(1, 10))}:
        raise InputError('ID is a reserved Windows device name')
    return value


def text(value, limit):
    if type(value) is not str or not value.strip() or len(value) > limit or '\x00' in value:
        raise InputError(f'Text must be nonblank, without NUL, at most {limit} code points')
    if re.search(r'<\|[^<>]*\|>', value):
        raise InputError('Model control-token syntax is not literal narration and is unsupported')
    try:
        value.encode('utf-8')
    except UnicodeError as exc:
        raise InputError('Text must contain valid Unicode scalar values') from exc
    return value.replace('\r\n', '\n').replace('\r', '\n')


def load_request(path: Path) -> dict:
    request = read_json(path)
    keys(request, {'version', 'requestId', 'language', 'speaker', 'fps', 'cues'})
    if type(request['version']) is not int or request['version'] != 1 or type(request['fps']) is not int or request['fps'] != 30:
        raise InputError('Only version 1 and fps 30 are supported')
    safe_id(request['requestId'])
    if request['language'] != 'English' or request['speaker'] != 'Ryan':
        raise InputError('Only English / Ryan are supported')
    cues = request['cues']
    if type(cues) is not list or not 1 <= len(cues) <= 24:
        raise InputError('Request requires 1–24 cues')
    seen = set()
    for cue in cues:
        keys(cue, {'id', 'text', 'preset', 'seed'}, {'instruction'})
        cue_id = safe_id(cue['id'])
        if cue_id.casefold() in seen:
            raise InputError('Cue IDs must be unique (including case on Windows)')
        seen.add(cue_id.casefold())
        normalized = text(cue['text'], 400)
        if len(normalized.split()) > 60:
            raise InputError('Cue exceeds 60 whitespace-delimited words')
        if type(cue['preset']) is not str or cue['preset'] not in PRESET_IDS:
            raise InputError('Unknown preset')
        if type(cue['seed']) is not int or not 0 <= cue['seed'] <= 2**32 - 1:
            raise InputError('Seed must be an integer in 0..2^32-1')
        if 'instruction' in cue:
            text(cue['instruction'], 500)
    return request


def load_presets(path: Path) -> dict:
    presets = read_json(path)
    keys(presets, {'version', 'presets'})
    if type(presets['version']) is not int or presets['version'] != 1:
        raise InputError('Unsupported preset version')
    keys(presets['presets'], PRESET_IDS)
    for value in presets['presets'].values():
        text(value, 500)
    return presets


def resolve_cues(request: dict, presets: dict) -> list[dict]:
    return [{
        'id': cue['id'], 'original': cue,
        'effectiveText': text(cue['text'], 400),
        'effectiveInstruction': text(cue.get('instruction', presets['presets'][cue['preset']]), 500),
        'presetId': cue['preset'], 'presetVersion': presets['version'],
        'instructionSource': 'override' if 'instruction' in cue else 'preset',
        'seed': cue['seed'], 'language': request['language'], 'speaker': request['speaker'],
    } for cue in request['cues']]


def cue_identity(cue: dict) -> dict:
    return {key: cue[key] for key in ('effectiveText', 'effectiveInstruction', 'presetId',
                                     'presetVersion', 'instructionSource', 'seed', 'language', 'speaker')}
