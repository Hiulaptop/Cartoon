"""Single-writer local store. Commit records are published last, never inferred."""
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from english_voice.contract import InputError, ReviewError, canonical_bytes, digest, load_request, read_json, safe_id
from english_voice.provenance import clip_identity, file_hash, fingerprint, safe_path

MARKER = '.english-voice-root.json'
HEX = re.compile(r'[0-9a-f]{64}')


def child(root, *parts):
    root = safe_path(root)
    result = safe_path(root.joinpath(*parts))
    if not result.is_relative_to(root):
        raise ReviewError('Artifact escapes root')
    return result


def json_at(path):
    safe_path(path)
    if not path.is_file():
        raise ReviewError(f'Missing regular artifact: {path.name}')
    try:
        return read_json(path)
    except InputError as exc:
        raise ReviewError(f'Invalid artifact: {path.name}') from exc


def write_json(path, value, immutable=False):
    safe_path(path)
    payload = canonical_bytes(value)
    if immutable and path.exists():
        raise ReviewError(f'Refusing to replace immutable {path.name}')
    temporary = path.with_name(f'.{path.name}-{uuid4().hex}.tmp')
    with temporary.open('xb') as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def open_root(path: Path, create: bool) -> Path:
    root = safe_path(path)
    repo = Path(__file__).resolve().parents[2]
    app_data = safe_path(Path(os.environ.get('DATA_DIR') or repo / 'data'))
    if (root == repo or root.is_relative_to(repo) or repo.is_relative_to(root)
            or root == app_data or root.is_relative_to(app_data) or app_data.is_relative_to(root)):
        raise InputError('Output must be outside the repository and app DATA_DIR; use dedicated private local storage')
    if not root.exists():
        if not create:
            raise ReviewError('Output root does not exist; verify never creates it')
        root.mkdir(parents=True)
    if not root.is_dir():
        raise ReviewError('Output root must be a directory')
    marker = child(root, MARKER)
    if not marker.exists():
        if not create or any(root.iterdir()):
            raise ReviewError('Nonempty/unmarked output root; do not adopt or overwrite it')
        value = {'version': 1, 'kind': 'qwen-english-voice', 'id': str(uuid4())}
        try:
            with marker.open('xb') as stream:
                stream.write(canonical_bytes(value))
                stream.flush()
                os.fsync(stream.fileno())
        except FileExistsError as exc:
            raise ReviewError('Concurrent root initialization; inspect before continuing') from exc
    value = json_at(marker)
    if set(value) != {'version', 'kind', 'id'} or type(value['version']) is not int or value['version'] != 1 or value['kind'] != 'qwen-english-voice':
        raise ReviewError('Invalid root ownership marker')
    try:
        from uuid import UUID
        UUID(value['id'])
    except (ValueError, TypeError, AttributeError) as exc:
        raise ReviewError('Invalid root marker UUID') from exc
    return root


def unlocked(root):
    if child(root, '.runner.lock').exists():
        raise ReviewError('Runner lock exists; inspect owner/process manually, never auto-unlock')


@contextmanager
def locked(root: Path):
    path = child(root, '.runner.lock')
    token = uuid4().hex
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError as exc:
        raise ReviewError('Runner lock exists; no stealing stale locks') from exc
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(canonical_bytes({'token': token, 'pid': os.getpid(), 'createdUnix': time.time()}))
            stream.flush()
            os.fsync(stream.fileno())
        yield
    finally:
        # A replaced/corrupt lock is not ours to remove.
        if json_at(path).get('token') == token:
            path.unlink()
        else:
            raise ReviewError('Lock ownership changed; lock retained')


def bind_run(root, request: dict, request_hash: str) -> Path:
    run = child(root, 'runs', safe_id(request['requestId']))
    snapshot = child(run, 'request.json')
    if run.exists():
        if not snapshot.exists() or digest(json_at(snapshot)) != request_hash:
            raise ReviewError('Request ID already exists with different/partial snapshot; use a new ID or inspect')
        if json_at(snapshot) != request:
            raise ReviewError('Immutable request differs')
    else:
        run.mkdir(parents=True)
        write_json(snapshot, request, immutable=True)
    return run


def cache_dir(root, fp):
    if type(fp) is not str or not HEX.fullmatch(fp):
        raise ReviewError('Invalid fingerprint path')
    return child(root, 'cache', fp)


def inspect_clip(root, fingerprint, expected_identity) -> dict | None:
    directory = cache_dir(root, fingerprint)
    if digest(expected_identity) != fingerprint:
        raise ReviewError('Fingerprint does not bind expected identity')
    if not directory.exists():
        return None
    commit_path = child(directory, 'commit.json')
    if not commit_path.exists():
        raise ReviewError('Uncommitted cache attempt/orphan; explicit review/retry required')
    commit = json_at(commit_path)
    if commit.get('version') != 1 or commit.get('fingerprint') != fingerprint or commit.get('identityDigest') != fingerprint:
        raise ReviewError('Invalid cache commit identity')
    attempt_id = safe_id(commit.get('attemptId'))
    attempt = child(directory, 'attempts', attempt_id)
    identity = json_at(child(attempt, 'identity.json'))
    meta_path = child(attempt, 'metadata.json')
    metadata = json_at(meta_path)
    audio_path = child(attempt, 'audio.wav')
    if identity != expected_identity or file_hash(meta_path) != commit.get('metadataSha256'):
        raise ReviewError('Cache identity/metadata checksum mismatch')
    if metadata.get('identityDigest') != fingerprint or metadata.get('fingerprint') != fingerprint or metadata.get('technical') != 'ready' or metadata.get('listening') != 'pending':
        raise ReviewError('Cache metadata status/identity mismatch')
    from english_voice.audio import inspect_wav
    wav = inspect_wav(audio_path)
    if wav != metadata.get('wav') or wav['sha256'] != commit.get('wavSha256'):
        raise ReviewError('Cache WAV integrity mismatch')
    source = metadata.get('sourceMetrics', {})
    if source.get('sampleCount') != wav['sampleCount'] or source.get('sampleRate') != wav['sampleRate'] or not 0.001 <= source.get('peak', -1) <= 1:
        raise ReviewError('Missing/invalid pre-quantization metrics')
    return {'fingerprint': fingerprint, 'attemptId': attempt_id, 'metadata': metadata,
            'src': audio_path.relative_to(root).as_posix(), 'identity': identity}


def begin_attempt(root, fingerprint, identity, retry: bool) -> dict:
    directory = cache_dir(root, fingerprint)
    if child(directory, 'commit.json').exists():
        raise ReviewError('Committed clip cannot be replaced')
    if directory.exists() and not retry:
        raise ReviewError('Existing cache requires explicit retry after review')
    if digest(identity) != fingerprint:
        raise ReviewError('Attempt identity mismatch')
    attempt_id = uuid4().hex
    path = child(directory, 'attempts', attempt_id)
    path.mkdir(parents=True)
    write_json(child(path, 'identity.json'), identity, immutable=True)
    write_json(child(path, 'attempt.json'), {'version': 1, 'attemptId': attempt_id,
               'fingerprint': fingerprint, 'state': 'generating', 'createdUnix': time.time()}, immutable=True)
    return {'id': attempt_id, 'fingerprint': fingerprint, 'identity': identity, 'path': path}


def commit_clip(root, attempt, audio_metadata: dict) -> dict:
    fp = attempt['fingerprint']
    directory = cache_dir(root, fp)
    path = attempt['path']
    if child(directory, 'commit.json').exists():
        raise ReviewError('Refusing to replace successful clip')
    metadata = {**audio_metadata, 'version': 1, 'fingerprint': fp, 'identityDigest': digest(attempt['identity'])}
    write_json(child(path, 'metadata.json'), metadata, immutable=True)
    from english_voice.audio import inspect_wav
    if inspect_wav(child(path, 'audio.wav')) != metadata['wav']:
        raise ReviewError('Audio changed before commit')
    write_json(child(directory, 'commit.json'), {'version': 1, 'fingerprint': fp,
               'attemptId': attempt['id'], 'identityDigest': digest(attempt['identity']),
               'wavSha256': metadata['wav']['sha256'], 'metadataSha256': file_hash(child(path, 'metadata.json'))}, immutable=True)
    return inspect_clip(root, fp, attempt['identity'])


def publish_run(root, run_id, manifest: dict, timeline: dict) -> None:
    run = child(root, 'runs', safe_id(run_id))
    complete = child(run, 'complete.json')
    if complete.exists():
        existing = read_publication(root, run_id, manifest['requestHash'])
        if existing != {'manifest': manifest, 'timeline': timeline}:
            raise ReviewError('Completed publication differs; never overwrite')
        return
    publishes = child(run, 'publications')
    if publishes.exists() and any(publishes.iterdir()):
        raise ReviewError('Orphan run publication; manual review required')
    publish_id = uuid4().hex
    directory = child(publishes, publish_id)
    directory.mkdir(parents=True)
    write_json(child(directory, 'manifest.json'), manifest, immutable=True)
    write_json(child(directory, 'timeline.json'), timeline, immutable=True)
    write_json(complete, {'version': 1, 'requestHash': manifest['requestHash'], 'publicationId': publish_id,
                         'manifestSha256': file_hash(child(directory, 'manifest.json')),
                         'timelineSha256': file_hash(child(directory, 'timeline.json'))}, immutable=True)


def read_publication(root, run_id, request_hash):
    run = child(root, 'runs', safe_id(run_id))
    complete = json_at(child(run, 'complete.json'))
    if complete.get('version') != 1 or complete.get('requestHash') != request_hash:
        raise ReviewError('Invalid complete record/request hash')
    directory = child(run, 'publications', safe_id(complete.get('publicationId')))
    result = {}
    for name in ('manifest', 'timeline'):
        path = child(directory, name + '.json')
        if file_hash(path) != complete.get(name + 'Sha256'):
            raise ReviewError('Published artifact checksum mismatch')
        result[name] = json_at(path)
    return result


def load_binding(run, request_hash, cues, context):
    path = child(run, 'binding.json')
    value = {'version': 1, 'requestHash': request_hash, 'cues': cues, 'context': context['identity']}
    if path.exists():
        if json_at(path) != value:
            raise ReviewError('Run provenance changed; use a new request ID, never overwrite binding')
    else:
        if any(p.name not in {'request.json'} for p in run.iterdir()):
            raise ReviewError('Partial run without binding; inspect before resuming')
        write_json(path, value, immutable=True)
    return value


def load_ledger(run, request_hash, cues, context, create):
    path = child(run, 'ledger.json')
    if path.exists():
        ledger = json_at(path)
        if ledger.get('schemaVersion') != 1 or ledger.get('requestHash') != request_hash or type(ledger.get('cues')) is not list or len(ledger['cues']) != len(cues):
            raise ReviewError('Run ledger shape/hash mismatch')
        for row, cue in zip(ledger['cues'], cues):
            if row.get('cueId') != cue['id'] or row.get('fingerprint') != fingerprint(cue, context) or row.get('state') not in {'pending', 'generating', 'ready', 'failed', 'needs_review'}:
                raise ReviewError('Run ledger cue/identity/state mismatch')
        return ledger
    if not create:
        raise ReviewError('Missing run ledger')
    ledger = {'schemaVersion': 1, 'requestHash': request_hash, 'cues': [
        {'cueId': cue['id'], 'fingerprint': fingerprint(cue, context), 'state': 'pending', 'attemptId': None, 'error': None}
        for cue in cues]}
    write_json(path, ledger, immutable=True)
    return ledger


def outputs(request, request_hash, cues, context, clips):
    from english_voice.audio import build_timeline
    rows = []
    for cue, clip in zip(cues, clips):
        wav = clip['metadata']['wav']
        rows.append({'cueId': cue['id'], 'fingerprint': clip['fingerprint'], 'src': clip['src'],
                     'wavSha256': wav['sha256'], 'sampleRate': wav['sampleRate'], 'sampleCount': wav['sampleCount'],
                     'text': cue['effectiveText'], 'effectiveInstruction': cue['effectiveInstruction']})
    timeline = {**build_timeline(rows), 'requestId': request['requestId'], 'requestHash': request_hash}
    manifest = {'version': 1, 'requestId': request['requestId'], 'requestHash': request_hash,
                'technical': 'ready', 'listening': 'pending', 'production': 'not_released',
                'context': context['identity'], 'cues': [{'cueId': c['id'], 'fingerprint': clip['fingerprint'],
                   'attemptId': clip['attemptId'], 'src': clip['src'], 'wavSha256': clip['metadata']['wav']['sha256']}
                   for c, clip in zip(cues, clips)]}
    return manifest, timeline


def run_request(output, model, request, cues, context, budget, retries):
    model = safe_path(model)
    target = safe_path(output)
    if target == model or target.is_relative_to(model) or model.is_relative_to(target):
        raise InputError('Output root must not overlap model tree')
    root = open_root(target, create=True)
    with locked(root):
        request_hash = digest(request)
        run = bind_run(root, request, request_hash)
        load_binding(run, request_hash, cues, context)
        ledger = load_ledger(run, request_hash, cues, context, create=True)
        ledger_path = child(run, 'ledger.json')
        completed = child(run, 'complete.json').exists()
        publications = child(run, 'publications')
        if completed:
            read_publication(root, request['requestId'], request_hash)
        elif publications.exists() and any(publications.iterdir()):
            raise ReviewError('Orphan publication; inspect before any new inference')
        backend = None
        spent = 0
        clips = []
        for cue, row in zip(cues, ledger['cues']):
            fp = row['fingerprint']
            identity = clip_identity(cue, context)
            try:
                clip = inspect_clip(root, fp, identity)
            except (ReviewError, InputError) as exc:
                row.update(state='needs_review', error=row.get('error') or str(exc))
                write_json(ledger_path, ledger)
                if cue['id'] not in retries or child(cache_dir(root, fp), 'commit.json').exists():
                    raise ReviewError(str(exc)) from exc
                clip = None
            if clip is not None:
                row.update(state='ready', attemptId=clip['attemptId'], error=None)
                write_json(ledger_path, ledger)
                clips.append(clip)
                continue
            if completed:
                raise ReviewError('Completed run has missing clip; never regenerate under its publication')
            if row['state'] == 'generating':
                row.update(state='needs_review', error='Interrupted generating state; prior attempt retained')
                write_json(ledger_path, ledger)
            if row['state'] != 'pending' and cue['id'] not in retries:
                row.update(state='needs_review', error=row.get('error') or 'Missing committed clip for prior attempt/state; explicit review/retry required')
                write_json(ledger_path, ledger)
                raise ReviewError(row['error'])
            if cue['id'] in retries and row['state'] not in {'failed', 'needs_review'}:
                raise ReviewError('Retry is only for failed/needs_review cues, not fresh pending cues')
            if retries and cue['id'] not in retries:
                raise ReviewError('Retry-only invocation encountered an earlier unready cue; no budget spent on unselected cues')
            if spent >= budget:
                return {'requestId': request['requestId'], 'state': 'pending', 'newAttempts': spent,
                        'reason': 'Budget exhausted; no model loaded for a zero-budget invocation'}, 4
            attempt = begin_attempt(root, fp, identity, retry=cue['id'] in retries)
            row.update(state='generating', attemptId=attempt['id'], error=None)
            write_json(ledger_path, ledger)
            spent += 1
            try:
                from english_voice.backend import load_backend, generate_cue
                from english_voice.audio import write_checked_wav
                if backend is None:
                    backend = load_backend(model, context)
                waveform, rate = generate_cue(backend, cue, context)
                metadata = write_checked_wav(child(attempt['path'], 'audio.wav'), waveform, rate)
                clip = commit_clip(root, attempt, metadata)
            except Exception as exc:
                state = 'needs_review' if isinstance(exc, (ReviewError, InputError)) else 'failed'
                detail = str(exc) if isinstance(exc, (ReviewError, InputError)) else 'Inspect retained attempt; no automatic retry'
                row.update(state=state, error=f'{type(exc).__name__}: {detail}')
                write_json(child(attempt['path'], 'failure.json'), {
                    'state': state, 'error': row['error'],
                    'audioDiagnostics': getattr(exc, 'diagnostics', None),
                    'quarantinedSource': 'rejected-source.npy' if child(attempt['path'], 'rejected-source.npy').exists() else None,
                }, immutable=True)
                write_json(ledger_path, ledger)
                return {'requestId': request['requestId'], 'state': state, 'cueId': cue['id'],
                        'newAttempts': spent, 'error': row['error']}, 3 if state == 'needs_review' else 5
            row.update(state='ready', error=None)
            write_json(ledger_path, ledger)
            clips.append(clip)
        # Reinspect every successful reference at the publication boundary.
        clips = [inspect_clip(root, fingerprint(cue, context), clip_identity(cue, context)) for cue in cues]
        if any(clip is None for clip in clips):
            raise ReviewError('Missing clip before publication')
        manifest, timeline = outputs(request, request_hash, cues, context, clips)
        publish_run(root, request['requestId'], manifest, timeline)
        return {'requestId': request['requestId'], 'technical': 'ready', 'listening': 'pending',
                'production': 'not_released', 'newAttempts': spent, 'durationInFrames': timeline['durationInFrames']}, 0


def verify_run(output, run_id):
    root = open_root(output, create=False)
    unlocked(root)
    run = child(root, 'runs', safe_id(run_id))
    request = load_request(child(run, 'request.json'))
    if request['requestId'] != run_id:
        raise ReviewError('Snapshot ID differs from directory')
    request_hash = digest(request)
    binding = json_at(child(run, 'binding.json'))
    if binding.get('version') != 1 or binding.get('requestHash') != request_hash:
        raise ReviewError('Immutable binding hash mismatch')
    cues = binding['cues']
    context = {'identity': binding['context']}
    # Verify effective strings against original snapshot and stored preset/override provenance.
    from english_voice.contract import cue_identity, resolve_cues
    if len(cues) != len(request['cues']):
        raise ReviewError('Binding cue count differs')
    for original, cue in zip(request['cues'], cues):
        if cue['id'] != original['id'] or cue['original'] != original:
            raise ReviewError('Binding original cue differs')
        presets = {'version': cue['presetVersion'], 'presets': {original['preset']: cue['effectiveInstruction']}}
        expected = resolve_cues({**request, 'cues': [original]}, presets)[0]
        if cue_identity(expected) != cue_identity(cue):
            raise ReviewError('Binding effective cue differs from snapshot')
    ledger = load_ledger(run, request_hash, cues, context, create=False)
    clips = []
    for cue, row in zip(cues, ledger['cues']):
        clip = inspect_clip(root, fingerprint(cue, context), clip_identity(cue, context))
        if clip is None or row['state'] != 'ready' or row['attemptId'] != clip['attemptId']:
            raise ReviewError('Run is partial/stale; verify does not repair it')
        clips.append(clip)
    manifest, timeline = outputs(request, request_hash, cues, context, clips)
    if read_publication(root, run_id, request_hash) != {'manifest': manifest, 'timeline': timeline}:
        raise ReviewError('Published artifacts differ from verified sample-derived output')
    unlocked(root)
    return {'requestId': run_id, 'technical': 'ready', 'listening': 'pending',
            'production': 'not_released', 'inference': False, 'durationInFrames': timeline['durationInFrames']}
