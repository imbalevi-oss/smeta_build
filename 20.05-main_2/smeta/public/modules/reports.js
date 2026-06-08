// modules/reports.js

import { AppState } from './state.js';
import { showError, showSuccess } from './ui-notifications.js';

export function generateFullReport() {
    if (!AppState.lastSessionId) {
        showError('Нет данных для отчета');
        return;
    }
    window.open(`/api/report/${AppState.lastSessionId}/html`, '_blank');
}
function getEffectiveActualCoefficient(item) {
    // Проверяем разные возможные названия поля в объекте
    let actual = item.actualCoefficient ?? item.actual_coefficient;
    if (actual !== null && actual !== undefined && actual !== 1) {
        return actual;
    }
    // Если коэффициент не указан, возвращаем 1 (норма)
    return 1;
}
export async function copyFilteredCodes() {
    // Получаем текущие отфильтрованные результаты из глобального состояния
    // или напрямую из DOM, если AppState недоступен
    let currentResults = window.currentResults || [];
    
    if (!currentResults || !currentResults.length) {
        if (window.showError) window.showError('Нет данных для копирования');
        return;
    }

    try {
        // Текущая дата
        const currentDateTime = new Date().toLocaleString('ru-RU', { 
            timeZone: 'Europe/Moscow',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        
        // Собираем коды по категориям
        const notAllowedCodes = currentResults.filter(item => 
            (item.status === 'Нельзя применять' || item.isRestoration) && 
            !(item.isText || item.is_text === 1)
        );
        
        const warningCodes = currentResults.filter(item => {
            if (item.isText || item.is_text === 1) return false;
            if (item.status === 'Нельзя применять' || item.isRestoration) return false;
            
            const actual = getEffectiveActualCoefficient(item);
            const expected = item.expectedCoefficient ?? item.expected_coefficient ?? 1;
            const statusWarning = (item.status === 'Обратите внимание');
            
            if (statusWarning && actual > expected) return true;
            
            const actualIsDefault = (actual === 1 && (item.actualCoefficient === null || item.actualCoefficient === undefined));
            if (actualIsDefault && expected < 1) return true;
            
            if (expected > 1 && Math.abs(actual - expected) < 0.01) return true;
            
            return false;
        });
        
        const textLinesCount = currentResults.filter(item => 
            item.isText || item.is_text === 1
        ).length;
        
        // Формируем текст письма
        let text = `ГКУ СФК ДОНМ ${currentDateTime} проведен автоматизированный мониторинг применения сметных нормативов в сметах, прилагаемых к контрактам. По итогам проведенного мониторинга по контракту от ________ № _______ на _________________ в сметной документации выявлены следующие недостатки с признаками «Нельзя применить», «Требует внимания», «Дополнительное замечание»:

`;

        // ==================== БЛОК «Нельзя применить» ====================
        if (notAllowedCodes.length > 0) {
            text += `Признак «Нельзя применить»
Неправомерное применение для объектов отрасли «Образование» стоимостных нормативов, разработанных для объектов, к которым установлены специальные эксплуатационные требования, связанные с их функциональным назначением и конструктивным решением, включая объекты культурного наследия.

`;
            for (let i = 0; i < notAllowedCodes.length; i++) {
                const item = notAllowedCodes[i];
                const code = item.extractedCode || item.code || '—';
                const position = item.positionNumber || item.position_number || '—';
                
                let line = `${i+1}. Шифр: ${code} (позиция ${position})`;
                
                const dbDesc = item.dbDescription || item.description;
                if (dbDesc && !dbDesc.includes('Коэффициент') && !dbDesc.includes('коэффициент')) {
                    let cleanDesc = dbDesc.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
                    cleanDesc = cleanDesc.replace(/^[⚠️✅ℹ️❌📝]\s*/, '');
                    line += `\n    ${cleanDesc}`;
                }
                
                text += line + '\n';
            }
            text += '\n';
        }

        // ==================== БЛОК «Требует внимания» ====================
        if (warningCodes.length > 0) {
            text += `Признак «Требует внимания»
Информация о необходимости проверки корректности и обоснования применения к стоимостным нормативам повышающих (и/или понижающих) коэффициентов, с учетом условий производства работ и необходимости их обоснования.

`;
            for (let i = 0; i < warningCodes.length; i++) {
                const item = warningCodes[i];
                const code = item.extractedCode || item.code || '—';
                const position = item.positionNumber || item.position_number || '—';
                const expected = item.expectedCoefficient ?? item.expected_coefficient ?? 1;
                const actual = getEffectiveActualCoefficient(item);
                
                let coeffText = '';
                if (actual !== null && actual !== undefined && actual !== 1) {
                    const actualFormatted = actual.toString().replace('.', ',');
                    const expectedFormatted = expected.toString().replace('.', ',');
                    if (actual > expected) {
                        coeffText = ` (применённый коэффициент ${actualFormatted})`;
                    } else if (actual !== expected) {
                        coeffText = ` (применённый коэффициент ${actualFormatted}, ожидаемый коэффициент ${expectedFormatted})`;
                    }
                }
                
                let line = `${i+1}. Шифр: ${code} (позиция ${position})${coeffText}`;
                
                let dbDesc = item.dbDescription || '';
                if (!dbDesc) {
                    const fullDesc = item.description || '';
                    dbDesc = fullDesc.split('\n')[0];
                    if (dbDesc.includes('⚠️') || dbDesc.includes('✅') || dbDesc.includes('ℹ️')) {
                        dbDesc = '';
                    }
                }
                
                if (dbDesc && dbDesc.length > 0 && dbDesc !== '—') {
                    let cleanDesc = dbDesc.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
                    cleanDesc = cleanDesc.replace(/^[⚠️✅ℹ️❌📝]\s*/, '');
                    line += `\n    ${cleanDesc}`;
                }
                
                text += line + '\n';
            }
            text += '\n';
        }

        // ==================== БЛОК «Дополнительное замечание» ====================
        if (textLinesCount > 0) {
            text += `Признак «Дополнительное замечание»
Информация о включении в сметную документацию материальных ресурсов «по цене поставщика». В сметной документации обнаружено ${textLinesCount} позиций, сформированных «по цене поставщика».
Заказчику необходимо дополнительно проверить в открытых источниках информацию об актуальной рыночной стоимости материальных ресурсов «по цене поставщика» (с учетом положений Распоряжения Правительства Москвы от 16.05.2014 № 242-РП «Об утверждении Методических рекомендаций по применению методов определения начальной (максимальной) цены контракта, цены контракта, заключаемого с единственным поставщиком (подрядчиком, исполнителем), начальной цены единицы товара, работы, услуги»).

`;
        }

        // ==================== ЗАКЛЮЧЕНИЕ ====================
        text += `В связи с вышеизложенным Учреждению необходимо:

`;
        
        let пункт = 1;
        
        if (notAllowedCodes.length > 0) {
            text += `${пункт}. По признаку «Нельзя применить» в течение трех рабочих дней с даты получения данного письма рассчитать с учетом полученных замечаний стоимость работ по позициям сметы, указанным в данном письме, и направить предварительный расчет стоимости работ по таким позициям сметы в ГКУ СФК ДОНМ по форме, прилагаемой к письму.

`;
            пункт++;
        }
        
        if (warningCodes.length > 0) {
            text += `${пункт}. По признаку «Требует внимания» в течение трех рабочих дней обосновать/подтвердить применение/неприменение повышающих/понижающих коэффициентов, и в случае исправления расчётов стоимости работ направить предварительный расчет стоимости работ по таким позициям сметы в ГКУ СФК ДОНМ по форме, прилагаемой к письму.

`;
            пункт++;
        }
        
        text += `${пункт}. Учесть выявленные недостатки при приемке и оплате работ по контракту.

`;
        пункт++;
        
        text += `${пункт}. Предоставить в ГКУ СФК ДОНМ информацию о принятых мерах и результатах приемки работ по контракту.`;

        // Копируем в буфер обмена
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.top = '-9999px';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        
        const totalIssues = notAllowedCodes.length + warningCodes.length;
        if (window.showSuccess) {
            window.showSuccess(`Письмо скопировано в буфер обмена (проблем: ${totalIssues}, цена поставщика: ${textLinesCount})`);
        }
        
    } catch (err) {
        console.error('Ошибка копирования:', err);
        if (window.showError) window.showError('Не удалось скопировать текст');
    }
}
export function downloadExcelReport() {
    if (!AppState.lastSessionId) {
        showError('Нет данных для отчёта');
        return;
    }
    
    fetch(`/api/report/${AppState.lastSessionId}/excel`, { method: 'POST' })
        .then(response => {
            if (!response.ok) throw new Error('Ошибка генерации Excel');
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `report_${AppState.lastSessionId}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showSuccess('Excel-отчёт скачан');
        })
        .catch(error => showError(error.message));
}