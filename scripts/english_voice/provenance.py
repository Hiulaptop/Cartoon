"""Read-only release/runtime inventory. Never imports torch or Qwen."""
import hashlib
import importlib.metadata as metadata
import platform
import sys
import stat
from pathlib import Path

from english_voice.contract import InputError, cue_identity, digest

SETTINGS = {
    'do_sample': True, 'top_k': 50, 'top_p': 0.9, 'temperature': 0.8,
    'repetition_penalty': 1.05, 'subtalker_dosample': True,
    'subtalker_top_k': 50, 'subtalker_top_p': 1.0, 'subtalker_temperature': 0.9,
    'max_new_tokens': 420, 'non_streaming_mode': True,
}
BASELINE = {'qwen-tts': '0.1.1', 'transformers': '4.57.3', 'torch': '2.15.0+cpu',
            'torchaudio': '2.11.1+cpu', 'numpy': '2.5.4', 'soundfile': '0.14.0'}


def safe_path(path: Path) -> Path:
    path = Path(path).absolute()
    for part in (path, *path.parents):
        try:
            attributes = part.lstat()
        except FileNotFoundError:
            attributes = None
        if attributes is not None and getattr(attributes, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0):
            raise InputError('Reparse paths are unsupported')
        if part.is_symlink() or part.is_junction():
            raise InputError('Symlink/junction paths are unsupported')
        if part.exists() and part.resolve() != part:
            # Resolve normalization on Windows is case insensitive through Path equality.
            raise InputError('Noncanonical filesystem path')
    return path.resolve()


def file_hash(path: Path) -> str:
    safe_path(path)
    if not stat.S_ISREG(path.lstat().st_mode):
        raise InputError(f'Regular file required: {path.name}')
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def code_inventory() -> list[dict]:
    scripts = Path(__file__).resolve().parents[1]
    files = [scripts / 'english_voice.py', *sorted((scripts / 'english_voice').glob('*.py'))]
    return [{'path': p.relative_to(scripts).as_posix(), 'size': p.stat().st_size,
             'sha256': file_hash(p)} for p in files]


def collect_context(model_dir: Path, release: dict) -> dict:
    if not sys.flags.isolated:
        raise InputError('Use Python -I')
    model_dir = safe_path(model_dir)
    if not model_dir.is_dir():
        raise InputError('Existing local model directory required; no download fallback')
    if platform.python_version() != '3.12.10':
        raise InputError('Python 3.12.10 is the approved baseline')
    for name, version in BASELINE.items():
        if metadata.version(name) != version:
            raise InputError(f'Baseline package mismatch: {name}; do not upgrade automatically')
    inventory = []
    expected = {entry['path'] for entry in release['files']}
    actual = set()
    for path in model_dir.rglob('*'):
        safe_path(path)
        rel = path.relative_to(model_dir).as_posix()
        if path.is_file():
            if rel.startswith('.cache/huggingface/'):
                continue
            actual.add(rel)
        elif not path.is_dir():
            raise InputError('Unexpected nonregular model artifact')
    if actual != expected:
        raise InputError(f'Model inventory differs: missing={sorted(expected-actual)}, extra={sorted(actual-expected)}')
    for entry in release['files']:
        rel = entry['path']
        if Path(rel).is_absolute() or '..' in Path(rel).parts or '\\' in rel or rel.endswith(('.py', '.pyc', '.pyd', '.dll', '.exe')):
            raise InputError('Unsafe executable/model inventory path')
        path = safe_path(model_dir / rel)
        size = path.stat().st_size
        sha = file_hash(path)
        if size != entry['size'] or sha != entry['sha256']:
            raise InputError(f'Model release hash/size mismatch: {rel}')
        inventory.append({'path': rel, 'size': size, 'sha256': sha})
    dependencies = sorted([{'name': d.metadata['Name'].lower().replace('_', '-'), 'version': d.version}
                           for d in metadata.distributions()], key=lambda d: (d['name'], d['version']))
    qwen = metadata.distribution('qwen-tts')
    wrapper_files = sorted([p for p in qwen.files or [] if str(p).replace('\\', '/').startswith('qwen_tts/') and str(p).endswith('.py')], key=str)
    if not wrapper_files:
        raise InputError('Missing installed Qwen source inventory')
    wrapper = [{'path': str(p).replace('\\', '/'), 'sha256': file_hash(Path(qwen.locate_file(p)))} for p in wrapper_files]
    identity = {
        'version': 1,
        'model': {'repo': release['repo'], 'revision': release['revision'], 'files': inventory},
        'runtime': {'python': platform.python_version(), 'implementation': platform.python_implementation(),
                    'system': platform.system(), 'release': platform.release(), 'machine': platform.machine(),
                    'processor': platform.processor(), 'device': 'cpu', 'dtype': 'float32',
                    'attention': 'sdpa', 'computeThreads': 6, 'interopThreads': 2,
                    'dependencies': dependencies, 'dependencyDigest': digest(dependencies), 'qwenSource': wrapper},
        'code': code_inventory(), 'settings': dict(SETTINGS), 'output': {'format': 'WAV', 'subtype': 'PCM_16', 'channels': 1},
    }
    return {'identity': identity, 'diagnostics': {'modelPath': str(model_dir), 'pythonExecutable': sys.executable}}


def fingerprint(cue: dict, context: dict) -> str:
    return digest({'version': 1, 'cue': cue_identity(cue), 'context': context['identity']})


def clip_identity(cue: dict, context: dict) -> dict:
    return {'version': 1, 'cue': cue_identity(cue), 'context': context['identity']}
