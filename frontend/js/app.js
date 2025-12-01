/**
 * Main Application - Distribution Manager PWA
 * Developer: JC Analytics
 */

const App = {
    // Estado de la aplicación
    state: {
        currentView: 'dashboard',
        mainData: null,
        trackingData: {},
        isOnline: navigator.onLine,
        selectedLevel: 1
    },

    // Inicializar aplicación
    async init() {
        console.log('🚀 Initializing Distribution Manager PWA...');
        
        // Verificar si el servidor está configurado
        const serverConfigured = await this.checkServerConfiguration();
        if (!serverConfigured) {
            console.log('⚠️ Servidor no configurado, redirigiendo a diagnósticos...');
            window.location.href = 'diagnostics.html';
            return;
        }
        
        // Registrar Service Worker
        this.registerServiceWorker();
        
        // Verificar conexión
        this.setupConnectionMonitor();
        
        // Verificar autenticación
        const isAuthenticated = await Auth.init();
        
        if (isAuthenticated) {
            await this.loadApp();
        } else {
            this.showLogin();
        }

        // Setup PWA install prompt
        this.setupInstallPrompt();
    },

    // Verificar configuración del servidor
    async checkServerConfiguration() {
        const savedUrl = localStorage.getItem('dm_server_url');
        
        // Si no hay URL guardada y no estamos en localhost, redirigir
        if (!savedUrl && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
            return false;
        }
        
        // Si hay URL guardada, verificar conexión
        if (savedUrl) {
            try {
                const result = await api.testConnection(savedUrl);
                if (!result.success) {
                    console.warn('⚠️ No se pudo conectar al servidor guardado:', savedUrl);
                    return false;
                }
            } catch (error) {
                console.error('❌ Error verificando servidor:', error);
                return false;
            }
        }
        
        return true;
    },

    // Registrar Service Worker
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('✅ Service Worker registered:', registration.scope);
                
                // Verificar actualizaciones
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            UI.showToast('Nueva versión disponible. Recarga para actualizar.', 'info', 10000);
                        }
                    });
                });
            } catch (error) {
                console.error('❌ Service Worker registration failed:', error);
            }
        }
    },

    // Monitorear conexión
    setupConnectionMonitor() {
        const updateStatus = () => {
            this.state.isOnline = navigator.onLine;
            UI.updateConnectionStatus(this.state.isOnline);
            
            if (this.state.isOnline) {
                this.checkServerConnection();
            }
        };

        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();

        // Verificar conexión al servidor cada 30 segundos
        setInterval(() => {
            if (this.state.isOnline) {
                this.checkServerConnection();
            }
        }, 30000);
    },

    async checkServerConnection() {
        try {
            await api.checkHealth();
            UI.updateConnectionStatus(true);
        } catch (error) {
            UI.updateConnectionStatus(false);
        }
    },

    // Setup PWA install
    setupInstallPrompt() {
        let deferredPrompt;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            this.showInstallBanner(deferredPrompt);
        });

        window.addEventListener('appinstalled', () => {
            console.log('✅ PWA installed');
            this.hideInstallBanner();
        });
    },

    showInstallBanner(deferredPrompt) {
        const banner = document.getElementById('install-banner');
        if (!banner) return;

        banner.classList.add('show');
        
        banner.querySelector('.install-btn').onclick = async () => {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log('Install outcome:', outcome);
            this.hideInstallBanner();
        };

        banner.querySelector('.dismiss-btn').onclick = () => {
            this.hideInstallBanner();
        };
    },

    hideInstallBanner() {
        const banner = document.getElementById('install-banner');
        if (banner) banner.classList.remove('show');
    },

    // Mostrar Login
    showLogin() {
        document.getElementById('app').innerHTML = `
            <div class="login-container">
                <div class="login-card">
                    <div class="login-header">
                        <div class="login-logo">📊</div>
                        <h1>Distribution Manager</h1>
                        <p>Inicia sesión para continuar</p>
                    </div>
                    <form class="login-form" id="login-form">
                        <div class="login-error" id="login-error"></div>
                        <div class="form-group">
                            <label class="form-label" for="username">Usuario</label>
                            <input type="text" id="username" class="form-input" placeholder="Tu usuario" required autocomplete="username">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="password">Contraseña</label>
                            <input type="password" id="password" class="form-input" placeholder="Tu contraseña" required autocomplete="current-password">
                        </div>
                        <button type="submit" class="btn btn-primary btn-lg" style="width: 100%">
                            Iniciar Sesión
                        </button>
                    </form>
                    <div class="login-footer">
                        <p>JC Analytics © ${new Date().getFullYear()}</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('login-form').onsubmit = async (e) => {
            e.preventDefault();
            await this.handleLogin();
        };
    },

    async handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('login-error');
        const submitBtn = document.querySelector('#login-form button[type="submit"]');

        errorEl.classList.remove('show');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px"></span> Verificando...';

        try {
            const result = await Auth.login(username, password);
            
            if (result.success) {
                await this.loadApp();
            } else {
                errorEl.textContent = result.message;
                errorEl.classList.add('show');
            }
        } catch (error) {
            errorEl.textContent = error.message || 'Error de conexión';
            errorEl.classList.add('show');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Iniciar Sesión';
        }
    },

    // Cargar aplicación principal
    async loadApp() {
        UI.showLoading('Cargando aplicación...');
        
        try {
            const user = Auth.getUser();
            
            // Renderizar estructura base
            this.renderAppStructure(user);
            
            // Cargar datos según rol
            await this.loadInitialData(user);
            
            // Mostrar vista según rol
            if (user.role === 'Manager') {
                this.showView('dashboard');
            } else if (user.role === 'Analyst' || user.role === 'Coordinator') {
                this.showView('operations');
            } else {
                this.showView('mydata');
            }

        } catch (error) {
            console.error('Error loading app:', error);
            UI.showToast('Error al cargar la aplicación', 'error');
        } finally {
            UI.hideLoading();
        }
    },

    renderAppStructure(user) {
        const isManager = user.role === 'Manager';
        const isAnalyst = user.role === 'Analyst';
        const isCoordinator = user.role === 'Coordinator';
        
        // Determinar el título y subtítulo según el rol
        const roleConfig = {
            Manager: { 
                title: 'Manager Control Panel',
                subtitle: 'Panel Administrativo Completo',
                icon: '👔',
                gradient: 'linear-gradient(135deg, #4f46e5, #7c3aed)'
            },
            Analyst: { 
                title: 'Operations Panel',
                subtitle: 'Level 1 - Prospecting',
                icon: '📞',
                gradient: 'linear-gradient(135deg, #0ea5e9, #06b6d4)'
            },
            Coordinator: { 
                title: 'Operations Panel',
                subtitle: 'Level 2 - Closing',
                icon: '🎯',
                gradient: 'linear-gradient(135deg, #8b5cf6, #a855f7)'
            }
        };
        
        const config = roleConfig[user.role] || roleConfig.Analyst;
        
        document.getElementById('app').innerHTML = `
            <div class="app-container ${user.role.toLowerCase()}-view">
                <!-- Header -->
                <header class="header" style="background: ${config.gradient}">
                    <div class="header-left">
                        <div class="logo-area">
                            <div class="logo-icon">${config.icon}</div>
                            <div class="header-title">
                                <h1>${config.title}</h1>
                                <p>${config.subtitle}</p>
                            </div>
                        </div>
                    </div>
                    <div class="header-right">
                        <div id="connection-status" class="connection-status online">
                            <span class="connection-dot"></span>
                            <span>Conectado</span>
                        </div>
                        <div class="user-info">
                            <div class="user-avatar" style="background: linear-gradient(135deg, ${Auth.getRoleColor()}, #818cf8)">
                                ${Auth.getInitials()}
                            </div>
                            <div class="user-details">
                                <span class="user-name">${Auth.getDisplayName()}</span>
                                <span class="user-role">${Auth.getRoleLabel()}</span>
                            </div>
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="App.logout()">
                            Salir
                        </button>
                    </div>
                </header>

                <!-- Navigation based on Role -->
                <nav class="nav-tabs" id="nav-tabs">
                    ${isManager ? `
                        <button class="nav-tab active" data-view="dashboard">
                            📊 Dashboard
                        </button>
                        <button class="nav-tab" data-view="distribution">
                            📤 Distribución
                        </button>
                        <button class="nav-tab" data-view="sync">
                            🔄 Sincronización
                        </button>
                        <button class="nav-tab" data-view="rawdata">
                            📥 RawData
                        </button>
                        <button class="nav-tab" data-view="users">
                            👥 Usuarios
                        </button>
                    ` : ''}
                    ${isAnalyst ? `
                        <button class="nav-tab active" data-view="operations">
                            📋 Gestión
                        </button>
                        <button class="nav-tab" data-view="mydata">
                            📁 Mis Leads
                        </button>
                        <button class="nav-tab" data-view="stats">
                            📊 Dashboard
                        </button>
                    ` : ''}
                    ${isCoordinator ? `
                        <button class="nav-tab active" data-view="operations">
                            🎯 Gestión
                        </button>
                        <button class="nav-tab" data-view="mydata">
                            📁 Mis Leads
                        </button>
                        <button class="nav-tab" data-view="stats">
                            📊 Dashboard
                        </button>
                    ` : ''}
                </nav>

                <!-- Main Content -->
                <main class="app-main" id="main-content">
                    <!-- Dynamic content -->
                </main>

                <!-- Install Banner -->
                <div class="install-banner" id="install-banner">
                    <div class="install-banner-text">
                        <h4>📱 Instalar App</h4>
                        <p>Instala Distribution Manager para acceso rápido</p>
                    </div>
                    <div class="install-banner-actions">
                        <button class="btn dismiss-btn">Ahora no</button>
                        <button class="btn install-btn">Instalar</button>
                    </div>
                </div>
            </div>
        `;

        // Setup navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.onclick = () => this.showView(tab.dataset.view);
        });
    },

    async loadInitialData(user) {
        try {
            if (user.role === 'Manager') {
                // Cargar datos principales
                const mainResult = await api.getMainData();
                if (mainResult.exists) {
                    this.state.mainData = {
                        headers: mainResult.headers,
                        data: mainResult.data,
                        fileName: mainResult.fileName
                    };
                }
                
                // Cargar estructura de archivos
                const structure = await api.getFileStructure();
                this.state.fileStructure = structure.structure;
            } else {
                // Cargar datos del usuario
                const trackingResult = await api.getTrackingData(user.name);
                if (trackingResult.exists) {
                    this.state.myData = {
                        headers: trackingResult.headers,
                        data: trackingResult.data,
                        fileName: trackingResult.fileName
                    };
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
            if (!error.data?.offline) {
                UI.showToast('Error al cargar datos: ' + error.message, 'error');
            }
        }
    },

    // Cambiar vista
    showView(viewName) {
        this.state.currentView = viewName;
        
        // Actualizar tabs activos
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });

        const content = document.getElementById('main-content');
        
        // Renderizar vista
        switch (viewName) {
            case 'dashboard':
                this.renderDashboard(content);
                break;
            case 'distribution':
                this.renderDistribution(content);
                break;
            case 'sync':
                this.renderSync(content);
                break;
            case 'rawdata':
                this.renderRawData(content);
                break;
            case 'users':
                this.renderUsers(content);
                break;
            case 'operations':
                this.renderOperations(content);
                break;
            case 'mydata':
                this.renderMyData(content);
                break;
            case 'stats':
                this.renderStats(content);
                break;
            default:
                content.innerHTML = '<p>Vista no encontrada</p>';
        }
    },

    // ============================================================
    // VISTA OPERATIONS - ANALYST & COORDINATOR
    // ============================================================

    renderOperations(container) {
        const user = Auth.getUser();
        const data = this.state.myData;
        const isAnalyst = user.role === 'Analyst';
        const roleColor = isAnalyst ? 'var(--level-1)' : 'var(--level-2)';
        const levelText = isAnalyst ? 'Level 1 - Prospecting' : 'Level 2 - Closing';

        // Calcular estadísticas
        const stats = data ? this.calculateUserStats(data) : { total: 0, pending: 0, callback: 0, po: 0, sold: 0, na: 0 };

        container.innerHTML = `
            <!-- Tarjetas de Estadísticas -->
            <div class="operations-stats-grid">
                <div class="ops-stat-card primary">
                    <div class="ops-stat-icon">📋</div>
                    <div class="ops-stat-info">
                        <span class="ops-stat-value">${stats.total}</span>
                        <span class="ops-stat-label">Total Leads</span>
                    </div>
                </div>
                <div class="ops-stat-card">
                    <div class="ops-stat-icon">⏳</div>
                    <div class="ops-stat-info">
                        <span class="ops-stat-value">${stats.pending}</span>
                        <span class="ops-stat-label">Pendientes</span>
                    </div>
                </div>
                <div class="ops-stat-card warning">
                    <div class="ops-stat-icon">📞</div>
                    <div class="ops-stat-info">
                        <span class="ops-stat-value">${stats.callback}</span>
                        <span class="ops-stat-label">Callbacks</span>
                    </div>
                </div>
                <div class="ops-stat-card gold">
                    <div class="ops-stat-icon">⭐</div>
                    <div class="ops-stat-info">
                        <span class="ops-stat-value">${stats.po}</span>
                        <span class="ops-stat-label">Pass Over</span>
                    </div>
                </div>
                <div class="ops-stat-card success">
                    <div class="ops-stat-icon">✅</div>
                    <div class="ops-stat-info">
                        <span class="ops-stat-value">${stats.sold}</span>
                        <span class="ops-stat-label">Cerrados</span>
                    </div>
                </div>
            </div>

            <!-- Panel de Acciones Rápidas -->
            <div class="card operations-actions-card">
                <div class="operations-actions-header">
                    <h3>🎯 Acciones Rápidas</h3>
                    <span class="role-badge" style="background: ${roleColor}">${levelText}</span>
                </div>
                <div class="quick-actions-grid">
                    <button class="quick-action-btn call" onclick="App.quickCallNext()">
                        <span class="qa-icon">📞</span>
                        <span class="qa-text">Llamar Siguiente</span>
                    </button>
                    <button class="quick-action-btn save" onclick="App.saveMyChanges()">
                        <span class="qa-icon">💾</span>
                        <span class="qa-text">Guardar Todo</span>
                    </button>
                    <button class="quick-action-btn refresh" onclick="App.refreshMyData()">
                        <span class="qa-icon">🔄</span>
                        <span class="qa-text">Actualizar</span>
                    </button>
                    <button class="quick-action-btn export" onclick="App.exportMyData()">
                        <span class="qa-icon">📥</span>
                        <span class="qa-text">Exportar</span>
                    </button>
                </div>
            </div>

            <!-- Tabs de Gestión -->
            <div class="card">
                <div class="gestion-tabs-container">
                    <div class="gestion-tabs">
                        <button class="gestion-tab active" onclick="App.switchGestionTab(this, 'pending')">
                            ⏳ Pendientes <span class="tab-count">${stats.pending}</span>
                        </button>
                        <button class="gestion-tab" onclick="App.switchGestionTab(this, 'callback')">
                            📞 Callbacks <span class="tab-count">${stats.callback}</span>
                        </button>
                        <button class="gestion-tab" onclick="App.switchGestionTab(this, 'po')">
                            ⭐ Pass Over <span class="tab-count">${stats.po}</span>
                        </button>
                        <button class="gestion-tab" onclick="App.switchGestionTab(this, 'all')">
                            📋 Todos <span class="tab-count">${stats.total}</span>
                        </button>
                    </div>
                </div>
                
                <!-- Tabla de Leads -->
                <div class="tabla-wrapper" id="operations-table-container">
                    ${data ? '' : '<p class="text-muted text-center">Sin leads asignados</p>'}
                </div>
            </div>

            <!-- Modal de Detalle -->
            <div class="detalle-overlay" id="detalleOverlay">
                <div class="detalle-modal">
                    <div class="detalle-header">
                        <h3>Detalle del Lead</h3>
                        <button class="btn-close" onclick="App.closeDetailModal()">×</button>
                    </div>
                    <div class="detalle-content" id="detalle-content"></div>
                </div>
            </div>
        `;

        // Renderizar tabla inicial
        if (data) {
            this.currentGestionFilter = 'pending';
            this.renderOperationsTable('pending');
        }
    },

    calculateUserStats(data) {
        const stats = { total: 0, pending: 0, callback: 0, po: 0, sold: 0, na: 0 };
        if (!data || !data.data) return stats;

        const idxStatus = this.findColumnIndex(data.headers, ['Status', 'Estado']);
        
        stats.total = data.data.length;
        
        data.data.forEach(row => {
            const status = (row[idxStatus] || '').toString().toUpperCase().trim();
            
            if (!status || status === 'NEW' || status === 'NUEVO') {
                stats.pending++;
            } else if (status === 'CB' || status === 'CALLBACK' || status === 'BUSY') {
                stats.callback++;
            } else if (status === 'PO' || status.includes('PASS')) {
                stats.po++;
            } else if (status === 'SOLD' || status === 'CLOSED') {
                stats.sold++;
            } else if (status === 'NA' || status === 'DISC' || status === 'DNC') {
                stats.na++;
            }
        });

        return stats;
    },

    switchGestionTab(btn, filter) {
        document.querySelectorAll('.gestion-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        this.currentGestionFilter = filter;
        this.renderOperationsTable(filter);
    },

    renderOperationsTable(filter = 'pending') {
        const container = document.getElementById('operations-table-container');
        const data = this.state.myData;
        
        if (!data || !data.data.length) {
            container.innerHTML = '<p class="text-muted text-center">No hay leads para mostrar</p>';
            return;
        }

        const idxStatus = this.findColumnIndex(data.headers, ['Status', 'Estado']);
        const idxPhone = this.findColumnIndex(data.headers, ['Phone', 'Telefono', 'Tel']);
        const idxName = this.findColumnIndex(data.headers, ['Name', 'Nombre', 'Cliente']);
        const idxComment = this.findColumnIndex(data.headers, ['Comment', 'Comments', 'Comentario', 'Notas']);

        // Filtrar datos
        let filtered = data.data.map((row, idx) => ({ row, idx }));
        
        if (filter !== 'all') {
            filtered = filtered.filter(({ row }) => {
                const status = (row[idxStatus] || '').toString().toUpperCase().trim();
                switch (filter) {
                    case 'pending': return !status || status === 'NEW' || status === 'NUEVO';
                    case 'callback': return status === 'CB' || status === 'CALLBACK' || status === 'BUSY';
                    case 'po': return status === 'PO' || status.includes('PASS');
                    default: return true;
                }
            });
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <h4>Sin leads en esta categoría</h4>
                </div>
            `;
            return;
        }

        // Construir tabla
        let html = `
            <table class="operations-table">
                <thead>
                    <tr>
                        <th class="col-id">#</th>
                        <th>Teléfono</th>
                        <th>Nombre</th>
                        <th class="col-status">Estado</th>
                        <th>Comentario</th>
                        <th class="col-action">Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filtered.forEach(({ row, idx }, displayIdx) => {
            const phone = row[idxPhone] || '';
            const name = row[idxName] || '';
            const status = row[idxStatus] || '';
            const comment = row[idxComment] || '';
            const statusClass = this.getStatusClass(status);

            html += `
                <tr data-idx="${idx}" class="${statusClass}">
                    <td class="col-id">${displayIdx + 1}</td>
                    <td>
                        <a href="tel:${phone}" class="phone-link">${phone}</a>
                    </td>
                    <td>${name}</td>
                    <td class="col-status">
                        <select class="status-select ${statusClass}" data-idx="${idx}" onchange="App.updateLeadStatus(${idx}, this.value)">
                            <option value="" ${!status ? 'selected' : ''}>--</option>
                            <option value="NEW" ${status === 'NEW' ? 'selected' : ''}>NEW</option>
                            <option value="CB" ${status === 'CB' ? 'selected' : ''}>CB</option>
                            <option value="NA" ${status === 'NA' ? 'selected' : ''}>NA</option>
                            <option value="BUSY" ${status === 'BUSY' ? 'selected' : ''}>BUSY</option>
                            <option value="DISC" ${status === 'DISC' ? 'selected' : ''}>DISC</option>
                            <option value="PO" ${status === 'PO' ? 'selected' : ''}>PO ⭐</option>
                            <option value="SOLD" ${status === 'SOLD' ? 'selected' : ''}>SOLD ✅</option>
                        </select>
                    </td>
                    <td>
                        <input type="text" class="comment-input" value="${comment}" 
                               data-idx="${idx}" onchange="App.updateLeadComment(${idx}, this.value)"
                               placeholder="Agregar nota...">
                    </td>
                    <td class="col-action">
                        <div class="action-btns">
                            <button class="smart-btn call" onclick="App.callLead(${idx})" title="Llamar">📞</button>
                            <button class="smart-btn detail" onclick="App.showLeadDetail(${idx})" title="Ver detalle">👁️</button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    },

    getStatusClass(status) {
        const s = (status || '').toString().toUpperCase();
        if (s === 'PO' || s.includes('PASS')) return 'status-po';
        if (s === 'SOLD' || s === 'CLOSED') return 'status-sold';
        if (s === 'CB' || s === 'CALLBACK') return 'status-cb';
        if (s === 'NA' || s === 'DISC') return 'status-na';
        return '';
    },

    updateLeadStatus(idx, value) {
        const data = this.state.myData;
        const idxStatus = this.findColumnIndex(data.headers, ['Status', 'Estado']);
        data.data[idx][idxStatus] = value;
        
        // Efecto visual
        const row = document.querySelector(`tr[data-idx="${idx}"]`);
        if (row) {
            row.className = this.getStatusClass(value);
            
            // Animación de éxito para PO o SOLD
            if (value === 'PO' || value === 'SOLD') {
                row.classList.add('row-success-animation');
                setTimeout(() => row.classList.remove('row-success-animation'), 500);
            }
        }

        UI.showToast('Estado actualizado', 'success', 2000);
    },

    updateLeadComment(idx, value) {
        const data = this.state.myData;
        const idxComment = this.findColumnIndex(data.headers, ['Comment', 'Comments', 'Comentario', 'Notas']);
        if (idxComment !== -1) {
            data.data[idx][idxComment] = value;
        }
    },

    quickCallNext() {
        const data = this.state.myData;
        if (!data) return;

        const idxStatus = this.findColumnIndex(data.headers, ['Status', 'Estado']);
        const idxPhone = this.findColumnIndex(data.headers, ['Phone', 'Telefono', 'Tel']);

        // Buscar el primer lead pendiente
        for (let i = 0; i < data.data.length; i++) {
            const status = (data.data[i][idxStatus] || '').toString().toUpperCase();
            if (!status || status === 'NEW') {
                const phone = data.data[i][idxPhone];
                if (phone) {
                    window.open(`tel:${phone}`, '_self');
                    return;
                }
            }
        }

        UI.showToast('No hay leads pendientes para llamar', 'info');
    },

    showLeadDetail(idx) {
        const data = this.state.myData;
        const row = data.data[idx];
        
        let html = '<div class="detalle-grid">';
        data.headers.forEach((header, i) => {
            html += `
                <div class="detalle-field">
                    <label>${header}</label>
                    <span>${row[i] || '-'}</span>
                </div>
            `;
        });
        html += '</div>';

        document.getElementById('detalle-content').innerHTML = html;
        document.getElementById('detalleOverlay').classList.add('active');
    },

    closeDetailModal() {
        document.getElementById('detalleOverlay').classList.remove('active');
    },

    async refreshMyData() {
        UI.showLoading('Actualizando...');
        try {
            const user = Auth.getUser();
            const trackingResult = await api.getTrackingData(user.name);
            if (trackingResult.exists) {
                this.state.myData = {
                    headers: trackingResult.headers,
                    data: trackingResult.data,
                    fileName: trackingResult.fileName
                };
            }
            this.showView(this.state.currentView);
            UI.showToast('Datos actualizados', 'success');
        } catch (error) {
            UI.showToast('Error al actualizar: ' + error.message, 'error');
        } finally {
            UI.hideLoading();
        }
    },

    exportMyData() {
        const data = this.state.myData;
        if (!data) {
            UI.showToast('No hay datos para exportar', 'warning');
            return;
        }

        // Crear workbook con XLSX
        const ws = XLSX.utils.aoa_to_sheet([data.headers, ...data.data]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'MisLeads');
        
        const user = Auth.getUser();
        XLSX.writeFile(wb, `${user.name}_leads_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        UI.showToast('Archivo exportado', 'success');
    },

    // ============================================================
    // VISTAS - MANAGER
    // ============================================================

    renderDashboard(container) {
        const data = this.state.mainData;
        
        if (!data) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <h3>Sin datos</h3>
                    <p>No hay archivo principal cargado. Ve a RawData para procesar archivos.</p>
                    <button class="btn btn-primary" onclick="App.showView('rawdata')">
                        Ir a RawData
                    </button>
                </div>
            `;
            return;
        }

        // Calcular estadísticas
        const stats = this.calculateStats(data);

        container.innerHTML = `
            <div class="dashboard-header">
                <h2 class="dashboard-title">Dashboard</h2>
                <div class="dashboard-actions">
                    <button class="btn btn-secondary" onclick="App.refreshData()">
                        🔄 Actualizar
                    </button>
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="stats-grid">
                <div class="stat-card primary">
                    <span class="stat-label">Total Leads</span>
                    <span class="stat-value" id="stat-total">${stats.total}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Disponibles</span>
                    <span class="stat-value">${stats.available}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Asignados</span>
                    <span class="stat-value">${stats.assigned}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Pass Over (PO)</span>
                    <span class="stat-value">${stats.po}</span>
                </div>
            </div>

            <!-- Pipeline Widget -->
            <div class="pipeline-widget">
                <div class="pipeline-metric level1">
                    <div class="metric-icon">📞</div>
                    <div class="metric-label">Level 1</div>
                    <div class="metric-value">${stats.level1}</div>
                    <div class="metric-subtitle">Prospecting</div>
                </div>
                <div class="pipeline-metric level2">
                    <div class="metric-icon">🎯</div>
                    <div class="metric-label">Level 2</div>
                    <div class="metric-value">${stats.level2}</div>
                    <div class="metric-subtitle">Closing</div>
                </div>
                <div class="pipeline-metric escalation">
                    <div class="metric-icon">⭐</div>
                    <div class="metric-label">Oportunidades</div>
                    <div class="metric-value">${stats.po}</div>
                    <div class="metric-subtitle">Para promover</div>
                </div>
                <div class="pipeline-metric">
                    <div class="metric-icon">✅</div>
                    <div class="metric-label">Cerrados</div>
                    <div class="metric-value">${stats.sold}</div>
                    <div class="metric-subtitle">Ventas</div>
                </div>
            </div>

            <!-- Data Table -->
            <div class="card">
                <div class="card-header">
                    <div>
                        <h3 class="card-title">Datos Principales</h3>
                        <p class="card-subtitle">${data.fileName} - ${data.data.length} registros</p>
                    </div>
                    <div class="table-toolbar">
                        <div class="table-search">
                            <span class="table-search-icon">🔍</span>
                            <input type="text" class="form-input" placeholder="Buscar..." id="search-input">
                        </div>
                    </div>
                </div>
                <div id="data-table-container"></div>
            </div>
        `;

        // Renderizar tabla
        this.renderMainTable();

        // Setup búsqueda
        document.getElementById('search-input').oninput = (e) => {
            this.filterMainTable(e.target.value);
        };
    },

    calculateStats(data) {
        const stats = {
            total: data.data.length,
            available: 0,
            assigned: 0,
            level1: 0,
            level2: 0,
            po: 0,
            sold: 0
        };

        const headers = data.headers;
        const idxAssigned = this.findColumnIndex(headers, ['AssignedTo', 'Asignado']);
        const idxLevel = this.findColumnIndex(headers, ['Level', 'Nivel']);
        const idxStatus = this.findColumnIndex(headers, ['Status', 'Estado']);

        data.data.forEach(row => {
            const assigned = row[idxAssigned];
            const level = row[idxLevel];
            const status = (row[idxStatus] || '').toString().toUpperCase();

            if (!assigned || assigned.toString().trim() === '') {
                stats.available++;
            } else {
                stats.assigned++;
            }

            if (level == 1) stats.level1++;
            if (level == 2) stats.level2++;
            if (status.includes('PO') || status.includes('PASS')) stats.po++;
            if (status.includes('SOLD') || status.includes('CLOSED')) stats.sold++;
        });

        return stats;
    },

    renderMainTable() {
        const container = document.getElementById('data-table-container');
        const data = this.state.mainData;
        
        if (!data) return;

        // Convertir a objetos para la tabla
        const tableData = data.data.map(row => {
            const obj = {};
            data.headers.forEach((h, i) => {
                obj[h] = row[i];
            });
            return obj;
        });

        UI.renderDataTable(container, tableData.slice(0, 100), {
            headers: data.headers.slice(0, 10), // Mostrar primeras 10 columnas
            onRowClick: (row, idx) => {
                console.log('Row clicked:', row);
            }
        });

        if (tableData.length > 100) {
            container.innerHTML += `
                <p class="text-muted text-center mt-2">
                    Mostrando 100 de ${tableData.length} registros
                </p>
            `;
        }
    },

    filterMainTable(searchTerm) {
        // Implementar filtrado
        const container = document.getElementById('data-table-container');
        const data = this.state.mainData;
        
        if (!data || !searchTerm) {
            this.renderMainTable();
            return;
        }

        const filtered = data.data.filter(row => {
            return row.some(cell => 
                String(cell).toLowerCase().includes(searchTerm.toLowerCase())
            );
        });

        const tableData = filtered.map(row => {
            const obj = {};
            data.headers.forEach((h, i) => {
                obj[h] = row[i];
            });
            return obj;
        });

        UI.renderDataTable(container, tableData.slice(0, 100), {
            headers: data.headers.slice(0, 10)
        });
    },

    renderDistribution(container) {
        container.innerHTML = `
            <div class="dashboard-header">
                <h2 class="dashboard-title">Distribución de Leads</h2>
            </div>

            <!-- Level Selector -->
            <div class="level-selector">
                <div class="level-card level-1 ${this.state.selectedLevel === 1 ? 'active' : ''}" onclick="App.selectLevel(1)">
                    <h4>📞 Level 1 - Prospecting</h4>
                    <p>Asignar a Analistas para primera llamada</p>
                </div>
                <div class="level-card level-2 ${this.state.selectedLevel === 2 ? 'active' : ''}" onclick="App.selectLevel(2)">
                    <h4>🎯 Level 2 - Closing</h4>
                    <p>Asignar POs a Coordinadores</p>
                </div>
            </div>

            <div class="distribution-wrapper">
                <!-- Panel de Personas -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Asignar a</h3>
                        <button class="btn btn-sm btn-secondary" onclick="App.addPerson()">
                            + Agregar persona
                        </button>
                    </div>
                    <div class="personas-container" id="personas-container">
                        <!-- Dynamic personas -->
                    </div>
                    <div class="mt-2">
                        <button class="btn btn-primary btn-lg" style="width:100%" onclick="App.executeDistribution()">
                            📤 Distribuir Leads
                        </button>
                    </div>
                </div>

                <!-- Panel de Disponibles -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Leads Disponibles</h3>
                        <span class="stat-value" id="available-count">0</span>
                    </div>
                    <div id="available-leads-container">
                        <p class="text-muted">Cargando leads disponibles...</p>
                    </div>
                </div>
            </div>
        `;

        this.loadAvailableLeads();
        this.loadPersonas();
    },

    selectLevel(level) {
        this.state.selectedLevel = level;
        document.querySelectorAll('.level-card').forEach(card => {
            card.classList.remove('active');
        });
        document.querySelector(`.level-card.level-${level}`).classList.add('active');
        this.loadAvailableLeads();
    },

    loadAvailableLeads() {
        const container = document.getElementById('available-leads-container');
        const countEl = document.getElementById('available-count');
        const data = this.state.mainData;

        if (!data) {
            container.innerHTML = '<p class="text-muted">No hay datos cargados</p>';
            return;
        }

        const headers = data.headers;
        const idxAssigned = this.findColumnIndex(headers, ['AssignedTo', 'Asignado']);
        const idxLevel = this.findColumnIndex(headers, ['Level', 'Nivel']);
        const idxStatus = this.findColumnIndex(headers, ['Status', 'Estado']);

        let available;
        
        if (this.state.selectedLevel === 1) {
            // Level 1: Sin asignar
            available = data.data.filter((row, idx) => {
                const assigned = row[idxAssigned];
                return !assigned || assigned.toString().trim() === '';
            });
        } else {
            // Level 2: POs sin asignar a coordinator
            available = data.data.filter((row, idx) => {
                const status = (row[idxStatus] || '').toString().toUpperCase();
                const level = row[idxLevel];
                return (status.includes('PO') || status.includes('PASS')) && level != 2;
            });
        }

        countEl.textContent = available.length;

        if (available.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <h3>Sin leads disponibles</h3>
                    <p>${this.state.selectedLevel === 1 ? 'Todos los leads están asignados' : 'No hay POs pendientes'}</p>
                </div>
            `;
            return;
        }

        const tableData = available.slice(0, 50).map(row => {
            const obj = {};
            headers.slice(0, 6).forEach((h, i) => {
                obj[h] = row[i];
            });
            return obj;
        });

        UI.renderDataTable(container, tableData, {
            headers: headers.slice(0, 6)
        });
    },

    loadPersonas() {
        const container = document.getElementById('personas-container');
        container.innerHTML = '';
        this.addPerson(); // Agregar una persona por defecto
    },

    addPerson() {
        const container = document.getElementById('personas-container');
        const role = this.state.selectedLevel === 1 ? 'Analyst' : 'Coordinator';
        
        const row = document.createElement('div');
        row.className = 'persona-row';
        row.innerHTML = `
            <input type="text" class="form-input persona-nombre" placeholder="Nombre de la persona">
            <select class="form-input form-select persona-rol">
                <option value="Analyst" ${role === 'Analyst' ? 'selected' : ''}>Analista</option>
                <option value="Coordinator" ${role === 'Coordinator' ? 'selected' : ''}>Coordinador</option>
            </select>
            <input type="number" class="form-input quantity-input" placeholder="Cant." min="0" value="10">
            <button class="btn btn-remove" onclick="this.parentElement.remove()">×</button>
        `;
        
        container.appendChild(row);
    },

    async executeDistribution() {
        const rows = document.querySelectorAll('.persona-row');
        const assignments = {};
        let totalToAssign = 0;

        rows.forEach(row => {
            const name = row.querySelector('.persona-nombre').value.trim();
            const quantity = parseInt(row.querySelector('.quantity-input').value) || 0;
            
            if (name && quantity > 0) {
                assignments[name] = quantity;
                totalToAssign += quantity;
            }
        });

        if (Object.keys(assignments).length === 0) {
            UI.showToast('Ingresa al menos una persona con cantidad', 'warning');
            return;
        }

        // Obtener leads disponibles
        const data = this.state.mainData;
        const headers = data.headers;
        const idxAssigned = this.findColumnIndex(headers, ['AssignedTo', 'Asignado']);
        const idxStatus = this.findColumnIndex(headers, ['Status', 'Estado']);
        const idxLevel = this.findColumnIndex(headers, ['Level', 'Nivel']);

        let availableIndices = [];
        
        if (this.state.selectedLevel === 1) {
            data.data.forEach((row, idx) => {
                const assigned = row[idxAssigned];
                if (!assigned || assigned.toString().trim() === '') {
                    availableIndices.push(idx);
                }
            });
        } else {
            data.data.forEach((row, idx) => {
                const status = (row[idxStatus] || '').toString().toUpperCase();
                const level = row[idxLevel];
                if ((status.includes('PO') || status.includes('PASS')) && level != 2) {
                    availableIndices.push(idx);
                }
            });
        }

        if (availableIndices.length < totalToAssign) {
            const confirm = await UI.confirm(
                `Solo hay ${availableIndices.length} leads disponibles pero quieres asignar ${totalToAssign}. ¿Continuar con los disponibles?`
            );
            if (!confirm) return;
        }

        // Crear asignaciones por persona
        const finalAssignments = {};
        let currentIdx = 0;

        for (const [name, quantity] of Object.entries(assignments)) {
            finalAssignments[name] = [];
            for (let i = 0; i < quantity && currentIdx < availableIndices.length; i++) {
                finalAssignments[name].push(availableIndices[currentIdx]);
                currentIdx++;
            }
        }

        UI.showLoading('Distribuyendo leads...');

        try {
            const result = await api.distributeLeads(finalAssignments, this.state.selectedLevel);
            
            if (result.success) {
                UI.showToast('Distribución completada exitosamente', 'success');
                await this.refreshData();
                this.showView('distribution');
            }
        } catch (error) {
            UI.showToast('Error en distribución: ' + error.message, 'error');
        } finally {
            UI.hideLoading();
        }
    },

    renderSync(container) {
        container.innerHTML = `
            <div class="dashboard-header">
                <h2 class="dashboard-title">Sincronización</h2>
            </div>

            <div class="sync-engine-section">
                <div class="sync-engine-icon">⚙️</div>
                <div class="sync-engine-text">
                    <h3>Motor de Sincronización</h3>
                    <p>Sincroniza actualizaciones de los archivos de tracking con el archivo principal</p>
                </div>
                <div class="sync-buttons">
                    <button class="sync-btn" onclick="App.executeSync('update')">
                        🔄 Sync Updates
                        <small>Actualiza Status y Comentarios</small>
                    </button>
                    <button class="sync-btn" onclick="App.executeSync('release')">
                        ♻️ Release NA
                        <small>Libera No Answer al pool</small>
                    </button>
                </div>
            </div>

            <div class="sync-feedback" id="sync-feedback"></div>

            <!-- Tracking Files -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Archivos de Tracking</h3>
                    <button class="btn btn-secondary btn-sm" onclick="App.loadTrackingFiles()">
                        🔄 Recargar
                    </button>
                </div>
                <div id="tracking-files-container">
                    <p class="text-muted">Cargando archivos...</p>
                </div>
            </div>
        `;

        this.loadTrackingFiles();
    },

    async loadTrackingFiles() {
        const container = document.getElementById('tracking-files-container');
        
        try {
            const result = await api.getAllTrackingData();
            const tracking = result.tracking;

            if (Object.keys(tracking).length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p>No hay archivos de tracking</p>
                    </div>
                `;
                return;
            }

            let html = '<div class="file-list">';
            
            for (const [personName, data] of Object.entries(tracking)) {
                html += `
                    <div class="file-item">
                        <div class="file-item-info">
                            <span class="file-item-icon">📁</span>
                            <div>
                                <span class="file-item-name">${personName}</span>
                                <span class="file-item-meta">${data.totalRows} registros - ${data.fileName}</span>
                            </div>
                        </div>
                        <div class="file-item-actions">
                            <button class="btn btn-sm btn-secondary" onclick="App.viewTrackingFile('${personName}')">
                                Ver
                            </button>
                        </div>
                    </div>
                `;
            }

            html += '</div>';
            container.innerHTML = html;

        } catch (error) {
            container.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
        }
    },

    async executeSync(mode) {
        const feedback = document.getElementById('sync-feedback');
        feedback.classList.add('show');
        feedback.innerHTML = '<div class="spinner"></div> Sincronizando...';

        try {
            const result = await api.syncUpdates(mode);
            
            if (result.success) {
                feedback.innerHTML = `
                    <p class="text-success">✅ ${result.message}</p>
                    <ul>
                        <li>POs promovidos: ${result.stats.poPromoted}</li>
                        <li>NAs liberados: ${result.stats.naReleased}</li>
                        <li>Archivos actualizados: ${result.filesUpdated}</li>
                    </ul>
                `;
                await this.refreshData();
            }
        } catch (error) {
            feedback.innerHTML = `<p class="text-danger">❌ Error: ${error.message}</p>`;
        }
    },

    renderRawData(container) {
        container.innerHTML = `
            <div class="dashboard-header">
                <h2 class="dashboard-title">RawData - Ingesta de Datos</h2>
            </div>

            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Subir Archivo</h3>
                </div>
                <div class="form-group">
                    <input type="file" id="rawdata-upload" accept=".xlsx,.xls,.csv" class="form-input">
                </div>
                <button class="btn btn-primary" onclick="App.uploadRawData()">
                    📤 Subir Archivo
                </button>
            </div>

            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Archivos Pendientes</h3>
                    <button class="btn btn-success" onclick="App.processRawData()">
                        ⚡ Procesar Todo
                    </button>
                </div>
                <div id="rawdata-files-container">
                    <p class="text-muted">Cargando archivos...</p>
                </div>
            </div>
        `;

        this.loadRawDataFiles();
    },

    async loadRawDataFiles() {
        const container = document.getElementById('rawdata-files-container');
        
        try {
            const result = await api.getRawDataFiles();
            
            if (result.files.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p>No hay archivos en RawData</p>
                    </div>
                `;
                return;
            }

            let html = '<div class="file-list">';
            
            for (const file of result.files) {
                html += `
                    <div class="file-item">
                        <div class="file-item-info">
                            <span class="file-item-icon">📄</span>
                            <div>
                                <span class="file-item-name">${file.name}</span>
                                <span class="file-item-meta">${UI.formatBytes(file.size)} - ${UI.formatDate(file.modified)}</span>
                            </div>
                        </div>
                        <div class="file-item-actions">
                            <button class="btn btn-sm btn-danger" onclick="App.deleteRawData('${file.name}')">
                                🗑️
                            </button>
                        </div>
                    </div>
                `;
            }

            html += '</div>';
            container.innerHTML = html;

        } catch (error) {
            container.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
        }
    },

    async uploadRawData() {
        const input = document.getElementById('rawdata-upload');
        const file = input.files[0];
        
        if (!file) {
            UI.showToast('Selecciona un archivo', 'warning');
            return;
        }

        UI.showLoading('Subiendo archivo...');

        try {
            await api.uploadRawData(file);
            UI.showToast('Archivo subido exitosamente', 'success');
            input.value = '';
            this.loadRawDataFiles();
        } catch (error) {
            UI.showToast('Error: ' + error.message, 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async processRawData() {
        if (!await UI.confirm('¿Procesar todos los archivos de RawData?')) return;

        UI.showLoading('Procesando archivos...');

        try {
            const result = await api.processRawData();
            UI.showToast(`Procesados: ${result.added} registros nuevos`, 'success');
            await this.refreshData();
            this.loadRawDataFiles();
        } catch (error) {
            UI.showToast('Error: ' + error.message, 'error');
        } finally {
            UI.hideLoading();
        }
    },

    async deleteRawData(fileName) {
        if (!await UI.confirm(`¿Eliminar ${fileName}?`)) return;

        try {
            await api.deleteRawData(fileName);
            UI.showToast('Archivo eliminado', 'success');
            this.loadRawDataFiles();
        } catch (error) {
            UI.showToast('Error: ' + error.message, 'error');
        }
    },

    renderUsers(container) {
        container.innerHTML = `
            <div class="dashboard-header">
                <h2 class="dashboard-title">Gestión de Usuarios</h2>
            </div>
            <div class="card">
                <p class="text-muted">
                    Los usuarios se configuran en el archivo .env del servidor.<br>
                    Contacta al administrador para agregar o modificar usuarios.
                </p>
                <div id="users-list" class="mt-2"></div>
            </div>
        `;

        this.loadUsers();
    },

    async loadUsers() {
        const container = document.getElementById('users-list');
        
        try {
            const result = await api.getUsers();
            
            let html = '<div class="file-list">';
            
            for (const user of result.users) {
                html += `
                    <div class="file-item">
                        <div class="file-item-info">
                            <div class="user-avatar" style="width:40px;height:40px;font-size:0.9rem">
                                ${user.name.substring(0,2).toUpperCase()}
                            </div>
                            <div>
                                <span class="file-item-name">${user.name}</span>
                                <span class="file-item-meta">@${user.username} - ${user.role}</span>
                            </div>
                        </div>
                    </div>
                `;
            }

            html += '</div>';
            container.innerHTML = html;

        } catch (error) {
            container.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
        }
    },

    // ============================================================
    // VISTAS - ANALYST/COORDINATOR
    // ============================================================

    renderMyData(container) {
        const user = Auth.getUser();
        const data = this.state.myData;
        const isAnalyst = user.role === 'Analyst';
        const roleClass = isAnalyst ? 'analyst' : 'coordinator';
        const stats = data ? this.calculateUserStats(data) : { total: 0, pending: 0, callback: 0, po: 0, sold: 0, na: 0 };

        container.innerHTML = `
            <div class="dashboard-header">
                <h2 class="dashboard-title">📁 Mis Leads Asignados</h2>
                <div class="dashboard-actions">
                    <button class="btn btn-secondary btn-sm" onclick="App.refreshMyData()">
                        🔄 Actualizar
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="App.saveMyChanges()">
                        💾 Guardar Todo
                    </button>
                </div>
            </div>

            ${data ? `
                <!-- Info Bar -->
                <div class="info-bar ${roleClass}">
                    <div class="info-bar-left">
                        <span class="info-icon">📋</span>
                        <div>
                            <strong>${data.fileName}</strong>
                            <span>${data.data.length} registros totales</span>
                        </div>
                    </div>
                    <div class="info-bar-right">
                        <span class="info-stat">⏳ ${stats.pending} pendientes</span>
                        <span class="info-stat">⭐ ${stats.po} PO</span>
                        <span class="info-stat">✅ ${stats.sold} cerrados</span>
                    </div>
                </div>

                <!-- Search & Filter -->
                <div class="card mb-3">
                    <div class="search-filter-row">
                        <div class="search-box">
                            <span class="search-icon">🔍</span>
                            <input type="text" class="form-input" placeholder="Buscar lead..." 
                                   id="mydata-search" oninput="App.filterMyData(this.value)">
                        </div>
                        <select class="form-input form-select" id="mydata-status-filter" 
                                onchange="App.filterMyDataByStatus(this.value)">
                            <option value="">Todos los estados</option>
                            <option value="pending">Pendientes</option>
                            <option value="callback">Callbacks</option>
                            <option value="po">Pass Over</option>
                            <option value="sold">Cerrados</option>
                            <option value="na">No Answer</option>
                        </select>
                    </div>
                </div>

                <!-- Data Table -->
                <div class="card">
                    <div class="tabla-wrapper" id="mydata-table-container"></div>
                </div>
            ` : `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <h3>Sin leads asignados</h3>
                    <p>Aún no tienes leads asignados. Contacta a tu manager.</p>
                </div>
            `}
        `;

        if (data) {
            this.myDataFilter = '';
            this.myDataStatusFilter = '';
            this.renderMyDataTable();
        }
    },

    renderMyDataTable() {
        const container = document.getElementById('mydata-table-container');
        const data = this.state.myData;
        
        if (!data) return;

        const idxStatus = this.findColumnIndex(data.headers, ['Status', 'Estado']);
        const idxPhone = this.findColumnIndex(data.headers, ['Phone', 'Telefono', 'Tel']);
        const idxName = this.findColumnIndex(data.headers, ['Name', 'Nombre', 'Cliente']);
        const idxComment = this.findColumnIndex(data.headers, ['Comment', 'Comments', 'Comentario', 'Notas']);

        // Filtrar datos
        let filtered = data.data.map((row, idx) => ({ row, idx }));
        
        // Aplicar filtro de búsqueda
        if (this.myDataFilter) {
            const search = this.myDataFilter.toLowerCase();
            filtered = filtered.filter(({ row }) => 
                row.some(cell => String(cell).toLowerCase().includes(search))
            );
        }
        
        // Aplicar filtro de status
        if (this.myDataStatusFilter) {
            filtered = filtered.filter(({ row }) => {
                const status = (row[idxStatus] || '').toString().toUpperCase().trim();
                switch (this.myDataStatusFilter) {
                    case 'pending': return !status || status === 'NEW' || status === 'NUEVO';
                    case 'callback': return status === 'CB' || status === 'CALLBACK' || status === 'BUSY';
                    case 'po': return status === 'PO' || status.includes('PASS');
                    case 'sold': return status === 'SOLD' || status === 'CLOSED';
                    case 'na': return status === 'NA' || status === 'DISC' || status === 'DNC';
                    default: return true;
                }
            });
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <h4>Sin resultados</h4>
                    <p>No se encontraron leads con los filtros aplicados.</p>
                </div>
            `;
            return;
        }

        // Construir tabla completa con todas las columnas
        const displayHeaders = data.headers.slice(0, 10);
        
        let html = `
            <table class="operations-table full-table">
                <thead>
                    <tr>
                        <th class="col-id">#</th>
                        ${displayHeaders.map(h => `<th>${h}</th>`).join('')}
                        <th class="col-action">Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filtered.forEach(({ row, idx }, displayIdx) => {
            const status = row[idxStatus] || '';
            const statusClass = this.getStatusClass(status);

            html += `<tr data-idx="${idx}" class="${statusClass}">`;
            html += `<td class="col-id">${displayIdx + 1}</td>`;
            
            displayHeaders.forEach((h, i) => {
                const value = row[i] ?? '';
                const hLower = h.toLowerCase();
                
                if (hLower.includes('status') || hLower.includes('estado')) {
                    html += `<td>
                        <select class="status-select ${statusClass}" data-idx="${idx}" 
                                onchange="App.updateLeadStatus(${idx}, this.value)">
                            <option value="" ${!value ? 'selected' : ''}>--</option>
                            <option value="NEW" ${value === 'NEW' ? 'selected' : ''}>NEW</option>
                            <option value="CB" ${value === 'CB' ? 'selected' : ''}>CB</option>
                            <option value="NA" ${value === 'NA' ? 'selected' : ''}>NA</option>
                            <option value="BUSY" ${value === 'BUSY' ? 'selected' : ''}>BUSY</option>
                            <option value="DISC" ${value === 'DISC' ? 'selected' : ''}>DISC</option>
                            <option value="PO" ${value === 'PO' ? 'selected' : ''}>PO ⭐</option>
                            <option value="SOLD" ${value === 'SOLD' ? 'selected' : ''}>SOLD ✅</option>
                        </select>
                    </td>`;
                } else if (hLower.includes('comment') || hLower.includes('nota')) {
                    html += `<td>
                        <input type="text" class="comment-input" value="${value}" 
                               data-idx="${idx}" data-field="${h}"
                               onchange="App.updateLeadField(${idx}, ${i}, this.value)"
                               placeholder="Agregar nota...">
                    </td>`;
                } else if (hLower.includes('phone') || hLower.includes('tel')) {
                    html += `<td><a href="tel:${value}" class="phone-link">${value}</a></td>`;
                } else {
                    html += `<td>${value}</td>`;
                }
            });

            html += `
                <td class="col-action">
                    <div class="action-btns">
                        <button class="smart-btn call" onclick="App.callLead(${idx})" title="Llamar">📞</button>
                        <button class="smart-btn detail" onclick="App.showLeadDetail(${idx})" title="Ver detalle">👁️</button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        html += `<p class="text-muted text-center mt-2">Mostrando ${filtered.length} de ${data.data.length} registros</p>`;
        container.innerHTML = html;
    },

    filterMyData(value) {
        this.myDataFilter = value;
        this.renderMyDataTable();
    },

    filterMyDataByStatus(value) {
        this.myDataStatusFilter = value;
        this.renderMyDataTable();
    },

    updateLeadField(idx, headerIdx, value) {
        this.state.myData.data[idx][headerIdx] = value;
    },

    countByStatus(data, statuses) {
        const idxStatus = this.findColumnIndex(data.headers, ['Status', 'Estado']);
        return data.data.filter(row => {
            const status = (row[idxStatus] || '').toString().toUpperCase();
            return statuses.some(s => status.includes(s) || (s === '' && !status));
        }).length;
    },

    // renderMyLeadsTable has been replaced by renderMyDataTable

    callLead(idx) {
        const data = this.state.myData;
        const idxPhone = this.findColumnIndex(data.headers, ['Phone', 'Telefono']);
        const phone = data.data[idx][idxPhone];
        
        if (phone) {
            window.open(`tel:${phone}`, '_self');
        }
    },

    async saveMyChanges() {
        const data = this.state.myData;
        const user = Auth.getUser();

        // Recopilar cambios
        document.querySelectorAll('[data-idx]').forEach(el => {
            const idx = parseInt(el.dataset.idx);
            const field = el.dataset.field;
            const headerIdx = data.headers.indexOf(field);
            
            if (headerIdx !== -1) {
                data.data[idx][headerIdx] = el.value;
            }
        });

        UI.showLoading('Guardando cambios...');

        try {
            await api.saveTrackingData(user.name, data.headers, data.data);
            UI.showToast('Cambios guardados exitosamente', 'success');
        } catch (error) {
            UI.showToast('Error: ' + error.message, 'error');
        } finally {
            UI.hideLoading();
        }
    },

    renderStats(container) {
        const user = Auth.getUser();
        const data = this.state.myData;
        const stats = data ? this.calculateUserStats(data) : { total: 0, pending: 0, callback: 0, po: 0, sold: 0, na: 0 };
        
        // Calcular porcentajes
        const totalProcessed = stats.po + stats.sold + stats.na;
        const conversionRate = stats.total > 0 ? ((stats.po + stats.sold) / stats.total * 100).toFixed(1) : 0;
        const poRate = stats.total > 0 ? (stats.po / stats.total * 100).toFixed(1) : 0;
        const soldRate = stats.total > 0 ? (stats.sold / stats.total * 100).toFixed(1) : 0;

        container.innerHTML = `
            <div class="dashboard-header">
                <h2 class="dashboard-title">📊 Mi Dashboard</h2>
                <div class="dashboard-actions">
                    <button class="btn btn-secondary btn-sm" onclick="App.refreshMyData()">
                        🔄 Actualizar
                    </button>
                </div>
            </div>

            ${data ? `
                <!-- KPIs Principales -->
                <div class="dashboard-kpi-grid">
                    <div class="kpi-card primary">
                        <div class="kpi-icon">📋</div>
                        <div class="kpi-content">
                            <span class="kpi-value">${stats.total}</span>
                            <span class="kpi-label">Total Leads</span>
                        </div>
                    </div>
                    <div class="kpi-card success">
                        <div class="kpi-icon">📈</div>
                        <div class="kpi-content">
                            <span class="kpi-value">${conversionRate}%</span>
                            <span class="kpi-label">Tasa Conversión</span>
                        </div>
                    </div>
                    <div class="kpi-card gold">
                        <div class="kpi-icon">⭐</div>
                        <div class="kpi-content">
                            <span class="kpi-value">${stats.po}</span>
                            <span class="kpi-label">Pass Over</span>
                        </div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-icon">✅</div>
                        <div class="kpi-content">
                            <span class="kpi-value">${stats.sold}</span>
                            <span class="kpi-label">Cerrados</span>
                        </div>
                    </div>
                </div>

                <!-- Charts Row -->
                <div class="dashboard-charts-row">
                    <!-- Pipeline Chart -->
                    <div class="card chart-card">
                        <h3 class="chart-title">Pipeline de Leads</h3>
                        <div class="pipeline-bars">
                            <div class="pipeline-bar">
                                <span class="bar-label">Pendientes</span>
                                <div class="bar-track">
                                    <div class="bar-fill pending" style="width: ${stats.total > 0 ? (stats.pending / stats.total * 100) : 0}%"></div>
                                </div>
                                <span class="bar-value">${stats.pending}</span>
                            </div>
                            <div class="pipeline-bar">
                                <span class="bar-label">Callbacks</span>
                                <div class="bar-track">
                                    <div class="bar-fill callback" style="width: ${stats.total > 0 ? (stats.callback / stats.total * 100) : 0}%"></div>
                                </div>
                                <span class="bar-value">${stats.callback}</span>
                            </div>
                            <div class="pipeline-bar">
                                <span class="bar-label">Pass Over</span>
                                <div class="bar-track">
                                    <div class="bar-fill po" style="width: ${stats.total > 0 ? (stats.po / stats.total * 100) : 0}%"></div>
                                </div>
                                <span class="bar-value">${stats.po}</span>
                            </div>
                            <div class="pipeline-bar">
                                <span class="bar-label">Cerrados</span>
                                <div class="bar-track">
                                    <div class="bar-fill sold" style="width: ${stats.total > 0 ? (stats.sold / stats.total * 100) : 0}%"></div>
                                </div>
                                <span class="bar-value">${stats.sold}</span>
                            </div>
                            <div class="pipeline-bar">
                                <span class="bar-label">No Answer</span>
                                <div class="bar-track">
                                    <div class="bar-fill na" style="width: ${stats.total > 0 ? (stats.na / stats.total * 100) : 0}%"></div>
                                </div>
                                <span class="bar-value">${stats.na}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Progress Ring -->
                    <div class="card chart-card">
                        <h3 class="chart-title">Progreso del Día</h3>
                        <div class="progress-ring-container">
                            <div class="progress-ring">
                                <svg viewBox="0 0 100 100">
                                    <circle class="ring-bg" cx="50" cy="50" r="42"/>
                                    <circle class="ring-fill" cx="50" cy="50" r="42" 
                                            stroke-dasharray="${2.64 * (totalProcessed / (stats.total || 1) * 100)} 264"/>
                                </svg>
                                <div class="ring-text">
                                    <span class="ring-value">${stats.total > 0 ? Math.round(totalProcessed / stats.total * 100) : 0}%</span>
                                    <span class="ring-label">Procesado</span>
                                </div>
                            </div>
                            <div class="progress-legend">
                                <div class="legend-item">
                                    <span class="legend-dot po"></span>
                                    <span>PO: ${poRate}%</span>
                                </div>
                                <div class="legend-item">
                                    <span class="legend-dot sold"></span>
                                    <span>Sold: ${soldRate}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Performance Summary -->
                <div class="card">
                    <h3 class="card-title">Resumen de Rendimiento</h3>
                    <div class="performance-grid">
                        <div class="perf-item">
                            <span class="perf-label">Leads por procesar</span>
                            <span class="perf-value">${stats.pending + stats.callback}</span>
                        </div>
                        <div class="perf-item">
                            <span class="perf-label">Leads procesados</span>
                            <span class="perf-value">${totalProcessed}</span>
                        </div>
                        <div class="perf-item">
                            <span class="perf-label">Eficiencia (PO+Sold)</span>
                            <span class="perf-value highlight">${conversionRate}%</span>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <h3>Sin datos disponibles</h3>
                    <p>No tienes leads asignados aún para mostrar estadísticas.</p>
                </div>
            `}
        `;
    },

    // ============================================================
    // UTILIDADES
    // ============================================================

    findColumnIndex(headers, possibleNames) {
        if (!Array.isArray(possibleNames)) possibleNames = [possibleNames];
        for (let i = 0; i < headers.length; i++) {
            const headerNorm = (headers[i] || '').toString().toLowerCase().trim();
            for (const name of possibleNames) {
                if (headerNorm === name.toLowerCase() || headerNorm.includes(name.toLowerCase())) {
                    return i;
                }
            }
        }
        return -1;
    },

    async refreshData() {
        const user = Auth.getUser();
        await this.loadInitialData(user);
    },

    async logout() {
        try {
            await Auth.logout();
        } catch (e) {
            console.warn('Error during logout:', e);
        }
        // Siempre limpiar y mostrar login
        localStorage.removeItem('dm_token');
        localStorage.removeItem('dm_user');
        this.state = {
            currentView: 'dashboard',
            mainData: null,
            trackingData: {},
            isOnline: navigator.onLine,
            selectedLevel: 1
        };
        this.showLogin();
    }
};

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
