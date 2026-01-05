/**
 * SCT TÁCTICO - FÉNIX V12.0 (FINAL PATCHED)
 * Lógica Principal: Mapa Híbrido, Balística Automática, Meteo y Reglaje Dinámico
 */

let distanciaTiroGlobal = 0;
let contadorReglajes = 0;
let historialImpactos = [];
let variacionCongelada = 0;
let map = null;
let mapMarkers = {};

document.addEventListener('DOMContentLoaded', () => {

    // 1. FECHA AUTOMÁTICA
    const inputFecha = document.getElementById('fecha_tiro');
    if (inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];

    // 2. INICIAR MAPA
    initHybridMap();

    // 3. LISTENERS AUTOMÁTICOS

    // A) OBSERVADOR
    ['ox', 'oy', 'distObs', 'azObs', 'azObsUnit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', calcularTargetDesdeObservador);
            el.addEventListener('change', calcularTargetDesdeObservador);
        }
    });

    // B) METEO & COORDENADAS
    const inputsRecalculo = [
        'mx', 'my', 'alt_pieza', 'tx', 'ty', 'alt_obj',
        'meteo_vel', 'meteo_dir', 'meteo_temp',
        'input_variacion', 'orientacion_base', 'tipoGranada',
        'decl_grados', 'decl_minutos', 'zona_utm'
    ];
    inputsRecalculo.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', calcularYDibujar);
    });

    // C) BLOQUEO
    const chk = document.getElementById('check_bloqueo');
    if (chk) {
        chk.addEventListener('change', () => {
            if (chk.checked) {
                variacionCongelada = parseFloat(document.getElementById('input_variacion').value) || 0;
                document.getElementById('lock-text').textContent = "BLOQ";
                document.getElementById('lock-text').style.color = "#ff3333";
            } else {
                document.getElementById('lock-text').textContent = "LIBRE";
                document.getElementById('lock-text').style.color = "#4dff88";
            }
            gestionarBloqueo();
            calcularYDibujar();
        });
    }

    // D) CAMBIO DE MÉTODO DE REGLAJE (CORRECCIÓN) -> ¡AQUÍ ESTÁ EL ARREGLO!
    const selMetodo = document.getElementById('metodo_reglaje');
    if (selMetodo) {
        selMetodo.addEventListener('change', toggleReglajeUI);
    }

    // E) CARGA MANUAL
    const selCarga = document.getElementById('sel_carga');
    if (selCarga) {
        selCarga.addEventListener('change', (e) => {
            if (distanciaTiroGlobal > 0 && e.target.value !== '-') {
                actualizarDatosPorCarga(distanciaTiroGlobal, e.target.value);
            }
        });
    }

    // Botones
    document.getElementById('btnCorregir').addEventListener('click', aplicarCorreccion);
    document.getElementById('btnResetHistorial').addEventListener('click', reiniciarHistorial);

    // Inicialización
    calcularVariacionMagnetica();
    gestionarBloqueo();
    toggleReglajeUI(); // Asegurar estado inicial correcto
    dibujarRadar(0, 0, 0, 0, NaN, NaN);
});

// ==========================================
// 1. INTERFAZ Y VISUALIZACIÓN
// ==========================================

function toggleReglajeUI() {
    const metodo = document.getElementById('metodo_reglaje').value;
    const panelAprec = document.getElementById('inputs_apreciacion');
    const panelMedic = document.getElementById('inputs_medicion');

    if (metodo === 'apreciacion') {
        panelAprec.classList.remove('hidden');
        panelMedic.classList.add('hidden');
    } else {
        panelAprec.classList.add('hidden');
        panelMedic.classList.remove('hidden');
    }
}

function initHybridMap() {
    const statusLed = document.getElementById('conn-status');
    function checkConnection() {
        if (navigator.onLine) {
            if (statusLed) statusLed.className = 'status-led online';
            document.getElementById('map').style.display = 'block';
            document.getElementById('radarCanvas').classList.add('hidden-canvas');
            if (!map) {
                map = L.map('map', { zoomControl: false, attributionControl: false }).setView([-12.0, -77.0], 12);
                L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
            }
        } else {
            if (statusLed) statusLed.className = 'status-led offline';
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
    if (!map || !navigator.onLine) return;
    const toLL = (x, y) => { try { const p = proj4("EPSG:32718", "EPSG:4326", [x, y]); return [p[1], p[0]]; } catch { return null; } };

    const m = toLL(geo.mx, geo.my);
    const t = toLL(geo.tx, geo.ty);
    const ox = parseFloat(document.getElementById('ox').value);
    const oy = parseFloat(document.getElementById('oy').value);
    const o = (!isNaN(ox) && !isNaN(oy)) ? toLL(ox, oy) : null;

    if (m) {
        if (!mapMarkers.m) mapMarkers.m = L.circleMarker(m, { color: '#4dff88', radius: 6, fillOpacity: 1 }).addTo(map).bindPopup("MORTERO");
        else mapMarkers.m.setLatLng(m);
        map.setView(m);
    }
    if (t) {
        if (!mapMarkers.t) mapMarkers.t = L.circleMarker(t, { color: '#ff3333', radius: 6, fillOpacity: 1 }).addTo(map).bindPopup("OBJETIVO");
        else mapMarkers.t.setLatLng(t);
    }
    if (o) {
        if (!mapMarkers.o) mapMarkers.o = L.circleMarker(o, { color: '#00bcd4', radius: 5, fillOpacity: 0.9 }).addTo(map).bindPopup("OBSERVADOR");
        else mapMarkers.o.setLatLng(o);
    } else if (mapMarkers.o) {
        map.removeLayer(mapMarkers.o); delete mapMarkers.o;
    }
    if (m && t) {
        if (!mapMarkers.line) mapMarkers.line = L.polyline([m, t], { color: '#4dff88', dashArray: '5, 10' }).addTo(map);
        else mapMarkers.line.setLatLngs([m, t]);
    }
}

// ==========================================
// 2. CÁLCULO
// ==========================================

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
}

function calcularVariacionMagnetica() {
    document.getElementById('input_variacion').value = "-3.50";
}

function calcularYDibujar() {
    const geo = obtenerGeometria();
    if (!geo) return;

    if (navigator.onLine && map) updateMapMarkers(geo);
    else dibujarRadar(geo.mx, geo.my, geo.tx, geo.ty, parseFloat(document.getElementById('ox').value), parseFloat(document.getElementById('oy').value));

    let variacion = 0;
    if (!document.getElementById('check_bloqueo').checked) {
        variacion = parseFloat(document.getElementById('input_variacion').value) || 0;
    }

    let azFinal = (geo.azMils + (variacion * 17.778)) % 6400;
    if (azFinal < 0) azFinal += 6400;

    document.getElementById('resAzimutMils').textContent = Math.round(azFinal).toString().padStart(4, '0');

    const labelMag = document.getElementById('resAzimutMag');
    if (document.getElementById('check_bloqueo').checked) {
        labelMag.textContent = "GRID (PURO)"; labelMag.style.color = "#00bcd4";
    } else {
        labelMag.textContent = Math.round(azFinal).toString().padStart(4, '0'); labelMag.style.color = "#fff";
    }

    // Datos ocultos para debugging o referencia
    document.getElementById('topo_az').textContent = Math.round(azFinal);
    document.getElementById('topo_dist').textContent = Math.round(geo.dist);

    const tipo = document.getElementById('tipoGranada').value;
    if (typeof ARSENAL !== 'undefined' && ARSENAL[tipo]) {
        distanciaTiroGlobal = geo.dist;
        llenarOpcionesDeCarga(geo.dist, tipo);
    }
}

function llenarOpcionesDeCarga(dist, tipo) {
    const BD = ARSENAL[tipo], sel = document.getElementById('sel_carga'), tbl = document.getElementById('tabla-cargas'), rec = document.getElementById('recomendacion-msg');
    sel.innerHTML = ""; tbl.innerHTML = '<div class="charge-row header"><span>C</span><span>EL</span><span>SEG</span></div>';
    let best = -1, buff = -1;

    for (const c in BD.rangos) {
        if (dist >= BD.rangos[c].min && dist <= BD.rangos[c].max) {
            const dat = calcularBalistica(dist, tipo, c);
            if (dat.status === "OK") {
                const b = BD.rangos[c].max - dist;
                const opt = document.createElement('option'); opt.value = c; opt.text = `C ${c}`; sel.appendChild(opt);

                const row = document.createElement('div'); row.className = "charge-row";
                row.innerHTML = `<span>${c}</span><span style="color:#ff0">${Math.round(dat.elev)}</span><span>${Math.round(b)}</span>`;
                row.onclick = () => { sel.value = c; actualizarDatosPorCarga(dist, c); };
                tbl.appendChild(row);

                if (best === -1 || (buff < 100 && b > buff)) { best = c; buff = b; }
            }
        }
    }

    if (best !== -1) {
        sel.value = best; actualizarDatosPorCarga(dist, best);
        if (rec) { rec.classList.remove('hidden'); rec.textContent = `REC: C ${best}`; rec.style.color = "#4f8"; }
    } else {
        sel.innerHTML = "<option>OUT</option>"; actualizarDatosPorCarga(dist, 'FUERA');
        if (rec) { rec.classList.remove('hidden'); rec.textContent = "FUERA ALCANCE"; rec.style.color = "#f33"; }
    }
}

function actualizarDatosPorCarga(dist, c) {
    const rows = document.querySelectorAll('.charge-row'); rows.forEach(r => r.classList.remove('active'));
    rows.forEach(r => { if (r.innerHTML.includes(`<span>${c}</span>`)) r.classList.add('active'); });

    const orient = parseFloat(document.getElementById('orientacion_base').value) || 0;
    const az = parseFloat(document.getElementById('resAzimutMils').textContent) || 0;
    let der = orient - az; while (der < 0) der += 6400; while (der >= 6400) der -= 6400;

    document.getElementById('cmd_orient').textContent = Math.round(orient);
    document.getElementById('cmd_deriva').textContent = Math.round(der).toString().padStart(4, '0');
    document.getElementById('cmd_dist').textContent = Math.round(dist);

    if (c === 'FUERA') { document.getElementById('cmd_elev').textContent = "-"; return; }

    const dat = calcularBalistica(dist, document.getElementById('tipoGranada').value, c);
    const ap = parseFloat(document.getElementById('alt_pieza').value) || 0, ao = parseFloat(document.getElementById('alt_obj').value) || 0;
    const sit = (Math.atan((ao - ap) / dist) * 6400) / (Math.PI * 2);

    document.getElementById('cmd_elev').textContent = Math.round(dat.elev - sit);
    document.getElementById('cmd_time').textContent = dat.tiempo;
}

// EN js/main.js

function aplicarCorreccion() {
    const mx = parseFloat(document.getElementById('mx').value), my = parseFloat(document.getElementById('my').value);
    const tx = parseFloat(document.getElementById('tx').value), ty = parseFloat(document.getElementById('ty').value);
    if (isNaN(mx) || isNaN(tx)) return;

    let ox = parseFloat(document.getElementById('ox').value), oy = parseFloat(document.getElementById('oy').value);
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

        const dx = tx - ox, dy = ty - oy;
        const azOT = Math.atan2(dx, dy);
        const distOT = Math.sqrt(dx * dx + dy * dy);

        let shiftLat = (unitLat === 'm') ? valLat : (distOT * valLat) / 1000;
        let shiftAlc = valAlc;

        let impOffsetLat = (dirLat === 'right') ? shiftLat : -shiftLat;
        let impOffsetAlc = (dirAlc === 'over') ? shiftAlc : -shiftAlc;

        impX = tx + (impOffsetAlc * Math.sin(azOT)) + (impOffsetLat * Math.cos(azOT));
        impY = ty + (impOffsetAlc * Math.cos(azOT)) - (impOffsetLat * Math.sin(azOT));

        const newTx = tx - (impX - tx);
        const newTy = ty - (impY - ty);

        document.getElementById('tx').value = newTx.toFixed(0);
        document.getElementById('ty').value = newTy.toFixed(0);

        logMsg = `APR: ${dirLat === 'right' ? 'Der' : 'Izq'} ${valLat}${unitLat}, ${dirAlc === 'over' ? '+' : '-'}${valAlc}m`;

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

        logMsg = `MED: Az ${impAz}${unit}, Dist ${impDist}m`;

        document.getElementById('impacto_az').value = "";
        document.getElementById('impacto_dist').value = "";
    }

    historialImpactos.push({ x: impX, y: impY, id: ++contadorReglajes });

    // NUEVO ESTILO DE HISTORIAL
    const list = document.getElementById('lista-historial');
    if (contadorReglajes === 1) list.innerHTML = ''; // Borrar placeholder

    const row = document.createElement('div');
    row.className = 'history-row-styled';
    row.innerHTML = `<span class="hist-id">#${contadorReglajes.toString().padStart(2, '0')}</span><span class="hist-data">${logMsg}</span><span class="hist-status">CORREGIDO</span>`;
    list.prepend(row);

    calcularYDibujar();
}

function reiniciarHistorial() {
    contadorReglajes = 0;
    historialImpactos = [];
    document.getElementById('lista-historial').innerHTML = '<div class="history-placeholder">Esperando datos...</div>';
    calcularYDibujar();
}
function gestionarBloqueo() {
    const l = document.getElementById('check_bloqueo').checked;
    ['fecha_tiro', 'zona_utm', 'orientacion_base'].forEach(i => {
        const el = document.getElementById(i); if (el) el.disabled = l;
    });
}

function obtenerGeometria() {
    const mx = parseFloat(document.getElementById('mx').value), my = parseFloat(document.getElementById('my').value);
    const tx = parseFloat(document.getElementById('tx').value), ty = parseFloat(document.getElementById('ty').value);
    if (isNaN(mx) || isNaN(tx)) return null;
    const dx = tx - mx, dy = ty - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let az = Math.atan2(dx, dy) * 6400 / (Math.PI * 2);
    if (az < 0) az += 6400;
    return { mx, my, tx, ty, dist, azMils: az };
}

function dibujarRadar(mx, my, tx, ty, ox, oy) {
    const c = document.getElementById('radarCanvas'), ctx = c.getContext('2d');
    c.width = c.offsetWidth; c.height = c.offsetHeight; ctx.clearRect(0, 0, c.width, c.height);
    const cx = c.width / 2, cy = c.height / 2;

    // Grilla
    ctx.strokeStyle = '#003300'; ctx.beginPath();
    ctx.arc(cx, cy, c.height * 0.25, 0, 6.28); ctx.stroke();
    ctx.arc(cx, cy, c.height * 0.45, 0, 6.28); ctx.stroke();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, c.height); ctx.moveTo(0, cy); ctx.lineTo(c.width, cy); ctx.stroke();

    if (isNaN(mx) || isNaN(tx)) return;

    // Escala dinámica
    let max = 3000;
    historialImpactos.forEach(h => { max = Math.max(max, Math.sqrt((h.x - mx) ** 2 + (h.y - my) ** 2)); });
    max = Math.max(max, Math.sqrt((tx - mx) ** 2 + (ty - my) ** 2));
    const s = (c.height / 2) / (max * 1.3);
    const p = (x, y) => ({ x: cx + (x - mx) * s, y: cy - (y - my) * s });

    const t = p(tx, ty);
    ctx.strokeStyle = '#0f0'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(t.x, t.y); ctx.stroke(); ctx.setLineDash([]);

    ctx.fillStyle = '#4f8'; ctx.fillText('M', cx + 5, cy - 5); ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#f33'; ctx.fillText('T', t.x + 5, t.y - 5); ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, 6.28); ctx.fill();

    historialImpactos.forEach(h => {
        const ip = p(h.x, h.y);
        ctx.fillStyle = '#fa0'; ctx.fillText(h.id, ip.x + 3, ip.y - 3); ctx.fillRect(ip.x - 2, ip.y - 2, 4, 4);
    });

    if (!isNaN(ox)) {
        const o = p(ox, oy);
        ctx.fillStyle = '#0ff'; ctx.fillText('Obs', o.x + 5, o.y - 5); ctx.fillRect(o.x - 2, o.y - 2, 4, 4);
    }
}

// Proj4 Def
if (typeof proj4 !== 'undefined') proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");