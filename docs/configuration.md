# Configuration

All settings are passed as environment variables. Every variable has a default and is optional.

---

## Database (required in production)

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_HOST` | — | Hostname of your AudioMuse-AI PostgreSQL instance |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | — | Database name |
| `POSTGRES_USER` | — | Database user |
| `POSTGRES_PASSWORD` | — | Database password |

---

## Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8081` | Port the server listens on |
| `WEB_CONCURRENCY` | `1` | Number of gunicorn worker processes. For a low-traffic personal server 1–2 is fine; increase if you see slow responses under load |
| `WORKER_TIMEOUT` | `120` | Gunicorn request timeout in seconds. The default covers the UMAP generation time on first boot |
| `LOG_LEVEL` | `info` | Gunicorn log verbosity: `debug`, `info`, `warning`, `error`, `critical` |

---

## Data

| Variable | Default | Description |
|---|---|---|
| `SONGS_FILE` | `/app/shared/songs.json` | Path to the generated song map cache. Mount a volume here to persist data across container restarts |

---

## Runtime

| Variable | Default | Description |
|---|---|---|
| `TZ` | `UTC` | Timezone for log timestamps (e.g. `America/New_York`, `Europe/Berlin`) |
| `PYTHONUNBUFFERED` | `1` | Flush logs immediately — leave this set |
| `PYTHONDONTWRITEBYTECODE` | `1` | Skip `.pyc` file generation at runtime — leave this set |

---

## Persisting data across restarts

By default the generated `songs.json` lives inside the container and is lost on restart. Mount a volume to avoid regenerating on every boot:

```yaml
volumes:
  - music-galaxy-data:/app/shared

volumes:
  music-galaxy-data:
```

Generation takes ~30 seconds for a typical library and only needs to re-run when AudioMuse ingests new music. You can trigger a regeneration at any time via the **Refresh Data** button in the settings panel (⚙).
