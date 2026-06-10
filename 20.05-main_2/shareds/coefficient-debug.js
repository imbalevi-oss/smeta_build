// shareds/coefficient-debug.js
// Модуль для диагностики коэффициентов в Excel файле

const XLSX = require('xlsx');
const { parseNumberWithComma } = require('./estimate-parser');

/**
 * Диагностика колонки коэффициентов в файле
 */
function diagnoseCoefficientColumn(fileBuffer, sheetName = null) {

    
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    // Поиск всех колонок, которые могут содержать коэффициенты
    const potentialCoeffCols = [];
    
    // Сначала ищем по заголовкам
    for (let i = 0; i < Math.min(30, data.length); i++) {
        const row = data[i];
        if (!row) continue;
        
        for (let col = 0; col < row.length; col++) {
            const cell = String(row[col] || '').toLowerCase();
            const coeffKeywords = ['коэф', 'поправоч', 'коэффициент', 'зимн', 'удорож', 'пересчет', 'coeff', 'k'];
            
            for (const kw of coeffKeywords) {
                if (cell.includes(kw)) {
                    potentialCoeffCols.push({
                        row: i + 1,
                        col: col + 1,
                        headerText: row[col]
                    });
                    break;
                }
            }
        }
    }
    

    potentialCoeffCols.forEach(c => {
  
    });
    
    // Анализируем каждую колонку на наличие чисел
    const maxCols = Math.max(...data.map(row => row?.length || 0), 0);

    
    for (let col = 0; col < Math.min(maxCols, 20); col++) {
        const values = [];
        let nonZeroCount = 0;
        let oneCount = 0;
        let zeroCount = 0;
        let textCount = 0;
        
        for (let row = 0; row < Math.min(data.length, 200); row++) {
            const cell = data[row]?.[col];
            if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
                const strVal = String(cell).trim();
                const numVal = parseNumberWithComma(cell);
                
                if (numVal !== null && !isNaN(numVal)) {
                    if (numVal !== 0 && numVal !== 1 && numVal > 0.01 && numVal < 100) {
                        nonZeroCount++;
                        values.push({ row: row + 1, val: numVal, raw: strVal });
                    } else if (numVal === 1) {
                        oneCount++;
                    } else if (numVal === 0) {
                        zeroCount++;
                    }
                } else {
                    textCount++;
                }
            }
        }
        
        if (nonZeroCount > 0) {
    
            values.slice(0, 10).forEach(v => {
 
            });
            if (values.length > 10) {
              
            }
        }
    }
    
  
    
    return { potentialCoeffCols, analysis: 'completed' };
}

module.exports = { diagnoseCoefficientColumn };