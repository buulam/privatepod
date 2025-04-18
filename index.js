const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const xml = require('xml');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3') {
      cb(null, true);
    } else {
      cb(new Error('Only MP3 files are allowed!'), false);
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

// Add new episode
app.post('/api/episodes', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }
  
  const { title, description, pubDate } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  
  const newEpisode = {
    id: Date.now().toString(),
    title,
    description: description || '',
    pubDate: pubDate || new Date().toISOString(),
    audioUrl: `/uploads/${req.file.filename}`,
    duration: '00:00:00', // In a real app, you'd calculate this from the MP3 file
    fileSize: req.file.size
  };
  
  podcastConfig.episodes.push(newEpisode);
  
  // Save updated config
  fs.writeFileSync('./config/podcast.json', JSON.stringify(podcastConfig, null, 2));
  
  res.status(201).json(newEpisode);
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
    console.error('Error deleting file:', err);
  }
  
  // Remove from episodes array
  podcastConfig.episodes.splice(episodeIndex, 1);
  
  // Save updated config
  fs.writeFileSync('./config/podcast.json', JSON.stringify(podcastConfig, null, 2));
  
  res.json({ success: true });
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
    return {
      item: [
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
      ]
    };
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Podcast feed available at http://localhost:${PORT}/feed.xml`);
});
