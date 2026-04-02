const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const xml = require('xml');
const cors = require('cors');
const crypto = require('crypto');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();
const PORT = process.env.PORT || 3000;
const PRIVATEPOD_API_KEY = process.env.PRIVATEPOD_API_KEY;

// API key authentication middleware
function requireApiKey(req, res, next) {
  if (!PRIVATEPOD_API_KEY) {
    return res.status(503).json({ error: 'API key not configured' });
  }
  const provided = req.headers['x-api-key'];
  if (!provided) {
    return res.status(401).json({ error: 'Missing X-API-Key header' });
  }
  const expected = Buffer.from(PRIVATEPOD_API_KEY);
  const actual = Buffer.from(String(provided));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  next();
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Swagger API docs
const swaggerDocument = YAML.load(path.join(__dirname, 'openapi.yaml'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

function isMp3(file) {
  const validMimes = ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg', 'audio/x-mp3'];
  const ext = path.extname(file.originalname).toLowerCase();
  return validMimes.includes(file.mimetype) || ext === '.mp3';
}

function isImage(file) {
  return file.mimetype === 'image/jpeg' || file.mimetype === 'image/png';
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    if (isMp3(file)) {
      cb(null, true);
    } else {
      cb(new Error('Only MP3 files are allowed!'), false);
    }
  }
});

// Multer for programmatic endpoint (audio + optional image)
const programmaticUpload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audio') {
      if (isMp3(file)) {
        cb(null, true);
      } else {
        cb(new Error('Only MP3 files are allowed for audio!'), false);
      }
    } else if (file.fieldname === 'image') {
      if (isImage(file)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG and PNG files are allowed for images!'), false);
      }
    } else {
      cb(new Error('Unexpected field'), false);
    }
  }
});

// Load podcast configuration
let podcastConfig = {};
try {
  podcastConfig = require('./config/podcast.json');
} catch (err) {
  // Create default config if it doesn't exist
  podcastConfig = {
    title: 'My Private Podcast',
    description: 'A private podcast hosted with PrivatePod',
    author: 'Podcast Author',
    email: 'author@example.com',
    language: 'en-us',
    copyright: `Copyright ${new Date().getFullYear()}`,
    link: `http://localhost:${PORT}`,
    imageUrl: 'http://localhost:3000/podcast-cover.jpg',
    category: 'Technology',
    episodes: []
  };
  
  // Save default config
  if (!fs.existsSync('./config')) {
    fs.mkdirSync('./config');
  }
  fs.writeFileSync('./config/podcast.json', JSON.stringify(podcastConfig, null, 2));
}

// Helper: create an episode and persist config
function createEpisode(file, { title, description, pubDate, imageUrl }) {
  const newEpisode = {
    id: Date.now().toString(),
    title,
    description: description || '',
    pubDate: pubDate || new Date().toISOString(),
    audioUrl: `/uploads/${file.filename}`,
    duration: '00:00:00',
    fileSize: file.size
  };
  if (imageUrl) {
    newEpisode.imageUrl = imageUrl;
  }
  podcastConfig.episodes.push(newEpisode);
  fs.writeFileSync('./config/podcast.json', JSON.stringify(podcastConfig, null, 2));
  return newEpisode;
}

// Routes

// Get podcast feed
app.get('/feed.xml', (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol;
  const baseUrl = `${protocol}://${host}`;
  
  // Generate RSS feed
  const rssFeed = generateRssFeed(podcastConfig, baseUrl);
  
  res.set('Content-Type', 'application/rss+xml');
  res.send(rssFeed);
});

// Get all episodes
app.get('/api/episodes', (req, res) => {
  res.json(podcastConfig.episodes);
});

// Add new episode (web UI)
app.post('/api/episodes', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }
  if (!req.body.title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const episode = createEpisode(req.file, req.body);
  res.status(201).json(episode);
});

// Add new episode (programmatic API with auth)
app.post('/api/v1/episodes', requireApiKey, programmaticUpload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), (req, res) => {
  const audioFile = req.files && req.files.audio && req.files.audio[0];
  if (!audioFile) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  const title = req.body.title || path.parse(audioFile.originalname).name
    .replace(/[_-]/g, ' ')
    .trim();

  const imageFile = req.files.image && req.files.image[0];
  const imageUrl = imageFile ? `/uploads/${imageFile.filename}` : undefined;

  const episode = createEpisode(audioFile, {
    title,
    description: req.body.description,
    pubDate: req.body.pubDate,
    imageUrl
  });
  res.status(201).json(episode);
});

// Delete episode
app.delete('/api/episodes/:id', (req, res) => {
  const episodeId = req.params.id;
  const episodeIndex = podcastConfig.episodes.findIndex(ep => ep.id === episodeId);
  
  if (episodeIndex === -1) {
    return res.status(404).json({ error: 'Episode not found' });
  }
  
  const episode = podcastConfig.episodes[episodeIndex];
  
  // Delete the audio file
  try {
    const filePath = path.join(__dirname, episode.audioUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Error deleting audio file:', err);
  }

  // Delete the image file if present
  if (episode.imageUrl) {
    try {
      const imgPath = path.join(__dirname, episode.imageUrl);
      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }
    } catch (err) {
      console.error('Error deleting image file:', err);
    }
  }
  
  // Remove from episodes array
  podcastConfig.episodes.splice(episodeIndex, 1);
  
  // Save updated config
  fs.writeFileSync('./config/podcast.json', JSON.stringify(podcastConfig, null, 2));
  
  res.json({ success: true });
});

// Get podcast settings
app.get('/api/settings', (req, res) => {
  const { episodes, ...settings } = podcastConfig;
  res.json(settings);
});

// Update podcast settings
app.put('/api/settings', (req, res) => {
  const { title, description, author, email, language, copyright, link, imageUrl, category } = req.body;
  
  // Update config with new values, keeping existing ones if not provided
  podcastConfig = {
    ...podcastConfig,
    title: title || podcastConfig.title,
    description: description || podcastConfig.description,
    author: author || podcastConfig.author,
    email: email || podcastConfig.email,
    language: language || podcastConfig.language,
    copyright: copyright || podcastConfig.copyright,
    link: link || podcastConfig.link,
    imageUrl: imageUrl || podcastConfig.imageUrl,
    category: category || podcastConfig.category
  };
  
  // Save updated config
  fs.writeFileSync('./config/podcast.json', JSON.stringify(podcastConfig, null, 2));
  
  res.json(podcastConfig);
});

// Function to generate RSS feed
function generateRssFeed(config, baseUrl) {
  const { title, description, author, email, language, copyright, link, imageUrl, category, episodes } = config;
  
  // Format episodes for XML
  const items = episodes.map(episode => {
    const itemFields = [
      { title: episode.title },
      { description: { _cdata: episode.description } },
      { pubDate: new Date(episode.pubDate).toUTCString() },
      { 'itunes:author': author },
      { 'itunes:subtitle': { _cdata: episode.title } },
      { 'itunes:summary': { _cdata: episode.description } },
      { 'itunes:duration': episode.duration },
      { guid: { _attr: { isPermaLink: 'false' }, _content: episode.id } },
      { enclosure: { _attr: {
        url: `${baseUrl}${episode.audioUrl}`,
        length: episode.fileSize,
        type: 'audio/mpeg'
      }}}
    ];
    if (episode.imageUrl) {
      itemFields.push({ 'itunes:image': { _attr: { href: `${baseUrl}${episode.imageUrl}` } } });
    }
    return { item: itemFields };
  });
  
  // Build the RSS feed
  const feed = [
    { _attr: {
      'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
      'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
      version: '2.0'
    }},
    { channel: [
      { title },
      { description },
      { link },
      { language },
      { copyright },
      { lastBuildDate: new Date().toUTCString() },
      { 'itunes:author': author },
      { 'itunes:summary': description },
      { 'itunes:owner': [
        { 'itunes:name': author },
        { 'itunes:email': email }
      ]},
      { 'itunes:image': { _attr: { href: imageUrl } } },
      { 'itunes:category': { _attr: { text: category } } },
      ...items
    ]}
  ];
  
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml({ rss: feed }, { declaration: false });
}

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling for multer and other errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// Start the server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Podcast feed available at http://localhost:${PORT}/feed.xml`);
    if (!PRIVATEPOD_API_KEY) {
      console.warn('WARNING: PRIVATEPOD_API_KEY not set. Programmatic API (POST /api/v1/episodes) is disabled.');
    } else {
      console.log('Programmatic API enabled at POST /api/v1/episodes');
    }
  });
}

module.exports = app;
