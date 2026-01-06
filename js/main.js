/**
 * SCT TÁCTICO - MORTEROS-MARIA V17.0 (FINAL)
 * - Calibración: Lima General (NOAA WMM-2025)
 * - Guardado: Manual (Con alerta de cierre)
 * - Interfaz: Paneles redimensionables
 */

let distanciaTiroGlobal = 0;
let contadorReglajes = 0;
let historialImpactos = [];
let map = null;
let mapMarkers = {};

// BANDERA DE ESTADO: Indica si hay cambios pendientes de guardar
let hayCambiosSinGuardar = false;

/**
 * 1. INICIALIZACIÓN DEL SISTEMA
 */
document.addEventListener('DOMContentLoaded', () => {
    // Fecha por defecto: HOY
    const inputFecha = document.getElementById('fecha_tiro');
    if (inputFecha && !inputFecha.value) inputFecha.value = new Date().toISOString().split('T')[0];

    // Iniciar Módulos
    initHybridMap();
    initResizers();
    recuperarSistema();  // Carga lo último guardado en memoria

    // --- LISTENERS DE CAMBIOS (ACTIVAN LA BANDERA) ---
    const inputsAll = [
        'mx', 'my', 'alt_pieza', 'tx', 'ty', 'alt_obj', 'orientacion_base', 'tipoGranada', 'zona_utm',
        'meteo_vel', 'meteo_dir', 'meteo_temp', 'meteo_pres', 'temp_carga', 'dif_peso', 'dif_vel',
        'fecha_tiro'
    ];

    inputsAll.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Al escribir, recalculamos pero NO guardamos (solo marcamos pendiente)
            el.addEventListener('input', () => { calcularYDibujar(); marcarCambio(); });
            el.addEventListener('change', () => { calcularYDibujar(); marcarCambio(); });
        }
    });

    // Observador
    ['ox', 'oy', 'distObs', 'azObs', 'azObsUnit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => { calcularTargetDesdeObservador(); marcarCambio(); });
    });

    // Carga Manual
    const selCarga = document.getElementById('sel_carga');
    if (selCarga) {
        selCarga.addEventListener('change', (e) => {
            if (distanciaTiroGlobal > 0 && e.target.value !== '-') {
                actualizarDatosPorCarga(distanciaTiroGlobal, e.target.value);
            }
        });
    }

    // Switch Meteorología
    const chk = document.getElementById('check_bloqueo');
    if (chk) {
        chk.addEventListener('change', () => {
            const label = document.getElementById('lock-text');
            if (chk.checked) {
                label.textContent = "OFF"; label.style.color = "#ff3333"; toggleInputsMeteo(true);
            } else {
                label.textContent = "ON"; label.style.color = "#4dff88"; toggleInputsMeteo(false);
            }
            calcularYDibujar();
            marcarCambio();
        });
    }

    // --- BOTONES DE ACCIÓN ---

    // BOTÓN DE GUARDADO MANUAL (NUEVO)
    const btnGuardar = document.getElementById('btnGuardarManual');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', () => {
            guardarSistema();
            // Feedback visual
            const originalText = btnGuardar.textContent;
            btnGuardar.textContent = "✅ GUARDADO OK";
            setTimeout(() => {
                btnGuardar.textContent = originalText;
            }, 2000);
        });
    }

    const btnCorregir = document.getElementById('btnCorregir');
    if (btnCorregir) btnCorregir.addEventListener('click', () => { aplicarCorreccion(); marcarCambio(); });

    const btnReset = document.getElementById('btnResetHistorial');
    if (btnReset) btnReset.addEventListener('click', () => { reiniciarHistorial(); marcarCambio(); });

    const selMetodo = document.getElementById('metodo_reglaje');
    if (selMetodo) selMetodo.addEventListener('change', toggleReglajeUI);

    // Arranque Inicial
    toggleReglajeUI();
    dibujarRadar(0, 0, 0, 0, NaN, NaN);
});

// --- EL PORTERO: EVITA CERRAR SI NO GUARDASTE ---
window.addEventListener('beforeunload', function (e) {
    if (hayCambiosSinGuardar) {
        // Mensaje estándar del navegador (Chrome no deja personalizarlo, pero bloquea la salida)
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});

/**
 * Activa la bandera de "Cambios Pendientes" y cambia el color del botón
 */
function marcarCambio() {
    if (!hayCambiosSinGuardar) {
        hayCambiosSinGuardar = true;
        const btn = document.getElementById('btnGuardarManual');
        if (btn) {
            btn.textContent = "💾 GUARDAR (*) (PENDIENTE)";
            btn.style.borderColor = "#ffb300"; // Amarillo
            btn.style.color = "#ffb300";
        }
    }
}

/**
 * 2. CÁLCULO DE VARIACIÓN MAGNÉTICA (LIMA GENERAL)
 * Datos extraídos de NOAA WMM-2025: 3° 31' W y 0° 13' W/año
 */
function calcularVariacionMagnetica() {
    const inputFecha = document.getElementById('fecha_tiro').value;
    if (!inputFecha) return -3.52;

    // --- CONFIGURACIÓN LIMA ---
    const baseYear = 2026.0;        // Enero 2026
    const baseDeclination = -3.52;  // Base actual
    const cambioAnual = -0.22;      // Cambio por año
    // --------------------------

    const fecha = new Date(inputFecha);
    const anio = fecha.getFullYear();
    const start = new Date(anio, 0, 0);
    const diff = fecha - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const diaDelAnio = Math.floor(diff / oneDay);

    const fechaDecimal = anio + (diaDelAnio / 365.25);
    const deltaAnios = fechaDecimal - baseYear;

    let variacionActual = baseDeclination + (deltaAnios * cambioAnual);

    return variacionActual;
}

/**
 * 3. CEREBRO PRINCIPAL
 */
function calcularYDibujar() {
    // A. Geometría
    const geo = obtenerGeometria();
    if (!geo) return;

    // B. Mapa y Radar
    if (navigator.onLine && map) updateMapMarkers(geo);
    else dibujarRadar(geo.mx, geo.my, geo.tx, geo.ty, parseFloat(document.getElementById('ox').value), parseFloat(document.getElementById('oy').value));

    distanciaTiroGlobal = geo.dist;

    // C. Variación Magnética Auto-Actualizable
    let variacionMag = calcularVariacionMagnetica();
    document.getElementById('input_variacion').value = variacionMag.toFixed(2);

    // D. Balística
    const tipo = document.getElementById('tipoGranada').value;
    const solBalistica = calcularBalistica(geo.dist, tipo);

    // E. CÁLCULO AZIMUT (CORREGIDO - RESTA LA VARIACIÓN)
    // Azimut = Mapa - Variación + Corrección Viento
    // 0 - (-3.52) = +3.52 (Corrección a la derecha para declinación Oeste)
    let azimutDeTiro = geo.azMils - (variacionMag * 17.778) + (solBalistica.corrDeriva || 0);

    // Normalizar 0-6400
    while (azimutDeTiro < 0) azimutDeTiro += 6400;
    while (azimutDeTiro >= 6400) azimutDeTiro -= 6400;

    // F. Mostrar Resultados
    document.getElementById('resAzimutMils').textContent = Math.round(azimutDeTiro).toString().padStart(4, '0');
    document.getElementById('resAzimutMag').textContent = "GRID " + Math.round(geo.azMils).toString().padStart(4, '0');

    llenarOpcionesDeCarga(geo.dist, tipo, solBalistica.carga);
}

/**
 * 4. GESTIÓN DE CARGAS
 */
function llenarOpcionesDeCarga(dist, tipo, cargaRecomendadaID) {
    const BD = ARSENAL[tipo];
    const sel = document.getElementById('sel_carga');
    const rec = document.getElementById('recomendacion-msg');
    const seleccionPrevia = sel.value;

    sel.innerHTML = "";
    let cargaFinalAUsar = null;
    let cargasPosibles = [];

    for (const c in BD.rangos) {
        if (dist >= BD.rangos[c].min && dist <= BD.rangos[c].max) {
            cargasPosibles.push(c);
            const opt = document.createElement('option');
            opt.value = c;
            opt.text = `CARGA ${c}`;
            sel.appendChild(opt);
        }
    }

    if (cargasPosibles.length > 0) {
        if (cargasPosibles.includes(seleccionPrevia)) {
            sel.value = seleccionPrevia;
            cargaFinalAUsar = seleccionPrevia;
        } else if (cargasPosibles.includes(cargaRecomendadaID)) {
            sel.value = cargaRecomendadaID;
            cargaFinalAUsar = cargaRecomendadaID;
        } else {
            sel.value = cargasPosibles[0];
            cargaFinalAUsar = cargasPosibles[0];
        }

        rec.classList.remove('hidden');
        rec.textContent = `REC: CARGA ${cargaRecomendadaID}`;
        rec.style.color = (cargaFinalAUsar == cargaRecomendadaID) ? "#4dff88" : "#ffb300";
        actualizarDatosPorCarga(dist, cargaFinalAUsar);
    } else {
        sel.innerHTML = "<option>OUT</option>";
        rec.textContent = "FUERA DE ALCANCE";
        rec.style.color = "#ff4444";
        actualizarDatosPorCarga(dist, null);
    }
}

function actualizarDatosPorCarga(dist, cargaID) {
    const elOrient = document.getElementById('cmd_orient');
    const elDeriva = document.getElementById('cmd_deriva');
    const elElev = document.getElementById('cmd_elev');
    const elTime = document.getElementById('cmd_time');
    const elDist = document.getElementById('cmd_dist');

    if (!cargaID || cargaID === 'FUERA') {
        elElev.textContent = "-"; elTime.textContent = "-"; elDeriva.textContent = "-"; elDist.textContent = Math.round(dist);
        return;
    }

    const tipo = document.getElementById('tipoGranada').value;
    const datos = calcularBalistica(dist, tipo, cargaID);

    if (datos.status !== "OK") return;

    const orientBase = parseFloat(document.getElementById('orientacion_base').value) || 0;
    const azimutTiro = parseFloat(document.getElementById('resAzimutMils').textContent) || 0;

    elOrient.textContent = Math.round(orientBase);

    let deriva = orientBase - azimutTiro;
    while (deriva < 0) deriva += 6400;
    while (deriva >= 6400) deriva -= 6400;

    elDeriva.textContent = Math.round(deriva).toString().padStart(4, '0');

    const altM = parseFloat(document.getElementById('alt_pieza').value) || 0;
    const altT = parseFloat(document.getElementById('alt_obj').value) || 0;
    const dAlt = altT - altM;
    let sitioMils = Math.atan(dAlt / dist) * 1000;

    let elevFinal = datos.elev + sitioMils;

    elElev.textContent = Math.round(elevFinal);
    elTime.textContent = datos.tiempo;
    elDist.textContent = Math.round(dist);
}

/**
 * 5. GEOMETRÍA
 */
function obtenerGeometria() {
    const mx = parseFloat(document.getElementById('mx').value);
    const my = parseFloat(document.getElementById('my').value);
    const tx = parseFloat(document.getElementById('tx').value);
    const ty = parseFloat(document.getElementById('ty').value);

    if (isNaN(mx) || isNaN(my) || isNaN(tx) || isNaN(ty)) return null;

    const dx = tx - mx;
    const dy = ty - my;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let az = Math.atan2(dx, dy) * 6400 / (Math.PI * 2);
    if (az < 0) az += 6400;

    return { mx, my, tx, ty, dist, azMils: az };
}

function calcularTargetDesdeObservador() {
    const dist = parseFloat(document.getElementById('distObs').value);
    const azInput = parseFloat(document.getElementById('azObs').value);
    const ox = parseFloat(document.getElementById('ox').value);
    const oy = parseFloat(document.getElementById('oy').value);

    if (isNaN(dist) || isNaN(azInput) || isNaN(ox) || isNaN(oy)) return;

    const azUnit = document.getElementById('azObsUnit').value;
    const rad = (azUnit === 'mils') ? azInput * (Math.PI * 2 / 6400) : azInput * (Math.PI / 180);

    document.getElementById('tx').value = (ox + dist * Math.sin(rad)).toFixed(0);
    document.getElementById('ty').value = (oy + dist * Math.cos(rad)).toFixed(0);

    calcularYDibujar();
    marcarCambio();
}

/**
 * 6. REGLAJE Y CORRECCIÓN
 */
function aplicarCorreccion() {
    const mx = parseFloat(document.getElementById('mx').value);
    const my = parseFloat(document.getElementById('my').value);
    const tx = parseFloat(document.getElementById('tx').value);
    const ty = parseFloat(document.getElementById('ty').value);

    if (isNaN(tx) || isNaN(ty)) return;

    let ox = parseFloat(document.getElementById('ox').value);
    let oy = parseFloat(document.getElementById('oy').value);
    if (isNaN(ox) || isNaN(oy)) { ox = mx; oy = my; }

    const metodo = document.getElementById('metodo_reglaje').value;
    let impX, impY, logMsg = "";

    if (metodo === 'apreciacion') {
        const valLat = parseFloat(document.getElementById('corr_lat_val').value) || 0;
        const valAlc = parseFloat(document.getElementById('corr_metros').value) || 0;

        if (valLat === 0 && valAlc === 0) return;

        const dirLat = document.getElementById('corr_dir').value;
        const unitLat = document.getElementById('corr_lat_unit').value;
        const dirAlc = document.getElementById('corr_range').value;

        const dx = tx - ox;
        const dy = ty - oy;
        const azOT = Math.atan2(dx, dy);
        const distOT = Math.sqrt(dx * dx + dy * dy);

        let desvioLateralMetros = (unitLat === 'm') ? valLat : (distOT * valLat) / 1000;
        let desvioAlcanceMetros = valAlc;

        let offsetX = (dirLat === 'right') ? desvioLateralMetros : -desvioLateralMetros;
        let offsetY = (dirAlc === 'over') ? desvioAlcanceMetros : -desvioAlcanceMetros;

        impX = tx + (offsetY * Math.sin(azOT)) + (offsetX * Math.cos(azOT));
        impY = ty + (offsetY * Math.cos(azOT)) - (offsetX * Math.sin(azOT));

        const errorX = impX - tx;
        const errorY = impY - ty;

        const newTx = tx - errorX;
        const newTy = ty - errorY;

        document.getElementById('tx').value = newTx.toFixed(0);
        document.getElementById('ty').value = newTy.toFixed(0);

        logMsg = `APR: ${dirLat === 'right' ? 'Der' : 'Izq'} ${valLat}, ${dirAlc === 'over' ? '+' : '-'}${valAlc}`;
        document.getElementById('corr_lat_val').value = "";
        document.getElementById('corr_metros').value = "";

    } else {
        const impAz = parseFloat(document.getElementById('impacto_az').value);
        const impDist = parseFloat(document.getElementById('impacto_dist').value);
        const unit = document.getElementById('impacto_az_unit').value;

        if (isNaN(impAz) || isNaN(impDist)) return;

        const rad = (unit === 'mils') ? impAz * (Math.PI * 2 / 6400) : impAz * (Math.PI / 180);
        impX = ox + impDist * Math.sin(rad);
        impY = oy + impDist * Math.cos(rad);

        const errorX = impX - tx;
        const errorY = impY - ty;

        document.getElementById('tx').value = (tx - errorX).toFixed(0);
        document.getElementById('ty').value = (ty - errorY).toFixed(0);

        logMsg = `MED: Az ${impAz}, Dist ${impDist}`;
        document.getElementById('impacto_az').value = "";
        document.getElementById('impacto_dist').value = "";
    }

    historialImpactos.push({ x: impX, y: impY, id: ++contadorReglajes });

    const list = document.getElementById('lista-historial');
    if (contadorReglajes === 1) list.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'history-row-styled';
    row.innerHTML = `<span class="hist-id">#${contadorReglajes.toString().padStart(2, '0')}</span><span class="hist-data">${logMsg}</span><span class="hist-status">CORREGIDO</span>`;
    list.prepend(row);

    calcularYDibujar();
    marcarCambio(); // Importante para que el sistema sepa que hubo un reglaje
}

function reiniciarHistorial() {
    contadorReglajes = 0;
    historialImpactos = [];
    document.getElementById('lista-historial').innerHTML = '<div class="history-placeholder">Esperando datos...</div>';
    calcularYDibujar();
    marcarCambio();
}

/**
 * 7. UTILS & SISTEMA
 */
function guardarSistema() {
    const estado = {
        mx: document.getElementById('mx').value,
        my: document.getElementById('my').value,
        alt_pieza: document.getElementById('alt_pieza').value,
        tx: document.getElementById('tx').value,
        ty: document.getElementById('ty').value,
        alt_obj: document.getElementById('alt_obj').value,
        ox: document.getElementById('ox').value,
        oy: document.getElementById('oy').value,
        distObs: document.getElementById('distObs').value,
        azObs: document.getElementById('azObs').value,
        azObsUnit: document.getElementById('azObsUnit').value,
        meteo_dir: document.getElementById('meteo_dir').value,
        meteo_vel: document.getElementById('meteo_vel').value,
        meteo_temp: document.getElementById('meteo_temp').value,
        meteo_pres: document.getElementById('meteo_pres').value,
        temp_carga: document.getElementById('temp_carga').value,
        dif_peso: document.getElementById('dif_peso').value,
        dif_vel: document.getElementById('dif_vel').value,
        fecha_tiro: document.getElementById('fecha_tiro').value,
        zona_utm: document.getElementById('zona_utm').value,
        orientacion_base: document.getElementById('orientacion_base').value,
        tipoGranada: document.getElementById('tipoGranada').value,
        check_bloqueo: document.getElementById('check_bloqueo').checked,
        historialImpactos: historialImpactos,
        contadorReglajes: contadorReglajes
    };
    localStorage.setItem('morteros_maria_save', JSON.stringify(estado));

    // RESETEAR BANDERA AL GUARDAR
    hayCambiosSinGuardar = false;
    const btn = document.getElementById('btnGuardarManual');
    if (btn) {
        btn.textContent = "💾 GUARDAR MISIÓN ACTUAL";
        btn.style.borderColor = "#4dff88";
        btn.style.color = "#4dff88";
    }
}

function recuperarSistema() {
    const dataJSON = localStorage.getItem('morteros_maria_save');
    if (!dataJSON) return;

    const data = JSON.parse(dataJSON);
    const ids = [
        'mx', 'my', 'alt_pieza', 'tx', 'ty', 'alt_obj',
        'ox', 'oy', 'distObs', 'azObs', 'azObsUnit',
        'meteo_dir', 'meteo_vel', 'meteo_temp', 'meteo_pres',
        'temp_carga', 'dif_peso', 'dif_vel', 'fecha_tiro', 'zona_utm',
        'orientacion_base', 'tipoGranada'
    ];

    ids.forEach(id => {
        if (document.getElementById(id) && data[id] !== undefined) document.getElementById(id).value = data[id];
    });

    if (document.getElementById('check_bloqueo')) {
        document.getElementById('check_bloqueo').checked = data.check_bloqueo;
        const label = document.getElementById('lock-text');
        if (data.check_bloqueo) {
            label.textContent = "OFF"; label.style.color = "#ff3333"; toggleInputsMeteo(true);
        } else {
            label.textContent = "ON"; label.style.color = "#4dff88"; toggleInputsMeteo(false);
        }
    }

    if (data.historialImpactos) {
        historialImpactos = data.historialImpactos;
        contadorReglajes = data.contadorReglajes;
        const list = document.getElementById('lista-historial');
        if (historialImpactos.length > 0) {
            list.innerHTML = '';
            historialImpactos.slice().reverse().forEach(h => {
                const row = document.createElement('div');
                row.className = 'history-row-styled';
                row.innerHTML = `<span class="hist-id">#${h.id.toString().padStart(2, '0')}</span><span class="hist-data">Reglaje Recuperado</span><span class="hist-status">MEM</span>`;
                list.appendChild(row);
            });
        }
    }
    calcularYDibujar();
}

function initHybridMap() {
    function checkConnection() {
        const led = document.getElementById('conn-status');
        if (navigator.onLine) {
            if (led) led.className = 'status-led online';
            document.getElementById('map').style.display = 'block';
            document.getElementById('radarCanvas').classList.add('hidden-canvas');
            if (!map) {
                // Centrado inicial aproximado en Lima Sur
                map = L.map('map', { zoomControl: false, attributionControl: false }).setView([-12.3, -76.8], 11);
                L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
            }
        } else {
            if (led) led.className = 'status-led offline';
            document.getElementById('map').style.display = 'none';
            document.getElementById('radarCanvas').classList.remove('hidden-canvas');
        }
        calcularYDibujar();
    }
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    checkConnection();
}

function updateMapMarkers(geo) {
    if (!map) return;
    const toLL = (x, y) => { try { const p = proj4("EPSG:32718", "EPSG:4326", [x, y]); return [p[1], p[0]]; } catch { return null; } };

    const mPos = toLL(geo.mx, geo.my);
    const tPos = toLL(geo.tx, geo.ty);

    if (mPos) {
        if (!mapMarkers.m) mapMarkers.m = L.circleMarker(mPos, { color: '#4dff88', radius: 6, fillOpacity: 1 }).addTo(map).bindPopup("MORTERO");
        else mapMarkers.m.setLatLng(mPos);
    }
    if (tPos) {
        if (!mapMarkers.t) mapMarkers.t = L.circleMarker(tPos, { color: '#ff3333', radius: 6, fillOpacity: 1 }).addTo(map).bindPopup("OBJETIVO");
        else mapMarkers.t.setLatLng(tPos);
    }
    if (mPos && tPos) {
        if (!mapMarkers.line) mapMarkers.line = L.polyline([mPos, tPos], { color: '#4dff88', dashArray: '5, 10' }).addTo(map);
        else mapMarkers.line.setLatLngs([mPos, tPos]);
    }

    const ox = parseFloat(document.getElementById('ox').value);
    const oy = parseFloat(document.getElementById('oy').value);
    if (!isNaN(ox) && !isNaN(oy)) {
        const oPos = toLL(ox, oy);
        if (oPos) {
            if (!mapMarkers.o) mapMarkers.o = L.circleMarker(oPos, { color: '#00bcd4', radius: 5, fillOpacity: 0.9 }).addTo(map).bindPopup("OBSERVADOR");
            else mapMarkers.o.setLatLng(oPos);
        }
    }
}

function dibujarRadar(mx, my, tx, ty, ox, oy) {
    const c = document.getElementById('radarCanvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    c.width = c.offsetWidth;
    c.height = c.offsetHeight;
    ctx.clearRect(0, 0, c.width, c.height);

    const cx = c.width / 2, cy = c.height / 2;

    ctx.strokeStyle = '#003300';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, c.height * 0.2, 0, 6.28);
    ctx.arc(cx, cy, c.height * 0.4, 0, 6.28);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, c.height);
    ctx.moveTo(0, cy); ctx.lineTo(c.width, cy);
    ctx.stroke();

    if (isNaN(mx) || isNaN(tx)) return;

    let maxR = Math.sqrt((tx - mx) ** 2 + (ty - my) ** 2);
    historialImpactos.forEach(h => {
        const d = Math.sqrt((h.x - mx) ** 2 + (h.y - my) ** 2);
        if (d > maxR) maxR = d;
    });
    const scale = (c.height * 0.45) / (maxR || 1000);

    const proj = (x, y) => ({ x: cx + (x - mx) * scale, y: cy - (y - my) * scale });

    const t = proj(tx, ty);
    ctx.strokeStyle = '#0f0';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(t.x, t.y); ctx.stroke();

    ctx.fillStyle = '#f00';
    ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, 6.28); ctx.fill();

    ctx.fillStyle = '#fa0';
    historialImpactos.forEach(h => {
        const p = proj(h.x, h.y);
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
}

function initResizers() {
    const resizerH = document.getElementById('resizer-h');
    const bottomPanel = document.getElementById('bottom-panel');
    const resizerV = document.getElementById('resizer-v');
    const rightSidebar = document.getElementById('right-sidebar');
    const mainLayout = document.getElementById('main-layout');

    let isResizingH = false;
    let isResizingV = false;

    if (resizerH) resizerH.addEventListener('mousedown', () => { isResizingH = true; document.body.style.cursor = 'row-resize'; });
    if (resizerV) resizerV.addEventListener('mousedown', () => { isResizingV = true; document.body.style.cursor = 'col-resize'; });

    document.addEventListener('mousemove', (e) => {
        if (!isResizingH && !isResizingV) return;
        const containerRect = mainLayout.getBoundingClientRect();

        if (isResizingH) {
            const newHeight = containerRect.bottom - e.clientY;
            if (newHeight > 100 && newHeight < (containerRect.height - 100)) bottomPanel.style.height = `${newHeight}px`;
        }
        if (isResizingV) {
            const newWidth = containerRect.right - e.clientX;
            if (newWidth > 250 && newWidth < (containerRect.width - 300)) rightSidebar.style.width = `${newWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizingH || isResizingV) {
            isResizingH = false; isResizingV = false; document.body.style.cursor = 'default';
            if (map) map.invalidateSize();
            calcularYDibujar();
        }
    });
}

function toggleInputsMeteo(disabled) {
    const inputs = document.querySelectorAll('#meteo_vel, #meteo_dir, #meteo_temp, #meteo_pres, #temp_carga, #dif_peso, #dif_vel, #fecha_tiro, #zona_utm');
    inputs.forEach(i => { i.style.opacity = disabled ? "0.3" : "1"; i.disabled = disabled; });
}

function toggleReglajeUI() {
    const metodo = document.getElementById('metodo_reglaje').value;
    const panelAprec = document.getElementById('inputs_apreciacion');
    const panelMedic = document.getElementById('inputs_medicion');
    if (metodo === 'apreciacion') { panelAprec.classList.remove('hidden'); panelMedic.classList.add('hidden'); }
    else { panelAprec.classList.add('hidden'); panelMedic.classList.remove('hidden'); }
}

if (typeof proj4 !== 'undefined') {
    proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");
}