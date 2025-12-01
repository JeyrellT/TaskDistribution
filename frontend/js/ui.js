/**
 * UI Module - Distribution Manager PWA
 * Componentes y utilidades de interfaz
 */

const UI = {
    // Toast notifications
    toasts: [],

    // Mostrar toast
    showToast(message, type = 'info', duration = 5000) {
        const container = document.getElementById('toast-container') || this.createToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${this.getToastIcon(type)}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;
        
        container.appendChild(toast);
        
        // Auto-remove
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
        
        return toast;
    },

    createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    },

    getToastIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    },

    // Mostrar loading overlay
    showLoading(message = 'Cargando...') {
        let overlay = document.getElementById('loading-overlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="spinner"></div>
                <p class="loading-text">${message}</p>
            `;
            document.body.appendChild(overlay);
        } else {
            overlay.querySelector('.loading-text').textContent = message;
            overlay.style.display = 'flex';
        }
    },

    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    },

    // Modal
    showModal(options) {
        const { title, content, footer, onClose, size = 'normal' } = options;
        
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal ${size === 'large' ? 'modal-lg' : ''}">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button class="modal-close" aria-label="Cerrar">×</button>
                </div>
                <div class="modal-body">
                    ${typeof content === 'string' ? content : ''}
                </div>
                ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
            </div>
        `;

        // Si content es elemento DOM
        if (typeof content !== 'string') {
            overlay.querySelector('.modal-body').appendChild(content);
        }

        document.body.appendChild(overlay);

        // Mostrar con animación
        requestAnimationFrame(() => {
            overlay.classList.add('show');
        });

        // Cerrar
        const closeModal = () => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
                if (onClose) onClose();
            }, 300);
        };

        overlay.querySelector('.modal-close').onclick = closeModal;
        overlay.onclick = (e) => {
            if (e.target === overlay) closeModal();
        };

        return {
            close: closeModal,
            element: overlay
        };
    },

    // Confirmar acción
    confirm(message, title = 'Confirmar') {
        return new Promise((resolve) => {
            const modal = this.showModal({
                title,
                content: `<p>${message}</p>`,
                footer: `
                    <button class="btn btn-secondary" data-action="cancel">Cancelar</button>
                    <button class="btn btn-primary" data-action="confirm">Confirmar</button>
                `
            });

            modal.element.querySelector('[data-action="cancel"]').onclick = () => {
                modal.close();
                resolve(false);
            };

            modal.element.querySelector('[data-action="confirm"]').onclick = () => {
                modal.close();
                resolve(true);
            };
        });
    },

    // Alert
    alert(message, title = 'Aviso') {
        return new Promise((resolve) => {
            const modal = this.showModal({
                title,
                content: `<p>${message}</p>`,
                footer: `
                    <button class="btn btn-primary" data-action="ok">Aceptar</button>
                `
            });

            modal.element.querySelector('[data-action="ok"]').onclick = () => {
                modal.close();
                resolve();
            };
        });
    },

    // Renderizar tabla de datos
    renderDataTable(container, data, options = {}) {
        const {
            headers,
            columns,
            onRowClick,
            selectable = false,
            pageSize = 50
        } = options;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <h3>Sin datos</h3>
                    <p>No hay registros para mostrar</p>
                </div>
            `;
            return;
        }

        const displayHeaders = headers || Object.keys(data[0]);
        
        let html = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            ${selectable ? '<th><input type="checkbox" class="select-all"></th>' : ''}
                            ${displayHeaders.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach((row, idx) => {
            html += `<tr data-index="${idx}" ${onRowClick ? 'style="cursor:pointer"' : ''}>`;
            
            if (selectable) {
                html += `<td><input type="checkbox" class="row-select" data-index="${idx}"></td>`;
            }

            displayHeaders.forEach(header => {
                const value = row[header] ?? '';
                html += `<td>${this.formatCellValue(value, header)}</td>`;
            });

            html += '</tr>';
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;

        // Event handlers
        if (onRowClick) {
            container.querySelectorAll('tbody tr').forEach(tr => {
                tr.onclick = (e) => {
                    if (e.target.type !== 'checkbox') {
                        onRowClick(data[parseInt(tr.dataset.index)], parseInt(tr.dataset.index));
                    }
                };
            });
        }

        if (selectable) {
            const selectAll = container.querySelector('.select-all');
            const rowSelects = container.querySelectorAll('.row-select');
            
            selectAll.onchange = () => {
                rowSelects.forEach(cb => cb.checked = selectAll.checked);
            };
        }
    },

    formatCellValue(value, header) {
        if (value === null || value === undefined) return '';
        
        // Formatear status
        const headerLower = header.toLowerCase();
        if (headerLower.includes('status') || headerLower.includes('estado')) {
            return this.getStatusBadge(value);
        }
        
        // Formatear level
        if (headerLower === 'level' || headerLower === 'nivel') {
            return `<span class="status-badge ${value == 1 ? 'new' : 'active'}">Level ${value}</span>`;
        }

        return String(value);
    },

    getStatusBadge(status) {
        const statusLower = String(status).toLowerCase();
        let badgeClass = '';
        
        if (statusLower.includes('new') || statusLower.includes('nuevo')) {
            badgeClass = 'new';
        } else if (statusLower.includes('po') || statusLower.includes('pass')) {
            badgeClass = 'po';
        } else if (statusLower.includes('sold') || statusLower.includes('closed')) {
            badgeClass = 'sold';
        } else if (statusLower.includes('na') || statusLower.includes('disc')) {
            badgeClass = 'na';
        } else {
            badgeClass = 'active';
        }

        return `<span class="status-badge ${badgeClass}">${status}</span>`;
    },

    // Actualizar estado de conexión
    updateConnectionStatus(isOnline) {
        const indicator = document.getElementById('connection-status');
        if (!indicator) return;

        if (isOnline) {
            indicator.className = 'connection-status online';
            indicator.innerHTML = `
                <span class="connection-dot"></span>
                <span>Conectado</span>
            `;
        } else {
            indicator.className = 'connection-status offline';
            indicator.innerHTML = `
                <span class="connection-dot"></span>
                <span>Sin conexión</span>
            `;
        }

        // Banner offline
        let banner = document.getElementById('offline-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'offline-banner';
            banner.className = 'offline-banner';
            banner.textContent = '⚠️ Sin conexión al servidor. Los cambios se guardarán cuando se restablezca la conexión.';
            document.body.insertBefore(banner, document.body.firstChild);
        }

        if (isOnline) {
            banner.classList.remove('show');
            document.body.classList.remove('offline');
        } else {
            banner.classList.add('show');
            document.body.classList.add('offline');
        }
    },

    // Formatear bytes
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Formatear fecha
    formatDate(date, includeTime = false) {
        const d = new Date(date);
        const options = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };
        
        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
        }
        
        return d.toLocaleString('es-CR', options);
    },

    // Animar número
    animateNumber(element, target, duration = 1000) {
        const start = parseInt(element.textContent) || 0;
        const increment = (target - start) / (duration / 16);
        let current = start;
        
        const animate = () => {
            current += increment;
            if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
                element.textContent = target;
                return;
            }
            element.textContent = Math.round(current);
            requestAnimationFrame(animate);
        };
        
        animate();
    }
};

// Exportar
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UI;
}
