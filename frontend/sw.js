/**
 * Service Worker - Distribution Manager PWA
 * Maneja cache y funcionalidad offline
 */

const CACHE_NAME = 'distribution-manager-v3';
const API_CACHE_NAME = 'dm-api-cache-v3';

// Archivos locales a cachear (sin CDN externos)
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/diagnostics.html',
    '/css/main.css',
    '/css/components.css',
    '/js/app.js',
    '/js/api.js',
    '/js/auth.js',
    '/js/ui.js',
    '/manifest.json'
];

// URLs externas que deben manejarse con network-first
const EXTERNAL_URLS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdn.jsdelivr.net'
];

// Instalar Service Worker y cachear assets locales
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                // Solo cachear assets locales
                return Promise.all(
                    STATIC_ASSETS.map(url => 
                        cache.add(url).catch(e => console.warn(`[SW] Failed to cache: ${url}`, e))
                    )
                );
            })
            .then(() => self.skipWaiting())
            .catch(err => {
                console.warn('[SW] Install failed:', err);
            })
    );
});

// Activar y limpiar caches antiguos
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Estrategia de Fetch
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Ignorar requests de extensiones del navegador
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
        return;
    }
    
    // Ignorar requests que no son GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Para requests externos (CDN, fonts), usar network-only
    if (EXTERNAL_URLS.some(ext => url.hostname.includes(ext))) {
        event.respondWith(
            fetch(event.request).catch(() => {
                console.log('[SW] External resource failed, continuing without cache');
                return new Response('', { status: 200 });
            })
        );
        return;
    }
    
    // Para requests de API: Network First con fallback a cache
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstStrategy(event.request));
        return;
    }

    // Para assets estáticos locales: Cache First con fallback a network
    event.respondWith(cacheFirstStrategy(event.request));
});

// Estrategia Cache First (para assets estáticos)
async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        // Actualizar cache en background
        fetchAndCache(request);
        return cachedResponse;
    }

    return fetchAndCache(request);
}

// Estrategia Network First (para API)
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Cachear respuestas GET exitosas
        if (request.method === 'GET' && networkResponse.ok) {
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache for:', request.url);
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }

        // Si es una solicitud de datos, devolver respuesta offline
        if (request.url.includes('/api/')) {
            return new Response(
                JSON.stringify({ 
                    error: 'Offline',
                    message: 'Sin conexión al servidor. Los datos mostrados pueden no estar actualizados.',
                    offline: true
                }),
                { 
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }

        throw error;
    }
}

// Helper: Fetch y cachear
async function fetchAndCache(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // No loguear como error, es normal en modo offline
        console.log('[SW] Fetch unavailable for:', request.url);
        
        // Intentar devolver desde cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Para HTML, devolver página offline
        if (request.destination === 'document') {
            const cachedIndex = await caches.match('/index.html');
            if (cachedIndex) return cachedIndex;
        }
        
        throw error;
    }
}

// Manejar mensajes del cliente
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((names) => {
                return Promise.all(names.map(name => caches.delete(name)));
            })
        );
    }
});

// Sincronización en background (cuando hay conexión)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncPendingData());
    }
});

// Sincronizar datos pendientes
async function syncPendingData() {
    try {
        // Obtener operaciones pendientes de IndexedDB
        // (Implementar según necesidades)
        console.log('[SW] Syncing pending data...');
    } catch (error) {
        console.error('[SW] Sync failed:', error);
    }
}

// Notificaciones push (opcional)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body || 'Nueva actualización disponible',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            vibrate: [100, 50, 100],
            data: data
        };

        event.waitUntil(
            self.registration.showNotification(
                data.title || 'Distribution Manager',
                options
            )
        );
    }
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});

console.log('[SW] Service Worker loaded');
