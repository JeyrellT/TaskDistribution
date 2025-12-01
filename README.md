# Distribution Manager PWA

Sistema de gestión y distribución de leads como Progressive Web App (PWA).
Diseñado para funcionar en computadora y Android, conectándose directamente a tu LAN a través de VPN.

**Desarrollado por:** JC Analytics  
**Autor:** Jeyrell Tardencilla

---

## 📋 Tabla de Contenidos

1. [Características](#características)
2. [Arquitectura](#arquitectura)
3. [Requisitos](#requisitos)
4. [Instalación en el Servidor](#instalación-en-el-servidor)
5. [Configuración](#configuración)
6. [Acceso desde Computadora](#acceso-desde-computadora)
7. [Acceso desde Android (VPN)](#acceso-desde-android-vpn)
8. [Uso de la Aplicación](#uso-de-la-aplicación)
9. [Solución de Problemas](#solución-de-problemas)
10. [Estructura del Proyecto](#estructura-del-proyecto)

---

## ✨ Características

- **PWA Completa**: Instalable en Android y escritorio
- **Funciona Offline**: Cache de datos con Service Worker
- **Seguridad JWT**: Autenticación con tokens seguros
- **Multi-rol**: Manager, Analyst, Coordinator
- **Sincronización**: Archivos Excel sincronizados entre usuarios
- **Compatible con VPN UDP**: Conexión directa a la LAN

---

## 🏗 Arquitectura

```
┌─────────────────┐     VPN UDP      ┌─────────────────┐
│   Android/PC    │◄────────────────►│   Servidor LAN  │
│   (PWA Client)  │                  │   (Node.js)     │
└─────────────────┘                  └────────┬────────┘
                                              │
                                     ┌────────▼────────┐
                                     │   Carpeta Data  │
                                     │  ├── Main/      │
                                     │  ├── Tracking/  │
                                     │  ├── RawData/   │
                                     │  └── Historical/│
                                     └─────────────────┘
```

---

## 📌 Requisitos

### Servidor (PC en la LAN)
- **Node.js** 18+ (https://nodejs.org/)
- **Windows 10/11** o **Linux**
- **IP fija** en la red local (ej: 192.168.1.100)

### Cliente Android
- **Android 11+** (probado)
- **Chrome** o **Edge** actualizado
- **VPN UDP** configurada y conectada

### Cliente PC
- Navegador moderno (Chrome, Edge, Firefox)

---

## 🚀 Instalación en el Servidor

### Paso 1: Preparar el entorno

```bash
# Clonar o copiar el proyecto
cd /ruta/donde/quieras/instalar

# Si descargaste el ZIP, descomprimirlo aquí
unzip distribution-manager-pwa.zip
cd distribution-manager-pwa
```

### Paso 2: Instalar dependencias

```bash
cd backend
npm install
```

### Paso 3: Configurar el archivo .env

```bash
# Copiar el archivo de ejemplo (macOS / Linux)
cp .env.example .env

# Windows (cmd.exe)
copy .env.example .env

# Alternativa recomendada: usa el script de setup que crea .env (si falta) e instala dependencias
npm run setup

# Editar con tu configuración
nano .env  # o usa notepad en Windows
```

### Paso 4: Configuración del archivo .env

```env
# Puerto del servidor (no cambiar si no es necesario)
PORT=3000
HOST=0.0.0.0

# IMPORTANTE: Cambiar esta clave en producción
JWT_SECRET=tu_clave_secreta_muy_larga_y_aleatoria_12345678901234567890

# Ruta donde se guardarán los archivos Excel
# En Windows: C:\\Users\\TuUsuario\\Documents\\DistributionData
# En Linux: /home/usuario/distribution-data
DATA_PATH=./data

# Tu IP en la red local (la que usará el VPN)
LAN_IP=192.168.1.100

# Usuarios del sistema (formato JSON)
USERS=[
  {"username":"manager","password":"Manager2024!","role":"Manager","name":"Gerente Principal"},
  {"username":"analista1","password":"Analista2024!","role":"Analyst","name":"Juan Perez"},
  {"username":"analista2","password":"Analista2024!","role":"Analyst","name":"Maria Lopez"},
  {"username":"coord1","password":"Coord2024!","role":"Coordinator","name":"Carlos Garcia"}
]

# Orígenes permitidos (tu IP de LAN)
ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.100:3000
```

### Paso 5: Crear estructura de carpetas de datos

```bash
# El servidor crea las carpetas automáticamente, pero puedes crearlas manualmente:
mkdir -p data/Main data/Tracking data/RawData data/Historical
```

### Paso 6: Iniciar el servidor

```bash
# Modo desarrollo (con auto-reload)
npm run dev

# Modo producción
npm start
```

Verás algo como:
```
╔════════════════════════════════════════════════════════════╗
║     DISTRIBUTION MANAGER PWA - Backend Server              ║
║     Developed by JC Analytics                              ║
╠════════════════════════════════════════════════════════════╣
║  🌐 Servidor corriendo en: http://0.0.0.0:3000
║  📱 Acceso LAN/VPN: http://192.168.1.100:3000
║  📂 Directorio de datos: ./data
╚════════════════════════════════════════════════════════════╝
```

### Paso 7: Configurar Firewall (Windows)

```powershell
# Abrir PowerShell como Administrador y ejecutar:
New-NetFirewallRule -DisplayName "Distribution Manager" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

En Linux:
```bash
sudo ufw allow 3000/tcp
```

---

## 💻 Acceso desde Computadora

1. Abre tu navegador
2. Ve a `http://192.168.1.100:3000` (usa tu IP real)
3. Inicia sesión con tus credenciales
4. **Opcional**: Instala como PWA:
   - Chrome: Clic en el ícono de instalar en la barra de direcciones
   - Edge: Menú → Apps → Instalar este sitio como aplicación

---

## 📱 Acceso desde Android (VPN)

### Requisitos previos
1. VPN UDP configurada y funcionando
2. El teléfono debe poder hacer ping a tu servidor

### Verificar conexión VPN

1. Conecta la VPN en tu Android
2. Abre una app de terminal (como Termux) o usa un ping tester
3. Verifica que puedas acceder a tu servidor:
   ```
   ping 192.168.1.100
   ```

### Instalar la PWA en Android

1. **Conecta la VPN** en tu teléfono
2. Abre **Chrome** en Android
3. Ve a `http://192.168.1.100:3000`
4. Espera a que cargue completamente
5. Chrome mostrará un banner "Agregar a pantalla de inicio"
   - Si no aparece: Menú (⋮) → "Agregar a pantalla de inicio"
6. Dale un nombre y confirma
7. ¡Listo! Tendrás un ícono en tu pantalla de inicio

### Notas importantes para Android 11+

- La PWA **SOLO funciona con VPN activa**
- No usa archivos locales del teléfono
- Todos los datos se guardan en el servidor
- Si pierdes conexión VPN, la app mostrará datos cacheados (solo lectura)

---

## 📖 Uso de la Aplicación

### Roles y Permisos

| Función | Manager | Analyst | Coordinator |
|---------|:-------:|:-------:|:-----------:|
| Ver Dashboard | ✅ | ❌ | ❌ |
| Distribuir Leads | ✅ | ❌ | ❌ |
| Sincronizar | ✅ | ❌ | ❌ |
| Procesar RawData | ✅ | ❌ | ❌ |
| Ver mis leads | ✅ | ✅ | ✅ |
| Editar mis leads | ❌ | ✅ | ✅ |

### Flujo de Trabajo

1. **Manager** sube archivos a RawData
2. **Manager** procesa RawData (agrega al Main)
3. **Manager** distribuye leads a Analysts (Level 1)
4. **Analysts** trabajan sus leads, marcan PO/NA
5. **Manager** sincroniza y promueve POs a Level 2
6. **Manager** asigna POs a Coordinators
7. **Coordinators** cierran las ventas

### Estados de Leads

- `NEW`: Nuevo, sin contactar
- `CB`: Callback pendiente
- `NA`: No Answer
- `DISC`: Disconnected
- `PO`: Pass Over (oportunidad)
- `SOLD`: Venta cerrada

---

## 🔧 Solución de Problemas

### "No puedo conectar desde Android"

1. ¿Está la VPN conectada? Verifica el ícono de VPN
2. ¿Puedes hacer ping al servidor? Prueba con una app de ping
3. ¿El firewall permite el puerto 3000?
4. ¿El servidor está corriendo? Revisa la consola

### "Error de autenticación"

1. Verifica usuario y contraseña en el archivo .env
2. Las contraseñas son case-sensitive
3. Revisa que el JWT_SECRET no tenga caracteres especiales problemáticos

### "La PWA no se instala"

1. Asegúrate de acceder por HTTP (no HTTPS) si no tienes certificado
2. La URL debe ser exacta: `http://IP:3000` (sin trailing slash)
3. Espera a que la página cargue completamente
4. Limpia cache del navegador y recarga

### "Los cambios no se guardan"

1. Verifica que tengas conexión al servidor
2. Revisa los permisos de escritura en la carpeta data/
3. Mira la consola del servidor por errores

### "Error: ENOENT no such file"

1. Asegúrate de que la carpeta DATA_PATH existe
2. El servidor tiene permisos de escritura
3. Crea manualmente: `mkdir -p data/Main data/Tracking data/RawData data/Historical`

---

## 📁 Estructura del Proyecto

```
distribution-manager-pwa/
├── backend/
│   ├── server.js           # Servidor Express principal
│   ├── package.json        # Dependencias Node.js
│   ├── .env.example        # Plantilla de configuración
│   ├── middleware/
│   │   └── auth.js         # Middleware de autenticación
│   └── routes/
│       ├── auth.js         # Rutas de login/logout
│       ├── files.js        # CRUD de archivos Excel
│       └── sync.js         # Sincronización de datos
│
├── frontend/
│   ├── index.html          # HTML principal
│   ├── manifest.json       # Configuración PWA
│   ├── sw.js               # Service Worker
│   ├── css/
│   │   ├── main.css        # Estilos principales
│   │   └── components.css  # Estilos de componentes
│   ├── js/
│   │   ├── app.js          # Aplicación principal
│   │   ├── api.js          # Cliente API
│   │   ├── auth.js         # Módulo de autenticación
│   │   └── ui.js           # Componentes de UI
│   └── icons/              # Iconos PWA
│
├── data/                   # Datos de la aplicación
│   ├── Main/               # Archivo principal (Datos.xlsx)
│   ├── Tracking/           # Archivos por usuario
│   │   ├── Usuario1/
│   │   └── Usuario2/
│   ├── RawData/            # Archivos a procesar
│   └── Historical/         # Logs históricos
│
└── README.md               # Esta documentación
```

---

## 🔐 Seguridad

### Recomendaciones para Producción

1. **Cambiar JWT_SECRET**: Usa una cadena aleatoria de 64+ caracteres
2. **Contraseñas fuertes**: Mínimo 12 caracteres, mayúsculas, números, símbolos
3. **HTTPS**: Configura un certificado SSL si expones al internet
4. **Backup**: Programa backups automáticos de la carpeta data/
5. **Logs**: Revisa los logs del servidor regularmente

### Generar JWT_SECRET seguro

```bash
# En Linux/Mac:
openssl rand -base64 64

# En Node.js:
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

---

## 🆘 Soporte

Para soporte o consultas:
- **LinkedIn**: [Jeyrell Tardencilla](https://www.linkedin.com/in/jeyrelltardencilla/)
- **Email**: Contactar vía LinkedIn

---

## 📜 Licencia

Propiedad de JC Analytics. Derechos reservados.  
Uso exclusivo autorizado. Prohibida la venta sin autorización.

---

*Documentación actualizada: 2024*
