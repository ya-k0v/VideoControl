import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../config/swagger.js';
import YAML from 'yamljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createSwaggerRouter() {
  const router = express.Router();

  // Swagger UI options
  const swaggerOptions = {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'VideoControl API Documentation',
    customfavIcon: '/favicon.ico'
  };

  // Serve Swagger UI
  router.use('/ui', swaggerUi.serve);
  router.get('/ui', swaggerUi.setup(swaggerSpec, swaggerOptions));

  // Serve OpenAPI spec as JSON
  router.get('/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Serve OpenAPI spec as YAML
  router.get('/openapi.yaml', (req, res) => {
    try {
      const yamlPath = path.join(__dirname, '../../docs/api/openapi.yaml');
      const yamlDoc = YAML.load(yamlPath);
      res.setHeader('Content-Type', 'text/yaml');
      res.send(YAML.stringify(yamlDoc, 8));
    } catch (error) {
      res.setHeader('Content-Type', 'text/yaml');
      res.send(YAML.stringify(swaggerSpec, 8));
    }
  });

  // API Documentation landing page
  router.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>VideoControl API Documentation</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            line-height: 1.6;
          }
          h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
          }
          .links {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 30px 0;
          }
          .link-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            text-decoration: none;
            color: #2c3e50;
            transition: all 0.3s;
          }
          .link-card:hover {
            border-color: #3498db;
            box-shadow: 0 4px 8px rgba(52, 152, 219, 0.2);
            transform: translateY(-2px);
          }
          .link-card h3 {
            margin: 0 0 10px 0;
            color: #3498db;
          }
          .link-card p {
            margin: 0;
            font-size: 0.9em;
            color: #666;
          }
          .features {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 30px 0;
          }
          .features ul {
            list-style: none;
            padding: 0;
          }
          .features li:before {
            content: "✓ ";
            color: #27ae60;
            font-weight: bold;
            margin-right: 8px;
          }
        </style>
      </head>
      <body>
        <h1>🎬 VideoControl API Documentation</h1>
        
        <p>
          Welcome to the VideoControl API documentation. This API provides comprehensive
          control over media content management for multiple devices in real-time.
        </p>

        <div class="links">
          <a href="/api/docs/ui" class="link-card">
            <h3>📖 Interactive API Docs</h3>
            <p>Swagger UI with live testing</p>
          </a>
          
          <a href="/api/docs/openapi.json" class="link-card">
            <h3>📄 OpenAPI JSON</h3>
            <p>Download OpenAPI specification</p>
          </a>
          
          <a href="/api/docs/openapi.yaml" class="link-card">
            <h3>📝 OpenAPI YAML</h3>
            <p>YAML format specification</p>
          </a>
          
          <a href="https://github.com/ya-k0v/VideoControl" class="link-card">
            <h3>💻 GitHub Repository</h3>
            <p>Source code and examples</p>
          </a>
        </div>

        <div class="features">
          <h2>Key Features</h2>
          <ul>
            <li>JWT-based authentication with role-based access control</li>
            <li>Real-time device communication via Socket.IO</li>
            <li>Automatic video optimization for Android TV</li>
            <li>PDF/PPTX presentation support</li>
            <li>Playlist management and scheduling</li>
            <li>Multi-device content synchronization</li>
            <li>RESTful API with comprehensive documentation</li>
          </ul>
        </div>

        <h2>Quick Start</h2>
        <pre style="background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 5px; overflow-x: auto;">
# 1. Login to get access token
POST /auth/login
{
  "email": "admin@example.com",
  "password": "yourpassword"
}

# 2. Use token in subsequent requests
GET /api/devices
Authorization: Bearer YOUR_ACCESS_TOKEN

# 3. Upload content to device
POST /api/devices/{device_id}/files
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: multipart/form-data
        </pre>

        <p style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; text-align: center;">
          <strong>VideoControl v2.5</strong> | MIT License | 
          <a href="https://github.com/ya-k0v" style="color: #3498db;">@ya-k0v</a>
        </p>
      </body>
      </html>
    `);
  });

  return router;
}

export default createSwaggerRouter;

