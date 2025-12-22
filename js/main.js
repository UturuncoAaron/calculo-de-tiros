let distanciaTiroGlobal = 0;

/* Inicialización de eventos */
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('inputMode').addEventListener('change', toggleInputs);
    document.getElementById('btnFuego').addEventListener('click', calcularYDibujar);
    document.getElementById('btnCalcularObs').addEventListener('click', calcularTargetDesdeObservador);
    document.getElementById('btnCorregir').addEventListener('click', aplicarCorreccion);

    document.getElementById('sel_carga').addEventListener('change', (e) => {
        const cargaManual = e.target.value;
        if (distanciaTiroGlobal > 0 && cargaManual !== '-') {
            actualizarDatosPorCarga(distanciaTiroGlobal, cargaManual);
        }
    });

    const inputsMeteo = document.querySelectorAll('.input-cyan');
    inputsMeteo.forEach(input => input.addEventListener('input', calcularYDibujar));
    document.getElementById('tipoGranada').addEventListener('change', calcularYDibujar);

    toggleMetodoReglaje();
    dibujarRadar(0, 0, 0, 0, NaN, NaN);
});

function toggleInputs() {
    const mode = document.getElementById('inputMode').value;
    const utmDivs = document.querySelectorAll('.utm-group');
    const dmsDivs = document.querySelectorAll('.dms-group');
    const obsUtm = document.getElementById('obs-utm');
    const obsDms = document.getElementById('obs-dms');

    if (mode === 'utm') {
        utmDivs.forEach(d => d.classList.remove('hidden'));
        dmsDivs.forEach(d => d.classList.add('hidden'));
        obsUtm.classList.remove('hidden');
        obsDms.classList.add('hidden');
    } else {
        utmDivs.forEach(d => d.classList.add('hidden'));
        dmsDivs.forEach(d => d.classList.remove('hidden'));
        obsUtm.classList.add('hidden');
        obsDms.classList.remove('hidden');
    }
}

function toggleMetodoReglaje() {
    const metodo = document.getElementById('metodo_reglaje').value;
    const divAprec = document.getElementById('inputs_apreciacion');
    const divMedic = document.getElementById('inputs_medicion');
    const btn = document.getElementById('btnCorregir');

    if (metodo === 'medicion') {
        divAprec.classList.add('hidden');
        divMedic.classList.remove('hidden');
        btn.textContent = "CALCULAR UBICACIÓN Y CORREGIR";
    } else {
        divAprec.classList.remove('hidden');
        divMedic.classList.add('hidden');
        btn.textContent = "APLICAR CORRECCIÓN";
    }
}

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

    let azRad = 0;
    if (azUnit === 'mils') {
        azRad = azInput * (2 * Math.PI / 6400);
    } else {
        azRad = azInput * (Math.PI / 180);
    }

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

/* FUNCIÓN PRINCIPAL CORREGIDA: LÓGICA DE SIGNOS FIXED */
function calcularYDibujar() {
    const mode = document.getElementById('inputMode').value;
    let mx, my, tx, ty;

    // 1. OBTENER COORDENADAS
    if (mode === 'utm') {
        mx = parseFloat(document.getElementById('mx').value);
        my = parseFloat(document.getElementById('my').value);
        tx = parseFloat(document.getElementById('tx').value);
        ty = parseFloat(document.getElementById('ty').value);
    } else {
        const mLat = dmsToDecimal('mlat'); const mLon = dmsToDecimal('mlon');
        const mUTM = proj4("EPSG:4326", "EPSG:32718", [mLon, mLat]);
        mx = mUTM[0]; my = mUTM[1];
        const tLat = dmsToDecimal('tlat'); const tLon = dmsToDecimal('tlon');
        const tUTM = proj4("EPSG:4326", "EPSG:32718", [tLon, tLat]);
        tx = tUTM[0]; ty = tUTM[1];
    }

    if (isNaN(mx) || isNaN(tx)) return;

    // 2. CALCULAR GEOMETRÍA DE MAPA (TOPOGRÁFICA)
    const deltaX = tx - mx;
    const deltaY = ty - my;
    const distanciaMapa = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    let azRad = Math.atan2(deltaX, deltaY);
    let azGrados = azRad * (180 / Math.PI);
    if (azGrados < 0) azGrados += 360;
    const azMilsBase = (azGrados * 6400) / 360;

    // 3. APLICAR CORRECCIONES METEOROLÓGICAS
    const tipoGranada = document.getElementById('tipoGranada').value;
    if (typeof ARSENAL === 'undefined' || !ARSENAL[tipoGranada]) return;

    const BD = ARSENAL[tipoGranada];

    // Buscar carga para factores
    let cargaParaFactores = 0;
    for (const c in BD.rangos) {
        if (distanciaMapa >= BD.rangos[c].min && distanciaMapa <= BD.rangos[c].max) {
            cargaParaFactores = c;
        }
    }
    if (cargaParaFactores == 0 && BD.cargas[3]) cargaParaFactores = 3;

    const datosBase = calcularBalistica(distanciaMapa, tipoGranada, cargaParaFactores);
    const fact = datosBase.factores || { v_cola: 0, v_traves: 0, t_aire: 0, peso: 0 };

    // Inputs Meteo
    const vientoDir = parseFloat(document.getElementById('meteo_dir').value) || 0;
    const vientoVel = parseFloat(document.getElementById('meteo_vel').value) || 0;
    const tempAire = parseFloat(document.getElementById('meteo_temp').value) || 15;
    const difPeso = parseFloat(document.getElementById('meteo_peso').value) || 0;

    // Viento
    const angVientoRad = vientoDir * (Math.PI / 180);
    const angTiroRad = azGrados * (Math.PI / 180);
    const angRelativo = angVientoRad - angTiroRad;
    const vCola = vientoVel * Math.cos(angRelativo); // + Cola, - Cabeza
    const vTraves = vientoVel * Math.sin(angRelativo);

    const corrViento = vCola * fact.v_cola;     // Si es positivo (cola), ayuda al vuelo -> Restar Alcance
    const corrTemp = (tempAire - 15) * fact.t_aire; // Si es positivo (calor), ayuda al vuelo -> Restar Alcance
    const corrPeso = difPeso * fact.peso; // Si es negativo (-2), es más ligero, ayuda al vuelo -> Restar Alcance

    // --- VARIACIÓN FIJA (HARDCODED) ---
    const VARIACION_LOTE = -0.87;
    const FACTOR_CORRECCION = 38;
    const corrVariacion = VARIACION_LOTE * FACTOR_CORRECCION; // Da negativo (-33m)

    // FÓRMULA MAESTRA CORREGIDA:
    // Mapa 
    // - Viento (Si vuela más, resto distancia)
    // - Temp (Si vuela más, resto distancia)
    // + Peso (Como el peso ya es negativo (-2), al SUMARLO, se resta solo. Antes lo restábamos y se sumaba).
    // + Variacion (Como ya es negativa (-33), al SUMARLA, se resta sola).

    distanciaTiroGlobal = distanciaMapa - corrViento - corrTemp + corrPeso + corrVariacion;

    // Deriva
    const corrDerivaMils = vTraves * fact.v_traves;
    const azimutFinal = azMilsBase + corrDerivaMils;

    // 4. ACTUALIZAR UI
    document.getElementById('resAzimutMils').textContent = Math.round(azimutFinal).toString().padStart(4, '0');

    llenarOpcionesDeCarga(distanciaTiroGlobal, tipoGranada);

    dibujarRadar(mx, my, tx, ty, parseFloat(document.getElementById('ox').value), parseFloat(document.getElementById('oy').value));
}

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
                row.innerHTML = `
                    <span>CARGA ${c}</span>
                    <span style="color:#ffff00">${Math.round(datos.elev)}</span>
                    <span>${Math.round(buffer)}m</span>
                `;
                tablaDiv.appendChild(row);

                if (mejorCarga === -1) {
                    mejorCarga = c;
                    mejorBuffer = buffer;
                    motivo = "Es la carga más baja posible (Menor desgaste).";
                } else {
                    if (mejorBuffer < 100 && buffer > mejorBuffer) {
                        mejorCarga = c;
                        mejorBuffer = buffer;
                        motivo = `Mayor margen de seguridad (${Math.round(buffer)}m libres).`;
                    }
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

function actualizarDatosPorCarga(distanciaBalistica, cargaID) {
    const tipoGranada = document.getElementById('tipoGranada').value;

    // 1. RECALCULAR DISTANCIA REAL DE MAPA (INDEPENDIENTE DE BALÍSTICA)
    const mode = document.getElementById('inputMode').value;
    let distMapa = 0;

    let mx, my, tx, ty;
    if (mode === 'utm') {
        mx = parseFloat(document.getElementById('mx').value);
        my = parseFloat(document.getElementById('my').value);
        tx = parseFloat(document.getElementById('tx').value);
        ty = parseFloat(document.getElementById('ty').value);
    } else {
        const mLat = dmsToDecimal('mlat'); const mLon = dmsToDecimal('mlon');
        const mUTM = proj4("EPSG:4326", "EPSG:32718", [mLon, mLat]);
        mx = mUTM[0]; my = mUTM[1];
        const tLat = dmsToDecimal('tlat'); const tLon = dmsToDecimal('tlon');
        const tUTM = proj4("EPSG:4326", "EPSG:32718", [tLon, tLat]);
        tx = tUTM[0]; ty = tUTM[1];
    }

    if (!isNaN(mx) && !isNaN(tx)) {
        const dx = tx - mx;
        const dy = ty - my;
        distMapa = Math.sqrt(dx * dx + dy * dy);
    } else {
        distMapa = distanciaBalistica;
    }

    // 2. CÁLCULOS BALÍSTICOS
    const datos = calcularBalistica(distanciaBalistica, tipoGranada, cargaID);

    // 3. CÁLCULOS DE ALTURA
    let altPieza = parseFloat(document.getElementById('alt_pieza').value) || 0;
    let altObj = parseFloat(document.getElementById('alt_obj').value);
    if (isNaN(altObj)) altObj = 0;
    const diffAlt = altObj - altPieza;

    const angSitRad = Math.atan(diffAlt / distMapa);
    const angSitMils = (angSitRad * 6400) / (2 * Math.PI);

    let elevFinal = datos.elev - angSitMils;

    // 4. AZIMUT Y DERIVA
    let azimutTiroMils = parseFloat(document.getElementById('resAzimutMils').textContent) || 0;
    const orientacion = parseFloat(document.getElementById('orientacion_base').value) || 6400;
    const declinacion = parseFloat(document.getElementById('declinacion_mag').value) || 0;

    const azimutMagnetico = azimutTiroMils + declinacion;

    let diffDerivaRaw = orientacion - azimutMagnetico;
    let derivaCmd = diffDerivaRaw;
    if (derivaCmd < 0) derivaCmd += 6400;
    if (derivaCmd >= 6400) derivaCmd -= 6400;

    let dirTiroRec = Math.round(azimutMagnetico / 100) * 100;

    // --- ACTUALIZACIÓN DE PANTALLA ---

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

function aplicarCorreccion() {
    // ... (El resto de funciones como aplicarCorreccion, dibujarRadar, etc. siguen igual que antes) ...
    // Para no hacer el mensaje eterno, puedes copiar esas funciones del código anterior
    // ya que no cambiaron. Si las necesitas dímelo.
    // Pero lo importante arriba es calcularYDibujar.
    let tx = parseFloat(document.getElementById('tx').value);
    let ty = parseFloat(document.getElementById('ty').value);
    let ox = parseFloat(document.getElementById('ox').value);
    let oy = parseFloat(document.getElementById('oy').value);

    if (isNaN(tx) || isNaN(ty)) { alert("No hay objetivo definido."); return; }
    if (isNaN(ox) || isNaN(oy)) {
        ox = parseFloat(document.getElementById('mx').value);
        oy = parseFloat(document.getElementById('my').value);
        if (isNaN(ox)) { alert("Faltan coordenadas de referencia."); return; }
    }

    const metodo = document.getElementById('metodo_reglaje').value;
    let newTx, newTy;

    if (metodo === 'apreciacion') {
        const valLateral = parseFloat(document.getElementById('corr_lat_val').value) || 0;
        const valAlcance = parseFloat(document.getElementById('corr_metros').value) || 0;
        if (valLateral === 0 && valAlcance === 0) return;
        const dirLat = document.getElementById('corr_dir').value;
        const unitLat = document.getElementById('corr_lat_unit').value;
        const dirAlc = document.getElementById('corr_range').value;
        const dx = tx - ox;
        const dy = ty - oy;
        const distOT = Math.sqrt(dx * dx + dy * dy);
        const azOTRad = Math.atan2(dx, dy);
        let shiftLateral = (unitLat === 'm') ? valLateral : (distOT * valLateral) / 1000;
        let shiftAlcance = valAlcance;
        let moveAlc = (dirAlc === 'over') ? -shiftAlcance : shiftAlcance;
        let moveLat = (dirLat === 'right') ? -shiftLateral : shiftLateral;
        const shiftX = (moveAlc * Math.sin(azOTRad)) + (moveLat * Math.cos(azOTRad));
        const shiftY = (moveAlc * Math.cos(azOTRad)) - (moveLat * Math.sin(azOTRad));
        newTx = tx + shiftX;
        newTy = ty + shiftY;
        document.getElementById('corr_lat_val').value = "";
        document.getElementById('corr_metros').value = "";
    }
    else {
        const impAz = parseFloat(document.getElementById('impacto_az').value);
        const impDist = parseFloat(document.getElementById('impacto_dist').value);
        if (isNaN(impAz) || isNaN(impDist)) { alert("Faltan datos de impacto."); return; }
        const impAzRad = impAz * (2 * Math.PI / 6400);
        const ix = ox + (impDist * Math.sin(impAzRad));
        const iy = oy + (impDist * Math.cos(impAzRad));
        const errorX = ix - tx;
        const errorY = iy - ty;
        newTx = tx - errorX;
        newTy = ty - errorY;
        document.getElementById('impacto_az').value = "";
        document.getElementById('impacto_dist').value = "";
    }
    document.getElementById('tx').value = newTx.toFixed(0);
    document.getElementById('ty').value = newTy.toFixed(0);
    if (document.getElementById('inputMode').value === 'dms' && typeof proj4 !== 'undefined') {
        const geo = proj4("EPSG:32718", "EPSG:4326", [newTx, newTy]);
        fillDMS('tlat', geo[1]);
        fillDMS('tlon', geo[0]);
    }
    calcularYDibujar();
}

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
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.2, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.4, 0, 2 * Math.PI);
    ctx.stroke();
    if (isNaN(mx) || isNaN(tx)) return;
    const maxRange = 6000;
    const scale = (w / 2) / maxRange;
    const dX = tx - mx;
    const dY = ty - my;
    const plotX = cx + dX * scale;
    const plotY = cy - dY * scale;
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(plotX, plotY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#00ff41';
    ctx.font = '12px Arial';
    ctx.fillText('M', cx + 5, cy - 5);
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'red';
    ctx.fillText('T', plotX + 5, plotY - 5);
    ctx.beginPath();
    ctx.moveTo(plotX - 4, plotY - 4);
    ctx.lineTo(plotX + 4, plotY + 4);
    ctx.moveTo(plotX + 4, plotY - 4);
    ctx.lineTo(plotX - 4, plotY + 4);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (!isNaN(ox) && !isNaN(oy)) {
        const odX = ox - mx;
        const odY = oy - my;
        const oPlotX = cx + odX * scale;
        const oPlotY = cy - odY * scale;
        ctx.fillStyle = 'cyan';
        ctx.fillText('Obs', oPlotX + 5, oPlotY - 5);
        ctx.beginPath();
        ctx.rect(oPlotX - 3, oPlotY - 3, 6, 6);
        ctx.fill();
    }
}

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