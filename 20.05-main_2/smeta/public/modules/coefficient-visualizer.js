// public/modules/coefficient-visualizer.js

/**
 * Модуль визуализации коэффициентов
 * Показывает графическую шкалу для оценки критичности коэффициента
 */

export class CoefficientVisualizer {
    constructor() {
        this.colors = {
            perfect: '#10b981',  // зеленый - идеально
            good: '#34d399',     // светло-зеленый - хорошо
            warning: '#f59e0b',  // оранжевый - внимание
            critical: '#ef4444', // красный - критично
            info: '#3b82f6'      // синий - информация
        };
    }

    /**
     * Оценивает критичность отклонения коэффициента
     */
    assessSeverity(actual, expected, tolerance = 0.05) {
        if (!expected || expected === 1) {
            if (actual > 1.5) return { level: 'critical', message: 'Сильное завышение', percent: 100 };
            if (actual > 1.2) return { level: 'warning', message: 'Умеренное завышение', percent: 70 };
            if (actual > 1.05) return { level: 'warning', message: 'Небольшое завышение', percent: 40 };
            if (actual < 0.8) return { level: 'info', message: 'Понижающий коэффициент', percent: 20 };
            return { level: 'good', message: 'В норме', percent: 10 };
        }

        const deviation = (actual - expected) / expected;
        const absDeviation = Math.abs(deviation);
        
        if (absDeviation <= tolerance) {
            return { level: 'perfect', message: 'Точно соответствует', percent: 0 };
        }
        
        if (deviation > 0) {
            // Завышение
            if (absDeviation > 0.5) return { level: 'critical', message: 'Критическое завышение', percent: 100 };
            if (absDeviation > 0.3) return { level: 'critical', message: 'Сильное завышение', percent: 85 };
            if (absDeviation > 0.2) return { level: 'warning', message: 'Значительное завышение', percent: 65 };
            if (absDeviation > 0.1) return { level: 'warning', message: 'Умеренное завышение', percent: 45 };
            return { level: 'warning', message: 'Небольшое завышение', percent: 25 };
        } else {
            // Занижение
            if (absDeviation > 0.5) return { level: 'critical', message: 'Критическое занижение', percent: 90 };
            if (absDeviation > 0.3) return { level: 'warning', message: 'Сильное занижение', percent: 70 };
            if (absDeviation > 0.2) return { level: 'info', message: 'Значительное занижение', percent: 50 };
            if (absDeviation > 0.1) return { level: 'info', message: 'Умеренное занижение', percent: 30 };
            return { level: 'good', message: 'Небольшое занижение', percent: 15 };
        }
    }

    /**
     * Создает визуальный индикатор коэффициента
     */
    createIndicator(actual, expected, details = {}) {
        const severity = this.assessSeverity(actual, expected);
        const actualFormatted = actual.toFixed(3);
        const expectedFormatted = expected ? expected.toFixed(3) : '1.000';
        
        // Вычисляем процент отклонения
        let deviationPercent = 0;
        let trendIcon = '';
        let trendColor = '';
        
        if (expected && expected !== 1) {
            deviationPercent = ((actual - expected) / expected * 100);
            if (deviationPercent > 0) {
                trendIcon = '📈';
                trendColor = '#ef4444';
            } else if (deviationPercent < 0) {
                trendIcon = '📉';
                trendColor = '#f59e0b';
            } else {
                trendIcon = '✓';
                trendColor = '#10b981';
            }
        } else if (actual > 1) {
            deviationPercent = (actual - 1) * 100;
            trendIcon = '📈';
            trendColor = '#ef4444';
        } else if (actual < 1) {
            deviationPercent = (1 - actual) * 100;
            trendIcon = '📉';
            trendColor = '#10b981';
        } else {
            trendIcon = '✓';
            trendColor = '#10b981';
        }
        
        // Создаем HTML индикатора
        const container = document.createElement('div');
        container.className = `coefficient-indicator coefficient-level-${severity.level}`;
        container.style.cssText = `
            display: inline-flex;
            flex-direction: column;
            gap: 6px;
            min-width: 200px;
            padding: 8px 12px;
            background: #f8fafc;
            border-radius: 12px;
            border-left: 3px solid ${this.colors[severity.level] || '#cbd5e1'};
        `;
        
        // Заголовок с значениями
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            font-size: 12px;
        `;
        header.innerHTML = `
            <span style="color: #64748b;">Коэффициент:</span>
            <span style="font-weight: 700; font-family: monospace; font-size: 14px;">
                ${actualFormatted}
            </span>
        `;
        
        // Ожидаемое значение
        if (expected && expected !== 1) {
            const expectedRow = document.createElement('div');
            expectedRow.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                font-size: 11px;
                color: #64748b;
            `;
            expectedRow.innerHTML = `
                <span>Ожидаемый:</span>
                <span style="font-family: monospace;">${expectedFormatted}</span>
            `;
            container.appendChild(expectedRow);
        }
        
        container.appendChild(header);
        
        // Прогресс-бар
        const barContainer = document.createElement('div');
        barContainer.style.cssText = `
            position: relative;
            height: 32px;
            margin: 4px 0;
        `;
        
        // Шкала
        const scale = document.createElement('div');
        scale.style.cssText = `
            position: relative;
            height: 24px;
            background: linear-gradient(to right, #10b981, #f59e0b, #ef4444);
            border-radius: 12px;
            overflow: hidden;
        `;
        
        // Маркер текущего значения
        let markerPosition = 50; // центр по умолчанию
        
        if (expected && expected !== 1) {
            // Нормализуем значение относительно ожидаемого
            const maxExpected = Math.max(actual, expected) * 1.5;
            const minValue = 0;
            const position = ((actual - minValue) / (maxExpected - minValue)) * 100;
            markerPosition = Math.min(Math.max(position, 5), 95);
        } else if (actual > 1) {
            // Для коэффициентов больше 1, шкала от 1 до 2
            const position = Math.min(((actual - 1) / 1) * 100, 95);
            markerPosition = Math.min(Math.max(position, 5), 95);
        } else {
            // Для понижающих, шкала от 0 до 1
            markerPosition = actual * 95;
        }
        
        const marker = document.createElement('div');
        marker.style.cssText = `
            position: absolute;
            top: -4px;
            left: ${markerPosition}%;
            transform: translateX(-50%);
            width: 8px;
            height: 32px;
            background: #1e293b;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            z-index: 2;
        `;
        
        const markerTooltip = document.createElement('div');
        markerTooltip.style.cssText = `
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: #1e293b;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            white-space: nowrap;
            pointer-events: none;
            margin-bottom: 4px;
        `;
        markerTooltip.textContent = actualFormatted;
        marker.appendChild(markerTooltip);
        
        scale.appendChild(marker);
        barContainer.appendChild(scale);
        
        // Подписи под шкалой
        const labels = document.createElement('div');
        labels.style.cssText = `
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #94a3b8;
            margin-top: 4px;
        `;
        
        if (expected && expected !== 1) {
            const maxVal = Math.max(actual, expected) * 1.5;
            labels.innerHTML = `
                <span>0</span>
                <span>Норма: ${expectedFormatted}</span>
                <span>${maxVal.toFixed(2)}</span>
            `;
        } else if (actual > 1) {
            labels.innerHTML = `
                <span>1.0</span>
                <span>⚠️ Граница</span>
                <span>2.0+</span>
            `;
        } else {
            labels.innerHTML = `
                <span>0</span>
                <span>📉 Понижающий</span>
                <span>1.0</span>
            `;
        }
        
        barContainer.appendChild(labels);
        container.appendChild(barContainer);
        
        // Статистика отклонения
        const stats = document.createElement('div');
        stats.style.cssText = `
            display: flex;
            gap: 16px;
            font-size: 11px;
            padding-top: 4px;
            border-top: 1px solid #e2e8f0;
            margin-top: 4px;
        `;
        
        stats.innerHTML = `
            <div style="display: flex; align-items: center; gap: 4px;">
                ${trendIcon}
                <span style="color: ${trendColor}; font-weight: 600;">
                    ${deviationPercent > 0 ? '+' : ''}${deviationPercent.toFixed(1)}%
                </span>
                <span style="color: #64748b;">от нормы</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
                <span>⚡</span>
                <span style="color: ${this.colors[severity.level]}">${severity.message}</span>
            </div>
        `;
        
        container.appendChild(stats);
        
        return container;
    }
    
    /**
     * Создает компактный индикатор для таблицы
     */
    createCompactIndicator(actual, expected) {
        const severity = this.assessSeverity(actual, expected);
        
        // Определяем цвет и иконку
        let bgColor, textColor, icon, tooltipText;
        
        switch(severity.level) {
            case 'perfect':
                bgColor = '#dcfce7';
                textColor = '#166534';
                icon = '✅';
                tooltipText = `Точно соответствует: ${actual.toFixed(3)} = ${expected?.toFixed(3) || '1.000'}`;
                break;
            case 'good':
                bgColor = '#d1fae5';
                textColor = '#065f46';
                icon = '✓';
                tooltipText = `В пределах нормы: ${actual.toFixed(3)}`;
                break;
            case 'warning':
                bgColor = '#fed7aa';
                textColor = '#9a3412';
                icon = '⚠️';
                tooltipText = `${severity.message}: ${actual.toFixed(3)}${expected ? ` (норма ${expected.toFixed(3)})` : ''}`;
                break;
            case 'critical':
                bgColor = '#fee2e2';
                textColor = '#991b1b';
                icon = '🔴';
                tooltipText = `${severity.message}: ${actual.toFixed(3)}${expected ? ` (норма ${expected.toFixed(3)})` : ''}`;
                break;
            default:
                bgColor = '#e2e8f0';
                textColor = '#475569';
                icon = 'ℹ️';
                tooltipText = `Коэффициент: ${actual.toFixed(3)}`;
        }
        
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: ${bgColor};
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            color: ${textColor};
            cursor: help;
            transition: all 0.2s;
        `;
        indicator.innerHTML = `${icon} ${actual.toFixed(3)}`;
        indicator.title = tooltipText;
        
        // Добавляем анимацию при наведении
        indicator.addEventListener('mouseenter', () => {
            indicator.style.transform = 'scale(1.05)';
            indicator.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        });
        indicator.addEventListener('mouseleave', () => {
            indicator.style.transform = 'scale(1)';
            indicator.style.boxShadow = 'none';
        });
        
        return indicator;
    }
    
    /**
     * Создает детальный попап с визуализацией
     */
    createDetailedPopup(actual, expected, additionalInfo = {}) {
        const popup = document.createElement('div');
        popup.style.cssText = `
            position: fixed;
            z-index: 10000;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
            padding: 20px;
            min-width: 320px;
            max-width: 400px;
            animation: fadeIn 0.2s ease;
        `;
        
        // Заголовок
        const title = document.createElement('h4');
        title.style.cssText = `
            margin: 0 0 12px 0;
            font-size: 16px;
            font-weight: 600;
            color: #1e293b;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        title.innerHTML = `<i class="fas fa-chart-line" style="color: #667eea;"></i> Детальный анализ коэффициента`;
        
        // Основной индикатор
        const indicator = this.createIndicator(actual, expected, additionalInfo);
        
        // Дополнительная информация
        const info = document.createElement('div');
        info.style.cssText = `
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid #e2e8f0;
            font-size: 12px;
            color: #475569;
        `;
        
        let infoHtml = '';
        if (additionalInfo.codeName) {
            infoHtml += `<div><strong>Код:</strong> ${additionalInfo.codeName}</div>`;
        }
        if (additionalInfo.position) {
            infoHtml += `<div><strong>Позиция:</strong> ${additionalInfo.position}</div>`;
        }
        if (additionalInfo.description) {
            infoHtml += `<div style="margin-top: 8px;"><strong>Рекомендация:</strong><br>${additionalInfo.description}</div>`;
        }
        
        info.innerHTML = infoHtml;
        
        popup.appendChild(title);
        popup.appendChild(indicator);
        if (infoHtml) popup.appendChild(info);
        
        return popup;
    }
}

// Создаем глобальный экземпляр
export const coefficientVisualizer = new CoefficientVisualizer();