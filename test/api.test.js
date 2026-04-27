const request = require('supertest');
const fs = require('fs');
const path = require('path');

const TEST_API_KEY = 'test-secret-key-123';
const fixturesDir = path.join(__dirname, 'fixtures');
const mp3Fixture = path.join(fixturesDir, 'test.mp3');
const jpgFixture = path.join(fixturesDir, 'test.jpg');

// Temp directories for test isolation
const tmpUploads = path.join(__dirname, '..', 'uploads');
const tmpConfig = path.join(__dirname, '..', 'config');

let app;

function loadApp() {
  jest.resetModules();
  return require('../index');
}

beforeEach(() => {
  // Ensure directories exist and clean config so app starts fresh
  fs.mkdirSync(tmpUploads, { recursive: true });
  fs.mkdirSync(tmpConfig, { recursive: true });
  // Remove any existing config so the app creates a fresh default
  const configPath = path.join(tmpConfig, 'podcast.json');
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);

  // Set API key env var before loading the app
  process.env.PRIVATEPOD_API_KEY = TEST_API_KEY;
  app = loadApp();
});

afterEach(() => {
  // Clean up uploaded files (but keep directories and .gitkeep)
  const cleanDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir)) {
      if (file === '.gitkeep') continue;
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    }
  };
  cleanDir(tmpUploads);
  cleanDir(tmpConfig);
});

describe('API Key Authentication', () => {
  test('returns 503 when PRIVATEPOD_API_KEY is not set', async () => {
    delete process.env.PRIVATEPOD_API_KEY;
    const noKeyApp = loadApp();

    const res = await request(noKeyApp)
      .post('/api/v1/episodes')
      .attach('audio', mp3Fixture);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });

  test('returns 401 when X-API-Key header is missing', async () => {
    const res = await request(app)
      .post('/api/v1/episodes')
      .attach('audio', mp3Fixture);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing/i);
  });

  test('returns 403 when X-API-Key is wrong', async () => {
    const res = await request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', 'wrong-key')
      .attach('audio', mp3Fixture);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/invalid/i);
  });
});

describe('POST /api/v1/episodes (programmatic)', () => {
  test('creates episode with auto-generated title from filename', async () => {
    const res = await request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', TEST_API_KEY)
      .attach('audio', mp3Fixture, 'my_great_episode-01.mp3');

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('my great episode 01');
    expect(res.body.audioUrl).toMatch(/^\/uploads\/.+\.mp3$/);
    expect(res.body.id).toBeDefined();
    expect(res.body.fileSize).toBeGreaterThan(0);
  });

  test('uses provided title and description when given', async () => {
    const res = await request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', TEST_API_KEY)
      .field('title', 'Custom Title')
      .field('description', 'A great episode')
      .attach('audio', mp3Fixture);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Custom Title');
    expect(res.body.description).toBe('A great episode');
  });

  test('accepts optional cover image', async () => {
    const res = await request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', TEST_API_KEY)
      .field('title', 'Episode with Art')
      .attach('audio', mp3Fixture)
      .attach('image', jpgFixture);

    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toMatch(/^\/uploads\/.+\.(jpg|jpeg)$/);
  });

  test('accepts MP3 by file extension even with non-standard MIME type', async () => {
    const res = await request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', TEST_API_KEY)
      .field('title', 'Mime Fallback')
      .attach('audio', mp3Fixture, { filename: 'test.mp3', contentType: 'application/octet-stream' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Mime Fallback');
  });

  test('returns 400 when no audio file is provided', async () => {
    const res = await request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', TEST_API_KEY)
      .field('title', 'No Audio');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no audio/i);
  });

  test('returns JSON error for invalid file type', async () => {
    const res = await request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', TEST_API_KEY)
      .attach('audio', jpgFixture, { filename: 'notaudio.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

describe('POST /api/episodes (web UI)', () => {
  test('requires title', async () => {
    const res = await request(app)
      .post('/api/episodes')
      .attach('audio', mp3Fixture);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  test('creates episode with title', async () => {
    const res = await request(app)
      .post('/api/episodes')
      .field('title', 'UI Episode')
      .attach('audio', mp3Fixture);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('UI Episode');
  });

  test('accepts optional cover image', async () => {
    const res = await request(app)
      .post('/api/episodes')
      .field('title', 'UI Episode with Art')
      .attach('audio', mp3Fixture)
      .attach('image', jpgFixture);

    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toMatch(/^\/uploads\/.+\.(jpg|jpeg)$/);
  });
});

describe('POST /api/settings/image', () => {
  test('uploads a cover image and updates settings.imageUrl', async () => {
    const res = await request(app)
      .post('/api/settings/image')
      .attach('image', jpgFixture);

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/^\/uploads\/.+\.(jpg|jpeg)$/);
    expect(res.body.episodes).toBeUndefined();

    const file = path.join(__dirname, '..', res.body.imageUrl);
    expect(fs.existsSync(file)).toBe(true);

    const settings = await request(app).get('/api/settings');
    expect(settings.body.imageUrl).toBe(res.body.imageUrl);
  });

  test('returns 400 when no image is provided', async () => {
    const res = await request(app).post('/api/settings/image');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no image/i);
  });

  test('rejects non-image file types', async () => {
    const res = await request(app)
      .post('/api/settings/image')
      .attach('image', mp3Fixture);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/episodes', () => {
  test('returns empty array initially', async () => {
    const res = await request(app).get('/api/episodes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns episodes after creation', async () => {
    await request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', TEST_API_KEY)
      .field('title', 'Test Ep')
      .attach('audio', mp3Fixture);

    const res = await request(app).get('/api/episodes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Test Ep');
  });
});

describe('PATCH /api/episodes/:id', () => {
  async function createEpisode(overrides = {}) {
    const req = request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', TEST_API_KEY)
      .field('title', overrides.title || 'Original')
      .field('description', overrides.description || 'Original desc')
      .attach('audio', mp3Fixture);
    if (overrides.image) req.attach('image', jpgFixture);
    const res = await req;
    return res.body;
  }

  test('updates title and description', async () => {
    const ep = await createEpisode();
    const res = await request(app)
      .patch(`/api/episodes/${ep.id}`)
      .field('title', 'New Title')
      .field('description', 'New desc');

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Title');
    expect(res.body.description).toBe('New desc');
  });

  test('rejects empty title', async () => {
    const ep = await createEpisode();
    const res = await request(app)
      .patch(`/api/episodes/${ep.id}`)
      .field('title', '   ');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  test('replaces image and deletes old file', async () => {
    const ep = await createEpisode({ image: true });
    const oldPath = path.join(__dirname, '..', ep.imageUrl);
    expect(fs.existsSync(oldPath)).toBe(true);

    // Ensure the new upload gets a different filename (Date.now()-based)
    await new Promise(r => setTimeout(r, 5));

    const res = await request(app)
      .patch(`/api/episodes/${ep.id}`)
      .attach('image', jpgFixture);

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/^\/uploads\/.+\.(jpg|jpeg)$/);
    expect(res.body.imageUrl).not.toBe(ep.imageUrl);
    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '..', res.body.imageUrl))).toBe(true);
  });

  test('removes image when removeImage=true', async () => {
    const ep = await createEpisode({ image: true });
    const oldPath = path.join(__dirname, '..', ep.imageUrl);

    const res = await request(app)
      .patch(`/api/episodes/${ep.id}`)
      .field('removeImage', 'true');

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBeUndefined();
    expect(fs.existsSync(oldPath)).toBe(false);
  });

  test('returns 404 for unknown episode', async () => {
    const res = await request(app)
      .patch('/api/episodes/nonexistent')
      .field('title', 'x');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/episodes/:id', () => {
  test('deletes episode and its files', async () => {
    const createRes = await request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', TEST_API_KEY)
      .field('title', 'To Delete')
      .attach('audio', mp3Fixture)
      .attach('image', jpgFixture);

    const episodeId = createRes.body.id;
    const audioPath = path.join(__dirname, '..', createRes.body.audioUrl);
    const imagePath = path.join(__dirname, '..', createRes.body.imageUrl);

    expect(fs.existsSync(audioPath)).toBe(true);
    expect(fs.existsSync(imagePath)).toBe(true);

    const delRes = await request(app).delete(`/api/episodes/${episodeId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Files should be removed
    expect(fs.existsSync(audioPath)).toBe(false);
    expect(fs.existsSync(imagePath)).toBe(false);

    // Episode should be gone from list
    const listRes = await request(app).get('/api/episodes');
    expect(listRes.body).toHaveLength(0);
  });

  test('returns 404 for unknown episode', async () => {
    const res = await request(app).delete('/api/episodes/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/settings', () => {
  test('returns settings without episodes array', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.title).toBeDefined();
    expect(res.body.author).toBeDefined();
    expect(res.body.episodes).toBeUndefined();
  });
});

describe('PUT /api/settings', () => {
  test('updates podcast settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ title: 'Updated Pod', author: 'New Author' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Pod');
    expect(res.body.author).toBe('New Author');
  });
});

describe('GET /feed.xml', () => {
  test('returns valid RSS XML', async () => {
    const res = await request(app).get('/feed.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/rss\+xml/);
    expect(res.text).toContain('<?xml');
    expect(res.text).toContain('<rss');
  });

  test('includes episode with image in feed', async () => {
    await request(app)
      .post('/api/v1/episodes')
      .set('X-API-Key', TEST_API_KEY)
      .field('title', 'Feed Episode')
      .attach('audio', mp3Fixture)
      .attach('image', jpgFixture);

    const res = await request(app).get('/feed.xml');
    expect(res.text).toContain('Feed Episode');
    expect(res.text).toContain('itunes:image');
  });
});
