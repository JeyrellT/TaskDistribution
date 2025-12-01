/**
 * Auth Module - Distribution Manager PWA
 * Maneja autenticación y sesión de usuario
 */

const Auth = {
    // Usuario actual
    currentUser: null,
    
    // Inicializar
    async init() {
        // Verificar si hay token guardado
        const token = localStorage.getItem('dm_token');
        
        if (!token) {
            return false;
        }

        try {
            const result = await api.verifyToken();
            if (result.valid && result.user) {
                this.currentUser = result.user;
                return true;
            }
        } catch (error) {
            console.warn('Token inválido o expirado');
            this.logout();
        }
        
        return false;
    },

    // Login
    async login(username, password) {
        try {
            const result = await api.login(username, password);
            
            if (result.success && result.user) {
                this.currentUser = result.user;
                
                // Guardar info de usuario
                localStorage.setItem('dm_user', JSON.stringify(result.user));
                
                return {
                    success: true,
                    user: result.user
                };
            }
            
            return {
                success: false,
                message: result.message || 'Error al iniciar sesión'
            };
        } catch (error) {
            return {
                success: false,
                message: error.message || 'Error de conexión'
            };
        }
    },

    // Logout
    async logout() {
        try {
            await api.logout();
        } catch (e) {
            // Ignorar errores de logout
        }
        
        this.currentUser = null;
        localStorage.removeItem('dm_token');
        localStorage.removeItem('dm_user');
        
        window.dispatchEvent(new CustomEvent('auth:logout'));
    },

    // Verificar si está autenticado
    isAuthenticated() {
        return !!this.currentUser && !!localStorage.getItem('dm_token');
    },

    // Obtener usuario actual
    getUser() {
        if (this.currentUser) {
            return this.currentUser;
        }
        
        const stored = localStorage.getItem('dm_user');
        if (stored) {
            try {
                this.currentUser = JSON.parse(stored);
                return this.currentUser;
            } catch (e) {
                return null;
            }
        }
        
        return null;
    },

    // Verificar rol
    hasRole(roles) {
        if (!this.currentUser) return false;
        
        if (typeof roles === 'string') {
            roles = [roles];
        }
        
        return roles.includes(this.currentUser.role);
    },

    // Es Manager
    isManager() {
        return this.hasRole('Manager');
    },

    // Es Analyst
    isAnalyst() {
        return this.hasRole('Analyst');
    },

    // Es Coordinator
    isCoordinator() {
        return this.hasRole('Coordinator');
    },

    // Obtener nombre para mostrar
    getDisplayName() {
        return this.currentUser?.name || this.currentUser?.username || 'Usuario';
    },

    // Obtener iniciales
    getInitials() {
        const name = this.getDisplayName();
        const parts = name.split(' ');
        
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        
        return name.substring(0, 2).toUpperCase();
    },

    // Obtener color de rol
    getRoleColor() {
        switch (this.currentUser?.role) {
            case 'Manager':
                return '#4f46e5'; // Primary
            case 'Analyst':
                return '#0ea5e9'; // Level 1
            case 'Coordinator':
                return '#8b5cf6'; // Level 2
            default:
                return '#6b7280';
        }
    },

    // Obtener label de rol
    getRoleLabel() {
        switch (this.currentUser?.role) {
            case 'Manager':
                return 'Manager';
            case 'Analyst':
                return 'Analista';
            case 'Coordinator':
                return 'Coordinador';
            default:
                return 'Usuario';
        }
    }
};

// Escuchar evento de logout
window.addEventListener('auth:logout', () => {
    Auth.currentUser = null;
    // Redirigir a login si la app está cargada
    if (typeof App !== 'undefined' && App.showLogin) {
        App.showLogin();
    }
});

// Exportar
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Auth;
}
