# PrivatePod

PrivatePod is a simple, self-hosted podcast hosting solution that allows you to:

- Host your MP3 files
- Generate an XML-based RSS feed compatible with podcast players
- Manage your podcast episodes through a web interface

## Features

- Upload and host MP3 files
- Generate a podcast RSS feed compatible with Apple Podcasts, Spotify, and other podcast players
- Simple web interface for managing episodes and podcast settings
- Containerized with Docker for easy deployment
- Persistent storage for your podcast files and configuration

## Requirements

- Docker and Docker Compose

## Quick Start

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/privatepod.git
   cd privatepod
   ```

2. Build and start the Docker container:
   ```
   docker-compose up -d
   ```

3. Access the web interface at http://localhost:3000

## Usage

### Web Interface

The web interface provides three main sections:

1. **Episodes** - View and manage your podcast episodes
2. **Upload New Episode** - Upload new MP3 files with title and description
3. **Podcast Settings** - Configure your podcast details (title, author, description, etc.)

### Adding Episodes

1. Click on the "Upload New Episode" tab
2. Fill in the episode title and description
3. Select an MP3 file to upload
4. Click "Upload Episode"

### Podcast Feed

Your podcast feed is available at:
```
http://localhost:3000/feed.xml
```

You can add this URL to podcast players like Apple Podcasts, Spotify, Pocket Casts, etc.

## Accessing from Other Devices

If you want to access your podcast from other devices on your network, you'll need to use your computer's IP address instead of localhost. For example:

```
http://192.168.1.100:3000/feed.xml
```

Replace `192.168.1.100` with your computer's actual IP address.

## Customization

### Changing the Port

If you want to use a different port, edit the `docker-compose.yml` file and change both occurrences of `3000` to your desired port.

### Persistent Storage

The application uses Docker volumes to persist data:

- `./uploads`: Stores all uploaded MP3 files
- `./config`: Stores podcast configuration

## Troubleshooting

### Cannot Upload Files

Make sure the `uploads` directory has the correct permissions:

```
chmod -R 777 uploads
```

### RSS Feed Not Updating

If your podcast player is not showing updated episodes, try refreshing the feed in your podcast player or clearing its cache.

## API Reference

PrivatePod provides a programmatic API for adding episodes from external automation (CI/CD, scripts, cron jobs). A full machine-readable spec is available in [`openapi.yaml`](openapi.yaml).

### Authentication

The programmatic endpoint requires an API key. Set it via environment variable:

```bash
export PRIVATEPOD_API_KEY=your-secret-key-here
```

Or in `docker-compose.yml`:
```yaml
environment:
  - PRIVATEPOD_API_KEY=your-secret-key-here
```

Pass the key in the `X-API-Key` header on every request to `/api/v1/*`.

### POST /api/v1/episodes

Upload an episode programmatically. Accepts multipart form data.

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio` | file | Yes | MP3 file (max 500MB) |
| `image` | file | No | Cover art, JPEG or PNG (max 5MB) |
| `title` | string | No | Episode title (auto-generated from filename if omitted) |
| `description` | string | No | Episode description |
| `pubDate` | string | No | Publication date (ISO 8601, defaults to now) |

**Examples:**

Upload with auto-generated title:
```bash
curl -X POST http://localhost:3000/api/v1/episodes \
  -H "X-API-Key: your-secret-key" \
  -F "audio=@/path/to/episode.mp3"
```

Upload with metadata and cover art:
```bash
curl -X POST http://localhost:3000/api/v1/episodes \
  -H "X-API-Key: your-secret-key" \
  -F "audio=@/path/to/episode.mp3" \
  -F "image=@/path/to/cover.jpg" \
  -F "title=My Episode Title" \
  -F "description=Episode description here"
```

**Error Responses:**
| Status | Meaning |
|--------|---------|
| 400 | No audio file provided |
| 401 | Missing `X-API-Key` header |
| 403 | Invalid API key |
| 503 | `PRIVATEPOD_API_KEY` environment variable not set |

### Other Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/episodes` | List all episodes |
| DELETE | `/api/episodes/:id` | Delete an episode |
| GET | `/api/settings` | Get podcast settings |
| PUT | `/api/settings` | Update podcast settings (JSON body) |
| GET | `/feed.xml` | RSS podcast feed |

## License

ISC
