"""Explicit, finite local Qwen workflow. Use the existing venv's Python -I."""
import argparse
import json
import sys
from pathlib import Path

if not sys.flags.isolated:
    raise SystemExit('Use Python -I for every command')
sys.dont_write_bytecode = True
SCRIPTS = Path(__file__).absolute().parent
PACKAGE = SCRIPTS / 'english_voice'
if PACKAGE.is_symlink() or PACKAGE.is_junction() or PACKAGE.resolve().parent != SCRIPTS.resolve():
    raise SystemExit('Untrusted sibling package path')
for component in (SCRIPTS, *SCRIPTS.parents):
    if component.is_symlink() or component.is_junction():
        raise SystemExit('Linked scripts directory is not supported')
if not PACKAGE.is_dir():
    raise SystemExit('Missing sibling package')
for source in PACKAGE.rglob('*'):
    if source.is_symlink() or source.is_junction():
        raise SystemExit('Linked package source is not supported')
sys.path.insert(0, str(SCRIPTS.resolve()))

from english_voice.contract import InputError, ReviewError, digest, load_presets, load_request, resolve_cues

PACK = SCRIPTS.parent / 'workflows/voice/qwen-english/v1'


def parser():
    p = argparse.ArgumentParser(description='Local English voice: validation by default; inference requires separate permission.')
    sub = p.add_subparsers(dest='command')
    p.add_argument('--request', type=Path, help='Default validation-only request')
    for name in ('validate', 'preflight', 'run'):
        command = sub.add_parser(name)
        command.add_argument('--request', type=Path, required=True)
        if name != 'validate':
            command.add_argument('--model', type=Path, required=True)
        if name == 'run':
            command.add_argument('--output', type=Path, required=True)
            command.add_argument('--execute', action='store_true', required=True)
            command.add_argument('--max-new-cues', type=int, choices=range(25), required=True)
            command.add_argument('--retry-cue', action='append', default=[])
    verify = sub.add_parser('verify')
    verify.add_argument('--output', type=Path, required=True)
    verify.add_argument('--request-id', required=True)
    return p


def main():
    p = parser()
    args = p.parse_args()
    command = args.command or 'validate'
    try:
        if command == 'verify':
            from english_voice.store import verify_run
            result = verify_run(args.output, args.request_id)
        else:
            if args.request is None:
                p.error('--request is required')
            request = load_request(args.request)
            presets = load_presets(PACK / 'presets.json')
            cues = resolve_cues(request, presets)
            result = {'command': command, 'requestId': request['requestId'],
                      'requestHash': digest(request), 'cues': cues,
                      'inference': False, 'listening': 'pending', 'production': 'not_released'}
            if command in ('preflight', 'run'):
                from english_voice.contract import read_json
                from english_voice.provenance import collect_context, fingerprint
                context = collect_context(args.model, read_json(PACK / 'manifest.json')['release'])
                result.update(context=context, fingerprints=[fingerprint(cue, context) for cue in cues])
            if command == 'run':
                if not set(args.retry_cue) <= {cue['id'] for cue in cues}:
                    raise InputError('retry-cue must identify a cue in this request')
                from english_voice.store import run_request
                result, code = run_request(args.output, args.model, request, cues, context,
                                           args.max_new_cues, set(args.retry_cue))
                print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
                return code
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
        return 0
    except InputError as exc:
        print(f'Input/preflight stopped: {exc}', file=sys.stderr)
        return 2
    except ReviewError as exc:
        print(f'Needs review: {exc}', file=sys.stderr)
        return 3
    except Exception as exc:
        # Do not dump backend request data, environment or traceback.
        print(f'Runtime stopped ({type(exc).__name__}); preserve artifacts and inspect locally. No automatic retry.', file=sys.stderr)
        return 5


if __name__ == '__main__':
    raise SystemExit(main())
