/**
 * Rutas de Autenticación
 * Login, logout, verificación de sesión
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_cambiar_en_produccion';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// Cargar usuarios desde variable de entorno
let USERS = [];
try {
    USERS = JSON.parse(process.env.USERS || '[]');
    // Hash passwords si no están hasheados (primera ejecución)
    USERS = USERS.map(user => {
        if (!user.password.startsWith('$2')) {
            return { ...user, password: bcrypt.hashSync(user.password, 10) };
        }
        return user;
    });
} catch (e) {
    console.error('Error cargando usuarios:', e);
    // Usuarios por defecto para desarrollo
    USERS = [
        { 
            username: 'admin', 
            password: bcrypt.hashSync('admin123', 10), 
            role: 'Manager', 
            name: 'Administrador' 
        }
    ];
}

/**
 * POST /api/auth/login
 * Iniciar sesión
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Datos incompletos',
                message: 'Usuario y contraseña son requeridos'
            });
        }

        // Buscar usuario
        const user = USERS.find(u => u.username.toLowerCase() === username.toLowerCase());
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas',
                message: 'Usuario o contraseña incorrectos'
            });
        }

        // Verificar contraseña
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas',
                message: 'Usuario o contraseña incorrectos'
            });
        }

        // Generar token JWT
        const tokenPayload = {
            username: user.username,
            role: user.role,
            name: user.name
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { 
            expiresIn: JWT_EXPIRES_IN 
        });

        // Establecer cookie httpOnly para mayor seguridad
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 8 * 60 * 60 * 1000 // 8 horas
        });

        res.json({
            success: true,
            message: 'Inicio de sesión exitoso',
            user: {
                username: user.username,
                name: user.name,
                role: user.role
            },
            token // También enviar token para almacenar en localStorage (apps móviles)
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'Error al procesar la solicitud de inicio de sesión'
        });
    }
});

/**
 * POST /api/auth/logout
 * Cerrar sesión
 */
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ 
        success: true,
        message: 'Sesión cerrada exitosamente'
    });
});

/**
 * GET /api/auth/me
 * Obtener información del usuario actual
 */
router.get('/me', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            username: req.user.username,
            name: req.user.name,
            role: req.user.role
        }
    });
});

/**
 * GET /api/auth/verify
 * Verificar si el token es válido
 */
router.get('/verify', authenticateToken, (req, res) => {
    res.json({ 
        valid: true,
        user: {
            username: req.user.username,
            name: req.user.name,
            role: req.user.role
        }
    });
});

/**
 * GET /api/auth/users
 * Obtener lista de usuarios (solo Manager)
 */
router.get('/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'Manager') {
        return res.status(403).json({ 
            error: 'Acceso denegado',
            message: 'Solo el Manager puede ver la lista de usuarios'
        });
    }

    const usersList = USERS.map(u => ({
        username: u.username,
        name: u.name,
        role: u.role
    }));

    res.json({
        success: true,
        users: usersList
    });
});

module.exports = router;
