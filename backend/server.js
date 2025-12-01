/**
 * Distribution Manager PWA - Backend Server
 * Developer: JC Analytics
 * 
 * Servidor Express con autenticación JWT para gestionar
 * archivos Excel de distribución de leads.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Rutas
const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files');
const syncRoutes = require('./routes/sync');

const app = express();

// ============================================================
// CONFIGURACIÓN DE SEGURIDAD
// ============================================================

// Helmet para headers de seguridad (modificado para PWA)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: [
                "'self'", 
                "https://fonts.googleapis.com",
                "https://fonts.gstatic.com",
                "https://cdn.jsdelivr.net",
                process.env.LAN_IP ? `http://${process.env.LAN_IP}:${process.env.PORT || 3000}` : "http://localhost:3000"
            ],
            workerSrc: ["'self'", "blob:"],
            manifestSrc: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuración
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:3000'];

app.use(cors({
    origin: function(origin, callback) {
        // Permitir requests sin origin (mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(null, true); // En desarrollo permitir todos
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde' }
});
app.use('/api/', limiter);

// Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ============================================================
// SERVIR ARCHIVOS ESTÁTICOS (Frontend PWA)
// ============================================================
app.use(express.static(path.join(__dirname, '../frontend')));

// Service Worker debe servirse desde la raíz
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(__dirname, '../frontend/sw.js'));
});

// Manifest PWA
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(path.join(__dirname, '../frontend/manifest.json'));
});

// ============================================================
// RUTAS API
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/sync', syncRoutes);

// Endpoint de salud para verificar conexión
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        server: process.env.LAN_IP || 'localhost'
    });
});

// ============================================================
// MANEJO DE RUTAS SPA (Single Page Application)
// ============================================================
app.get('*', (req, res) => {
    // Si es una ruta de API que no existe, devolver 404
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint no encontrado' });
    }
    // Para cualquier otra ruta, servir el index.html (SPA)
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ============================================================
// MANEJO DE ERRORES
// ============================================================
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({ 
        error: 'Error interno del servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     DISTRIBUTION MANAGER PWA - Backend Server              ║');
    console.log('║     Developed by JC Analytics                              ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🌐 Servidor corriendo en: http://${HOST}:${PORT}`);
    console.log(`║  📱 Acceso LAN/VPN: http://${process.env.LAN_IP || 'TU_IP_LAN'}:${PORT}`);
    console.log(`║  📂 Directorio de datos: ${process.env.DATA_PATH || './data'}`);
    console.log('╚════════════════════════════════════════════════════════════╝');
});

module.exports = app;
