/**
 * Rutas de Sincronización
 * Sincronizar datos entre Main y archivos de Tracking
 */

const express = require('express');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '../../data');

// ============================================================
// HELPERS
// ============================================================

async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

async function readExcelFile(filePath) {
    const buffer = await fs.readFile(filePath);
    const workbook = XLSX.read(buffer, { cellStyles: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return { workbook, data, sheetName };
}

async function saveExcelFile(filePath, data, options = {}) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, options.sheetName || 'Sheet1');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true });
    await fs.writeFile(filePath, buffer);
}

function normalizeId(id) {
    if (!id) return '';
    return String(id).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumnIndex(headers, possibleNames) {
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
}

// ============================================================
// RUTAS DE SINCRONIZACIÓN
// ============================================================

/**
 * POST /api/sync/distribute
 * Distribuir leads a personas (crear archivos de tracking)
 */
router.post('/distribute', authenticateToken, requireRole(['Manager']), async (req, res) => {
    try {
        const { assignments, level = 1 } = req.body;
        // assignments: { "PersonName": [rowIndices], ... }

        if (!assignments || Object.keys(assignments).length === 0) {
            return res.status(400).json({ 
                error: 'Datos incompletos',
                message: 'Se requieren asignaciones'
            });
        }

        // Leer archivo Main
        const mainPath = path.join(DATA_PATH, 'Main');
        const mainFiles = await fs.readdir(mainPath);
        const mainFile = mainFiles.find(f => f.toLowerCase() === 'datos.xlsx') 
                      || mainFiles.find(f => f.match(/\.xlsx$/i));

        if (!mainFile) {
            return res.status(404).json({ 
                error: 'Archivo no encontrado',
                message: 'No existe archivo principal'
            });
        }

        const mainFilePath = path.join(mainPath, mainFile);
        const { data: mainData } = await readExcelFile(mainFilePath);
        const headers = mainData[0];

        // Encontrar índices de columnas importantes
        const idxAssigned = findColumnIndex(headers, ['AssignedTo', 'Asignado']);
        const idxLevel = findColumnIndex(headers, ['Level', 'Nivel']);
        const idxRole = findColumnIndex(headers, ['Role', 'Rol']);

        if (idxAssigned === -1) {
            return res.status(400).json({ 
                error: 'Columna no encontrada',
                message: 'No se encontró columna AssignedTo en el archivo principal'
            });
        }

        const results = {};
        const trackingPath = path.join(DATA_PATH, 'Tracking');

        // Procesar cada persona
        for (const [personName, rowIndices] of Object.entries(assignments)) {
            const role = level === 1 ? 'Analyst' : 'Coordinator';
            const personRows = [];

            // Actualizar Main y recopilar filas para tracking
            for (const rowIndex of rowIndices) {
                const dataRowIndex = rowIndex + 1; // +1 porque headers está en índice 0
                if (mainData[dataRowIndex]) {
                    // Actualizar en Main
                    mainData[dataRowIndex][idxAssigned] = personName;
                    if (idxLevel !== -1) mainData[dataRowIndex][idxLevel] = level;
                    if (idxRole !== -1) mainData[dataRowIndex][idxRole] = role;
                    
                    // Guardar para archivo de tracking
                    personRows.push([...mainData[dataRowIndex]]);
                }
            }

            // Crear/actualizar archivo de tracking
            if (personRows.length > 0) {
                const personPath = path.join(trackingPath, personName);
                await ensureDir(personPath);

                const timestamp = new Date().toISOString().slice(0,10);
                const trackingFileName = `${personName}_${timestamp}.xlsx`;
                const trackingFilePath = path.join(personPath, trackingFileName);

                // Verificar si existe archivo previo para agregar
                let existingData = [headers];
                try {
                    const existingFiles = await fs.readdir(personPath);
                    const latestFile = existingFiles
                        .filter(f => f.match(/\.xlsx$/i))
                        .sort()
                        .pop();
                    
                    if (latestFile) {
                        const { data: prevData } = await readExcelFile(path.join(personPath, latestFile));
                        existingData = prevData;
                    }
                } catch (e) {
                    // No hay archivo previo, usar solo headers
                }

                // Agregar nuevas filas
                const finalData = [...existingData, ...personRows];
                await saveExcelFile(trackingFilePath, finalData);

                results[personName] = {
                    assigned: personRows.length,
                    fileName: trackingFileName
                };
            }
        }

        // Guardar Main actualizado
        await saveExcelFile(mainFilePath, mainData);

        res.json({
            success: true,
            message: 'Distribución completada exitosamente',
            results
        });

    } catch (error) {
        console.error('Error en distribución:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo completar la distribución'
        });
    }
});

/**
 * POST /api/sync/update
 * Sincronizar actualizaciones de archivos de tracking al Main
 */
router.post('/update', authenticateToken, requireRole(['Manager']), async (req, res) => {
    try {
        const { mode = 'update' } = req.body; // 'update' o 'release'

        const negativeKeywords = ['NA', 'NS', 'DISC', 'ACB', 'NO SALE', 'DISCONNECTED', 'NO ANSWER', 'ALL CIRCUITS'];

        // Leer archivo Main
        const mainPath = path.join(DATA_PATH, 'Main');
        const mainFiles = await fs.readdir(mainPath);
        const mainFile = mainFiles.find(f => f.toLowerCase() === 'datos.xlsx') 
                      || mainFiles.find(f => f.match(/\.xlsx$/i));

        if (!mainFile) {
            return res.status(404).json({ 
                error: 'Archivo no encontrado',
                message: 'No existe archivo principal'
            });
        }

        const mainFilePath = path.join(mainPath, mainFile);
        const { data: mainData } = await readExcelFile(mainFilePath);
        const mainHeaders = mainData[0];

        // Índices en Main
        const idxMainID = findColumnIndex(mainHeaders, ['ID', 'Folio']);
        const idxMainStatus = findColumnIndex(mainHeaders, ['Status', 'Estado', 'Estatus']);
        const idxMainAssigned = findColumnIndex(mainHeaders, ['AssignedTo', 'Asignado']);
        const idxMainComments = findColumnIndex(mainHeaders, ['Comments_Analyst', 'Comentarios', 'Comments']);

        if (idxMainID === -1) {
            return res.status(400).json({ 
                error: 'Columna no encontrada',
                message: 'No se encontró columna ID en el archivo principal'
            });
        }

        // Crear mapa de IDs -> índice de fila
        const mainIdMap = new Map();
        for (let i = 1; i < mainData.length; i++) {
            const id = normalizeId(mainData[i][idxMainID]);
            if (id) mainIdMap.set(id, i);
        }

        const historyLog = [];
        const stats = { poPromoted: 0, naReleased: 0, updates: 0 };
        const filesToSave = {};

        // Leer todos los archivos de Tracking
        const trackingPath = path.join(DATA_PATH, 'Tracking');
        await ensureDir(trackingPath);
        const trackingDirs = await fs.readdir(trackingPath, { withFileTypes: true });

        for (const dir of trackingDirs) {
            if (!dir.isDirectory()) continue;

            const personName = dir.name;
            const personPath = path.join(trackingPath, personName);
            const personFiles = await fs.readdir(personPath);
            const xlsxFiles = personFiles.filter(f => f.match(/\.xlsx$/i));

            if (xlsxFiles.length === 0) continue;

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

            const trackingFilePath = path.join(personPath, latestFile);
            const { data: trackingData } = await readExcelFile(trackingFilePath);
            const trackingHeaders = trackingData[0];

            // Índices en Tracking
            const idxTrkID = findColumnIndex(trackingHeaders, ['ID', 'Folio']);
            const idxTrkStatus = findColumnIndex(trackingHeaders, ['Status', 'Estado', 'Estatus']);
            const idxTrkComments = findColumnIndex(trackingHeaders, ['Comments_Analyst', 'Comentarios', 'Comments']);

            if (idxTrkID === -1 || idxTrkStatus === -1) continue;

            const rowsToKeep = [trackingHeaders];
            let fileModified = false;

            // Procesar filas
            for (let i = 1; i < trackingData.length; i++) {
                const row = trackingData[i];
                const idVal = normalizeId(row[idxTrkID]);
                const statusVal = (row[idxTrkStatus] || '').toString().toUpperCase().trim();
                const commentVal = idxTrkComments !== -1 ? row[idxTrkComments] : '';

                const mainRowIdx = mainIdMap.get(idVal);
                if (!mainRowIdx) {
                    rowsToKeep.push(row);
                    continue;
                }

                let removeRow = false;

                // LOGIC A: PO HANDLING
                if (mode === 'update' && (statusVal.includes('PO') || statusVal.includes('PASS OVER'))) {
                    mainData[mainRowIdx][idxMainStatus] = 'PO';
                    mainData[mainRowIdx][idxMainAssigned] = '';

                    historyLog.push({
                        Date: new Date().toISOString().slice(0,10),
                        ID: idVal,
                        User: personName,
                        Action: 'PO_RELEASED',
                        Status: statusVal,
                        Note: 'Released for manager review'
                    });

                    stats.poPromoted++;
                    stats.updates++;
                    removeRow = true;
                    fileModified = true;
                }
                // LOGIC B: RELEASE NEGATIVE
                else if (mode === 'release' && negativeKeywords.some(s => statusVal.includes(s))) {
                    if (idxMainStatus !== -1) mainData[mainRowIdx][idxMainStatus] = statusVal;
                    mainData[mainRowIdx][idxMainAssigned] = '';

                    historyLog.push({
                        Date: new Date().toISOString().slice(0,10),
                        ID: idVal,
                        User: personName,
                        Action: 'RELEASED_NEGATIVE',
                        Status: statusVal,
                        Note: 'Returned to pool'
                    });

                    stats.naReleased++;
                    stats.updates++;
                    removeRow = true;
                    fileModified = true;
                }
                // LOGIC C: STANDARD UPDATE
                else if (mode === 'update') {
                    if (statusVal && idxMainStatus !== -1) {
                        mainData[mainRowIdx][idxMainStatus] = statusVal;
                    }
                    if (commentVal && idxMainComments !== -1) {
                        mainData[mainRowIdx][idxMainComments] = commentVal;
                    }
                    stats.updates++;
                }

                if (!removeRow) {
                    rowsToKeep.push(row);
                }
            }

            // Marcar archivo para guardar si fue modificado
            if (fileModified) {
                filesToSave[personName] = {
                    path: trackingFilePath,
                    data: rowsToKeep,
                    name: latestFile
                };
            }
        }

        // Guardar archivos de tracking modificados
        for (const [personName, fileData] of Object.entries(filesToSave)) {
            await saveExcelFile(fileData.path, fileData.data);
        }

        // Guardar Main actualizado
        await saveExcelFile(mainFilePath, mainData);

        // Guardar log en Historical
        if (historyLog.length > 0) {
            const histPath = path.join(DATA_PATH, 'Historical');
            await ensureDir(histPath);

            const timeStr = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
            const logFileName = `History_Log_${timeStr}.xlsx`;
            const logFilePath = path.join(histPath, logFileName);

            const logHeaders = ['Date', 'ID', 'User', 'Action', 'Status', 'Note'];
            const logData = [logHeaders, ...historyLog.map(h => [h.Date, h.ID, h.User, h.Action, h.Status, h.Note])];
            await saveExcelFile(logFilePath, logData);
        }

        res.json({
            success: true,
            message: 'Sincronización completada',
            stats,
            filesUpdated: Object.keys(filesToSave).length,
            historyEntries: historyLog.length
        });

    } catch (error) {
        console.error('Error en sincronización:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo completar la sincronización'
        });
    }
});

/**
 * POST /api/sync/promote
 * Promover leads de Level 1 a Level 2 (PO -> Coordinator)
 */
router.post('/promote', authenticateToken, requireRole(['Manager']), async (req, res) => {
    try {
        const { leadIds, coordinatorName } = req.body;

        if (!leadIds || !coordinatorName) {
            return res.status(400).json({ 
                error: 'Datos incompletos',
                message: 'Se requieren leadIds y coordinatorName'
            });
        }

        // Leer archivo Main
        const mainPath = path.join(DATA_PATH, 'Main');
        const mainFiles = await fs.readdir(mainPath);
        const mainFile = mainFiles.find(f => f.toLowerCase() === 'datos.xlsx') 
                      || mainFiles.find(f => f.match(/\.xlsx$/i));

        if (!mainFile) {
            return res.status(404).json({ 
                error: 'Archivo no encontrado',
                message: 'No existe archivo principal'
            });
        }

        const mainFilePath = path.join(mainPath, mainFile);
        const { data: mainData } = await readExcelFile(mainFilePath);
        const headers = mainData[0];

        const idxID = findColumnIndex(headers, ['ID', 'Folio']);
        const idxAssigned = findColumnIndex(headers, ['AssignedTo', 'Asignado']);
        const idxLevel = findColumnIndex(headers, ['Level', 'Nivel']);
        const idxRole = findColumnIndex(headers, ['Role', 'Rol']);
        const idxStatus = findColumnIndex(headers, ['Status', 'Estado']);

        const promotedRows = [];
        let promotedCount = 0;

        for (let i = 1; i < mainData.length; i++) {
            const rowId = normalizeId(mainData[i][idxID]);
            if (leadIds.map(id => normalizeId(id)).includes(rowId)) {
                mainData[i][idxAssigned] = coordinatorName;
                if (idxLevel !== -1) mainData[i][idxLevel] = 2;
                if (idxRole !== -1) mainData[i][idxRole] = 'Coordinator';
                if (idxStatus !== -1) mainData[i][idxStatus] = 'Promoted';
                
                promotedRows.push([...mainData[i]]);
                promotedCount++;
            }
        }

        // Crear archivo de tracking para Coordinator
        if (promotedRows.length > 0) {
            const trackingPath = path.join(DATA_PATH, 'Tracking', coordinatorName);
            await ensureDir(trackingPath);

            const timestamp = new Date().toISOString().slice(0,10);
            const trackingFileName = `${coordinatorName}_L2_${timestamp}.xlsx`;
            
            // Verificar archivo existente
            let existingData = [headers];
            try {
                const existingFiles = await fs.readdir(trackingPath);
                const latestFile = existingFiles
                    .filter(f => f.match(/\.xlsx$/i))
                    .sort()
                    .pop();
                
                if (latestFile) {
                    const { data: prevData } = await readExcelFile(path.join(trackingPath, latestFile));
                    existingData = prevData;
                }
            } catch (e) { }

            const finalData = [...existingData, ...promotedRows];
            await saveExcelFile(path.join(trackingPath, trackingFileName), finalData);
        }

        // Guardar Main
        await saveExcelFile(mainFilePath, mainData);

        res.json({
            success: true,
            message: `${promotedCount} leads promovidos a Level 2`,
            promoted: promotedCount,
            coordinator: coordinatorName
        });

    } catch (error) {
        console.error('Error en promoción:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo completar la promoción'
        });
    }
});

/**
 * POST /api/sync/process-rawdata
 * Procesar archivos de RawData e ingestar al Main
 */
router.post('/process-rawdata', authenticateToken, requireRole(['Manager']), async (req, res) => {
    try {
        const rawPath = path.join(DATA_PATH, 'RawData');
        const mainPath = path.join(DATA_PATH, 'Main');
        
        await ensureDir(rawPath);
        await ensureDir(mainPath);

        // Leer archivos RawData
        const rawFiles = await fs.readdir(rawPath);
        const xlsxFiles = rawFiles.filter(f => f.match(/\.(xlsx|xls|csv)$/i));

        if (xlsxFiles.length === 0) {
            return res.json({
                success: true,
                message: 'No hay archivos en RawData para procesar',
                added: 0
            });
        }

        // Leer o crear archivo Main
        let mainData = [];
        const mainFiles = await fs.readdir(mainPath);
        const mainFile = mainFiles.find(f => f.toLowerCase() === 'datos.xlsx') 
                      || mainFiles.find(f => f.match(/\.xlsx$/i));

        // Headers estándar
        const STANDARD_HEADERS = [
            'ID', 'Phone', 'FirstName', 'LastName', 'Address', 'City', 'State', 'ZipCode',
            'Classification', 'Level', 'Status', 'AssignedTo', 'Role', 
            'Comments_Analyst', 'Comments_Coordinator', 'Comments_Manager', 'LeadSource'
        ];

        if (mainFile) {
            const { data } = await readExcelFile(path.join(mainPath, mainFile));
            mainData = data;
        } else {
            mainData = [STANDARD_HEADERS];
        }

        const headers = mainData[0];
        const idxPhone = findColumnIndex(headers, ['Phone', 'Telefono', 'Number']);
        
        // Set de teléfonos existentes
        const existingPhones = new Set();
        for (let i = 1; i < mainData.length; i++) {
            const phone = (mainData[i][idxPhone] || '').toString().replace(/\D/g, '');
            if (phone) existingPhones.add(phone);
        }

        let maxID = mainData.length - 1;
        let totalAdded = 0;
        const processedFiles = [];

        // Procesar cada archivo RawData
        for (const fileName of xlsxFiles) {
            const filePath = path.join(rawPath, fileName);
            const { data: rawData } = await readExcelFile(filePath);
            let addedFromFile = 0;

            for (let i = 0; i < rawData.length; i++) {
                const row = rawData[i];
                // Asumiendo formato Data25: [Phone, Name, LastName, Address, City, State, Zip]
                const rawPhone = (row[0] || '').toString().replace(/\D/g, '');
                
                if (!rawPhone || rawPhone.length < 7) continue;
                if (existingPhones.has(rawPhone)) continue;

                maxID++;
                existingPhones.add(rawPhone);

                const newRow = new Array(headers.length).fill('');
                const idxID = findColumnIndex(headers, ['ID']);
                const idxPhoneH = findColumnIndex(headers, ['Phone']);
                const idxFirstName = findColumnIndex(headers, ['FirstName']);
                const idxLastName = findColumnIndex(headers, ['LastName']);
                const idxAddress = findColumnIndex(headers, ['Address']);
                const idxCity = findColumnIndex(headers, ['City']);
                const idxState = findColumnIndex(headers, ['State']);
                const idxZip = findColumnIndex(headers, ['ZipCode']);
                const idxClass = findColumnIndex(headers, ['Classification']);
                const idxLevel = findColumnIndex(headers, ['Level']);
                const idxSource = findColumnIndex(headers, ['LeadSource']);

                if (idxID !== -1) newRow[idxID] = maxID;
                if (idxPhoneH !== -1) newRow[idxPhoneH] = rawPhone;
                if (idxFirstName !== -1) newRow[idxFirstName] = (row[1] || '').toString().trim();
                if (idxLastName !== -1) newRow[idxLastName] = (row[2] || '').toString().trim();
                if (idxAddress !== -1) newRow[idxAddress] = (row[3] || '').toString().trim();
                if (idxCity !== -1) newRow[idxCity] = (row[4] || '').toString().trim();
                if (idxState !== -1) newRow[idxState] = (row[5] || '').toString().trim();
                if (idxZip !== -1) newRow[idxZip] = (row[6] || '').toString().trim();
                if (idxClass !== -1) newRow[idxClass] = 'New';
                if (idxLevel !== -1) newRow[idxLevel] = 1;
                if (idxSource !== -1) newRow[idxSource] = fileName;

                mainData.push(newRow);
                addedFromFile++;
                totalAdded++;
            }

            processedFiles.push({ name: fileName, added: addedFromFile });

            // Mover archivo procesado a Historical
            const histPath = path.join(DATA_PATH, 'Historical');
            await ensureDir(histPath);
            const timestamp = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
            const archiveName = `Processed_${timestamp}_${fileName}`;
            await fs.rename(filePath, path.join(histPath, archiveName));
        }

        // Guardar Main actualizado
        await saveExcelFile(path.join(mainPath, 'Datos.xlsx'), mainData);

        res.json({
            success: true,
            message: `Procesados ${xlsxFiles.length} archivos, ${totalAdded} registros nuevos agregados`,
            added: totalAdded,
            files: processedFiles
        });

    } catch (error) {
        console.error('Error procesando RawData:', error);
        res.status(500).json({ 
            error: 'Error del servidor',
            message: 'No se pudo procesar RawData'
        });
    }
});

module.exports = router;
