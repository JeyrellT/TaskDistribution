# 🚀 GUÍA RÁPIDA DE INICIO

## Instalación en 5 minutos

### 1. Instalar Node.js
Descarga e instala desde: https://nodejs.org/ (versión LTS)

### 2. Configurar el proyecto
```bash
cd distribution-manager-pwa/backend
npm install
# Alternativa multiplataforma: crea .env desde .env.example y instala dependencias
# macOS / Linux
cp .env.example .env
# Windows (cmd.exe)
copy .env.example .env
# O bien usa el script incluido para simplificarlo (recomendado):
npm run setup
```

### 3. Editar .env
Abre `.env` con un editor de texto y cambia:
- `LAN_IP`: Tu IP en la red (ej: 192.168.1.100)
- `JWT_SECRET`: Una clave secreta larga
- `USERS`: Tus usuarios (ya vienen ejemplos)

### 4. Iniciar servidor
```bash
npm start
```

### 5. Acceder
- **PC**: http://localhost:3000
- **Celular (VPN)**: http://TU_IP:3000

---

## Usuarios por defecto

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| manager | Manager2024! | Manager |
| analista1 | Analista2024! | Analyst |
| coord1 | Coord2024! | Coordinator |

---

## Estructura de carpetas de datos

```
data/
├── Main/           → Archivo principal (Datos.xlsx)
├── Tracking/       → Carpetas por usuario
│   ├── Juan/
│   └── Maria/
├── RawData/        → Archivos nuevos a procesar
└── Historical/     → Logs y backups
```

---

## Comandos útiles

```bash
# Iniciar en desarrollo (auto-reload)
npm run dev

# Iniciar en producción
npm start

# Ver logs
# Los logs aparecen en la consola donde corre el servidor
```

---

## ¿Problemas?

1. ¿Node.js instalado? → `node --version`
2. ¿Dependencias instaladas? → `npm install`
3. ¿Puerto ocupado? → Cambia PORT en .env
4. ¿Firewall bloqueando? → Abre el puerto 3000

Lee el README.md completo para más detalles.
