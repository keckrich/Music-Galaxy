#!/usr/bin/env python3
"""
Music Galaxy Flask server.

ENVIRONMENT=development  Reads songs.json from disk. Run fetch_data.py first.
                         Only serves /api/* — Vite dev server handles the frontend.
ENVIRONMENT=production   Auto-generates songs.json from Postgres on boot if missing.
                         Serves /api/* + Vite dist/ static files.

Dev usage:
  cd backend && ENVIRONMENT=development python server.py  # API on :8765
  cd frontend && npm run dev                              # Vite on :5173, proxies /api → :8765

Prod usage (Docker):
  docker build -t music-galaxy .   # builds from repo root
  # server runs on :8081, SONGS_FILE and DIST_DIR set by Dockerfile ENV
"""
import json
import os
import re
import threading
from datetime import datetime, timezone
from urllib.parse import quote as url_quote

import requests as req_lib
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_file, send_from_directory, stream_with_context

ENVIRONMENT = os.getenv('ENVIRONMENT', 'production')

# In dev, load .env from the repo root so NAVIDROME_URL etc. are available
# for the /api/stream proxy without requiring a full Docker stack.
if ENVIRONMENT == 'development':
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env'))

PORT = int(os.getenv('PORT', '8765' if ENVIRONMENT == 'development' else '8081'))

# Resolve paths relative to the repo root (one level up from backend/).
# Both can be overridden via env vars — Docker sets them explicitly.
_ROOT      = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SONGS_FILE = os.getenv('SONGS_FILE', os.path.join(_ROOT, 'shared', 'default songs.json'))
DIST_DIR   = os.getenv('DIST_DIR',   os.path.join(_ROOT, 'frontend', 'dist'))

# Multi-library support
SHARED_DIR = os.path.abspath(os.path.dirname(SONGS_FILE) or os.path.join(_ROOT, 'shared'))

app = Flask(__name__)

_cache:          dict[str, list] = {}   # filename → songs list
_lock            = threading.Lock()
_generating      = False
_generate_error: str | None = None

_DEFAULT_NAME = os.path.basename(SONGS_FILE)


def sanitize_library_name(raw: str) -> str:
    """Sanitize an uploaded filename to a safe library name."""
    name = os.path.basename(raw)                  # strip path components
    name = re.sub(r'[^\w\-.]', '_', name)          # only word chars, hyphens, dots
    if not name.lower().endswith('.json'):
        name = name + '.json'                      # append .json if missing
    if name.startswith('.'):
        raise ValueError('Invalid filename')
    return name[:69]                               # max 64 chars + ".json"


def _unique_library_name(name: str) -> str:
    """Return a unique name by appending (2), (3), … until no collision."""
    stem = name[:-5]  # strip .json
    n = 2
    while True:
        candidate = f'{stem} ({n}).json'
        if not os.path.exists(os.path.join(SHARED_DIR, candidate)):
            return candidate
        n += 1



# ── Metadata envelope helpers ─────────────────────────────────────────────

def _make_envelope(songs: list, is_default: bool) -> dict:
    """Wrap a songs list in the v1 metadata envelope."""
    return {
        'version':   1,
        'songCount': len(songs),
        'createdAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'isDefault': is_default,
        'generator': 'music-galaxy',
        'songs':     songs,
    }


def _extract_songs(data: object) -> tuple[list, bool]:
    """Extract songs list and isDefault from either new envelope or legacy plain array.
    Returns (songs, is_default).
    """
    if isinstance(data, list):
        # Legacy format — plain array, treat as non-default upload
        return data, False
    if isinstance(data, dict) and 'songs' in data:
        songs     = data['songs'] if isinstance(data['songs'], list) else []
        is_default = bool(data.get('isDefault', False))
        return songs, is_default
    return [], False


# ── Data generation (production only) ────────────────────────────────────

def _generate() -> list:
    if not os.getenv('POSTGRES_HOST'):
        raise RuntimeError(
            'No song library found and Postgres is not configured. '
            'Upload a songs.json via the settings panel (⚙), or set the '
            'POSTGRES_HOST environment variable to auto-generate one.'
        )

    try:
        import psycopg2
        import numpy as np
        import umap as umap_lib
    except ImportError as exc:
        raise RuntimeError(
            f'Generation dependencies not installed ({exc}). '
            'Rebuild with --build-arg GENERATION=true or pre-populate songs.json.'
        ) from exc

    conn = psycopg2.connect(
        host     = os.environ['POSTGRES_HOST'],
        port     = int(os.getenv('POSTGRES_PORT', '5432')),
        dbname   = os.environ['POSTGRES_DB'],
        user     = os.environ['POSTGRES_USER'],
        password = os.environ['POSTGRES_PASSWORD'],
    )
    cur = conn.cursor()

    print('Fetching embeddings...', flush=True)
    cur.execute('SELECT item_id, embedding FROM embedding ORDER BY item_id')
    rows       = cur.fetchall()
    item_ids   = [r[0] for r in rows]
    embeddings = np.array([np.frombuffer(bytes(r[1]), dtype=np.float32) for r in rows])
    print(f'  shape: {embeddings.shape}', flush=True)

    print('Running UMAP (3D)...', flush=True)
    reducer = umap_lib.UMAP(
        n_components=3, n_neighbors=15, min_dist=0.1, random_state=42, verbose=False
    )
    coords = reducer.fit_transform(embeddings)
    print(f'  done: {coords.shape}', flush=True)

    cur.execute('''
        SELECT item_id, title, author, album, album_artist,
               tempo, key, scale, energy, mood_vector, other_features, year, rating
        FROM score
    ''')
    score_map = {r[0]: r[1:] for r in cur.fetchall()}
    cur.close()
    conn.close()

    songs: list = []
    valid_coords: list = []
    for i, sid in enumerate(item_ids):
        m = score_map.get(sid)
        if not m:
            continue
        songs.append({
            'id':          sid,
            'x':           float(coords[i][0]),
            'y':           float(coords[i][1]),
            'z':           float(coords[i][2]),
            'title':       m[0],
            'author':      m[1],
            'album':       m[2],
            'albumArtist': m[3],
            'tempo':       round(float(m[4]), 1) if m[4] else None,
            'key':         m[5],
            'scale':       m[6],
            'energy':      round(float(m[7]), 3) if m[7] else None,
            'mood':        m[8],
            'features':    m[9],
            'year':        m[10],
            'rating':      m[11],
        })
        valid_coords.append([float(coords[i][0]), float(coords[i][1]), float(coords[i][2])])

    # Normalize to [-10, 10] cube
    c  = np.array(valid_coords)
    cx = (c[:, 0].min() + c[:, 0].max()) / 2
    cy = (c[:, 1].min() + c[:, 1].max()) / 2
    cz = (c[:, 2].min() + c[:, 2].max()) / 2
    sc = 20.0 / max(
        c[:, 0].max() - c[:, 0].min(),
        c[:, 1].max() - c[:, 1].min(),
        c[:, 2].max() - c[:, 2].min(),
    )
    for s, vc in zip(songs, valid_coords):
        s['x'] = round((vc[0] - cx) * sc, 4)
        s['y'] = round((vc[1] - cy) * sc, 4)
        s['z'] = round((vc[2] - cz) * sc, 4)

    # Antipodes — farthest song for each song
    c2      = np.array([[s['x'], s['y'], s['z']] for s in songs])
    sq_dist = np.sum((c2[:, None] - c2[None, :]) ** 2, axis=2)
    ant_idx = sq_dist.argmax(axis=1)
    for i, s in enumerate(songs):
        s['antipodeId'] = songs[int(ant_idx[i])]['id']

    print(f'Generated {len(songs)} songs', flush=True)
    return songs


def _bg_generate() -> None:
    global _generating, _generate_error
    try:
        songs    = _generate()
        envelope = _make_envelope(songs, is_default=True)
        with open(SONGS_FILE, 'w') as f:
            json.dump(envelope, f, separators=(',', ':'))
        with _lock:
            _cache[_DEFAULT_NAME] = songs
    except Exception as e:
        print(f'Generation error: {e}', flush=True)
        with _lock:
            _generate_error = str(e)
    finally:
        with _lock:
            _generating = False


def _find_default_in_shared() -> str | None:
    """Scan SHARED_DIR for the first JSON file whose envelope has isDefault=True."""
    if not os.path.exists(SHARED_DIR):
        return None
    for fname in sorted(os.listdir(SHARED_DIR)):
        if not fname.endswith('.json') or fname.startswith('.'):
            continue
        fpath = os.path.join(SHARED_DIR, fname)
        try:
            with open(fpath) as f:
                raw = json.load(f)
            _, is_default = _extract_songs(raw)
            if is_default:
                return fpath
        except Exception:
            continue
    return None


def _ensure_songs(name: str | None = None) -> list | None:
    """Load songs for the given library filename. Falls back to default if not found."""
    global _generating, _generate_error

    if name:
        safe = os.path.basename(name)
        path = os.path.join(SHARED_DIR, safe)
        if not os.path.exists(path):
            safe = _DEFAULT_NAME
            path = SONGS_FILE
    else:
        safe = _DEFAULT_NAME
        path = SONGS_FILE

    with _lock:
        if safe in _cache:
            return _cache[safe]

    if os.path.exists(path):
        with open(path) as f:
            raw = json.load(f)
        songs, _ = _extract_songs(raw)
        with _lock:
            _cache[safe] = songs
        print(f'Loaded {len(songs)} songs from {safe}', flush=True)
        return songs

    # Default file not at expected path — scan for any isDefault file, then try generation.
    if safe == _DEFAULT_NAME:
        default_path = _find_default_in_shared()
        if default_path:
            try:
                with open(default_path) as f:
                    raw = json.load(f)
                songs, _ = _extract_songs(raw)
                with _lock:
                    _cache[_DEFAULT_NAME] = songs
                print(f'Loaded default from {os.path.basename(default_path)}', flush=True)
                return songs
            except Exception:
                pass

        # No default found — attempt Postgres generation once (any environment).
        with _lock:
            if not _generating and _generate_error is None:
                _generating = True
                threading.Thread(target=_bg_generate, daemon=True).start()
        return None

    return None


# ── Media provider helpers ────────────────────────────────────────────────

def _nav_pass() -> str:
    """NAVIDROME_PASSWORD is the audiomuse standard; fall back to NAVIDROME_PASS for old installs."""
    return os.getenv('NAVIDROME_PASSWORD') or os.getenv('NAVIDROME_PASS', '')


def _provider_configured(ptype: str) -> bool:
    if ptype == 'navidrome':
        return bool(os.getenv('NAVIDROME_URL') and os.getenv('NAVIDROME_USER') and _nav_pass())
    if ptype == 'jellyfin':
        return bool(os.getenv('JELLYFIN_URL') and os.getenv('JELLYFIN_TOKEN'))
    if ptype == 'emby':
        return bool(os.getenv('EMBY_URL') and os.getenv('EMBY_TOKEN'))
    if ptype == 'lyrion':
        return bool(os.getenv('LYRION_URL'))
    return False


def _build_stream_url(song_id: str, provider: str) -> str:
    if provider == 'navidrome':
        base = os.getenv('NAVIDROME_URL', '').rstrip('/')
        user = os.getenv('NAVIDROME_USER', '')
        pwd  = url_quote(_nav_pass())
        return f'{base}/rest/stream.view?id={song_id}&u={user}&p={pwd}&v=1.16.1&c=musicgalaxy'
    if provider == 'jellyfin':
        base  = os.getenv('JELLYFIN_URL', '').rstrip('/')
        token = os.getenv('JELLYFIN_TOKEN', '')
        return f'{base}/Audio/{song_id}/stream?Static=true&api_key={token}'
    if provider == 'emby':
        base  = os.getenv('EMBY_URL', '').rstrip('/')
        token = os.getenv('EMBY_TOKEN', '')
        return f'{base}/Audio/{song_id}/stream?Static=true&api_key={token}'
    if provider == 'lyrion':
        base = os.getenv('LYRION_URL', '').rstrip('/')
        return f'{base}/music/{song_id}/download'
    raise ValueError(f'Unknown provider: {provider}')


# ── Routes ────────────────────────────────────────────────────────────────

@app.route('/api/config', methods=['GET'])
def api_config():
    providers = []
    _PROVIDER_META = [
        ('navidrome', 'Navidrome', lambda: os.getenv('NAVIDROME_URL', '').rstrip('/')),
        ('jellyfin',  'Jellyfin',  lambda: os.getenv('JELLYFIN_URL',  '').rstrip('/')),
        ('emby',      'Emby',      lambda: os.getenv('EMBY_URL',      '').rstrip('/')),
        ('lyrion',    'Lyrion',    lambda: os.getenv('LYRION_URL',    '').rstrip('/')),
    ]
    for ptype, label, get_url in _PROVIDER_META:
        if _provider_configured(ptype):
            providers.append({'type': ptype, 'url': get_url(), 'label': label})
    return jsonify({'providers': providers})


@app.route('/api/stream/<song_id>', methods=['GET'])
def api_stream(song_id: str):
    provider = request.args.get('provider', '').strip()
    if not provider:
        for ptype in ('navidrome', 'jellyfin', 'emby', 'lyrion'):
            if _provider_configured(ptype):
                provider = ptype
                break
    if not provider or not _provider_configured(provider):
        return jsonify({'error': f'Media provider not configured: {provider or "none"}'}), 503

    try:
        stream_url = _build_stream_url(song_id, provider)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    fwd_headers = {}
    range_hdr = request.headers.get('Range')
    if range_hdr:
        fwd_headers['Range'] = range_hdr

    try:
        r = req_lib.get(stream_url, headers=fwd_headers, stream=True, timeout=30)
    except Exception as e:
        return jsonify({'error': str(e)}), 502

    resp_headers = {
        'Content-Type': r.headers.get('Content-Type', 'audio/mpeg'),
        'Accept-Ranges': 'bytes',
    }
    if 'Content-Length' in r.headers:
        resp_headers['Content-Length'] = r.headers['Content-Length']
    if 'Content-Range' in r.headers:
        resp_headers['Content-Range'] = r.headers['Content-Range']

    return Response(
        stream_with_context(r.iter_content(chunk_size=8192)),
        status=r.status_code,
        headers=resp_headers,
    )


@app.route('/api/status')
def api_status():
    default_songs = _cache.get(_DEFAULT_NAME)
    return jsonify({
        'environment': ENVIRONMENT,
        'generating':  _generating,
        'count':       len(default_songs) if default_songs else 0,
        'error':       _generate_error,
    })


@app.route('/api/songs')
def api_songs():
    library = request.args.get('library') or None

    # Named library requests always go straight to disk regardless of generation state.
    # Generation state only gates the default library.
    if not library:
        if _generating:
            return jsonify({'status': 'generating', 'message': 'Computing 3D song map...'}), 202
        if _generate_error:
            return jsonify({'error': _generate_error, 'no_default': True}), 503

    songs = _ensure_songs(library)
    if songs is None:
        if not library:
            # _ensure_songs just kicked off generation — tell the client to poll
            return jsonify({'status': 'generating', 'message': 'Starting...'}), 202
        return jsonify({'error': f'Library not found: {library}'}), 404

    return jsonify(songs)


@app.route('/api/export')
def api_export():
    library = request.args.get('library') or None
    if library:
        safe = os.path.basename(library)
        path = os.path.join(SHARED_DIR, safe)
        if not os.path.exists(path):
            return jsonify({'error': f'{safe} not found'}), 404
    else:
        path = SONGS_FILE
        safe = _DEFAULT_NAME
    if not os.path.exists(path):
        return jsonify({'error': 'No song data available yet.'}), 404
    return send_file(path, as_attachment=True, download_name=safe, mimetype='application/json')


@app.route('/api/refresh', methods=['POST'])
def api_refresh():
    global _generating, _generate_error

    with _lock:
        if _generating:
            return jsonify({'status': 'generating', 'message': 'Already generating...'}), 202
        _cache.pop(_DEFAULT_NAME, None)
        _generating     = True
        _generate_error = None
        if os.path.exists(SONGS_FILE):
            os.remove(SONGS_FILE)

    threading.Thread(target=_bg_generate, daemon=True).start()
    return jsonify({'status': 'generating', 'message': 'Regenerating song map...'})


# ── Library management routes ─────────────────────────────────────────────

@app.route('/api/libraries')
def api_libraries():
    if not os.path.exists(SHARED_DIR):
        return jsonify([])

    libs = []
    for fname in sorted(os.listdir(SHARED_DIR)):
        if fname.endswith('.json') and not fname.startswith('.'):
            fpath = os.path.join(SHARED_DIR, fname)
            size_kb = round(os.path.getsize(fpath) / 1024, 1)
            try:
                with open(fpath) as fp:
                    raw = json.load(fp)
                songs, is_default = _extract_songs(raw)
                count = len(songs)
            except Exception:
                count      = 0
                is_default = False
            libs.append({
                'name':      fname,
                'size_kb':   size_kb,
                'count':     count,
                'isDefault': is_default,
            })

    return jsonify(libs)


@app.route('/api/libraries/upload', methods=['POST'])
def api_libraries_upload():
    global _cache

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    f = request.files['file']
    try:
        safe_name = sanitize_library_name(f.filename or 'library.json')
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    os.makedirs(SHARED_DIR, exist_ok=True)
    dest = os.path.join(SHARED_DIR, safe_name)
    strategy = request.args.get('strategy', '')  # 'replace' | 'keep_both'

    # Read and parse the uploaded file
    try:
        uploaded_raw   = json.loads(f.read())
        uploaded_songs, _ = _extract_songs(uploaded_raw)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid JSON file'}), 400

    if os.path.exists(dest) and strategy not in ('replace', 'keep_both'):
        # Conflict — return counts so the UI can show a useful dialog
        try:
            with open(dest) as fp:
                existing_raw = json.load(fp)
            existing_songs, _ = _extract_songs(existing_raw)
            existing_count = len(existing_songs)
        except Exception:
            existing_count = 0
        return jsonify({
            'conflict': True,
            'existing_name': safe_name,
            'existing_count': existing_count,
        }), 409

    if strategy == 'keep_both' and os.path.exists(dest):
        safe_name = _unique_library_name(safe_name)
        dest = os.path.join(SHARED_DIR, safe_name)

    # Write with envelope, marking as non-default (user upload)
    envelope = _make_envelope(uploaded_songs, is_default=False)
    with open(dest, 'w') as out:
        json.dump(envelope, out, separators=(',', ':'))

    with _lock:
        _cache.pop(safe_name, None)

    return jsonify({'name': safe_name})


@app.route('/api/libraries/rename', methods=['PATCH'])
def api_libraries_rename():
    global _cache

    data = request.get_json() or {}
    from_name = os.path.basename(data.get('from', '').strip())
    try:
        to_name = sanitize_library_name(data.get('to', '').strip())
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    if not from_name:
        return jsonify({'error': '"from" is required'}), 400

    src = os.path.join(SHARED_DIR, from_name)
    dst = os.path.join(SHARED_DIR, to_name)

    if not os.path.exists(src):
        return jsonify({'error': f'{from_name} not found'}), 404
    if os.path.exists(dst):
        return jsonify({'error': f'{to_name} already exists'}), 409

    os.rename(src, dst)

    with _lock:
        _cache.pop(from_name, None)
        _cache.pop(to_name, None)

    return jsonify({'from': from_name, 'to': to_name})


@app.route('/api/libraries/<name>', methods=['DELETE'])
def api_libraries_delete(name: str):

    safe_name = os.path.basename(name)
    target = os.path.join(SHARED_DIR, safe_name)

    if not os.path.exists(target):
        return jsonify({'error': f'{safe_name} not found'}), 404

    # Refuse if isDefault
    try:
        with open(target) as fp:
            raw = json.load(fp)
        _, is_default = _extract_songs(raw)
    except Exception:
        is_default = False
    if is_default:
        return jsonify({'error': 'Cannot delete the default library'}), 409

    # Refuse if it would be the last file
    libs = [f for f in os.listdir(SHARED_DIR) if f.endswith('.json') and not f.startswith('.')]
    if len(libs) <= 1:
        return jsonify({'error': 'Cannot delete the last library'}), 409

    os.remove(target)
    with _lock:
        _cache.pop(safe_name, None)
    return jsonify({'deleted': safe_name})


# Serve Vite build (production) — SPA catch-all
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static(path: str):
    if ENVIRONMENT == 'development':
        return 'Use npm run dev for the frontend in development mode.', 404
    full = os.path.join(DIST_DIR, path)
    if path and os.path.exists(full):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, 'index.html')


_ensure_songs()  # Load from disk or kick off generation on startup

if __name__ == '__main__':
    print(f'Music Galaxy [{ENVIRONMENT}] → http://localhost:{PORT}', flush=True)
    app.run(host='0.0.0.0', port=PORT, debug=(ENVIRONMENT == 'development'), use_reloader=False)
