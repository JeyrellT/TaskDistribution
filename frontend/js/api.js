/**
 * API Client - Distribution Manager PWA
 * Maneja todas las llamadas al backend
 */

class ApiClient {
    constructor(baseUrl = '') {
        // Prioridad: parámetro > localStorage > window.location.origin
        this.baseUrl = baseUrl || localStorage.getItem('dm_server_url') || window.location.origin;
        this.token = localStorage.getItem('dm_token');
    }

    // ============================================================
    // CONFIGURACIÓN DE SERVIDOR
    // ============================================================
    
    /**
     * Configura la URL del servidor
     */
    setServerUrl(url) {
        this.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
        localStorage.setItem('dm_server_url', this.baseUrl);
    }

    /**
     * Obtiene la URL del servidor configurada
     */
    getServerUrl() {
        return this.baseUrl;
    }

    /**
     * Prueba la conexión al servidor
     * @returns {Promise<{success: boolean, message: string, data?: object}>}
     */
    async testConnection(serverUrl = null) {
        const url = serverUrl || this.baseUrl;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${url}/api/health`, {
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                return { success: true, message: 'Conexión exitosa', data };
            } else {
                return { 
                    success: false, 
                    message: `Error HTTP ${response.status}: ${response.statusText}` 
                };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, message: 'Timeout - El servidor no respondió en 10 segundos' };
            }
            return { success: false, message: 'No se pudo conectar al servidor' };
        }
    }

    /**
     * Verifica si hay un servidor configurado y conectado
     */
    async isServerConfigured() {
        const savedUrl = localStorage.getItem('dm_server_url');
        if (!savedUrl) return false;
        
        const result = await this.testConnection(savedUrl);
        return result.success;
    }

    // Configurar token
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('dm_token', token);
        } else {
            localStorage.removeItem('dm_token');
        }
    }

    // Headers comunes
    getHeaders(includeJson = true) {
        const headers = {};
        if (includeJson) {
            headers['Content-Type'] = 'application/json';
        }
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    // Método genérico para requests
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(!options.isFormData),
                ...options.headers
            },
            credentials: 'include'
        };

        if (options.isFormData) {
            delete config.headers['Content-Type'];
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                // Si el token expiró, limpiar y redirigir
                if (response.status === 401) {
                    this.setToken(null);
                    window.dispatchEvent(new CustomEvent('auth:logout'));
                }
                throw new ApiError(data.message || data.error, response.status, data);
            }

            return data;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            // Error de red
            throw new ApiError(
                'Sin conexión al servidor. Verifica tu VPN.',
                0,
                { offline: true }
            );
        }
    }

    // ============================================================
    // AUTENTICACIÓN
    // ============================================================
    
    async login(username, password) {
        const data = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        if (data.token) {
            this.setToken(data.token);
        }
        
        return data;
    }

    async logout() {
        try {
            await this.request('/api/auth/logout', { method: 'POST' });
        } finally {
            this.setToken(null);
        }
    }

    async getCurrentUser() {
        return this.request('/api/auth/me');
    }

    async verifyToken() {
        return this.request('/api/auth/verify');
    }

    async getUsers() {
        return this.request('/api/auth/users');
    }

    // ============================================================
    // ESTRUCTURA DE ARCHIVOS
    // ============================================================
    
    async getFileStructure() {
        return this.request('/api/files/structure');
    }

    // ============================================================
    // ARCHIVO PRINCIPAL (MAIN)
    // ============================================================
    
    async getMainData() {
        return this.request('/api/files/main');
    }

    async saveMainData(headers, data, fileName = 'Datos.xlsx') {
        return this.request('/api/files/main', {
            method: 'POST',
            body: JSON.stringify({ headers, data, fileName })
        });
    }

    // ============================================================
    // ARCHIVOS DE TRACKING
    // ============================================================
    
    async getTrackingData(personName) {
        return this.request(`/api/files/tracking/${encodeURIComponent(personName)}`);
    }

    async saveTrackingData(personName, headers, data, fileName) {
        return this.request(`/api/files/tracking/${encodeURIComponent(personName)}`, {
            method: 'POST',
            body: JSON.stringify({ headers, data, fileName })
        });
    }

    async getAllTrackingData() {
        return this.request('/api/files/tracking-all');
    }

    // ============================================================
    // RAWDATA
    // ============================================================
    
    async getRawDataFiles() {
        return this.request('/api/files/rawdata');
    }

    async getRawDataContent(fileName) {
        return this.request(`/api/files/rawdata/${encodeURIComponent(fileName)}`);
    }

    async uploadRawData(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        return this.request('/api/files/upload/rawdata', {
            method: 'POST',
            body: formData,
            isFormData: true
        });
    }

    async deleteRawData(fileName) {
        return this.request(`/api/files/rawdata/${encodeURIComponent(fileName)}`, {
            method: 'DELETE'
        });
    }

    // ============================================================
    // HISTORICAL
    // ============================================================
    
    async saveToHistorical(headers, data, fileName) {
        return this.request('/api/files/historical', {
            method: 'POST',
            body: JSON.stringify({ headers, data, fileName })
        });
    }

    async getHistoricalFiles() {
        return this.request('/api/files/historical');
    }

    // ============================================================
    // SINCRONIZACIÓN
    // ============================================================
    
    async distributeLeads(assignments, level = 1) {
        return this.request('/api/sync/distribute', {
            method: 'POST',
            body: JSON.stringify({ assignments, level })
        });
    }

    async syncUpdates(mode = 'update') {
        return this.request('/api/sync/update', {
            method: 'POST',
            body: JSON.stringify({ mode })
        });
    }

    async promoteLeads(leadIds, coordinatorName) {
        return this.request('/api/sync/promote', {
            method: 'POST',
            body: JSON.stringify({ leadIds, coordinatorName })
        });
    }

    async processRawData() {
        return this.request('/api/sync/process-rawdata', {
            method: 'POST'
        });
    }

    // ============================================================
    // UTILIDADES
    // ============================================================
    
    async checkHealth() {
        return this.request('/api/health');
    }
}

// Clase de Error personalizada
class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

// Instancia global
const api = new ApiClient();

// Exportar para módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ApiClient, ApiError, api };
}
