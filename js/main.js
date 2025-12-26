let distanciaTiroGlobal = 0;
let contadorReglajes = 0;

/* Inicialización y Eventos */
document.addEventListener('DOMContentLoaded', () => {
    const inputFecha = document.getElementById('fecha_tiro');
    const hoy = new Date();
    const fechaLocal = new Date(hoy.getTime() - (hoy.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    inputFecha.value = fechaLocal;

    document.getElementById('inputMode').addEventListener('change', toggleInputs);

    document.getElementById('btnFuego').addEventListener('click', () => {
        reiniciarHistorial();
        calcularYDibujar();
    });

    document.getElementById('btnCalcularObs').addEventListener('click', calcularTargetDesdeObservador);
    document.getElementById('btnCorregir').addEventListener('click', aplicarCorreccion);
    document.getElementById('btnResetHistorial').addEventListener('click', reiniciarHistorial);

    const triggersVariacion = ['fecha_tiro', 'decl_grados', 'decl_minutos', 'zona_utm'];
    triggersVariacion.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', calcularVariacionMagnetica);
            el.addEventListener('change', calcularVariacionMagnetica);
        }
    });

    const triggersGeneral = ['orientacion_base', 'tipoGranada'];
    triggersGeneral.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', calcularYDibujar);
    });

    document.querySelectorAll('.input-cyan').forEach(input => input.addEventListener('input', calcularYDibujar));

    document.getElementById('sel_carga').addEventListener('change', (e) => {
        if (distanciaTiroGlobal > 0 && e.target.value !== '-') {
            actualizarDatosPorCarga(distanciaTiroGlobal, e.target.value);
        }
    });

    calcularVariacionMagnetica();
    toggleMetodoReglaje();
    dibujarRadar(0, 0, 0, 0, NaN, NaN);
});

/* Control de Interfaz UTM/DMS */
function toggleInputs() {
    const mode = document.getElementById('inputMode').value;
    const isUtm = mode === 'utm';
    document.querySelectorAll('.utm-group').forEach(d => d.classList.toggle('hidden', !isUtm));
    document.querySelectorAll('.dms-group').forEach(d => d.classList.toggle('hidden', isUtm));
    document.getElementById('obs-utm').classList.toggle('hidden', !isUtm);
    document.getElementById('obs-dms').classList.toggle('hidden', isUtm);
}

/* Control de Interfaz Reglaje */
function toggleMetodoReglaje() {
    const metodo = document.getElementById('metodo_reglaje').value;
    const isMedicion = metodo === 'medicion';
    document.getElementById('inputs_apreciacion').classList.toggle('hidden', isMedicion);
    document.getElementById('inputs_medicion').classList.toggle('hidden', !isMedicion);
    document.getElementById('btnCorregir').textContent = isMedicion ? "CALCULAR UBICACIÓN Y CORREGIR" : "APLICAR CORRECCIÓN";
}

/* Gestión del Historial de Reglaje */
function reiniciarHistorial() {
    contadorReglajes = 0;
    const lista = document.getElementById('lista-historial');
    if (lista) lista.innerHTML = '';
    const panel = document.getElementById('historial-panel');
    if (panel) panel.classList.add('hidden');
}

function agregarAlHistorial(textoCorreccion) {
    contadorReglajes++;
    const panel = document.getElementById('historial-panel');
    panel.classList.remove('hidden');
    const lista = document.getElementById('lista-historial');

    const nuevoAz = document.getElementById('cmd_deriva').textContent;
    const nuevoEl = document.getElementById('cmd_elev').textContent;
    const nuevaDist = document.getElementById('cmd_dist').textContent;

    const claseFila = (contadorReglajes === 1) ? 'first-impact' : 'subsequent';

    const row = document.createElement('div');
    row.className = `history-row ${claseFila}`;
    row.innerHTML = `
        <span style="width: 10%; text-align: center;">${contadorReglajes}</span>
        <span style="width: 45%; padding-left: 5px; font-size: 0.8rem;">${textoCorreccion}</span>
        <span style="width: 15%; text-align: center;">${nuevoAz}</span>
        <span style="width: 15%; text-align: center;">${nuevoEl}</span>
        <span style="width: 15%; text-align: center;">${nuevaDist}</span>
    `;

    lista.appendChild(row);
    lista.scrollTop = lista.scrollHeight;
}

/* Cálculo de Geometría (Mapa) */
function obtenerGeometria() {
    const mode = document.getElementById('inputMode').value;
    let mx, my, tx, ty;

    if (mode === 'utm') {
        mx = parseFloat(document.getElementById('mx').value);
        my = parseFloat(document.getElementById('my').value);
        tx = parseFloat(document.getElementById('tx').value);
        ty = parseFloat(document.getElementById('ty').value);
    } else {
        const mLat = dmsToDecimal('mlat');
        const mLon = dmsToDecimal('mlon');
        const tLat = dmsToDecimal('tlat');
        const tLon = dmsToDecimal('tlon');

        if (!isNaN(mLat)) {
            const mUTM = proj4("EPSG:4326", "EPSG:32718", [mLon, mLat]);
            mx = mUTM[0]; my = mUTM[1];
        }
        if (!isNaN(tLat)) {
            const tUTM = proj4("EPSG:4326", "EPSG:32718", [tLon, tLat]);
            tx = tUTM[0]; ty = tUTM[1];
        }
    }

    if (isNaN(mx) || isNaN(tx)) return null;

    const dx = tx - mx;
    const dy = ty - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let azRad = Math.atan2(dx, dy);
    let azGrados = azRad * (180 / Math.PI);
    if (azGrados < 0) azGrados += 360;
    const azMils = (azGrados * 6400) / 360;

    return { mx, my, tx, ty, dist, azMils, azGrados };
}

/* Cálculo de Posición Objetivo desde Observador */
function calcularTargetDesdeObservador() {
    const mode = document.getElementById('inputMode').value;
    const dist = parseFloat(document.getElementById('distObs').value);
    const azInput = parseFloat(document.getElementById('azObs').value);
    const azUnit = document.getElementById('azObsUnit').value;

    if (isNaN(dist) || isNaN(azInput)) { alert("Faltan datos de visión"); return; }

    let obsX, obsY;
    if (mode === 'utm') {
        obsX = parseFloat(document.getElementById('ox').value);
        obsY = parseFloat(document.getElementById('oy').value);
    } else {
        const lat = dmsToDecimal('olat');
        const lon = dmsToDecimal('olon');
        if (isNaN(lat)) { alert("Coord Obs inválidas"); return; }
        const utm = proj4("EPSG:4326", "EPSG:32718", [lon, lat]);
        obsX = utm[0]; obsY = utm[1];
    }

    if (isNaN(obsX)) { alert("Falta posición Obs"); return; }

    let azRad = (azUnit === 'mils') ? azInput * (2 * Math.PI / 6400) : azInput * (Math.PI / 180);

    const tx = obsX + (dist * Math.sin(azRad));
    const ty = obsY + (dist * Math.cos(azRad));

    document.getElementById('tx').value = tx.toFixed(0);
    document.getElementById('ty').value = ty.toFixed(0);

    if (mode === 'dms') {
        const geo = proj4("EPSG:32718", "EPSG:4326", [tx, ty]);
        fillDMS('tlat', geo[1]);
        fillDMS('tlon', geo[0]);
    }
}

/* Cálculo de Variación Magnética (NOAA 2025 Universal) */
function calcularVariacionMagnetica() {
    const fechaVal = document.getElementById('fecha_tiro').value;
    const zona = parseFloat(document.getElementById('zona_utm').value) || 18;
    const grados = parseFloat(document.getElementById('decl_grados').value) || 0;
    const minutos = parseFloat(document.getElementById('decl_minutos').value) || 0;

    if (!fechaVal) return;

    const convergenciaUsuario = grados + (minutos / 60);

    const fechaBase = new Date('2026-12-27');
    const declinacionBaseNOAA = -3.716;
    const cambioAnualNOAA = -0.217;

    const fechaActual = new Date(fechaVal);
    const diffTime = fechaActual - fechaBase;
    const diffAnios = diffTime / (1000 * 60 * 60 * 24 * 365.25);

    const diferenciaZona = zona - 18;
    const factorZona = -5.04;

    const declinacionActual = declinacionBaseNOAA + (diffAnios * cambioAnualNOAA) + (diferenciaZona * factorZona);
    const variacionFinal = declinacionActual - convergenciaUsuario;

    document.getElementById('input_variacion').value = variacionFinal.toFixed(2);

    calcularYDibujar();
}

/* Función Principal: Cálculo Balístico y Dibujo */
function calcularYDibujar() {
    const geo = obtenerGeometria();
    if (!geo) return;

    const tipoGranada = document.getElementById('tipoGranada').value;
    if (typeof ARSENAL === 'undefined' || !ARSENAL[tipoGranada]) return;

    const BD = ARSENAL[tipoGranada];

    let cargaID = 0;
    for (const c in BD.rangos) {
        if (geo.dist >= BD.rangos[c].min && geo.dist <= BD.rangos[c].max) {
            cargaID = c;
        }
    }
    if (cargaID == 0 && BD.cargas[3]) cargaID = 3;

    const datosBase = calcularBalistica(geo.dist, tipoGranada, cargaID);
    const fact = datosBase.factores || { v_cola: 0, v_traves: 0, t_aire: 0, peso: 0 };

    const vientoDir = parseFloat(document.getElementById('meteo_dir').value) || 0;
    const vientoVel = parseFloat(document.getElementById('meteo_vel').value) || 0;
    const tempAire = parseFloat(document.getElementById('meteo_temp').value) || 15;
    const difPeso = parseFloat(document.getElementById('meteo_peso').value) || 0;
    const variacionInput = parseFloat(document.getElementById('input_variacion').value) || 0;

    const angVientoRad = vientoDir * (Math.PI / 180);
    const angTiroRad = geo.azGrados * (Math.PI / 180);
    const angRelativo = angVientoRad - angTiroRad;
    const vCola = vientoVel * Math.cos(angRelativo);
    const vTraves = vientoVel * Math.sin(angRelativo);

    const corrViento = vCola * fact.v_cola;
    const corrTemp = (tempAire - 15) * fact.t_aire;
    const corrPeso = difPeso * fact.peso;
    const corrVariacion = variacionInput * 22;

    distanciaTiroGlobal = geo.dist - corrViento - corrTemp + corrPeso + corrVariacion;

    const corrDerivaMils = vTraves * fact.v_traves;
    const azimutMapaCorregido = geo.azMils + corrDerivaMils;

    document.getElementById('resAzimutMils').textContent = Math.round(azimutMapaCorregido).toString().padStart(4, '0');

    llenarOpcionesDeCarga(distanciaTiroGlobal, tipoGranada);
    dibujarRadar(geo.mx, geo.my, geo.tx, geo.ty, parseFloat(document.getElementById('ox').value), parseFloat(document.getElementById('oy').value));
}

/* Interfaz de Cargas y Recomendaciones */
function llenarOpcionesDeCarga(distanciaBalistica, tipoID) {
    const BD = ARSENAL[tipoID];
    const select = document.getElementById('sel_carga');
    const tablaDiv = document.getElementById('tabla-cargas');
    const recDiv = document.getElementById('recomendacion-msg');

    select.innerHTML = "";
    tablaDiv.innerHTML = `<div class="charge-row header"><span>CARGA</span><span>ELEVACIÓN</span><span>SEGURIDAD</span></div>`;
    tablaDiv.classList.remove('hidden');
    recDiv.classList.remove('hidden');

    let mejorCarga = -1;
    let mejorBuffer = -1;
    let motivo = "";

    for (const c in BD.rangos) {
        if (distanciaBalistica >= BD.rangos[c].min && distanciaBalistica <= BD.rangos[c].max) {
            const datos = calcularBalistica(distanciaBalistica, tipoID, c);
            if (datos.status === "OK") {
                const buffer = BD.rangos[c].max - distanciaBalistica;

                const option = document.createElement('option');
                option.value = c;
                option.text = `CARGA ${c}`;
                select.appendChild(option);

                const row = document.createElement('div');
                row.className = "charge-row";
                row.innerHTML = `<span>CARGA ${c}</span><span style="color:#ffff00">${Math.round(datos.elev)}</span><span>${Math.round(buffer)}m</span>`;
                tablaDiv.appendChild(row);

                if (mejorCarga === -1) {
                    mejorCarga = c; mejorBuffer = buffer; motivo = "Es la carga más baja posible (Menor desgaste).";
                } else if (mejorBuffer < 100 && buffer > mejorBuffer) {
                    mejorCarga = c; mejorBuffer = buffer; motivo = `Mayor margen de seguridad (${Math.round(buffer)}m libres).`;
                }
            }
        }
    }

    if (mejorCarga !== -1) {
        select.value = mejorCarga;
        actualizarDatosPorCarga(distanciaBalistica, mejorCarga);
        recDiv.innerHTML = `> RECOMENDACIÓN: CARGA ${mejorCarga}<br>> MOTIVO: ${motivo}`;
        recDiv.style.color = "#4dff88";
        recDiv.style.borderColor = "#4dff88";
    } else {
        select.innerHTML = "<option>FUERA</option>";
        recDiv.innerHTML = `> ALERTA: FUERA DE ALCANCE BALÍSTICO (${Math.round(distanciaBalistica)}m).`;
        recDiv.style.color = "#ff5555";
        recDiv.style.borderColor = "#ff5555";
        actualizarDatosPorCarga(distanciaBalistica, 0);
    }
}

/* Actualización de Datos Específicos por Carga */
function actualizarDatosPorCarga(distanciaBalistica, cargaID) {
    const tipoGranada = document.getElementById('tipoGranada').value;
    const geo = obtenerGeometria();
    const distMapa = geo ? geo.dist : distanciaBalistica;

    const datos = calcularBalistica(distanciaBalistica, tipoGranada, cargaID);

    let altPieza = parseFloat(document.getElementById('alt_pieza').value) || 0;
    let altObj = parseFloat(document.getElementById('alt_obj').value) || 0;
    const diffAlt = altObj - altPieza;

    const angSitRad = Math.atan(diffAlt / distMapa);
    const angSitMils = (angSitRad * 6400) / (2 * Math.PI);
    let elevFinal = datos.elev - angSitMils;

    let azimutMapa = parseFloat(document.getElementById('resAzimutMils').textContent) || 0;
    const orientacion = parseFloat(document.getElementById('orientacion_base').value) || 6400;

    const declGrados = parseFloat(document.getElementById('decl_grados').value) || 0;
    const declMinutos = parseFloat(document.getElementById('decl_minutos').value) || 0;
    const declinacionMils = ((declGrados + (declMinutos / 60)) * 17.777778);

    const azimutMagnetico = azimutMapa + declinacionMils;

    let diffDerivaRaw = orientacion - azimutMagnetico;
    let derivaCmd = diffDerivaRaw;
    if (derivaCmd < 0) derivaCmd += 6400;
    if (derivaCmd >= 6400) derivaCmd -= 6400;

    let dirTiroRec = Math.round(azimutMagnetico / 100) * 100;

    document.getElementById('resAzimutMag').textContent = Math.round(azimutMagnetico).toString().padStart(4, '0');
    document.getElementById('topo_az').textContent = Math.round(azimutMagnetico).toString().padStart(4, '0');
    document.getElementById('topo_dist').textContent = Math.round(distMapa);
    document.getElementById('topo_alt').textContent = Math.round(diffAlt);

    document.getElementById('cmd_orient').textContent = Math.round(orientacion);
    document.getElementById('cmd_deriva').textContent = Math.round(derivaCmd).toString().padStart(4, '0');
    document.getElementById('cmd_elev').textContent = Math.round(elevFinal);
    document.getElementById('cmd_dist').textContent = Math.round(distanciaBalistica);
    document.getElementById('cmd_time').textContent = datos.tiempo;

    document.getElementById('bal_elev').textContent = Math.round(elevFinal);
    document.getElementById('bal_time').textContent = datos.tiempo;

    const miniTabla = document.getElementById('mini-resumen');
    if (miniTabla) {
        miniTabla.classList.remove('hidden');
        document.getElementById('excel_dir_rec').textContent = Math.round(dirTiroRec).toString().padStart(4, '0');
        document.getElementById('excel_az_mag').textContent = Math.round(azimutMagnetico).toString().padStart(4, '0');
        let valorAbs = Math.abs(Math.round(diffDerivaRaw)).toString().padStart(4, '0');
        document.getElementById('excel_diff_deriva').textContent = (diffDerivaRaw < 0 ? "-" : "") + valorAbs;
        document.getElementById('excel_dist').textContent = Math.round(distMapa);
    }

    const filas = document.querySelectorAll('.charge-row');
    filas.forEach(f => f.classList.remove('active'));
    for (let f of filas) {
        if (f.textContent.includes(`CARGA ${cargaID}`)) f.classList.add('active');
    }
}

/* Aplicación de Correcciones y Guardado en Historial */
function aplicarCorreccion() {
    const geo = obtenerGeometria();
    if (!geo) { alert("Defina coordenadas primero."); return; }

    let ox = parseFloat(document.getElementById('ox').value);
    let oy = parseFloat(document.getElementById('oy').value);
    if (isNaN(ox) || isNaN(oy)) { ox = geo.mx; oy = geo.my; }

    const metodo = document.getElementById('metodo_reglaje').value;
    let newTx, newTy;
    let descripcionCorreccion = "";

    if (metodo === 'apreciacion') {
        const valLateral = parseFloat(document.getElementById('corr_lat_val').value) || 0;
        const valAlcance = parseFloat(document.getElementById('corr_metros').value) || 0;
        if (valLateral === 0 && valAlcance === 0) return;

        const dirLat = document.getElementById('corr_dir').value;
        const unitLat = document.getElementById('corr_lat_unit').value;
        const dirAlc = document.getElementById('corr_range').value;

        const txtLat = (valLateral > 0) ? `${(dirLat === 'right' ? 'Der' : 'Izq')} ${valLateral}${unitLat}` : "";
        const txtAlc = (valAlcance > 0) ? `${(dirAlc === 'over' ? 'Largo (+)' : 'Corto (-)')} ${valAlcance}` : "";
        descripcionCorreccion = [txtLat, txtAlc].filter(Boolean).join(", ");

        const dx = geo.tx - ox;
        const dy = geo.ty - oy;
        const distOT = Math.sqrt(dx * dx + dy * dy);
        const azOTRad = Math.atan2(dx, dy);

        let shiftLateral = (unitLat === 'm') ? valLateral : (distOT * valLateral) / 1000;
        let shiftAlcance = valAlcance;

        let moveAlc = (dirAlc === 'over') ? -shiftAlcance : shiftAlcance;
        let moveLat = (dirLat === 'right') ? -shiftLateral : shiftLateral;

        const shiftX = (moveAlc * Math.sin(azOTRad)) + (moveLat * Math.cos(azOTRad));
        const shiftY = (moveAlc * Math.cos(azOTRad)) - (moveLat * Math.sin(azOTRad));

        newTx = geo.tx + shiftX;
        newTy = geo.ty + shiftY;

        document.getElementById('corr_lat_val').value = "";
        document.getElementById('corr_metros').value = "";

    } else {
        const impAz = parseFloat(document.getElementById('impacto_az').value);
        const impDist = parseFloat(document.getElementById('impacto_dist').value);
        if (isNaN(impAz) || isNaN(impDist)) { alert("Faltan datos de impacto."); return; }

        descripcionCorreccion = `Imp: AZ ${impAz}, Dist ${impDist}m`;

        const impAzRad = impAz * (2 * Math.PI / 6400);
        const ix = ox + (impDist * Math.sin(impAzRad));
        const iy = oy + (impDist * Math.cos(impAzRad));

        const errorX = ix - geo.tx;
        const errorY = iy - geo.ty;

        newTx = geo.tx - errorX;
        newTy = geo.ty - errorY;

        document.getElementById('impacto_az').value = "";
        document.getElementById('impacto_dist').value = "";
    }

    document.getElementById('tx').value = newTx.toFixed(0);
    document.getElementById('ty').value = newTy.toFixed(0);

    if (document.getElementById('inputMode').value === 'dms' && typeof proj4 !== 'undefined') {
        const geoProj = proj4("EPSG:32718", "EPSG:4326", [newTx, newTy]);
        fillDMS('tlat', geoProj[1]);
        fillDMS('tlon', geoProj[0]);
    }

    calcularYDibujar();
    agregarAlHistorial(descripcionCorreccion);
}

/* Dibujado de Radar Canvas */
function dibujarRadar(mx, my, tx, ty, ox, oy) {
    const canvas = document.getElementById('radarCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#004400';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.2, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.4, 0, 2 * Math.PI); ctx.stroke();

    if (isNaN(mx) || isNaN(tx)) return;

    const maxRange = 6000;
    const scale = (w / 2) / maxRange;
    const dX = tx - mx;
    const dY = ty - my;
    const plotX = cx + dX * scale;
    const plotY = cy - dY * scale;

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(plotX, plotY); ctx.stroke(); ctx.setLineDash([]);

    ctx.fillStyle = '#00ff41'; ctx.font = '12px Arial';
    ctx.fillText('M', cx + 5, cy - 5); ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 2 * Math.PI); ctx.fill();

    ctx.fillStyle = 'red'; ctx.fillText('T', plotX + 5, plotY - 5);
    ctx.beginPath(); ctx.moveTo(plotX - 4, plotY - 4); ctx.lineTo(plotX + 4, plotY + 4);
    ctx.moveTo(plotX + 4, plotY - 4); ctx.lineTo(plotX - 4, plotY + 4);
    ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.stroke();

    if (!isNaN(ox) && !isNaN(oy)) {
        const odX = ox - mx; const odY = oy - my;
        const oPlotX = cx + odX * scale; const oPlotY = cy - odY * scale;
        ctx.fillStyle = 'cyan'; ctx.fillText('Obs', oPlotX + 5, oPlotY - 5);
        ctx.beginPath(); ctx.rect(oPlotX - 3, oPlotY - 3, 6, 6); ctx.fill();
    }
}

/* Utilidades DMS */
function dmsToDecimal(idPrefix) {
    const d = parseFloat(document.getElementById(idPrefix + '_d').value) || 0;
    const m = parseFloat(document.getElementById(idPrefix + '_m').value) || 0;
    const s = parseFloat(document.getElementById(idPrefix + '_s').value) || 0;
    return -1 * (d + m / 60 + s / 3600);
}

function fillDMS(idPrefix, val) {
    val = Math.abs(val);
    const d = Math.floor(val);
    const rem = (val - d) * 60;
    const m = Math.floor(rem);
    const s = ((rem - m) * 60).toFixed(2);
    if (document.getElementById(idPrefix + '_d')) document.getElementById(idPrefix + '_d').value = d;
    if (document.getElementById(idPrefix + '_m')) document.getElementById(idPrefix + '_m').value = m;
    if (document.getElementById(idPrefix + '_s')) document.getElementById(idPrefix + '_s').value = s;
}