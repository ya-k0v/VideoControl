import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VideoControl API',
      version: '2.5.0',
      description: 'Professional system for centralized media content management for multiple devices in real-time',
      contact: {
        name: 'VideoControl Team',
        url: 'https://github.com/ya-k0v/VideoControl'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.videocontrol.example.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authorization header using the Bearer scheme'
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for external integrations'
        }
      },
      schemas: {
        Device: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique device identifier'
            },
            name: {
              type: 'string',
              description: 'Device display name'
            },
            type: {
              type: 'string',
              enum: ['DISPLAY', 'ANDROID_TV', 'VLC_PLAYER'],
              description: 'Device type'
            },
            status: {
              type: 'string',
              enum: ['ONLINE', 'OFFLINE', 'ERROR'],
              description: 'Current device status'
            },
            placeholder: {
              type: 'string',
              nullable: true,
              description: 'Default placeholder file'
            },
            lastSeen: {
              type: 'string',
              format: 'date-time',
              description: 'Last connection timestamp'
            },
            metadata: {
              type: 'object',
              description: 'Additional device metadata'
            }
          }
        },
        File: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            deviceId: {
              type: 'string'
            },
            fileName: {
              type: 'string'
            },
            displayName: {
              type: 'string'
            },
            fileType: {
              type: 'string',
              enum: ['video', 'image', 'pdf', 'pptx']
            },
            fileSize: {
              type: 'integer',
              description: 'File size in bytes'
            },
            duration: {
              type: 'integer',
              nullable: true,
              description: 'Duration in seconds (for videos)'
            },
            resolution: {
              type: 'string',
              nullable: true,
              description: 'Video resolution (e.g., 1920x1080)'
            },
            optimized: {
              type: 'boolean',
              description: 'Whether video has been optimized'
            }
          }
        },
        Playlist: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            name: {
              type: 'string'
            },
            description: {
              type: 'string',
              nullable: true
            },
            loop: {
              type: 'boolean',
              description: 'Whether to loop the playlist'
            },
            shuffle: {
              type: 'boolean',
              description: 'Whether to shuffle playback'
            },
            schedule: {
              type: 'object',
              nullable: true,
              description: 'Cron-like schedule or time ranges'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            username: {
              type: 'string'
            },
            role: {
              type: 'string',
              enum: ['ADMIN', 'OPERATOR', 'VIEWER']
            },
            isActive: {
              type: 'boolean'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            details: {
              type: 'object',
              description: 'Additional error details'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              }
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and session management'
      },
      {
        name: 'Devices',
        description: 'Device management operations'
      },
      {
        name: 'Files',
        description: 'File upload and management'
      },
      {
        name: 'Playlists',
        description: 'Playlist creation and scheduling'
      },
      {
        name: 'Video Optimization',
        description: 'Video optimization and conversion'
      },
      {
        name: 'Player Control',
        description: 'Real-time player control via Socket.IO'
      }
    ]
  },
  apis: [
    './src/routes/*.js',
    './src/socket/*.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;

