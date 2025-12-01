/**
 * Middleware de Autenticación JWT
 * Verifica tokens y permisos de usuario
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_cambiar_en_produccion';

/**
 * Middleware para verificar token JWT
 */
const authenticateToken = (req, res, next) => {
    // Buscar token en header Authorization o en cookie
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];
    const tokenFromCookie = req.cookies?.token;
    
    const token = tokenFromHeader || tokenFromCookie;

    if (!token) {
        return res.status(401).json({ 
            error: 'Acceso denegado',
            message: 'Token de autenticación requerido'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token expirado',
                message: 'Tu sesión ha expirado, por favor inicia sesión nuevamente'
            });
        }
        return res.status(403).json({ 
            error: 'Token inválido',
            message: 'No se pudo verificar el token de autenticación'
        });
    }
};

/**
 * Middleware para verificar rol específico
 * @param {string[]} allowedRoles - Array de roles permitidos
 */
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'No autenticado',
                message: 'Debes iniciar sesión primero'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Permiso denegado',
                message: `Se requiere rol: ${allowedRoles.join(' o ')}`
            });
        }

        next();
    };
};

/**
 * Middleware para verificar que el usuario puede acceder a archivos de una persona
 * Manager puede ver todo, otros solo sus propios archivos
 */
const canAccessPerson = (req, res, next) => {
    const { personName } = req.params;
    const { user } = req;

    // Manager puede acceder a todo
    if (user.role === 'Manager') {
        return next();
    }

    // Otros usuarios solo pueden acceder a sus propios archivos
    if (personName && personName.toLowerCase() !== user.name.toLowerCase()) {
        return res.status(403).json({ 
            error: 'Acceso denegado',
            message: 'Solo puedes acceder a tus propios archivos'
        });
    }

    next();
};

module.exports = {
    authenticateToken,
    requireRole,
    canAccessPerson
};
