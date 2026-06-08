const logsDb = require('./logs-db');

class Logger {
    constructor() {
        this.currentSessionId = null;
        this.currentUser = null;
        this.currentIp = null;
    }

    setSession(sessionId, user, ip) {
        this.currentSessionId = sessionId;
        this.currentUser = user;
        this.currentIp = ip;
    }

    clearSession() {
        this.currentSessionId = null;
        this.currentUser = null;
        this.currentIp = null;
    }

    async logAnalysisStart(data) {
        const sessionId = data.sessionId || Date.now().toString() + '-' + Math.random().toString(36).substr(2, 8);
        this.setSession(sessionId, data.user, data.ip);
        await logsDb.createSession(sessionId, {
            user: data.user,
            ip: data.ip,
            filename: data.filename,
            estimateName: data.estimateName,
            isRevised: data.isRevised || false,
            totalCodes: 0,
            foundCodes: 0,
            notFoundCodes: 0,
            status: 'started'
        });
        return sessionId;
    }

    async logAnalysisComplete(sessionId, results, totalAmount = null) {
        const found = results.filter(r => r.found || r.isText).length;
        const notFound = results.filter(r => !r.found && !r.isText && !r.isRestoration).length;
        const exactMatches = results.filter(r => r.matchType === 'exact').length;
        const tableMatches = results.filter(r => r.matchType === 'table').length;
        const sectionMatches = results.filter(r => r.matchType === 'section').length;
        const collectionMatches = results.filter(r => r.matchType === 'collection').length;
        const chapterMatches = results.filter(r => r.matchType === 'chapter').length;
        const relationMatches = results.filter(r => r.matchType === 'relation_duplicate' || r.matchType === 'relation_related').length;
        const parentMatches = results.filter(r => r.matchType === 'parent').length;
        const textLines = results.filter(r => r.isText).length;
        const restorationCodes = results.filter(r => r.isRestoration).length;
        const hasCoefficientCount = results.filter(r => r.hasCoefficient).length;
        const coefficientMatches = results.filter(r => r.coefficientMatch === true).length;
        const coefficientMismatches = results.filter(r => r.coefficientMatch === false).length;

        await logsDb.updateSessionStats(sessionId, {
            totalCodes: results.length,
            foundCodes: found,
            notFoundCodes: notFound,
            exactMatches: exactMatches,
            tableMatches: tableMatches,
            sectionMatches: sectionMatches,
            collectionMatches: collectionMatches,
            chapterMatches: chapterMatches,
            relationMatches: relationMatches,
            parentMatches: parentMatches,
            textLines: textLines,
            restorationCodes: restorationCodes,
            hasCoefficientCount: hasCoefficientCount,
            coefficientMatches: coefficientMatches,
            coefficientMismatches: coefficientMismatches,
            totalAmount: totalAmount,
            status: 'completed'
        });

        await logsDb.addCodeDetailsBatch(sessionId, results);
        this.clearSession();
        return sessionId;
    }

    async logAnalysisError(sessionId, error, user, ip, filename) {
        await logsDb.updateSessionStatus(sessionId, 'error');
        this.clearSession();
    }

    async logAdminAction(adminName, actionType, targetType, targetId, details, ip) {
        await logsDb.logAdminAction(adminName, actionType, targetType, targetId, details, ip);
    }

    async logApiRequest(method, endpoint, statusCode, durationMs, ip, userAgent) {
        const moscowTime = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    
        await logsDb.logApiRequest(method, endpoint, statusCode, durationMs, ip, userAgent);
    }
}

module.exports = new Logger();