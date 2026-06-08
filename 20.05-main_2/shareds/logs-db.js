// shareds/logs-db.js
// База данных для логов, сессий и проектов (без КС-2)

const db = require('./db');
const { run, query, getOne, getLastInsertId, createTableIfNotExists, addColumnIfNotExists } = db;

// Увеличенный таймаут для тяжёлых запросов
const LONG_TIMEOUT_MS = 60000; // 60 секунд

// ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С МОСКОВСКИМ ВРЕМЕНЕМ ====================
function getMoscowISOString() {
    const date = new Date();
    const moscowTime = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    return moscowTime.toISOString();
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
async function initLogsDatabase() {
    await addColumnIfNotExists('sessions', 'is_ks2', 'INT DEFAULT 0');
    await createTableIfNotExists('sessions', `
        CREATE TABLE sessions (
            id INT IDENTITY(1,1) PRIMARY KEY,
            session_id NVARCHAR(100) UNIQUE,
            user_name NVARCHAR(255),
            user_institution NVARCHAR(255),
            user_ip NVARCHAR(50),
            filename NVARCHAR(255),
            estimate_name NVARCHAR(500),
            is_revised INT DEFAULT 0,
            total_codes INT,
            found_codes INT,
            not_found_codes INT,
            exact_matches INT DEFAULT 0,
            table_matches INT DEFAULT 0,
            section_matches INT DEFAULT 0,
            collection_matches INT DEFAULT 0,
            chapter_matches INT DEFAULT 0,
            relation_matches INT DEFAULT 0,
            parent_matches INT DEFAULT 0,
            sbornik_matches INT DEFAULT 0,
            text_lines INT DEFAULT 0,
            restoration_codes INT DEFAULT 0,
            has_coefficient_count INT DEFAULT 0,
            coefficient_matches INT DEFAULT 0,
            coefficient_mismatches INT DEFAULT 0,
            total_amount FLOAT,
            status NVARCHAR(20),
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE()),
            updated_at DATETIME2,
            project_id INT NULL
        )
    `);

    await createTableIfNotExists('code_details', `
        CREATE TABLE code_details (
            id INT IDENTITY(1,1) PRIMARY KEY,
            session_id NVARCHAR(100),
            position INT,
            row_number INT,
            position_number NVARCHAR(50),
            code NVARCHAR(MAX),
            extracted_code NVARCHAR(255),
            status NVARCHAR(50),
            match_type NVARCHAR(50),
            matched_level NVARCHAR(50),
            is_restoration INT DEFAULT 0,
            is_text INT DEFAULT 0,
            has_comment INT DEFAULT 0,
            is_duplicate INT DEFAULT 0,
            duplicate_count INT DEFAULT 0,
            has_coefficient INT DEFAULT 0,
            coefficient_type NVARCHAR(20) DEFAULT 'none',
            coefficient_value FLOAT,
            expected_coefficient FLOAT,
            coefficient_match INT DEFAULT 0,
            description NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE())
        )
    `);

    await createTableIfNotExists('admin_actions', `
        CREATE TABLE admin_actions (
            id INT IDENTITY(1,1) PRIMARY KEY,
            admin_name NVARCHAR(100),
            action_type NVARCHAR(50),
            target_type NVARCHAR(50),
            target_id INT,
            details NVARCHAR(MAX),
            ip NVARCHAR(50),
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE())
        )
    `);

    await createTableIfNotExists('api_logs', `
        CREATE TABLE api_logs (
            id INT IDENTITY(1,1) PRIMARY KEY,
            method NVARCHAR(10),
            endpoint NVARCHAR(255),
            status_code INT,
            duration_ms INT,
            ip NVARCHAR(50),
            user_agent NVARCHAR(255),
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE())
        )
    `);

    await createTableIfNotExists('user_projects', `
        CREATE TABLE user_projects (
            id INT IDENTITY(1,1) PRIMARY KEY,
            user_id INT NOT NULL,
            project_name NVARCHAR(500) NOT NULL,
            filename NVARCHAR(255),
            estimate_name NVARCHAR(500),
            status NVARCHAR(20) DEFAULT 'active',
            current_session_id NVARCHAR(100),
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE()),
            updated_at DATETIME2,
            archived_at DATETIME2
        )
    `);
    // В файле shareds/logs-db.js
// Найди функцию async function initLogsDatabase() {
// И в самом конце, перед последней } добавь:

    // Таблица для деталей позиций (ЗП, ЭМ, МР, НР, СП)
    await createTableIfNotExists('position_details', `
        CREATE TABLE position_details (
            id INT IDENTITY(1,1) PRIMARY KEY,
            session_id NVARCHAR(100) NOT NULL,
            position_id INT NOT NULL,
            detail_type NVARCHAR(50) NOT NULL,
            detail_name NVARCHAR(500),
            amount FLOAT DEFAULT 0,
            quantity FLOAT,
            unit NVARCHAR(50),
            row_number INT,
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE())
        )
    `);

    // Таблица для МР деталей
    await createTableIfNotExists('mr_details', `
        CREATE TABLE mr_details (
            id INT IDENTITY(1,1) PRIMARY KEY,
            session_id NVARCHAR(100) NOT NULL,
            position_id INT NOT NULL,
            material_name NVARCHAR(500),
            amount FLOAT DEFAULT 0,
            quantity FLOAT,
            unit NVARCHAR(50),
            row_number INT,
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE())
        )
    `);
    await createTableIfNotExists('ks2_items', `
    CREATE TABLE ks2_items (
        id INT IDENTITY(1,1) PRIMARY KEY,
        session_id NVARCHAR(100) NOT NULL,
        file_name NVARCHAR(255) NOT NULL,
        ks2_file_index INT DEFAULT 1,
        position INT NOT NULL,
        ks2_position_number NVARCHAR(50),
        estimate_position_number NVARCHAR(50),
        code NVARCHAR(255),
        name NVARCHAR(MAX),
        unit NVARCHAR(50),
        quantity FLOAT,
        price FLOAT,
        total FLOAT,
        coefficient FLOAT,
        coeff_main FLOAT,
        coeff_winter FLOAT,
        coeff_recalc FLOAT,
        row_number INT,
        created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE()),
        updated_at DATETIME2,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
    )
`);

    // ==================== ДОБАВЛЕНИЕ НЕДОСТАЮЩИХ КОЛОНОК ====================
    await addColumnIfNotExists('sessions', 'coefficient_matches', 'INT DEFAULT 0');
    await addColumnIfNotExists('sessions', 'coefficient_mismatches', 'INT DEFAULT 0');
    await addColumnIfNotExists('code_details', 'has_coefficient', 'INT DEFAULT 0');
    await addColumnIfNotExists('code_details', 'coefficient_type', "NVARCHAR(20) DEFAULT 'none'");
    await addColumnIfNotExists('code_details', 'coefficient_value', 'FLOAT');
    await addColumnIfNotExists('code_details', 'expected_coefficient', 'FLOAT');
    await addColumnIfNotExists('code_details', 'coefficient_match', 'INT DEFAULT 0');
    await addColumnIfNotExists('sessions', 'project_id', 'INT NULL');
    await addColumnIfNotExists('code_details', 'is_main_row', 'INT DEFAULT 1');
    await addColumnIfNotExists('code_details', 'total_amount', 'FLOAT');
    await addColumnIfNotExists('code_details', 'quantity', 'FLOAT');
    await addColumnIfNotExists('code_details', 'unit', 'NVARCHAR(50)');
    await addColumnIfNotExists('code_details', 'price', 'FLOAT');
    await addColumnIfNotExists('code_details', 'name', 'NVARCHAR(MAX)');
    await addColumnIfNotExists('code_details', 'status_category', 'NVARCHAR(20)');
    await addColumnIfNotExists('code_details', 'volume', 'FLOAT');
    await addColumnIfNotExists('code_details', 'formatted_volume', 'NVARCHAR(200)');
    await addColumnIfNotExists('sessions', 'total_mr_amount', 'FLOAT');
    await addColumnIfNotExists('sessions', 'total_mr_rows', 'INT DEFAULT 0');
    await addColumnIfNotExists('sessions', 'positions_with_mr', 'INT DEFAULT 0');
    await addColumnIfNotExists('ks2_items', 'volume', 'NVARCHAR(200)');
    await addColumnIfNotExists('ks2_items', 'details_json', 'NVARCHAR(MAX)');
    await addColumnIfNotExists('ks2_items', 'extracted_code', 'NVARCHAR(255)');
    await addColumnIfNotExists('ks2_items', 'expected_coefficient', 'FLOAT');
    await addColumnIfNotExists('ks2_items', 'coefficient_match', 'INT DEFAULT 0');
    await addColumnIfNotExists('ks2_items', 'status', 'NVARCHAR(50)');
    await addColumnIfNotExists('ks2_items', 'status_category', 'NVARCHAR(20)');
    await addColumnIfNotExists('ks2_items', 'description', 'NVARCHAR(MAX)');

    await createTableIfNotExists('ks2_item_details', `
        CREATE TABLE ks2_item_details (
            id INT IDENTITY(1,1) PRIMARY KEY,
            session_id NVARCHAR(100) NOT NULL,
            item_id INT NOT NULL,
            detail_type NVARCHAR(50) NOT NULL,
            detail_name NVARCHAR(500),
            amount FLOAT DEFAULT 0,
            quantity FLOAT,
            unit NVARCHAR(50),
            row_number INT,
            created_at DATETIME2 DEFAULT DATEADD(hour, 3, GETUTCDATE())
        )
    `);
    try { await run(`CREATE INDEX idx_ks2_item_details_session ON ks2_item_details(session_id)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_ks2_item_details_item ON ks2_item_details(item_id)`); } catch(e) {}

    // ==================== ИНДЕКСЫ ====================
    try { await run(`CREATE INDEX idx_sessions_project_id ON sessions (project_id)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_sessions_user_name ON sessions (user_name)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_sessions_created_at ON sessions (created_at)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_user_projects_user_id ON user_projects (user_id)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_user_projects_status ON user_projects (status)`); } catch(e) {}
    try { await run(`CREATE INDEX idx_code_details_session_id ON code_details (session_id)`); } catch(e) {}
try { await run(`CREATE INDEX idx_ks2_items_session ON ks2_items(session_id)`); } catch(e) {}
try { await run(`CREATE INDEX idx_ks2_items_file ON ks2_items(file_name)`); } catch(e) {}

}

// ==================== СЕССИИ ====================
// shareds/logs-db.js

async function createSession(sessionId, data) {
   
    
    const result = await run(`
        INSERT INTO sessions (
            session_id, user_name, user_institution, user_ip, filename, estimate_name,
            is_revised, total_codes, found_codes, not_found_codes,
            exact_matches, table_matches, section_matches, collection_matches,
            chapter_matches, relation_matches, parent_matches, sbornik_matches,
            text_lines, restoration_codes, has_coefficient_count,
            coefficient_matches, coefficient_mismatches,
            total_amount, status, project_id, is_ks2,
            total_mr_amount, total_mr_rows, positions_with_mr
        ) VALUES (
            @p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9,
            @p10, @p11, @p12, @p13, @p14, @p15, @p16, @p17,
            @p18, @p19, @p20, @p21, @p22, @p23, @p24, @p25, @p26,
            @p27, @p28, @p29
        )
    `, [
        sessionId,
        data.user?.fullname || null,
        data.user?.institution || null,
        data.ip,
        data.filename,
        data.estimateName,
        data.isRevised ? 1 : 0,
        data.totalCodes || 0,
        data.foundCodes || 0,
        data.notFoundCodes || 0,
        data.exactMatches || 0,
        data.tableMatches || 0,
        data.sectionMatches || 0,
        data.collectionMatches || 0,
        data.chapterMatches || 0,
        data.relationMatches || 0,
        data.parentMatches || 0,
        data.sbornikMatches || 0,
        data.textLines || 0,
        data.restorationCodes || 0,
        data.hasCoefficientCount || 0,
        data.coefficientMatches || 0,
        data.coefficientMismatches || 0,
        data.totalAmount || 0,
        data.status || 'completed',
        data.project_id || null,
        data.is_ks2 || 0,
        data.totalMrAmount || 0,
        data.totalMrRows || 0,
        data.positionsWithMr || 0
    ]);
    
    return sessionId;
}

async function updateSessionStats(sessionId, data) {
    const updates = [];
    const params = [];
    const fields = [
        'total_codes', 'found_codes', 'not_found_codes',
        'exact_matches', 'table_matches', 'section_matches', 'collection_matches',
        'chapter_matches', 'relation_matches', 'parent_matches',
        'text_lines', 'restoration_codes', 'has_coefficient_count',
        'coefficient_matches', 'coefficient_mismatches', 'total_amount', 'status'
    ];
    for (const field of fields) {
        if (data[field] !== undefined) {
            updates.push(`${field} = @p${params.length}`);
            params.push(data[field]);
        }
    }
    if (updates.length === 0) return;
    updates.push('updated_at = DATEADD(hour, 3, GETUTCDATE())');
    params.push(sessionId);
    await run(`UPDATE sessions SET ${updates.join(', ')} WHERE session_id = @p${params.length-1}`, params);
}

async function updateSessionStatus(sessionId, status, totalAmount = null) {
    if (totalAmount !== null) {
        await run(`UPDATE sessions SET status = @p0, total_amount = @p1, updated_at = DATEADD(hour, 3, GETUTCDATE()) WHERE session_id = @p2`, [status, totalAmount, sessionId]);
    } else {
        await run(`UPDATE sessions SET status = @p0, updated_at = DATEADD(hour, 3, GETUTCDATE()) WHERE session_id = @p1`, [status, sessionId]);
    }
}


function encodeCoefficientMatch(value) {
    if (value === true) return 1;
    if (value === false) return -1;
    return 0;
}

function decodeCoefficientMatch(value) {
    if (value === 1) return true;
    if (value === -1) return false;
    return null;
}

function deriveStatusCategory(c) {
    if (c.status_category) return c.status_category;
    if (c.is_text === 1 || c.match_type === 'text') return 'text';
    if (c.is_restoration === 1 || c.status === 'Нельзя применять') return 'notallowed';
    if (c.coefficient_match === -1) return 'warning';
    if (c.status === 'Обратите внимание') {
        if (c.description && c.description.includes('Понижающий коэффициент')) return 'ok';
        return 'warning';
    }
    if (c.status === 'НЕ НАЙДЕН') return 'warning';
    return 'ok';
}

function mapPositionDetails(details) {
    return (details || []).map(d => ({
        type: d.detail_type,
        name: d.detail_name,
        amount: d.amount,
        quantity: d.quantity,
        unit: d.unit,
        rowNumber: d.row_number
    }));
}

function mapMrDetails(mrDetails) {
    return (mrDetails || []).map(m => ({
        type: 'МР',
        name: m.material_name,
        amount: m.amount,
        quantity: m.quantity,
        unit: m.unit,
        rowNumber: m.row_number
    }));
}

function transformCodeRow(c, details = [], mrDetails = []) {
    const coeffMatch = decodeCoefficientMatch(c.coefficient_match);
    const statusCategory = deriveStatusCategory(c);
    const mappedDetails = mapPositionDetails(details);
    const mappedMrDetails = mapMrDetails(mrDetails);
    const mrTotalAmount = mappedMrDetails.reduce((sum, m) => sum + (m.amount || 0), 0);

    return {
        ...c,
        name: c.name || null,
        positionName: c.name || null,
        positionNumber: c.position_number,
        rowNumber: c.row_number,
        extractedCode: c.extracted_code,
        matchType: c.match_type,
        matchedLevel: c.matched_level,
        statusCategory,
        isRestoration: c.is_restoration === 1,
        isText: c.is_text === 1,
        isTextPosition: c.is_text === 1 || statusCategory === 'text',
        hasComment: c.has_comment === 1,
        isDuplicate: c.is_duplicate === 1,
        duplicateCount: c.duplicate_count,
        hasCoefficient: c.has_coefficient === 1,
        coefficientType: c.coefficient_type,
        actualCoefficient: c.coefficient_value,
        expectedCoefficient: c.expected_coefficient,
        coefficientMatch: coeffMatch,
        actual_coefficient: c.coefficient_value,
        expected_coefficient: c.expected_coefficient,
        coefficient_match: c.coefficient_match,
        totalAmount: c.total_amount,
        formattedVolume: c.formatted_volume,
        volume: c.volume,
        details: mappedDetails,
        mrDetails: mappedMrDetails,
        mrTotalAmount,
        mrCount: mappedMrDetails.length,
        hasDetails: mappedDetails.length > 0 || mappedMrDetails.length > 0,
        found: c.status !== 'НЕ НАЙДЕН'
    };
}

async function addCodeDetailsBatch(sessionId, codes) {
    if (!codes || codes.length === 0) return 0;
    
    let savedCount = 0;
    
    for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        
        try {
            const result = await run(`
                INSERT INTO code_details (
                    session_id, position, row_number, position_number, 
                    code, extracted_code, name, status, match_type, status_category,
                    is_restoration, is_text, description, total_amount,
                    quantity, unit, price, volume, formatted_volume,
                    has_coefficient, coefficient_value, expected_coefficient, coefficient_match,
                    created_at
                ) VALUES (
                    @p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9,
                    @p10, @p11, @p12, @p13, @p14, @p15, @p16, @p17, @p18,
                    @p19, @p20, @p21, @p22,
                    DATEADD(hour, 3, GETUTCDATE())
                );
                SELECT SCOPE_IDENTITY() as id;
            `, [
                sessionId, i + 1, c.rowNumber || null, c.positionNumber || null,
                c.code || '', c.extractedCode || '', c.name || c.positionName || null,
                c.status || '', c.matchType || 'none', c.statusCategory || null,
                c.isRestoration ? 1 : 0, c.isText ? 1 : 0, c.description || null, c.totalAmount || 0,
                c.quantity || 0, c.unit || '', c.price || 0, c.volume || 0, c.formattedVolume || null,
                c.hasCoefficient ? 1 : 0, c.actualCoefficient ?? null, c.expectedCoefficient ?? null,
                encodeCoefficientMatch(c.coefficientMatch)
            ]);
            
            const positionId = result.recordset?.[0]?.id;
            
            if (positionId) {
                savedCount++;
                if (c.details?.length) await savePositionDetails(sessionId, positionId, c.details);
                if (c.mrDetails?.length) await saveMrDetails(sessionId, positionId, c.mrDetails);
            }
        } catch (err) {
           
        }
    }
    

    return savedCount;
}

// ==================== ПРОЕКТЫ ====================
async function createProject(userId, projectName, filename, estimateName, sessionId) {
    await run(`
        INSERT INTO user_projects (user_id, project_name, filename, estimate_name, current_session_id, created_at, updated_at)
        VALUES (@p0, @p1, @p2, @p3, @p4, DATEADD(hour, 3, GETUTCDATE()), DATEADD(hour, 3, GETUTCDATE()))
    `, [userId, projectName, filename, estimateName, sessionId]);
    
    const result = await getOne(`SELECT SCOPE_IDENTITY() as id`);
    return result ? result.id : null;
}

async function getUserProjects(userId, status = null) {
    let sql = `
        SELECT 
            p.*,
            (SELECT COUNT(*) FROM sessions WHERE project_id = p.id) as session_count,
            (SELECT ISNULL(SUM(total_codes), 0) FROM sessions WHERE project_id = p.id) as total_codes,
            (SELECT ISNULL(SUM(found_codes), 0) FROM sessions WHERE project_id = p.id) as found_codes,
            (SELECT ISNULL(SUM(not_found_codes), 0) FROM sessions WHERE project_id = p.id) as not_found_codes,
            (SELECT ISNULL(SUM(coefficient_matches), 0) FROM sessions WHERE project_id = p.id) as coefficient_matches,
            (SELECT ISNULL(SUM(coefficient_mismatches), 0) FROM sessions WHERE project_id = p.id) as coefficient_mismatches,
            (SELECT MAX(updated_at) FROM sessions WHERE project_id = p.id) as last_analysis_date,
            (SELECT ISNULL(SUM(CASE WHEN cd.status = N'Обратите внимание' OR cd.is_text = 1 THEN 1 ELSE 0 END), 0)
             FROM code_details cd
             WHERE cd.session_id IN (SELECT session_id FROM sessions WHERE project_id = p.id)) as warningCount,
            (SELECT ISNULL(SUM(CASE WHEN cd.status = N'Нельзя применять' OR cd.is_restoration = 1 THEN 1 ELSE 0 END), 0)
             FROM code_details cd
             WHERE cd.session_id IN (SELECT session_id FROM sessions WHERE project_id = p.id)) as notAllowedCount
        FROM user_projects p
        WHERE p.user_id = @p0
    `;
    
    const params = [userId];
    
    if (status) {
        sql += ` AND p.status = @p1`;
        params.push(status);
    }
    
    sql += ` ORDER BY p.updated_at DESC`;
    
    const projects = await query(sql, params);
    
    return projects.map(p => ({
        ...p,
        stats: {
            totalCodes: p.total_codes || 0,
            foundCodes: p.found_codes || 0,
            notFoundCodes: p.not_found_codes || 0,
            coefficientMatches: p.coefficient_matches || 0,
            coefficientMismatches: p.coefficient_mismatches || 0,
            warningCount: p.warningCount || 0,
            notAllowedCount: p.notAllowedCount || 0,
            lastAnalysisDate: p.last_analysis_date
        }
    }));
}

async function getProjectById(projectId, userId) {
    const project = await getOne(`SELECT * FROM user_projects WHERE id = @p0 AND user_id = @p1`, [projectId, userId]);
    
    if (!project) return null;
    
    let currentSession = null;
    if (project.current_session_id) {
        currentSession = await getSessionDetails(project.current_session_id);
    }
    
    const stats = await getProjectStats(projectId);
    
    return {
        ...project,
        stats,
        currentSession
    };
}

async function archiveProject(projectId, userId) {
    await run(`UPDATE user_projects SET status = 'archived', updated_at = DATEADD(hour, 3, GETUTCDATE()), archived_at = DATEADD(hour, 3, GETUTCDATE()) WHERE id = @p0 AND user_id = @p1`, [projectId, userId]);
}

async function restoreProject(projectId, userId) {
    await run(`UPDATE user_projects SET status = 'active', updated_at = DATEADD(hour, 3, GETUTCDATE()), archived_at = NULL WHERE id = @p0 AND user_id = @p1`, [projectId, userId]);
}

async function updateProjectSession(projectId, userId, sessionId, estimateName = null, filename = null) {
    if (estimateName != null || filename != null) {
        await run(`
            UPDATE user_projects
            SET current_session_id = @p0,
                estimate_name = COALESCE(@p1, estimate_name),
                filename = COALESCE(@p2, filename),
                updated_at = DATEADD(hour, 3, GETUTCDATE())
            WHERE id = @p3 AND user_id = @p4
        `, [sessionId, estimateName, filename, projectId, userId]);
    } else {
        await run(`
            UPDATE user_projects
            SET current_session_id = @p0, updated_at = DATEADD(hour, 3, GETUTCDATE())
            WHERE id = @p1 AND user_id = @p2
        `, [sessionId, projectId, userId]);
    }
}

async function deleteProject(projectId, userId) {
    await run(`DELETE FROM user_projects WHERE id = @p0 AND user_id = @p1 AND status = 'archived'`, [projectId, userId]);
}

async function getProjectStats(projectId) {
    const project = await getOne(`SELECT current_session_id FROM user_projects WHERE id = @p0`, [projectId]);
    if (!project || !project.current_session_id) return null;
    
    const session = await getOne(`
        SELECT 
            total_codes, found_codes, not_found_codes,
            coefficient_matches, coefficient_mismatches,
            exact_matches, table_matches, section_matches,
            collection_matches, chapter_matches, parent_matches,
            text_lines, restoration_codes, updated_at
        FROM sessions WHERE session_id = @p0
    `, [project.current_session_id]);
    
    if (!session) return null;
    
    const problemCount = (session.not_found_codes || 0) + (session.restoration_codes || 0) + (session.coefficient_mismatches || 0);
    
    return {
        totalCodes: session.total_codes || 0,
        problemCount: problemCount,
        coefficientMismatches: session.coefficient_mismatches || 0,
        notFoundCodes: session.not_found_codes || 0,
        restorationCodes: session.restoration_codes || 0,
        lastAnalysisDate: session.updated_at || null
    };
}

// ==================== АДМИНСКИЕ ФУНКЦИИ ПРОЕКТОВ ====================
async function getAllProjectsAdmin() {
    return await query(`
        SELECT 
            p.id,
            p.project_name,
            p.status,
            p.created_at,
            p.updated_at,
            u.fullname as user_name,
            u.institution as user_institution,
            COUNT(DISTINCT s.id) as session_count,
            ISNULL(SUM(s.total_codes), 0) as total_codes,
            ISNULL(SUM(s.found_codes), 0) as found_codes,
            ISNULL(SUM(s.not_found_codes), 0) as not_found_codes,
            ISNULL(SUM(s.coefficient_matches), 0) as coefficient_matches,
            ISNULL(SUM(s.coefficient_mismatches), 0) as coefficient_mismatches,
            ISNULL(SUM(s.restoration_codes), 0) as restoration_codes,
            ISNULL(SUM(s.text_lines), 0) as text_lines,
            (
                SELECT ISNULL(SUM(CASE WHEN cd.status = N'Обратите внимание' OR cd.is_text = 1 THEN 1 ELSE 0 END), 0)
                FROM code_details cd
                WHERE cd.session_id IN (SELECT session_id FROM sessions WHERE project_id = p.id)
            ) as warning_count,
            (
                SELECT ISNULL(SUM(CASE WHEN cd.status = N'Нельзя применять' OR cd.is_restoration = 1 THEN 1 ELSE 0 END), 0)
                FROM code_details cd
                WHERE cd.session_id IN (SELECT session_id FROM sessions WHERE project_id = p.id)
            ) as not_allowed_count,
            (
                SELECT MAX(s2.updated_at)
                FROM sessions s2
                WHERE s2.project_id = p.id
            ) as last_analysis_date
        FROM user_projects p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN sessions s ON s.project_id = p.id
        GROUP BY p.id, p.project_name, p.status, p.created_at, p.updated_at, u.fullname, u.institution
        ORDER BY p.updated_at DESC
    `);
}

// shareds/logs-db.js

async function getProjectSessions(projectId) {
    
    
    const sessions = await query(`
        SELECT 
            s.session_id,
            s.created_at,
            s.updated_at,
            s.filename,
            s.estimate_name,
            s.total_codes,
            s.found_codes,
            s.not_found_codes,
            s.total_amount,
            s.total_mr_amount,
            s.total_mr_rows,
            s.positions_with_mr,
            s.status,
            s.is_revised,
            s.is_ks2,
            s.coefficient_matches,
            s.coefficient_mismatches,
            s.restoration_codes,
            s.text_lines,
            s.exact_matches,
            s.table_matches,
            s.section_matches,
            s.collection_matches,
            s.chapter_matches,
            s.relation_matches,
            s.parent_matches,
            s.has_coefficient_count,
            ISNULL(s.not_found_codes, 0) + ISNULL(s.restoration_codes, 0) + ISNULL(s.coefficient_mismatches, 0) as problem_count,
            (
                SELECT ISNULL(SUM(CASE WHEN cd.status = N'Обратите внимание' OR cd.is_text = 1 THEN 1 ELSE 0 END), 0)
                FROM code_details cd
                WHERE cd.session_id = s.session_id
            ) as warning_count,
            (
                SELECT ISNULL(SUM(CASE WHEN cd.status = N'Нельзя применять' OR cd.is_restoration = 1 THEN 1 ELSE 0 END), 0)
                FROM code_details cd
                WHERE cd.session_id = s.session_id
            ) as not_allowed_count
        FROM sessions s
        WHERE s.project_id = @p0
        ORDER BY s.created_at DESC
    `, [projectId]);
    
    // ПРЕОБРАЗУЕМ СУММУ - ЗАМЕНЯЕМ ЗАПЯТУЮ НА ТОЧКУ
    const parseAmount = (value) => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string' && value.includes(',')) {
            value = parseFloat(value.replace(',', '.'));
        } else if (typeof value === 'string') {
            value = parseFloat(value);
        }
        return isNaN(value) ? null : value;
    };

    const formattedSessions = sessions.map(session => ({
        ...session,
        total_amount: parseAmount(session.total_amount),
        total_mr_amount: parseAmount(session.total_mr_amount)
    }));
    
   
    
    if (formattedSessions.length > 0) {
       
    }
    
    return formattedSessions;
}

async function adminUpdateProjectStatus(projectId, status) {
    await run(`UPDATE user_projects SET status = @p0, updated_at = DATEADD(hour, 3, GETUTCDATE()) WHERE id = @p1`, [status, projectId]);
}

async function adminDeleteProject(projectId) {
    await run(`DELETE FROM sessions WHERE project_id = @p0`, [projectId]);
    await run(`DELETE FROM user_projects WHERE id = @p0`, [projectId]);
}

// ==================== ЛОГИРОВАНИЕ ====================
async function logAdminAction(adminName, actionType, targetType, targetId, details, ip) {
    await run(`
        INSERT INTO admin_actions (admin_name, action_type, target_type, target_id, details, ip)
        VALUES (@p0, @p1, @p2, @p3, @p4, @p5)
    `, [adminName, actionType, targetType, targetId, JSON.stringify(details), ip]);
}

async function logApiRequest(method, endpoint, statusCode, durationMs, ip, userAgent) {
    await run(`
        INSERT INTO api_logs (method, endpoint, status_code, duration_ms, ip, user_agent)
        VALUES (@p0, @p1, @p2, @p3, @p4, @p5)
    `, [method, endpoint, statusCode, durationMs, ip, userAgent]);
}

// ==================== СТАТИСТИКА ====================
async function getSessionsStats(startDate, endDate) {
    const stats = await getOne(`
        SELECT 
            COUNT(*) as total_sessions,
            SUM(total_codes) as total_codes,
            SUM(found_codes) as found_codes,
            SUM(not_found_codes) as not_found_codes,
            SUM(exact_matches) as exact_matches,
            SUM(table_matches) as table_matches,
            SUM(section_matches) as section_matches,
            SUM(collection_matches) as collection_matches,
            SUM(chapter_matches) as chapter_matches,
            SUM(relation_matches) as relation_matches,
            SUM(parent_matches) as parent_matches,
            SUM(text_lines) as text_lines,
            SUM(restoration_codes) as restoration_codes,
            SUM(has_coefficient_count) as has_coefficient_count,
            SUM(coefficient_matches) as coefficient_matches,
            SUM(coefficient_mismatches) as coefficient_mismatches,
            AVG(CASE WHEN total_codes > 0 THEN (found_codes * 100.0 / total_codes) ELSE 0 END) as avg_accuracy,
            SUM(CASE WHEN is_revised = 1 THEN 1 ELSE 0 END) as revised_count,
            SUM(CASE WHEN is_revised = 0 THEN 1 ELSE 0 END) as new_count,
            SUM(total_amount) as total_amount
        FROM sessions
        WHERE created_at BETWEEN @p0 AND @p1
    `, [startDate, endDate]);
    return stats || {};
}

async function getDailyStats(days = 30) {
    return await query(`
        SELECT 
            CAST(created_at AS DATE) as date,
            COUNT(*) as sessions,
            SUM(total_codes) as codes,
            SUM(found_codes) as found,
            AVG(CASE WHEN total_codes > 0 THEN (found_codes * 100.0 / total_codes) ELSE 0 END) as accuracy,
            SUM(coefficient_matches) as coeff_matches,
            SUM(coefficient_mismatches) as coeff_mismatches
        FROM sessions
        WHERE created_at >= DATEADD(day, -@p0, DATEADD(hour, 3, GETUTCDATE()))
        GROUP BY CAST(created_at AS DATE)
        ORDER BY date DESC
    `, [days]);
}

async function getTopUsers(limit = 10) {
    return await query(`
        SELECT TOP (@p0)
            user_name,
            user_institution,
            COUNT(*) as sessions_count,
            SUM(total_codes) as total_codes,
            SUM(found_codes) as found_codes,
            SUM(coefficient_matches) as coeff_matches,
            SUM(coefficient_mismatches) as coeff_mismatches,
            AVG(CASE WHEN total_codes > 0 THEN (found_codes * 100.0 / total_codes) ELSE 0 END) as avg_accuracy
        FROM sessions
        WHERE user_name IS NOT NULL AND user_name != ''
        GROUP BY user_name, user_institution
        ORDER BY sessions_count DESC
    `, [limit]);
}

async function getTopEstimates(limit = 10) {
    return await query(`
        SELECT TOP (@p0)
            estimate_name,
            COUNT(*) as count,
            AVG(CASE WHEN total_codes > 0 THEN (found_codes * 100.0 / total_codes) ELSE 0 END) as avg_accuracy,
            SUM(total_amount) as total_amount,
            SUM(total_codes) as total_codes,
            SUM(found_codes) as found_codes,
            SUM(coefficient_matches) as coeff_matches,
            SUM(coefficient_mismatches) as coeff_mismatches
        FROM sessions
        WHERE estimate_name IS NOT NULL AND estimate_name != ''
        GROUP BY estimate_name
        ORDER BY count DESC
    `, [limit]);
}
function mapKs2DetailRows(dbDetails) {
    return (dbDetails || []).map(d => ({
        type: d.detail_type || d.type || 'Прочие',
        name: d.detail_name || d.name || d.detail_type || '',
        amount: d.amount || 0,
        quantity: d.quantity ?? null,
        unit: d.unit || '',
        rowNumber: d.row_number ?? d.rowNumber ?? null
    }));
}

function parseKs2DetailsFromJson(detailsJson) {
    if (!detailsJson) return [];
    try {
        const parsed = JSON.parse(detailsJson);
        return Array.isArray(parsed) ? mapKs2DetailRows(parsed) : [];
    } catch (e) {
        return [];
    }
}

function transformKs2Item(row, tableDetails = null) {
    let details = mapKs2DetailRows(tableDetails);
    if (!details.length) {
        details = parseKs2DetailsFromJson(row.details_json);
    }

    const coeffMatch = decodeCoefficientMatch(row.coefficient_match);

    return {
        ...row,
        ks2_position_number: row.ks2_position_number,
        estimate_position_number: row.estimate_position_number,
        extractedCode: row.extracted_code || row.code,
        coefficient: row.coefficient,
        expectedCoefficient: row.expected_coefficient,
        coefficientMatch: coeffMatch,
        statusCategory: row.status_category,
        volume: row.volume,
        details,
        hasDetails: details.length > 0,
        detailsTotal: details.reduce((sum, d) => sum + (d.amount || 0), 0)
    };
}

async function saveKs2ItemDetails(sessionId, itemId, details) {
    if (!details || details.length === 0) return 0;

    let savedCount = 0;
    for (const detail of details) {
        try {
            await run(`
                INSERT INTO ks2_item_details (
                    session_id, item_id, detail_type, detail_name,
                    amount, quantity, unit, row_number, created_at
                ) VALUES (
                    @p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7,
                    DATEADD(hour, 3, GETUTCDATE())
                )
            `, [
                sessionId,
                itemId,
                detail.type || 'Прочие',
                detail.name || detail.type || '',
                detail.amount || 0,
                detail.quantity ?? null,
                detail.unit || '',
                detail.rowNumber ?? detail.row_number ?? null
            ]);
            savedCount++;
        } catch (err) {
            // пропускаем проблемную деталь
        }
    }
    return savedCount;
}

/**
 * Сохранение КС-2 позиций в БД
 */
async function saveKs2Items(sessionId, fileName, fileIndex, items) {
    if (!items || items.length === 0) return 0;

    let savedCount = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        const details = Array.isArray(item.details) ? item.details : [];
        const detailsJson = details.length ? JSON.stringify(details) : null;

        try {
            const result = await run(`
                INSERT INTO ks2_items (
                    session_id, file_name, ks2_file_index,
                    position, ks2_position_number, estimate_position_number,
                    code, extracted_code, name, unit, quantity, price, total, volume,
                    coefficient, expected_coefficient, coefficient_match,
                    coeff_main, coeff_winter, coeff_recalc,
                    status, status_category, description, details_json,
                    row_number, created_at, updated_at
                ) VALUES (
                    @p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13,
                    @p14, @p15, @p16, @p17, @p18, @p19, @p20, @p21, @p22, @p23, @p24,
                    DATEADD(hour, 3, GETUTCDATE()), DATEADD(hour, 3, GETUTCDATE())
                );
                SELECT SCOPE_IDENTITY() as id;
            `, [
                sessionId,
                fileName,
                fileIndex,
                item.position || i + 1,
                item.ks2_position_number || null,
                item.estimate_position_number || null,
                item.code || null,
                item.extractedCode || item.code || null,
                item.name || null,
                item.unit || null,
                item.quantity || 0,
                item.price || 0,
                item.total || 0,
                item.volume || null,
                item.coefficient ?? null,
                item.expectedCoefficient ?? null,
                encodeCoefficientMatch(item.coefficientMatch),
                item.coeff_main || null,
                item.coeff_winter || null,
                item.coeff_recalc || null,
                item.status || null,
                item.statusCategory || null,
                item.description || null,
                detailsJson,
                item.row_number || null
            ]);

            const itemId = result.recordset?.[0]?.id;
            if (itemId && details.length) {
                await saveKs2ItemDetails(sessionId, itemId, details);
            }
            savedCount++;
        } catch (err) {
            // пропускаем проблемную строку
        }
    }

    return savedCount;
}
async function getMatchTypeDistribution(startDate, endDate) {
    const stats = await getOne(`
        SELECT 
            SUM(exact_matches) as exact,
            SUM(table_matches) as table_match,
            SUM(section_matches) as section,
            SUM(collection_matches) as collection,
            SUM(chapter_matches) as chapter,
            SUM(relation_matches) as relation,
            SUM(parent_matches) as parent,
            SUM(text_lines) as text,
            SUM(restoration_codes) as restoration
        FROM sessions
        WHERE created_at BETWEEN @p0 AND @p1
    `, [startDate, endDate]);
    return stats || {};
}

async function getCoefficientStats(startDate, endDate) {
    const stats = await getOne(`
        SELECT 
            SUM(coefficient_matches) as matches,
            SUM(coefficient_mismatches) as mismatches,
            CASE WHEN SUM(coefficient_matches + coefficient_mismatches) > 0 
                 THEN ROUND(SUM(coefficient_matches) * 100.0 / SUM(coefficient_matches + coefficient_mismatches), 1)
                 ELSE 0 END as match_percentage
        FROM sessions
        WHERE created_at BETWEEN @p0 AND @p1
    `, [startDate, endDate]);
    return stats || { matches: 0, mismatches: 0, match_percentage: 0 };
}

async function getSessionsHistory(limit = 50, offset = 0) {
    return await query(`
        SELECT * FROM sessions
        ORDER BY created_at DESC
        OFFSET @p0 ROWS FETCH NEXT @p1 ROWS ONLY
    `, [offset, limit]);
}

async function getSessionDetails(sessionId) {
    return getSessionWithDetails(sessionId);
}

async function getHourlyStats(startDate, endDate) {
    const rows = await query(`
        SELECT DATEPART(hour, created_at) as hour, COUNT(*) as count
        FROM sessions
        WHERE created_at BETWEEN @p0 AND @p1
        GROUP BY DATEPART(hour, created_at)
        ORDER BY hour
    `, [startDate, endDate]);
    const hourlyStats = [];
    for (let hour = 0; hour < 24; hour++) {
        const row = rows.find(r => r.hour === hour);
        hourlyStats.push({ hour, count: row ? row.count : 0 });
    }
    return hourlyStats;
}

async function getFileTypeStats(startDate, endDate) {
    const newFiles = await getOne(`SELECT COUNT(*) as count FROM sessions WHERE created_at BETWEEN @p0 AND @p1 AND is_revised = 0`, [startDate, endDate]);
    const revisedFiles = await getOne(`SELECT COUNT(*) as count FROM sessions WHERE created_at BETWEEN @p0 AND @p1 AND is_revised = 1`, [startDate, endDate]);
    return { new: newFiles?.count || 0, revised: revisedFiles?.count || 0 };
}

async function getCodeStatusStats(startDate, endDate) {
    const sessions = await query(`SELECT 
            session_id,
            created_at,
            filename,
            estimate_name,
            total_codes,
            found_codes,
            not_found_codes,
            total_amount,
            status,
            is_revised,
            is_ks2,  // ← ЭТО ПОЛЕ ДОЛЖНО БЫТЬ
            coefficient_matches,
            coefficient_mismatches,
            restoration_codes,
            text_lines
        FROM sessions 
        WHERE project_id = @p0 
        ORDER BY created_at DESC
    `, [projectId]);
    const sessionIds = sessions.map(s => s.session_id);
    if (sessionIds.length === 0) {
        return { available: 0, warning: 0, notAllowed: 0, notFound: 0 };
    }
    const placeholders = sessionIds.map((_, i) => `@p${i}`).join(',');
    const available = await getOne(`SELECT COUNT(*) as count FROM code_details WHERE session_id IN (${placeholders}) AND status = 'Доступен'`, sessionIds);
    const warning = await getOne(`SELECT COUNT(*) as count FROM code_details WHERE session_id IN (${placeholders}) AND status = 'Обратите внимание'`, sessionIds);
    const notAllowed = await getOne(`SELECT COUNT(*) as count FROM code_details WHERE session_id IN (${placeholders}) AND status = 'Нельзя применять'`, sessionIds);
    const notFound = await getOne(`SELECT COUNT(*) as count FROM code_details WHERE session_id IN (${placeholders}) AND status = 'НЕ НАЙДЕН'`, sessionIds);
    return {
        available: available?.count || 0,
        warning: warning?.count || 0,
        notAllowed: notAllowed?.count || 0,
        notFound: notFound?.count || 0
    };
}

async function getUniqueUsersCount(startDate, endDate) {
    const result = await getOne(`
        SELECT COUNT(DISTINCT user_name) as count 
        FROM sessions 
        WHERE created_at BETWEEN @p0 AND @p1 
          AND user_name IS NOT NULL AND user_name != ''
    `, [startDate, endDate]);
    return result?.count || 0;
}

async function getDashboardStats(days = 30) {
    const now = new Date();
    const moscowNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const startDate = new Date(moscowNow - days * 24 * 60 * 60 * 1000).toISOString();
    const endDate = moscowNow.toISOString();
    const prevStartDate = new Date(moscowNow - days * 2 * 24 * 60 * 60 * 1000).toISOString();
    const prevEndDate = new Date(moscowNow - days * 24 * 60 * 60 * 1000).toISOString();

    const [overview, dailyStats, hourlyStats, fileTypeStats, statusStats, matchTypeStats, coefficientStats, topUsers, topEstimates, uniqueUsers, sessions, prevOverview] = await Promise.all([
        getSessionsStats(startDate, endDate),
        getDailyStats(days),
        getHourlyStats(startDate, endDate),
        getFileTypeStats(startDate, endDate),
        getCodeStatusStats(startDate, endDate),
        getMatchTypeDistribution(startDate, endDate),
        getCoefficientStats(startDate, endDate),
        getTopUsers(10),
        getTopEstimates(10),
        getUniqueUsersCount(startDate, endDate),
        getSessionsHistory(50, 0),
        getSessionsStats(prevStartDate, prevEndDate)
    ]);

    const trends = {
        sessions: prevOverview.total_sessions ? ((overview.total_sessions - prevOverview.total_sessions) / prevOverview.total_sessions * 100).toFixed(1) : 0,
        accuracy: prevOverview.avg_accuracy ? (overview.avg_accuracy - prevOverview.avg_accuracy).toFixed(1) : 0,
        coefficientMatchRate: coefficientStats.match_percentage || 0
    };

    return {
        overview,
        dailyStats,
        hourlyStats,
        fileTypeStats,
        statusStats,
        matchTypeStats,
        coefficientStats,
        topUsers,
        topEstimates,
        uniqueUsers,
        sessions,
        trends
    };
}

async function getUsersAnalytics(days = 30, projectId = null) {
    const params = [];
    let dateFilter = `s.created_at >= DATEADD(day, -@p0, DATEADD(hour, 3, GETUTCDATE()))`;
    params.push(days);

    let projectFilter = '';
    if (projectId !== null) {
        projectFilter = `AND s.project_id = @p${params.length}`;
        params.push(projectId);
    }

    const sql = `
        SELECT 
            s.user_name,
            s.user_institution,
            MAX(s.created_at) AS last_activity,
            COUNT(DISTINCT s.session_id) AS sessions_count,
            COUNT(DISTINCT s.filename) AS files_count,
            SUM(s.total_codes) AS total_codes,
            SUM(s.found_codes) AS found_codes,
            CASE WHEN SUM(s.total_codes) > 0 
                 THEN ROUND(SUM(s.found_codes)*100.0/SUM(s.total_codes), 1) 
                 ELSE 0 END AS accuracy,
            SUM(s.coefficient_matches) AS coeff_matches,
            SUM(s.coefficient_mismatches) AS coeff_mismatches,
            SUM(s.exact_matches) AS exact_matches,
            SUM(s.table_matches) AS table_matches,
            SUM(s.section_matches) AS section_matches,
            SUM(s.collection_matches) AS collection_matches,
            SUM(s.chapter_matches) AS chapter_matches,
            SUM(s.relation_matches) AS relation_matches,
            SUM(s.parent_matches) AS parent_matches,
            SUM(s.restoration_codes) AS restoration_codes,
            SUM(s.text_lines) AS text_lines
        FROM sessions s
        WHERE ${dateFilter} ${projectFilter}
          AND s.user_name IS NOT NULL AND s.user_name != ''
        GROUP BY s.user_name, s.user_institution
        ORDER BY last_activity DESC
    `;

    return await query(sql, params);
}

async function getUserSessions(userName, days = 30, projectId = null) {
    const params = [userName];
    let dateFilter = `s.created_at >= DATEADD(day, -@p1, DATEADD(hour, 3, GETUTCDATE()))`;
    params.push(days);

    let projectFilter = '';
    if (projectId !== null) {
        projectFilter = `AND s.project_id = @p${params.length}`;
        params.push(projectId);
    }

    const sql = `
        SELECT 
            s.session_id,
            s.filename,
            s.estimate_name,
            s.is_revised,
            s.total_codes,
            s.found_codes,
            s.not_found_codes,
            s.coefficient_matches,
            s.coefficient_mismatches,
            s.total_amount,
            s.status,
            s.created_at
        FROM sessions s
        WHERE s.user_name = @p0
          AND ${dateFilter}
          ${projectFilter}
        ORDER BY s.created_at DESC
    `;
    return await query(sql, params);
}

async function getProjectProblemCodes(projectId) {
    const sessions = await query(`SELECT session_id FROM sessions WHERE project_id = @p0`, [projectId]);
    const sessionIds = sessions.map(s => s.session_id);
    if (sessionIds.length === 0) return { notAllowed: [], warning: [] };

    const placeholders = sessionIds.map((_, i) => `@p${i}`).join(',');

    const notAllowed = await query(`
        SELECT cd.code, cd.description, cd.status, cd.match_type, cd.position, s.filename, s.created_at
        FROM code_details cd
        JOIN sessions s ON cd.session_id = s.session_id
        WHERE cd.session_id IN (${placeholders})
          AND (cd.status = N'Нельзя применять' OR cd.is_restoration = 1)
        ORDER BY s.created_at DESC, cd.position
    `, sessionIds);

    const warning = await query(`
        SELECT cd.code, cd.description, cd.status, cd.match_type, cd.position, s.filename, s.created_at
        FROM code_details cd
        JOIN sessions s ON cd.session_id = s.session_id
        WHERE cd.session_id IN (${placeholders})
          AND (cd.status = N'Обратите внимание' OR cd.is_text = 1)
        ORDER BY s.created_at DESC, cd.position
    `, sessionIds);

    return { notAllowed, warning };
}

async function getTopProblemCodes(days = 30, limit = 20) {
    const dateFilter = `s.created_at >= DATEADD(day, -@p0, DATEADD(hour, 3, GETUTCDATE()))`;
    const params = [days];
    
    const notAllowed = await query(`
        SELECT TOP (@p1)
            cd.code,
            cd.description,
            'Нельзя применять' as problem_type,
            COUNT(*) as count
        FROM code_details cd
        JOIN sessions s ON cd.session_id = s.session_id
        WHERE ${dateFilter}
          AND (cd.status = N'Нельзя применять' OR cd.is_restoration = 1)
        GROUP BY cd.code, cd.description
        ORDER BY count DESC
    `, [days, limit]);
    
    const warning = await query(`
        SELECT TOP (@p1)
            cd.code,
            cd.description,
            'Обратите внимание' as problem_type,
            COUNT(*) as count
        FROM code_details cd
        JOIN sessions s ON cd.session_id = s.session_id
        WHERE ${dateFilter}
          AND (cd.status = N'Обратите внимание' OR cd.is_text = 1)
        GROUP BY cd.code, cd.description
        ORDER BY count DESC
    `, [days, limit]);
    
    return {
        notAllowed,
        warning
    };
}

async function getMatchTypeTrend(days = 30) {
    const sql = `
        SELECT 
            CAST(created_at AS DATE) as date,
            SUM(exact_matches) as exact,
            SUM(table_matches) as table_match,
            SUM(section_matches) as section,
            SUM(collection_matches) as collection,
            SUM(chapter_matches) as chapter,
            SUM(relation_matches) as relation,
            SUM(parent_matches) as parent,
            SUM(text_lines) as text,
            SUM(restoration_codes) as restoration
        FROM sessions
        WHERE created_at >= DATEADD(day, -@p0, DATEADD(hour, 3, GETUTCDATE()))
        GROUP BY CAST(created_at AS DATE)
        ORDER BY date
    `;
    return await query(sql, [days]);
}

async function getManagerDashboard(days = 30) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const startDate = todayStart.toISOString();
    const endDate = todayEnd.toISOString();
    
    const todayStats = await getSessionsStats(startDate, endDate);
    const topUsers = await getTopUsers(5);
    const topProblems = await getTopProblemCodes(days, 10);
    
    return {
        today: {
            sessions: todayStats.total_sessions || 0,
            accuracy: todayStats.avg_accuracy || 0,
            totalAmount: todayStats.total_amount || 0,
            codes: todayStats.total_codes || 0,
            found: todayStats.found_codes || 0
        },
        topUsers: topUsers || [],
        topProblems: topProblems || { notAllowed: [], warning: [] }
    };
}

// ==================== ОЧИСТКА ЛОГОВ ====================
async function clearLogsOlderThan(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString();

    const sessionsResult = await run(`DELETE FROM sessions WHERE created_at < @p0`, [cutoffStr]);
    const apiResult = await run(`DELETE FROM api_logs WHERE created_at < @p0`, [cutoffStr]);
    const adminResult = await run(`DELETE FROM admin_actions WHERE created_at < @p0`, [cutoffStr]);
    const detailsResult = await run(`DELETE FROM code_details WHERE session_id NOT IN (SELECT session_id FROM sessions)`);
    return {
        sessions: sessionsResult.changes,
        apiLogs: apiResult.changes,
        adminActions: adminResult.changes,
        details: detailsResult.changes
    };
}

async function clearAllLogs() {
    await run(`DELETE FROM sessions`);
    await run(`DELETE FROM code_details`);
    await run(`DELETE FROM api_logs`);
    await run(`DELETE FROM admin_actions`);
    return true;
}

function isDatabaseExists() { return true; }
// ==================== КС-2 МЕТОДЫ ====================

/**
 * Создание сессии для КС-2
 */
/**
 * Создание сессии для КС-2
 */
async function createKs2Session(sessionId, data) {
    // Убедимся, что колонка is_ks2 существует
    await addColumnIfNotExists('sessions', 'is_ks2', 'INT DEFAULT 0');
    
    const result = await run(`
        INSERT INTO sessions (
            session_id, user_name, user_institution, user_ip, filename, estimate_name,
            total_codes, total_amount, status, project_id, is_ks2, created_at, updated_at
        ) VALUES (
            @p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, 1, DATEADD(hour, 3, GETUTCDATE()), DATEADD(hour, 3, GETUTCDATE())
        )
    `, [
        sessionId,
        data.user?.fullname || null,
        data.user?.institution || null,
        data.ip || null,
        data.filename,
        data.estimateName || `КС-2: ${data.filename}`,
        data.totalCodes || 0,
        data.totalAmount || 0,
        data.status || 'completed',
        data.projectId || null
    ]);
    
    
    return sessionId;
}

/**
 * Получение КС-2 позиций по сессии
 */
async function getKs2Items(sessionId) {
    const rows = await query(`
        SELECT 
            id, session_id, file_name, ks2_file_index,
            position, ks2_position_number, estimate_position_number,
            code, extracted_code, name, unit, quantity, price, total, volume,
            coefficient, expected_coefficient, coefficient_match,
            coeff_main, coeff_winter, coeff_recalc,
            status, status_category, description, details_json,
            row_number, created_at
        FROM ks2_items 
        WHERE session_id = @p0
        ORDER BY ks2_file_index, position
    `, [sessionId], { timeout: LONG_TIMEOUT_MS });

    const allDetails = await query(`
        SELECT session_id, item_id, detail_type, detail_name, amount, quantity, unit, row_number
        FROM ks2_item_details
        WHERE session_id = @p0
        ORDER BY item_id, row_number
    `, [sessionId], { timeout: LONG_TIMEOUT_MS });

    const detailsByItem = new Map();
    for (const detail of allDetails) {
        if (!detailsByItem.has(detail.item_id)) {
            detailsByItem.set(detail.item_id, []);
        }
        detailsByItem.get(detail.item_id).push(detail);
    }

    return rows.map(row => transformKs2Item(row, detailsByItem.get(row.id) || null));
}

/**
 * Получение всех КС-2 сессий по проекту
 */
async function getProjectKs2Sessions(projectId) {
    return await query(`
        SELECT 
            s.session_id,
            s.filename,
            s.estimate_name,
            s.created_at,
            s.total_codes as total_items,
            s.total_amount,
            s.status,
            s.user_name,
            COUNT(i.id) as items_count,
            SUM(i.total) as calculated_amount,
            SUM(i.quantity) as total_quantity
        FROM sessions s
        LEFT JOIN ks2_items i ON s.session_id = i.session_id
        WHERE s.project_id = @p0 
          AND s.is_ks2 = 1
        GROUP BY 
            s.session_id, s.filename, s.estimate_name, s.created_at, 
            s.total_codes, s.total_amount, s.status, s.user_name
        ORDER BY s.created_at DESC
    `, [projectId]);
}

/**
 * Получение сессии по ID (КС-2)
 */
async function getKs2SessionById(sessionId) {
    const session = await getOne(`
        SELECT * FROM sessions 
        WHERE session_id = @p0 AND is_ks2 = 1
    `, [sessionId]);
    
    if (!session) return null;
    
    const items = await getKs2Items(sessionId);
    
    return {
        ...session,
        items: items,
        totalItems: items.length
    };
}

/**
 * Удаление КС-2 сессии
 */
async function deleteKs2Session(sessionId) {
    await run(`DELETE FROM ks2_item_details WHERE session_id = @p0`, [sessionId]);
    await run(`DELETE FROM ks2_items WHERE session_id = @p0`, [sessionId]);
    const result = await run(`DELETE FROM sessions WHERE session_id = @p0 AND is_ks2 = 1`, [sessionId]);
    return result.changes > 0;
}
// ==================== МЕТОДЫ ДЛЯ РАБОТЫ С ДЕТАЛЯМИ ====================

async function savePositionDetails(sessionId, positionId, details) {
    if (!details || details.length === 0) return 0;
    let savedCount = 0;
    for (const detail of details) {
        try {
            await run(`
                INSERT INTO position_details (
                    session_id, position_id, detail_type, detail_name, 
                    amount, quantity, unit, row_number, created_at
                ) VALUES (
                    @p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, DATEADD(hour, 3, GETUTCDATE())
                )
            `, [
                sessionId, positionId,
                detail.type || 'Прочие',
                detail.name || detail.type || '',
                detail.amount || 0,
                detail.quantity || null,
                detail.unit || '',
                detail.rowNumber || null
            ]);
            savedCount++;
        } catch (err) {
     
        }
    }
    return savedCount;
}

async function saveMrDetails(sessionId, positionId, mrDetails) {
    if (!mrDetails || mrDetails.length === 0) return 0;
    let savedCount = 0;
    for (const detail of mrDetails) {
        try {
            await run(`
                INSERT INTO mr_details (
                    session_id, position_id, material_name, 
                    amount, quantity, unit, row_number, created_at
                ) VALUES (
                    @p0, @p1, @p2, @p3, @p4, @p5, @p6, DATEADD(hour, 3, GETUTCDATE())
                )
            `, [
                sessionId, positionId,
                detail.name || detail.type || '',
                detail.amount || 0,
                detail.quantity || null,
                detail.unit || '',
                detail.rowNumber || null
            ]);
            savedCount++;
        } catch (err) {
            
        }
    }
    return savedCount;
}

async function getSessionWithDetails(sessionId) {
    const session = await getOne(`SELECT * FROM sessions WHERE session_id = @p0`, [sessionId]);
    if (!session) return null;
    
    const codes = await query(`
        SELECT 
            id, session_id, position, row_number, position_number, 
            code, extracted_code, name, status, match_type, status_category,
            matched_level, is_restoration, is_text, has_comment,
            is_duplicate, duplicate_count, has_coefficient, coefficient_type,
            coefficient_value, expected_coefficient, coefficient_match,
            description, total_amount, quantity, unit, price,
            volume, formatted_volume, is_main_row, created_at
        FROM code_details 
        WHERE session_id = @p0 
        ORDER BY position
    `, [sessionId], { timeout: LONG_TIMEOUT_MS });
    
    const allDetails = await query(`
        SELECT * FROM position_details WHERE session_id = @p0 ORDER BY position_id, row_number
    `, [sessionId]);
    
    const allMrDetails = await query(`
        SELECT * FROM mr_details WHERE session_id = @p0 ORDER BY position_id, row_number
    `, [sessionId]);
    
    const detailsByPosition = new Map();
    for (const detail of allDetails) {
        if (!detailsByPosition.has(detail.position_id)) {
            detailsByPosition.set(detail.position_id, { details: [], mrDetails: [] });
        }
        detailsByPosition.get(detail.position_id).details.push(detail);
    }
    
    for (const mr of allMrDetails) {
        if (!detailsByPosition.has(mr.position_id)) {
            detailsByPosition.set(mr.position_id, { details: [], mrDetails: [] });
        }
        detailsByPosition.get(mr.position_id).mrDetails.push(mr);
    }
    
    const enrichedCodes = codes.map(code => {
        const posDetails = detailsByPosition.get(code.id) || { details: [], mrDetails: [] };
        return transformCodeRow(code, posDetails.details, posDetails.mrDetails);
    });
    
    return { ...session, codes: enrichedCodes };
}
// ==================== ЭКСПОРТ ====================
module.exports = {
    initLogsDatabase,
    createSession,
    updateSessionStats,
    updateSessionStatus,
    addCodeDetailsBatch,
    logAdminAction,
    logApiRequest,
    getSessionsStats,
    getDailyStats,
    getTopUsers,
    getTopEstimates,
    getMatchTypeDistribution,
    getCoefficientStats,
    getSessionsHistory,
    getSessionDetails,
    getSessionWithDetails,
    getHourlyStats,
    getFileTypeStats,
    getCodeStatusStats,
    getUniqueUsersCount,
    getDashboardStats,
    getUsersAnalytics,
    getUserSessions,
    getProjectProblemCodes,
    getTopProblemCodes,
    getMatchTypeTrend,
    getManagerDashboard,
    isDatabaseExists,
    clearLogsOlderThan,
    clearAllLogs,
    createProject,
    getUserProjects,
    getProjectById,
    archiveProject,
    restoreProject,
    updateProjectSession,
    deleteProject,
    saveKs2Items,
    getProjectStats,
    getAllProjectsAdmin,
    getProjectSessions,
    getOne,  // уже должно быть
    query, 
    getKs2Items,
    adminUpdateProjectStatus,
    adminDeleteProject
};