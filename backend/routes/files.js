/**
 * Rutas de Manejo de Archivos
 * CRUD de archivos Excel en el sistema
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken, requireRole, canAccessPerson } = require('../middleware/auth');

const router = express.Router();

// Directorio base de datos
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '../../data');

// Configuración de Multer para subida de archivos
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];
        if (allowedTypes.includes(file.mimetype) || 
            file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV'));
        }
    }
});

// ============================================================
// HELPERS
// ============================================================

/**
 * Asegura que un directorio existe
 */
async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

/**
 * Lee un archivo Excel y devuelve datos JSON
 */
async function readExcelFile(filePath) {
    const buffer = await fs.readFile(filePath);
    const workbook = XLSX.read(buffer, { cellStyles: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return { workbook, data, sheetName };
}

/**
 * Guarda datos como archivo Excel
 */
async function saveExcelFile(filePath, data, options = {}) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, options.sheetName || 'Sheet1');
    
    if (options.colWidths) {
        ws['!cols'] = options.colWidths;
    }
    
    const buffer = XLSX.write(wb, { 
        bookType: 'xlsx', 
        type: 'buffer',
        cellStyles: true 
    });
    
    await fs.writeFile(filePath, buffer);
    return true;
}

// ============================================================
// RUTAS - ESTRUCTURA DE CARPETAS
// ============================================================

/**
 * GET /api/files/structure
 * Obtener estructura de carpetas y archivos
 */
router.get('/structure', authenticateToken, async (req, res) => {
    try {
        const structure = {
            Main: [],
            Tracking: {},
            RawData: [],
            Historical: []
        };

        // Leer carpeta Main
        const mainPath = path.join(DATA_PATH, 'Main');
        await ensureDir(mainPath);
        const mainFiles = await fs.readdir(mainPath);
        for (const file of mainFiles) {
            if (file.match(/\.(xlsx|xls|csv)$/i)) {
                const stat = await fs.stat(path.join(mainPath, file));
                structure.Main.push({
                    name: file,
                    size: stat.size,
                    modified: stat.mtime
                });
            }
        }

        // Leer carpeta Tracking (con subcarpetas por persona)
        const trackingPath = path.join(DATA_PATH, 'Tracking');
        await ensureDir(trackingPath);
        const trackingEntries = await fs.readdir(trackingPath, { withFileTypes: true });
        
        for (const entry of trackingEntries) {
            if (entry.isDirectory()) {
                // Subcarpeta de persona
                const personPath = path.join(trackingPath, entry.name);
                const personFiles = await fs.readdir(personPath);
                structure.Tracking[entry.name] = [];
                
                for (const file of personFiles) {
                    if (file.match(/\.(xlsx|xls)$/i)) {
                        const stat = await fs.stat(path.join(personPath, file));
                        structure.Tracking[entry.name].push({
                            name: file,
                            size: stat.size,
                            modified: stat.mtime
                        });
                    }
                }
            } else if (entry.isFile() && entry.name.match(/\.(xlsx|xls)$/i)) {
                // Archivo en raíz de Tracking
                const stat = await fs.stat(path.join(trackingPath, entry.name));
                if (!structure.Tracking['_root']) structure.Tracking['_root'] = [];
                structure.Tracking['_root'].push({
                    name: entry.name,
                    size: stat.size,
                    modified: stat.mtime
                });
            }
        }

        // Leer carpeta RawData
        const rawPath = path.join(DATA_PATH, 'RawData');
        await ensureDir(rawPath);
        const rawFiles = await fs.readdir(rawPath);
        for (const file of rawFiles) {
            if (file.match(/\.(xlsx|xls|csv)$/i)) {
                const stat = await fs.stat(path.join(rawPath, file));
                structure.RawData.push({
                    name: file,
                    size: stat.size,
                    modified: stat.mtime
                });
            }
        }

        // Leer carpeta Historical
        const histPath = path.join(DATA_PATH, 'Historical');
        await ensureDir(histPath);
        const histFiles = await fs.readdir(histPath);
        for (const file of histFiles) {
            if (file.match(/\.(xlsx|xls)$/i)) {
                const stat = await fs.stat(path.join(histPath, file));
                structure.Historical.push({
                    name: file,
                    size: stat.size,
                    modified: stat.mtime
                });
            }
        }

        res.json({
            success: true,
            structure
        });

    } catch (error) {
        console.error('Error leyendo estructura:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo leer la estructura de archivos'
        });
    }
});

// ============================================================
// RUTAS - ARCHIVO PRINCIPAL (MAIN)
// ============================================================

/**
 * GET /api/files/main
 * Obtener datos del archivo principal (Datos.xlsx)
 */
router.get('/main', authenticateToken, async (req, res) => {
    try {
        const mainPath = path.join(DATA_PATH, 'Main');
        await ensureDir(mainPath);
        
        // Buscar archivo Datos.xlsx o el primer Excel
        const files = await fs.readdir(mainPath);
        const mainFile = files.find(f => f.toLowerCase() === 'datos.xlsx') 
                      || files.find(f => f.match(/\.xlsx$/i));

        if (!mainFile) {
            return res.json({
                success: true,
                exists: false,
                message: 'No existe archivo principal'
            });
        }

        const filePath = path.join(mainPath, mainFile);
        const { data } = await readExcelFile(filePath);

        res.json({
            success: true,
            exists: true,
            fileName: mainFile,
            headers: data[0] || [],
            data: data.slice(1),
            totalRows: data.length - 1
        });

    } catch (error) {
        console.error('Error leyendo Main:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo leer el archivo principal'
        });
    }
});

/**
 * POST /api/files/main
 * Guardar/actualizar archivo principal
 */
router.post('/main', authenticateToken, requireRole(['Manager']), async (req, res) => {
    try {
        const { headers, data, fileName = 'Datos.xlsx' } = req.body;

        if (!headers || !data) {
            return res.status(400).json({ 
                error: 'Datos incompletos',
                message: 'Se requieren headers y data'
            });
        }

        const mainPath = path.join(DATA_PATH, 'Main');
        await ensureDir(mainPath);

        const fullData = [headers, ...data];
        const filePath = path.join(mainPath, fileName);
        
        await saveExcelFile(filePath, fullData);

        res.json({
            success: true,
            message: 'Archivo principal guardado exitosamente',
            fileName
        });

    } catch (error) {
        console.error('Error guardando Main:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo guardar el archivo principal'
        });
    }
});

// ============================================================
// RUTAS - ARCHIVOS DE TRACKING
// ============================================================

/**
 * GET /api/files/tracking/:personName
 * Obtener archivo de tracking de una persona
 */
router.get('/tracking/:personName', authenticateToken, canAccessPerson, async (req, res) => {
    try {
        const { personName } = req.params;
        const trackingPath = path.join(DATA_PATH, 'Tracking', personName);
        
        try {
            await fs.access(trackingPath);
        } catch {
            return res.json({
                success: true,
                exists: false,
                message: `No existe carpeta de tracking para ${personName}`
            });
        }

        const files = await fs.readdir(trackingPath);
        const xlsxFiles = files.filter(f => f.match(/\.xlsx$/i));

        if (xlsxFiles.length === 0) {
            return res.json({
                success: true,
                exists: false,
                message: `No hay archivos de tracking para ${personName}`
            });
        }

        // Obtener el archivo más reciente
        let latestFile = null;
        let latestTime = 0;

        for (const file of xlsxFiles) {
            const stat = await fs.stat(path.join(trackingPath, file));
            if (stat.mtimeMs > latestTime) {
                latestTime = stat.mtimeMs;
                latestFile = file;
            }
        }

        const filePath = path.join(trackingPath, latestFile);
        const { data } = await readExcelFile(filePath);

        res.json({
            success: true,
            exists: true,
            personName,
            fileName: latestFile,
            headers: data[0] || [],
            data: data.slice(1),
            totalRows: data.length - 1,
            allFiles: xlsxFiles
        });

    } catch (error) {
        console.error('Error leyendo Tracking:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo leer el archivo de tracking'
        });
    }
});

/**
 * POST /api/files/tracking/:personName
 * Guardar archivo de tracking de una persona
 */
router.post('/tracking/:personName', authenticateToken, canAccessPerson, async (req, res) => {
    try {
        const { personName } = req.params;
        const { headers, data, fileName } = req.body;

        if (!headers || !data) {
            return res.status(400).json({ 
                error: 'Datos incompletos',
                message: 'Se requieren headers y data'
            });
        }

        const trackingPath = path.join(DATA_PATH, 'Tracking', personName);
        await ensureDir(trackingPath);

        const finalFileName = fileName || `${personName}_tracking.xlsx`;
        const fullData = [headers, ...data];
        const filePath = path.join(trackingPath, finalFileName);
        
        await saveExcelFile(filePath, fullData);

        res.json({
            success: true,
            message: `Archivo de tracking guardado para ${personName}`,
            fileName: finalFileName
        });

    } catch (error) {
        console.error('Error guardando Tracking:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo guardar el archivo de tracking'
        });
    }
});

/**
 * GET /api/files/tracking-all
 * Obtener todos los archivos de tracking (solo Manager)
 */
router.get('/tracking-all', authenticateToken, requireRole(['Manager']), async (req, res) => {
    try {
        const trackingPath = path.join(DATA_PATH, 'Tracking');
        await ensureDir(trackingPath);
        
        const result = {};
        const entries = await fs.readdir(trackingPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const personPath = path.join(trackingPath, entry.name);
                const files = await fs.readdir(personPath);
                const xlsxFiles = files.filter(f => f.match(/\.xlsx$/i));

                if (xlsxFiles.length > 0) {
                    // Obtener archivo más reciente
                    let latestFile = xlsxFiles[0];
                    let latestTime = 0;

                    for (const file of xlsxFiles) {
                        const stat = await fs.stat(path.join(personPath, file));
                        if (stat.mtimeMs > latestTime) {
                            latestTime = stat.mtimeMs;
                            latestFile = file;
                        }
                    }

                    const filePath = path.join(personPath, latestFile);
                    const { data } = await readExcelFile(filePath);

                    result[entry.name] = {
                        fileName: latestFile,
                        headers: data[0] || [],
                        data: data.slice(1),
                        totalRows: data.length - 1
                    };
                }
            }
        }

        res.json({
            success: true,
            tracking: result
        });

    } catch (error) {
        console.error('Error leyendo todos los Tracking:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo leer los archivos de tracking'
        });
    }
});

// ============================================================
// RUTAS - UPLOAD DE ARCHIVOS
// ============================================================

/**
 * POST /api/files/upload/rawdata
 * Subir archivo a RawData
 */
router.post('/upload/rawdata', authenticateToken, requireRole(['Manager']), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                error: 'Archivo requerido',
                message: 'No se recibió ningún archivo'
            });
        }

        const rawPath = path.join(DATA_PATH, 'RawData');
        await ensureDir(rawPath);

        const fileName = req.file.originalname;
        const filePath = path.join(rawPath, fileName);

        await fs.writeFile(filePath, req.file.buffer);

        res.json({
            success: true,
            message: 'Archivo subido a RawData exitosamente',
            fileName
        });

    } catch (error) {
        console.error('Error subiendo archivo:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo subir el archivo'
        });
    }
});

/**
 * GET /api/files/rawdata
 * Obtener lista de archivos en RawData
 */
router.get('/rawdata', authenticateToken, requireRole(['Manager']), async (req, res) => {
    try {
        const rawPath = path.join(DATA_PATH, 'RawData');
        await ensureDir(rawPath);

        const files = await fs.readdir(rawPath);
        const fileList = [];

        for (const file of files) {
            if (file.match(/\.(xlsx|xls|csv)$/i)) {
                const stat = await fs.stat(path.join(rawPath, file));
                fileList.push({
                    name: file,
                    size: stat.size,
                    modified: stat.mtime
                });
            }
        }

        res.json({
            success: true,
            files: fileList
        });

    } catch (error) {
        console.error('Error leyendo RawData:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo leer la carpeta RawData'
        });
    }
});

/**
 * GET /api/files/rawdata/:fileName
 * Obtener contenido de un archivo de RawData
 */
router.get('/rawdata/:fileName', authenticateToken, requireRole(['Manager']), async (req, res) => {
    try {
        const { fileName } = req.params;
        const filePath = path.join(DATA_PATH, 'RawData', fileName);

        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ 
                error: 'No encontrado',
                message: 'El archivo no existe'
            });
        }

        const { data } = await readExcelFile(filePath);

        res.json({
            success: true,
            fileName,
            headers: data[0] || [],
            data: data.slice(1),
            totalRows: data.length - 1
        });

    } catch (error) {
        console.error('Error leyendo archivo RawData:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo leer el archivo'
        });
    }
});

/**
 * DELETE /api/files/rawdata/:fileName
 * Eliminar archivo de RawData (después de procesar)
 */
router.delete('/rawdata/:fileName', authenticateToken, requireRole(['Manager']), async (req, res) => {
    try {
        const { fileName } = req.params;
        const filePath = path.join(DATA_PATH, 'RawData', fileName);

        await fs.unlink(filePath);

        res.json({
            success: true,
            message: `Archivo ${fileName} eliminado de RawData`
        });

    } catch (error) {
        console.error('Error eliminando archivo:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo eliminar el archivo'
        });
    }
});

// ============================================================
// RUTAS - HISTORICAL
// ============================================================

/**
 * POST /api/files/historical
 * Guardar archivo en Historical
 */
router.post('/historical', authenticateToken, async (req, res) => {
    try {
        const { headers, data, fileName } = req.body;

        if (!headers || !data || !fileName) {
            return res.status(400).json({ 
                error: 'Datos incompletos',
                message: 'Se requieren headers, data y fileName'
            });
        }

        const histPath = path.join(DATA_PATH, 'Historical');
        await ensureDir(histPath);

        const fullData = [headers, ...data];
        const filePath = path.join(histPath, fileName);
        
        await saveExcelFile(filePath, fullData);

        res.json({
            success: true,
            message: 'Log guardado en Historical',
            fileName
        });

    } catch (error) {
        console.error('Error guardando en Historical:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo guardar en Historical'
        });
    }
});

/**
 * GET /api/files/historical
 * Obtener lista de archivos históricos
 */
router.get('/historical', authenticateToken, requireRole(['Manager']), async (req, res) => {
    try {
        const histPath = path.join(DATA_PATH, 'Historical');
        await ensureDir(histPath);

        const files = await fs.readdir(histPath);
        const fileList = [];

        for (const file of files) {
            if (file.match(/\.xlsx$/i)) {
                const stat = await fs.stat(path.join(histPath, file));
                fileList.push({
                    name: file,
                    size: stat.size,
                    modified: stat.mtime
                });
            }
        }

        // Ordenar por fecha descendente
        fileList.sort((a, b) => new Date(b.modified) - new Date(a.modified));

        res.json({
            success: true,
            files: fileList
        });

    } catch (error) {
        console.error('Error leyendo Historical:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo leer la carpeta Historical'
        });
    }
});

module.exports = router;
