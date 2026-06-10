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

function getEffectiveActualCoefficient(item) {
    let actual = item.actualCoefficient ?? item.actual_coefficient;
    if (actual !== null && actual !== undefined && actual !== 1) {
        return actual;
    }
    return 1;
}

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
                            return ` В смете применён коэффициент: ${coeffFormatted}. Проверьте обоснованность его применения. Необходимо проверить коэффициент, учитывающий расстояние вывоза строительного мусора, в зависимости от округа, в котором расположен объект ремонта.
Коэф. = среднее расстояние перевозки отходов строительства и сноса по округам минус 1 км. Данные о расстоянии перевозки отходов строительства и сноса принимаются согласно приложению № 2 к письму Москомэкспертизы от 17.11.2023 № МКЭ-ОД/23-19.
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
                    if (fullDescription && fullDescription !== '—') {
                        let cleanDesc = fullDescription.replace(/^[⚠️✅ℹ️❌📝]\s*/, '').replace(/\s+/g, ' ').trim();
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
                    line += ` (применённый коэффициент ${actualFormatted})`;
                }
                
                text += line + '\n';
                
                const special = getSpecialCodeText(code, position, actual);
                
                if (special && special.text) {
                    text += `    ${special.text}\n`;
                } else {
                    const shouldShow = shouldShowDescription(item);
                    
                    if (shouldShow) {
                        let dbDescription = item.dbDescription || item.description || '';
                        let cleanDesc = dbDescription.replace(/^[⚠️✅ℹ️❌📝]\s*/, '').replace(/\s+/g, ' ').trim();
                        
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