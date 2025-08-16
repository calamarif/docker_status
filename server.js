const express = require('express');
const Docker = require('dockerode');
const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const cors = require('cors');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data storage
const DATA_DIR = '/app/data';
const CONFIG_FILE = '/app/config/services.json';
const STATUS_FILE = path.join(DATA_DIR, 'status.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Ensure directories exist
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync('/app/config');

// Default service configuration
const defaultServices = {
  "services": [
    {
      "name": "n8n",
      "url": "https://n8n.examplename.net",
      "container": "n8n",
      "description": "Workflow Automation"
    },
    {
      "name": "Planka",
      "url": "https://planka.examplename.net",
      "container": "planka",
      "description": "Project Management"
    },
    {
      "name": "Ghostfolio",
      "url": "https://ghostfolio.examplename.net",
      "container": "ghostfolio",
      "description": "Portfolio Management"
    }
  ]
};

// Initialize config file if it doesn't exist
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeJsonSync(CONFIG_FILE, defaultServices, { spaces: 2 });
}

// Initialize status files
if (!fs.existsSync(STATUS_FILE)) {
  fs.writeJsonSync(STATUS_FILE, { lastUpdate: new Date().toISOString(), services: [] });
}

if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeJsonSync(HISTORY_FILE, { incidents: [] });
}

// Function to check container status
async function checkContainerStatus(containerName) {
  try {
    const containers = await docker.listContainers({ all: true });
    const container = containers.find(c => 
      c.Names.some(name => name.includes(containerName)) ||
      c.Image.includes(containerName)
    );
    
    if (!container) {
      return { status: 'not_found', uptime: 0 };
    }
    
    const containerInfo = docker.getContainer(container.Id);
    const info = await containerInfo.inspect();
    
    return {
      status: container.State === 'running' ? 'operational' : 'down',
      uptime: container.State === 'running' ? 
        Math.floor((Date.now() - new Date(info.State.StartedAt).getTime()) / 1000) : 0,
      state: container.State,
      created: container.Created
    };
  } catch (error) {
    console.error(`Error checking container ${containerName}:`, error.message);
    return { status: 'error', uptime: 0, error: error.message };
  }
}

// Function to check URL status
async function checkUrlStatus(url) {
  try {
    const https = url.startsWith('https:') ? require('https') : require('http');
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      const req = https.get(url, { timeout: 10000 }, (res) => {
        const responseTime = Date.now() - startTime;
        resolve({
          available: res.statusCode >= 200 && res.statusCode < 400,
          responseTime,
          statusCode: res.statusCode
        });
      });
      
      req.on('error', () => {
        resolve({ available: false, responseTime: 0, error: 'Connection failed' });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ available: false, responseTime: 0, error: 'Timeout' });
      });
    });
  } catch (error) {
    return { available: false, responseTime: 0, error: error.message };
  }
}

// Function to update service status
async function updateServiceStatus() {
  try {
    const config = fs.readJsonSync(CONFIG_FILE);
    const currentStatus = { lastUpdate: new Date().toISOString(), services: [] };
    
    for (const service of config.services) {
      const containerStatus = await checkContainerStatus(service.container);
      const urlStatus = await checkUrlStatus(service.url);
      
      const status = {
        name: service.name,
        description: service.description,
        url: service.url,
        container: service.container,
        status: containerStatus.status === 'operational' && urlStatus.available ? 'operational' : 'down',
        containerStatus: containerStatus,
        urlStatus: urlStatus,
        lastChecked: new Date().toISOString()
      };
      
      currentStatus.services.push(status);
    }
    
    // Save current status
    fs.writeJsonSync(STATUS_FILE, currentStatus);
    
    // Update history for status changes
    updateStatusHistory(currentStatus.services);
    
    console.log('Status updated:', new Date().toLocaleString());
  } catch (error) {
    console.error('Error updating status:', error);
  }
}

// Function to update status history
function updateStatusHistory(services) {
  try {
    const history = fs.readJsonSync(HISTORY_FILE);
    
    services.forEach(service => {
      if (service.status === 'down') {
        // Check if this is a new incident
        const recentIncident = history.incidents.find(incident => 
          incident.service === service.name && 
          !incident.resolved &&
          (Date.now() - new Date(incident.started).getTime()) < 3600000 // Within last hour
        );
        
        if (!recentIncident) {
          history.incidents.push({
            id: Date.now().toString(),
            service: service.name,
            title: `${service.name} Service Disruption`,
            description: 'Service is currently unavailable',
            started: new Date().toISOString(),
            resolved: null,
            impact: 'major'
          });
        }
      } else if (service.status === 'operational') {
        // Resolve any open incidents for this service
        history.incidents.forEach(incident => {
          if (incident.service === service.name && !incident.resolved) {
            incident.resolved = new Date().toISOString();
            incident.description += ' - Service restored';
          }
        });
      }
    });
    
    // Keep only last 100 incidents
    history.incidents = history.incidents.slice(-100);
    
    fs.writeJsonSync(HISTORY_FILE, history);
  } catch (error) {
    console.error('Error updating history:', error);
  }
}

// API Routes
app.get('/api/status', (req, res) => {
  try {
    const status = fs.readJsonSync(STATUS_FILE);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read status' });
  }
});

app.get('/api/history', (req, res) => {
  try {
    const history = fs.readJsonSync(HISTORY_FILE);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read history' });
  }
});

app.get('/api/config', (req, res) => {
  try {
    const config = fs.readJsonSync(CONFIG_FILE);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read config' });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Schedule status checks every 2 minutes
cron.schedule('*/2 * * * *', updateServiceStatus);

// Initial status check
updateServiceStatus();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Status page server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});