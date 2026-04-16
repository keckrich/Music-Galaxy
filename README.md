# Music Galaxy

A 3D interactive visualizer for your [AudioMuse-AI](https://github.com/NeptuneHub/AudioMuse-AI) music library. Every song in your collection becomes a star, positioned in 3D space by audio similarity — songs that sound alike cluster together. Built on top of AudioMuse's CLAP embeddings and UMAP dimensionality reduction.

**Features:**
- 3D particle galaxy with physics drift
- Color by energy, musical key, genre, decade, or antipode grouping
- Click any star to see song details, mood breakdown, and similar songs
- Fuzzy search across title, artist, and album
- Plays audio via Navidrome, Jellyfin, Emby, or Lyrion (Currently only supports Navidrome)

---

## Adding to your AudioMuse stack

Add a single service to your existing `docker-compose.yml`:

```yaml
services:
  music-galaxy:
    image: keckrich/music-galaxy:latest
    container_name: music-galaxy
    ports:
      - "${GALAXY_PORT:-8081}:8081"
    environment:
      # Postgres — required for auto-generating the song map
      POSTGRES_HOST: "postgres"
      POSTGRES_USER: ${POSTGRES_USER:-audiomuse}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-audiomusepassword}
      POSTGRES_DB: ${POSTGRES_DB:-audiomusedb}
      POSTGRES_PORT: ${POSTGRES_PORT:-5432}

      # Media provider — add one to enable in-browser playback (all optional)

      # Navidrome
      # NAVIDROME_URL: ${NAVIDROME_URL}
      # NAVIDROME_USER: ${NAVIDROME_USER}
      # NAVIDROME_PASSWORD: ${NAVIDROME_PASSWORD}

      # Jellyfin
      # JELLYFIN_URL: ${JELLYFIN_URL}
      # JELLYFIN_TOKEN: ${JELLYFIN_TOKEN}
      # JELLYFIN_USER_ID: ${JELLYFIN_USER_ID}

      # Emby
      # EMBY_URL: ${EMBY_URL}
      # EMBY_TOKEN: ${EMBY_TOKEN}
      # EMBY_USER_ID: ${EMBY_USER_ID}

      # Lyrion (LMS)
      # LYRION_URL: ${LYRION_URL}
    depends_on:
      - postgres
    restart: unless-stopped
```

Open `http://<your-server>:8081`. On first boot the server will generate the 3D song map from your AudioMuse database — this takes about 30 seconds and shows a progress message in the UI. The result is cached, so subsequent restarts are instant.

To regenerate the map after AudioMuse ingests new music, use the **Refresh Data** button in the settings panel (⚙).

See [Configuration](docs/configuration.md) for all available environment variables.

---

## Running locally for development

**Prerequisites:** Python 3.11+, Node 20+

**1. Install dependencies**

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd frontend && npm install
```

**2. Get song data**

From a running Music Galaxy instance, open the settings panel (⚙) and click **Export songs.json**. Drop the downloaded file into `shared/songs.json`.

**3. Start the backend** (Terminal 1)

```bash
cd backend && ENVIRONMENT=development python3 server.py   # Flask API on :8765
```

**4. Start the frontend** (Terminal 2)

```bash
cd frontend && npm run dev   # Vite on :5173 with hot reload
```

Open `http://localhost:5173`.
