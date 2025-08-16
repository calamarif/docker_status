# Docker Status Page

A beautiful, responsive status page for monitoring your Docker services, similar to enterprise status pages like Prophecy.io.

## Features

- **Real-time monitoring** of Docker containers and service URLs
- **Historical incident tracking** with automatic detection
- **Professional design** similar to enterprise status pages
- **Responsive layout** that works on all devices
- **Automatic status checks** every 2 minutes
- **Uptime statistics** and service health metrics
- **Docker socket integration** for container status
- **Configurable services** via JSON configuration

## Quick Setup

1. **Clone or create the project structure:**
   ```bash
   mkdir docker-status-page
   cd docker-status-page
   ```

2. **Create all the files** from the artifacts above in your project directory:
   ```
   docker-status-page/
   ├── docker-compose.yml
   ├── Dockerfile
   ├── package.json
   ├── server.js
   ├── public/
   │   └── index.html
   └── config/
       └── services.json
   ```

3. **Customize your services** in `config/services.json`:
   - Update the service names, URLs, and container names
   - Add or remove services as needed
   - Change the domain from `examplename.net` to your actual domain

4. **Update docker-compose.yml:**
   - Change `status.examplename.net` to your desired subdomain
   - Modify Traefik labels if you're using a different reverse proxy
   - Adjust the timezone if not in Melbourne

5. **Build and run:**
   ```bash
   docker-compose up -d --build
   ```

## Configuration

### Adding New Services

Edit `config/services.json` to add new services:

```json
{
  "services": [
    {
      "name": "Your Service Name",
      "url": "https://yourservice.yourdomain.net",
      "container": "your-container-name",
      "description": "Service description"
    }
  ]
}
```

### Container Name Matching

The system will try to find containers by:
1. Exact container name match
2. Container names containing the specified string
3. Image names containing the specified string

### Reverse Proxy Integration

If you're using Traefik (as shown in the docker-compose.yml), the status page will automatically get SSL certificates and be accessible at `status.examplename.