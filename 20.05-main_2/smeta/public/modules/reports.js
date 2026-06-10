// modules/reports.js

import { AppState } from './state.js';
import { showSuccess, showError } from './ui-notifications.js';

export function generateFullReport() {
    if (!AppState.lastSessionId) {
        showError('Нет данных для отчета');
        return;
    }
    window.open(`/api/report/${AppState.lastSessionId}/html`, '_blank');
}
1.49-9201-1-3/1
function getEffectiveActualCoefficient(item) {
    let actual = item.actualCoefficient ?? item.actual_coefficient;
    if (actual !== null && actual !== undefined && actual !== 1) {
        return actual;
    }
    return 1;
}
/*
export async function copyFilteredCodes() {
    const currentResults = AppState.currentResults || [];

    if (!currentResults.length) {
        showError('Нет данных для копирования');
        return;
    }

    try {
        const currentDateTime = new Date().toLocaleString('ru-RU', {
            timeZone: 'Europe/Moscow',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        function getActualCoefficientIfExists(item) {
            let actual = item.actualCoefficient ?? item.actual_coefficient;
            if (actual !== null && actual !== undefined && actual !== 0 && actual !== 1) {
                return actual;
            }
            return null;
        }

        function getSpecialCodeText(code, position, actualCoefficient = null) {
            const specialCodes = {
                '1.49-9201-1-3/1': {
                    title: 'Вывоз мусора',
                    textTemplate: (coeff) => {
                        if (coeff && coeff !== 1) {
                            const coeffFormatted = coeff.toString().replace('.', ',');
                            return `    Проверьте обоснованность его применения. Необходимо проверить коэффициент, учитывающий расстояние вывоза строительного мусора, в зависимости от округа, в котором расположен объект ремонта. Коэф. = среднее расстояние перевозки отходов строительства и сноса по округам минус 1 км.
    Данные о расстоянии перевозки отходов строительства и сноса принимаются согласно приложению № 2 к письму Москомэкспертизы от 17.11.2023 № МКЭ-ОД/23-19.
`;
                        }
                        return '';
                    }
                }
            };

            for (const [key, value] of Object.entries(specialCodes)) {
                if (code === key || (code && code.includes(key))) {
                    const text = value.textTemplate(actualCoefficient);
                    if (text) {
                        return { title: value.title, text: text };
                    }
                }
            }
            return null;
        }

        function shouldShowDescription(item) {
            const matchType = item.matchType || item.match_type || '';
            
            const hideDescriptionForTypes = [
                'chapter', 'collection', 'section', 'parent', 'parent_collection'
            ];
            
            if (hideDescriptionForTypes.includes(matchType)) {
                return false;
            }
            return true;
        }

        const notAllowedCodes = currentResults.filter(item =>
            (item.status === 'Нельзя применять' || item.isRestoration) &&
            !(item.isText || item.is_text === 1)
        );

        const warningCodes = currentResults.filter(item => {
            if (item.isText || item.is_text === 1) return false;
            if (item.status === 'Нельзя применять' || item.isRestoration) return false;
            
            const actual = getActualCoefficientIfExists(item);
            const expected = item.expectedCoefficient ?? item.expected_coefficient ?? 1;
            
            // Есть реальный коэффициент больше 1
            if (actual !== null && actual > 1) return true;
            
            // Коэффициента нет, но ожидается не 1
            if (actual === null && expected !== 1) return true;
            
            // Статус "Обратите внимание" И коэффициент завышен
            if (item.status === 'Обратите внимание' && actual !== null && actual > expected) return true;
            
            return false;
        });

        const textLinesCount = currentResults.filter(item =>
            item.isText || item.is_text === 1
        ).length;

        let text = `ГКУ СФК ДОНМ ${currentDateTime} проведен автоматизированный мониторинг применения сметных нормативов в сметах, прилагаемых к контрактам. По итогам проведенного мониторинга по контракту от ________ № _______ на _________________ в сметной документации выявлены следующие недостатки с признаками «Нельзя применить», «Требует внимания», «Дополнительное замечание»:

`;

        // ==================== БЛОК «Нельзя применять» ====================
        if (notAllowedCodes.length > 0) {
            text += `Признак «Нельзя применить»
Неправомерное применение для объектов отрасли «Образование» стоимостных нормативов, разработанных для объектов, к которым установлены специальные эксплуатационные требования, связанные с их функциональным назначением и конструктивным решением, включая объекты культурного наследия.

`;
            for (let i = 0; i < notAllowedCodes.length; i++) {
                const item = notAllowedCodes[i];
                const code = item.extractedCode || item.code || '—';
                const position = item.positionNumber || item.position_number || '—';
                const actual = getActualCoefficientIfExists(item);
                const special = getSpecialCodeText(code, position, actual);
                
                let line = `${i+1}. Шифр: ${code} (позиция ${position})`;
                if (special && special.text) {
                    line += `\n    ${special.text}`;
                } else {
                    let fullDescription = item.description || item.dbDescription || '';
                    if (fullDescription && fullDescription !== '—') {/*
                        let cleanDesc = fullDescription.replace().replace(/\s+/g, ' ').trim();
                        if (cleanDesc) line += `\n    ${cleanDesc}`;
                    }
                }
                text += line + '\n';
            }
        }

        // ==================== БЛОК «Требует внимания» ====================
        if (warningCodes.length > 0) {
            if (notAllowedCodes.length > 0) {
                text += '\n';
            }
            
            text += `Признак «Требует внимания»
Информация о необходимости проверки корректности и обоснования применения к стоимостным нормативам повышающих (и/или понижающих) коэффициентов, с учетом условий производства работ и необходимости их обоснования.

`;
            for (let i = 0; i < warningCodes.length; i++) {
                const item = warningCodes[i];
                const code = item.extractedCode || item.code || '—';
                const position = item.positionNumber || item.position_number || '—';
                const actual = getActualCoefficientIfExists(item);
                
                let line = `${i+1}. Шифр: ${code} (позиция ${position})`;
                
                if (actual !== null) {
                    const actualFormatted = actual.toString().replace('.', ',');
                    line += `- в смете применён коэффициент ${actualFormatted}`;
                }
                
                text += line + '\n';
                
                const special = getSpecialCodeText(code, position, actual);
                
                if (special && special.text) {
                    text += `    ${special.text}\n`;
                } else {
                    const shouldShow = shouldShowDescription(item);
                    
                    if (shouldShow) {
                        let dbDescription = item.dbDescription || item.description || '';
                        let cleanDesc = dbDescription.replace().replace(/\s+/g, ' ').trim();
                        
                        if (cleanDesc && cleanDesc !== '—' && cleanDesc !== '') {
                            text += `    ${cleanDesc}\n`;
                        }
                    }
                }
            }
            text += '\n';
        }

        // ==================== БЛОК «Дополнительное замечание» ====================
        if (textLinesCount > 0) {
            if (notAllowedCodes.length > 0 || warningCodes.length > 0) {
                text += '\n';
            }
            text += `Признак «Дополнительное замечание»
    Информация о включении в сметную документацию материальных ресурсов «по цене поставщика». В сметной документации обнаружено ${textLinesCount} позиций, сформированных «по цене поставщика»
    Заказчику необходимо дополнительно проверить в открытых источниках информацию об актуальной рыночной стоимости материальных ресурсов «по цене поставщика» (с учетом положений Распоряжения Правительства Москвы от 16.05.2014 № 242-РП «Об утверждении Методических рекомендаций по применению методов определения начальной (максимальной) цены контракта, цены контракта, заключаемого с единственным поставщиком (подрядчиком, исполнителем), начальной цены единицы товара, работы, услуги»).
    
    `;
        }

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
        showSuccess(`Письмо скопировано в буфер обмена (проблем: ${totalIssues}, цена поставщика: ${textLinesCount})`);

    } catch (err) {
        console.error('Ошибка копирования:', err);
        showError('Не удалось скопировать текст');
    }
}
*/

// public/modules/reports.js

export async function copyFilteredCodes() {
    // 🔥 БЕРЁМ ВСЕ ПОЗИЦИИ из detailedPositionsData
    const allPositions = AppState.detailedPositionsData || [];
    
    if (!allPositions.length) {
        showError('Нет данных для копирования');
        return;
    }

    try {
        const currentDateTime = new Date().toLocaleString('ru-RU', {
            timeZone: 'Europe/Moscow',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // ========== ФУНКЦИЯ ПОЛУЧЕНИЯ КОЭФФИЦИЕНТА ==========
        function getActualCoefficientIfExists(item) {
            let actual = item.actualCoefficient ?? item.actual_coefficient;
            if (actual !== null && actual !== undefined && actual !== 0 && actual !== 1) {
                return actual;
            }
            return null;
        }

        // ========== ПРОВЕРКА НАЛИЧИЯ КОДА 1.50 (среди ВСЕХ позиций) ==========
        const hasCode150 = allPositions.some(item => {
            const code = item.extractedCode || item.code || '';
            return code.startsWith('1.50');
        });

        // ========== ОТЛАДКА ==========
        console.log('===== ДЕБАГ КОПИРОВАНИЯ (Вариант 2) =====');
        console.log('Есть код 1.50 в смете (по всем позициям):', hasCode150);
        console.log('Всего позиций в allPositions:', allPositions.length);

        // ========== ОСНОВНАЯ ФУНКЦИЯ ПРОВЕРКИ ==========
        function shouldIncludeCode(item) {
            const code = item.extractedCode || item.code || '';
            const actualCoeff = getActualCoefficientIfExists(item);
            
            // ========== 1. КОД 1.49 ==========
            if (code === '1.49-9201-1-3/1' || code.startsWith('1.49-9201-1-3/1')) {
                return actualCoeff !== null && actualCoeff > 65;
            }
            
            // ========== 2. КОЭФФИЦИЕНТ > 1 - ВСЕГДА ВЫВОДИМ ==========
            if (actualCoeff !== null && actualCoeff > 1) {
                return true;
            }
            
            // ========== 3. КОДЫ 1.50 (только из массива, точное совпадение) ==========
// ========== ПРОВЕРКА НАЛИЧИЯ КОДА 1.50 (ТОЛЬКО ИЗ МАССИВА) ==========
const code150ListForCheck = [
    '1.50-3203-33-1/1',
    '1.50-3203-33-2/1',
    '1.50-3203-32-1/1',
    '1.50-3203-32-2/1',
    '1.50-3203-35-1/1',
    '1.50-3203-35-2/1'
];

const hasCode150 = allPositions.some(item => {
    const code = item.extractedCode || item.code || '';
    const isMatch = code150ListForCheck.includes(code);
    if (isMatch) {
        console.log('🔍 Найден точный код 1.50:', code);
    }
    return isMatch;
});

// ========== ОТЛАДКА ==========
console.log('===== ДЕБАГ КОПИРОВАНИЯ =====');
console.log('Есть код 1.50 (точное совпадение):', hasCode150);
console.log('Всего позиций в allPositions:', allPositions.length);
            
            // ========== 4. КОДЫ 1.13 (только из массива, точное совпадение) ==========
            const code113List = [
                // 1.13-3103 (21 код)
                '1.13-3103-1', '1.13-3103-2', '1.13-3103-3', '1.13-3103-4', '1.13-3103-5',
                '1.13-3103-6', '1.13-3103-7', '1.13-3103-8', '1.13-3103-9', '1.13-3103-10',
                '1.13-3103-11', '1.13-3103-12', '1.13-3103-13', '1.13-3103-14', '1.13-3103-15',
                '1.13-3103-16', '1.13-3103-17', '1.13-3103-18', '1.13-3103-19', '1.13-3103-20',
                '1.13-3103-21',
                
                // 1.13-3101 (8 кодов)
                '1.13-3101-1', '1.13-3101-2', '1.13-3101-3', '1.13-3101-4',
                '1.13-3101-5', '1.13-3101-6', '1.13-3101-7', '1.13-3101-8',
                
                // Остальные 1.13
                '1.13-3503-1',
                '1.13-3503-3',
                '1.13-3603-2',
                '1.13-3603-22',
                '1.13-3501-1',
                '1.13-3501-2',
                
                // ДОБАВЛЕННЫЕ ШИФРЫ (с /1, /2 и т.д.)
                '1.13-3101-8-1/1',
                '1.13-3101-7-8/1',
                '1.13-3101-7-7/1',
                '1.13-3101-7-6/1',
                '1.13-3101-7-5/1',
                '1.13-3101-7-4/1',
                '1.13-3101-7-3/1',
                '1.13-3101-7-2/1',
                '1.13-3101-7-1/1',
                '1.13-3101-6-4/1',
                '1.13-3101-6-3/1',
                '1.13-3101-6-2/1',
                '1.13-3101-5-6/1',
                '1.13-3101-5-5/1',
                '1.13-3101-5-4/1',
                '1.13-3101-5-3/1',
                '1.13-3101-5-2/1',
                '1.13-3101-5-1/1',
                '1.13-3101-4-6/1',
                '1.13-3101-4-5/1',
                '1.13-3101-4-4/1',
                '1.13-3101-4-3/1',
                '1.13-3101-4-2/1',
                '1.13-3101-4-1/1',
                '1.13-3101-3-12/1',
                '1.13-3101-3-11/1',
                '1.13-3101-3-10/1',
                '1.13-3101-3-9/1',
                '1.13-3101-3-8/1',
                '1.13-3101-3-7/1',
                '1.13-3101-3-6/1',
                '1.13-3101-3-5/1',
                '1.13-3101-3-4/1',
                '1.13-3101-3-3/1',
                '1.13-3101-3-2/1',
                '1.13-3101-3-1/1',
                '1.13-3101-2-6/1',
                '1.13-3101-2-5/1',
                '1.13-3101-2-4/1',
                '1.13-3101-2-3/1',
                '1.13-3101-2-2/1',
                '1.13-3101-2-1/1',
                '1.13-3101-1-12/1',
                '1.13-3101-1-11/1',
                '1.13-3101-1-10/1',
                '1.13-3101-1-9/1',
                '1.13-3101-1-8/1',
                '1.13-3101-1-7/1',
                '1.13-3101-1-6/1',
                '1.13-3101-1-5/1',
                '1.13-3101-1-4/1',
                '1.13-3101-1-3/1',
                '1.13-3101-1-2/1',
                '1.13-3101-1-1/1',
                '1.13-3603-22-1/1',
                '1.13-3603-2-1/1',
                '1.13-3501-1-6/2',
                '1.13-3501-1-6/1',
                '1.13-3501-1-5/1',
                '1.13-3501-1-4/2',
                '1.13-3501-1-4/1',
                '1.13-3501-1-3/2',
                '1.13-3501-1-3/1',
                '1.13-3501-1-2/2',
                '1.13-3501-1-2/1',
                '1.13-3501-1-1/2',
                '1.13-3501-1-1/1',
                '1.13-3503-3-4/2',
                '1.13-3503-3-4/1',
                '1.13-3503-3-3/2',
                '1.13-3503-3-3/1',
                '1.13-3503-3-2/2',
                '1.13-3503-3-2/1',
                '1.13-3503-3-1/2',
                '1.13-3503-3-1/1',
                '1.13-3501-2-1/2',
                '1.13-3501-2-1/1',
                '1.13-3503-1-2/2',
                '1.13-3503-1-2/1',
                '1.13-3503-1-1/2',
                '1.13-3503-1-1/1',
                '1.13-3103-1-1/1',
                '1.13-3103-1-2/1',
                '1.13-3103-1-3/1',
                '1.13-3103-1-4/1',
                '1.13-3103-1-5/1',
                '1.13-3103-1-6/1',
                '1.13-3103-1-7/1',
                '1.13-3103-1-8/1',
                '1.13-3103-1-9/1',
                '1.13-3103-1-10/1',
                '1.13-3103-1-11/1',
                '1.13-3103-1-12/1',
                '1.13-3103-2-1/1',
                '1.13-3103-2-2/1',
                '1.13-3103-2-3/1',
                '1.13-3103-2-4/1',
                '1.13-3103-2-5/1',
                '1.13-3103-2-6/1',
                '1.13-3103-2-7/1',
                '1.13-3103-2-8/1',
                '1.13-3103-2-9/1',
                '1.13-3103-2-10/1',
                '1.13-3103-2-11/1',
                '1.13-3103-2-12/1',
                '1.13-3103-3-1/1',
                '1.13-3103-3-2/1',
                '1.13-3103-3-3/1',
                '1.13-3103-4-1/1',
                '1.13-3103-4-2/1',
                '1.13-3103-5-1/1',
                '1.13-3103-5-2/1',
                '1.13-3103-6-1/1',
                '1.13-3103-6-2/1',
                '1.13-3103-6-3/1',
                '1.13-3103-6-4/1',
                '1.13-3103-6-5/1',
                '1.13-3103-6-6/1',
                '1.13-3103-6-7/1',
                '1.13-3103-7-1/1',
                '1.13-3103-8-1/1',
                '1.13-3103-8-2/1',
                '1.13-3103-9-1/1',
                '1.13-3103-9-2/1',
                '1.13-3103-9-3/1',
                '1.13-3103-9-4/1',
                '1.13-3103-10-1/1',
                '1.13-3103-10-2/1',
                '1.13-3103-10-3/1',
                '1.13-3103-10-4/1',
                '1.13-3103-11-1/1',
                '1.13-3103-11-2/1',
                '1.13-3103-11-3/1',
                '1.13-3103-11-4/1',
                '1.13-3103-11-5/1',
                '1.13-3103-11-6/1',
                '1.13-3103-12-1/1',
                '1.13-3103-12-2/1',
                '1.13-3103-12-3/1',
                '1.13-3103-12-4/1',
                '1.13-3103-12-5/1',
                '1.13-3103-12-6/1',
                '1.13-3103-13-1/1',
                '1.13-3103-13-2/1',
                '1.13-3103-13-3/1',
                '1.13-3103-13-4/1',
                '1.13-3103-13-5/1',
                '1.13-3103-13-6/1',
                '1.13-3103-14-1/1',
                '1.13-3103-14-2/1',
                '1.13-3103-14-3/1',
                '1.13-3103-14-4/1',
                '1.13-3103-16-1/1',
                '1.13-3103-16-2/1',
                '1.13-3103-17-1/1',
                '1.13-3103-17-2/1',
                '1.13-3103-17-3/1',
                '1.13-3103-17-4/1',
                '1.13-3103-17-5/1',
                '1.13-3103-17-6/1',
                '1.13-3103-17-7/1',
                '1.13-3103-17-8/1',
                '1.13-3103-17-9/1',
                '1.13-3103-17-10/1',
                '1.13-3103-17-11/1',
                '1.13-3103-17-12/1',
                '1.13-3103-19-1/1',
                '1.13-3103-19-2/1',
                '1.13-3103-19-3/1',
                '1.13-3103-19-4/1',
                '1.13-3103-19-5/1',
                '1.13-3103-19-6/1',
                '1.13-3103-19-7/1',
                '1.13-3103-19-8/1',
                '1.13-3103-19-9/1',
                '1.13-3103-19-10/1',
                '1.13-3103-19-11/1',
                '1.13-3103-19-12/1',
                '1.13-3103-20-1/1',
                '1.13-3103-20-2/1',
                '1.13-3103-21-1/1',
                '1.13-3103-21-2/1',
                '1.13-3103-21-3/1',
                '1.13-3103-21-4/1',
                '1.13-3103-21-5/1',
                '1.13-3103-21-6/1'
            ];
            
            // ТОЧНОЕ СОВПАДЕНИЕ, а не startsWith
            const isCode113 = code113List.includes(code);
           /* 
            if (isCode113) {
                // Если есть код 1.50 в смете - выводим 1.13
                if (hasCode150) {
                    return true;
                }
                return false;
            }
            */
            // ========== 5. ОСТАЛЬНЫЕ КОДЫ ==========
            if (item.isText || item.is_text === 1) return true;
            if (item.status === 'Нельзя применять' || item.isRestoration) return true;
            if (item.status === 'Обратите внимание') return true;
            
            return false;
        }
        // ========== ФИЛЬТРАЦИЯ КОДОВ ==========
        const codesToInclude = allPositions.filter(shouldIncludeCode);

        // ========== ОТЛАДКА - статистика ==========
        const included113 = codesToInclude.filter(item => {
            const code = item.extractedCode || item.code || '';
            return code.startsWith('1.13');
        });
        const all113 = allPositions.filter(item => {
            const code = item.extractedCode || item.code || '';
            return code.startsWith('1.13');
        });
        console.log(`📊 1.13 в результате: ${included113.length} из ${all113.length}`);

        // ========== ФОРМИРОВАНИЕ ТЕКСТА ПИСЬМА ==========
        let text = `ГКУ СФК ДОНМ ${currentDateTime} проведен автоматизированный мониторинг применения сметных нормативов в сметах, прилагаемых к контрактам. По итогам проведенного мониторинга по контракту от ________ № _______ на _________________ в сметной документации выявлены следующие недостатки с признаками «Нельзя применить», «Требует внимания», «Возможный риск»:

`;

        // ==================== БЛОК «Нельзя применять» ====================
        const notAllowedCodes = codesToInclude.filter(item =>
            (item.status === 'Нельзя применять' || item.isRestoration) &&
            !(item.isText || item.is_text === 1)
        );

        if (notAllowedCodes.length > 0) {
            text += `Признак «Нельзя применить»
Неправомерное применение для объектов отрасли «Образование» стоимостных нормативов, разработанных для объектов, к которым установлены специальные эксплуатационные требования, связанные с их функциональным назначением и конструктивным решением, включая объекты культурного наследия.

`;
            for (let i = 0; i < notAllowedCodes.length; i++) {
                const item = notAllowedCodes[i];
                const code = item.extractedCode || item.code || '—';
                const position = item.positionNumber || item.position_number || '—';
                const actual = getActualCoefficientIfExists(item);
                
                let line = `${i+1}. Шифр: ${code} (позиция ${position})`;
                if (actual !== null && actual > 1) {
                    line += ` (применённый коэффициент ${actual.toString().replace('.', ',')})`;
                }
                
                let fullDescription = item.description || item.dbDescription || '';
                if (fullDescription && fullDescription !== '—') {
                    let cleanDesc = fullDescription.replace(/^[⚠️✅ℹ️❌📝]\s*/, '').replace(/\s+/g, ' ').trim();
                    if (cleanDesc) line += `\n    ${cleanDesc}`;
                }
                text += line + '\n';
            }
        }

        // ==================== БЛОК «Требует внимания» ====================
        const warningCodes = codesToInclude.filter(item => {
            if (item.isText || item.is_text === 1) return false;
            if (item.status === 'Нельзя применять' || item.isRestoration) return false;
            if (item.status === 'Обратите внимание') return true;
            return false;
        });

        if (warningCodes.length > 0) {
            if (notAllowedCodes.length > 0) text += '\n';
            
            text += `Признак «Требует внимания»
Информация о необходимости проверки корректности и обоснования применения к стоимостным нормативам повышающих (и/или понижающих) коэффициентов, с учетом условий производства работ и необходимости их обоснования.

`;
            for (let i = 0; i < warningCodes.length; i++) {
                const item = warningCodes[i];
                const code = item.extractedCode || item.code || '—';
                const position = item.positionNumber || item.position_number || '—';
                const actual = getActualCoefficientIfExists(item);
                
                let line = `${i+1}. Шифр: ${code} (позиция ${position})`;
                
                if (actual !== null) {
                    const actualFormatted = actual.toString().replace('.', ',');
                    line += ` (применённый коэффициент ${actualFormatted})`;
                }
                
                let dbDescription = item.dbDescription || item.description || '';
                let cleanDesc = dbDescription.replace(/^[⚠️✅ℹ️❌📝]\s*/, '').replace(/\s+/g, ' ').trim();
                if (cleanDesc && cleanDesc !== '—' && cleanDesc !== '') {
                    line += `\n    ${cleanDesc}`;
                }
                text += line + '\n';
            }
            text += '\n';
        }

        // ==================== БЛОК «Возможный риск» ====================
        const textLinesCount = codesToInclude.filter(item =>
            item.isText || item.is_text === 1
        ).length;

        if (textLinesCount > 0) {
            if (notAllowedCodes.length > 0 || warningCodes.length > 0) text += '\n';
            text += `Признак «Возможный риск»
    Информация о включении в сметную документацию материальных ресурсов «по цене поставщика». В сметной документации обнаружено ${textLinesCount} позиций, сформированных «по цене поставщика»
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

        // ==================== КОПИРОВАНИЕ В БУФЕР ====================
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
        showSuccess(`Письмо скопировано в буфер обмена (проблем: ${totalIssues}, цена поставщика: ${textLinesCount})`);

    } catch (err) {
        console.error('Ошибка копирования:', err);
        showError('Не удалось скопировать текст');
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