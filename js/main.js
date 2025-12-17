document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('inputMode').addEventListener('change', toggleInputs);
    document.getElementById('btnFuego').addEventListener('click', calcularYDibujar);
    document.getElementById('btnCalcularObs').addEventListener('click', calcularTargetDesdeObservador);
    document.getElementById('btnCorregir').addEventListener('click', aplicarCorreccion);

    document.getElementById('tipoGranada').addEventListener('change', () => {
        if (document.getElementById('resDist').textContent !== "0") calcularYDibujar();
    });

    dibujarRadar(0, 0, 0, 0, NaN, NaN);
});

function toggleInputs() {
    const mode = document.getElementById('inputMode').value;
    const ids = ['mortero', 'target', 'obs'];
    ids.forEach(id => {
        const divUtm = document.getElementById(`${id}-utm`);
        const divDms = document.getElementById(`${id}-dms`);
        // Ahora sí existen todos, el cambio funcionará
        if (divUtm && divDms) {
            if (mode === 'utm') {
                divUtm.classList.remove('hidden');
                divDms.classList.add('hidden');
            } else {
                divUtm.classList.add('hidden');
                divDms.classList.remove('hidden');
            }
        }
    });
}

function calcularTargetDesdeObservador() {
    const mode = document.getElementById('inputMode').value;
    const dist = parseFloat(document.getElementById('distObs').value);
    const azMils = parseFloat(document.getElementById('azObs').value); // Entrada en MILS

    if (isNaN(dist) || isNaN(azMils)) { alert("Faltan datos de visión"); return; }

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

    // CORRECCIÓN: Convertir Mils (6400) a Radianes
    const azRad = azMils * (2 * Math.PI / 6400);

    const tx = obsX + (dist * Math.sin(azRad));
    const ty = obsY + (dist * Math.cos(azRad));

    document.getElementById('tx').value = tx.toFixed(0);
    document.getElementById('ty').value = ty.toFixed(0);

    // Si estamos en modo DMS, actualizar también los campos Lat/Lon del objetivo
    if (mode === 'dms') {
        const geo = proj4("EPSG:32718", "EPSG:4326", [tx, ty]);
        fillDMS('tlat', geo[1]);
        fillDMS('tlon', geo[0]);
    }
}

function calcularYDibujar() {
    const mode = document.getElementById('inputMode').value;
    let mx, my, tx, ty, ox, oy;

    if (mode === 'utm') {
        mx = parseFloat(document.getElementById('mx').value);
        my = parseFloat(document.getElementById('my').value);
        tx = parseFloat(document.getElementById('tx').value);
        ty = parseFloat(document.getElementById('ty').value);
        ox = parseFloat(document.getElementById('ox').value);
        oy = parseFloat(document.getElementById('oy').value);
    } else {
        const mLat = dmsToDecimal('mlat'); const mLon = dmsToDecimal('mlon');
        const mUTM = proj4("EPSG:4326", "EPSG:32718", [mLon, mLat]);
        mx = mUTM[0]; my = mUTM[1];
        const tLat = dmsToDecimal('tlat'); const tLon = dmsToDecimal('tlon');
        const tUTM = proj4("EPSG:4326", "EPSG:32718", [tLon, tLat]);
        tx = tUTM[0]; ty = tUTM[1];
        const oLat = dmsToDecimal('olat'); const oLon = dmsToDecimal('olon');
        if (!isNaN(oLat)) {
            const oUTM = proj4("EPSG:4326", "EPSG:32718", [oLon, oLat]);
            ox = oUTM[0]; oy = oUTM[1];
        }
    }

    if (isNaN(mx) || isNaN(tx)) { alert("Faltan coordenadas"); return; }

    const deltaX = tx - mx;
    const deltaY = ty - my;
    const distanciaPlana = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    let azRad = Math.atan2(deltaX, deltaY);
    let azGrados = azRad * (180 / Math.PI);
    if (azGrados < 0) azGrados += 360;

    // Cálculo de Milésimas
    const azMils = (azGrados * 6400) / 360;

    let altPieza = parseFloat(document.getElementById('alt_pieza').value) || 0;
    let altObj = parseFloat(document.getElementById('alt_obj').value);
    if (isNaN(altObj)) altObj = altPieza;
    const diffAlt = altObj - altPieza;
    const angSitRad = Math.atan(diffAlt / distanciaPlana);
    const angSitMils = (angSitRad * 6400) / (2 * Math.PI);

    const tipoGranada = document.getElementById('tipoGranada').value;
    const datosBalisticos = calcularBalistica(distanciaPlana, tipoGranada);

    let elevacionFinal = datosBalisticos.elev;
    if (datosBalisticos.status === "OK") {
        elevacionFinal = datosBalisticos.elev + angSitMils;
    }

    document.getElementById('resAzimutMils').textContent = Math.round(azMils).toString().padStart(4, '0');
    document.getElementById('resAzimutDeg').textContent = `${azGrados.toFixed(1)}°`;
    document.getElementById('resDist').textContent = Math.round(distanciaPlana);

    document.getElementById('bal_carga').textContent = datosBalisticos.carga;
    document.getElementById('bal_time').textContent = datosBalisticos.tiempo;

    if (datosBalisticos.status === "OK") {
        let textoElev = Math.round(elevacionFinal);
        document.getElementById('bal_elev').textContent = textoElev;
    } else {
        document.getElementById('bal_elev').textContent = "---";
    }

    dibujarRadar(mx, my, tx, ty, ox, oy);
}

function aplicarCorreccion() {
    let tx = parseFloat(document.getElementById('tx').value);
    let ty = parseFloat(document.getElementById('ty').value);
    let ox = parseFloat(document.getElementById('ox').value);
    let oy = parseFloat(document.getElementById('oy').value);

    if (isNaN(ox) || isNaN(oy)) {
        ox = parseFloat(document.getElementById('mx').value);
        oy = parseFloat(document.getElementById('my').value);
        if (isNaN(ox)) { alert("No hay referencia para corrección"); return; }
    }

    const milsLateral = parseFloat(document.getElementById('corr_mils').value) || 0;
    const metrosAlcance = parseFloat(document.getElementById('corr_metros').value) || 0;
    const dirLat = document.getElementById('corr_dir').value;
    const dirAlc = document.getElementById('corr_range').value;

    if (milsLateral === 0 && metrosAlcance === 0) return;

    const dx = tx - ox;
    const dy = ty - oy;
    const distOT = Math.sqrt(dx * dx + dy * dy);

    const correc = calcularVectorCorreccion(distOT, milsLateral, metrosAlcance, dirLat, dirAlc);

    const azOTRad = Math.atan2(dx, dy);

    const shiftX_alc = correc.alc * Math.sin(azOTRad);
    const shiftY_alc = correc.alc * Math.cos(azOTRad);

    const shiftX_lat = correc.lat * Math.cos(azOTRad);
    const shiftY_lat = -correc.lat * Math.sin(azOTRad);

    let newTx = tx + shiftX_alc + shiftX_lat;
    let newTy = ty + shiftY_alc + shiftY_lat;

    document.getElementById('tx').value = newTx.toFixed(0);
    document.getElementById('ty').value = newTy.toFixed(0);

    if (document.getElementById('inputMode').value === 'dms' && typeof proj4 !== 'undefined') {
        const geo = proj4("EPSG:32718", "EPSG:4326", [newTx, newTy]);
        fillDMS('tlat', geo[1]);
        fillDMS('tlon', geo[0]);
    }

    document.getElementById('corr_mils').value = "";
    document.getElementById('corr_metros').value = "";

    calcularYDibujar();
}

function dibujarRadar(mx, my, tx, ty, ox, oy) {
    const canvas = document.getElementById('radarCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#003300'; ctx.lineWidth = 1;
    for (let i = 0; i <= w; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    for (let i = 0; i <= h; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }

    ctx.strokeStyle = '#004400'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.20, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.40, 0, Math.PI * 2); ctx.stroke();

    if (isNaN(mx) || isNaN(tx)) return;

    const deltaTx = tx - mx;
    const deltaTy = ty - my;
    const distT = Math.sqrt(deltaTx * deltaTx + deltaTy * deltaTy);
    let maxDist = distT;
    if (!isNaN(ox)) {
        const distO = Math.sqrt(Math.pow(ox - mx, 2) + Math.pow(oy - my, 2));
        maxDist = Math.max(distT, distO);
    }
    const scale = (w / 2 * 0.85) / (maxDist || 1);
    const mapX = (val) => cx + (val - mx) * scale;
    const mapY = (val) => cy - (val - my) * scale;

    // Mortero
    ctx.fillStyle = '#00ff41';
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx - 7, cy + 7); ctx.lineTo(cx + 7, cy + 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "10px monospace"; ctx.fillText("M", cx + 10, cy);

    // Objetivo
    const cTx = mapX(tx); const cTy = mapY(ty);
    ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cTx - 5, cTy - 5); ctx.lineTo(cTx + 5, cTy + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cTx + 5, cTy - 5); ctx.lineTo(cTx - 5, cTy + 5); ctx.stroke();
    ctx.fillStyle = "#ff3333"; ctx.fillText("T", cTx + 8, cTy);

    // Linea de Tiro
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.5)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cTx, cTy); ctx.stroke(); ctx.setLineDash([]);

    // Observador
    if (!isNaN(ox)) {
        const cOx = mapX(ox); const cOy = mapY(oy);
        ctx.fillStyle = '#00ffff'; ctx.beginPath(); ctx.arc(cOx, cOy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#00ffff"; ctx.fillText("OP", cOx + 8, cOy);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)'; ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(cOx, cOy); ctx.lineTo(cTx, cTy); ctx.stroke(); ctx.setLineDash([]);
    }
}
function calcularTargetDesdeObservador() {
    const mode = document.getElementById('inputMode').value;
    const dist = parseFloat(document.getElementById('distObs').value);
    const azInput = parseFloat(document.getElementById('azObs').value);
    const azUnit = document.getElementById('azObsUnit').value; // 'mils' o 'deg'

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

    // --- CORRECCIÓN: Convertir según la unidad elegida ---
    let azRad = 0;
    if (azUnit === 'mils') {
        // De Milésimas (6400) a Radianes
        azRad = azInput * (2 * Math.PI / 6400);
    } else {
        // De Grados (360) a Radianes
        azRad = azInput * (Math.PI / 180);
    }
    // ----------------------------------------------------

    const tx = obsX + (dist * Math.sin(azRad));
    const ty = obsY + (dist * Math.cos(azRad));

    document.getElementById('tx').value = tx.toFixed(0);
    document.getElementById('ty').value = ty.toFixed(0);

    // Si estamos en modo DMS, actualizar también los campos Lat/Lon del objetivo
    if (mode === 'dms') {
        const geo = proj4("EPSG:32718", "EPSG:4326", [tx, ty]);
        fillDMS('tlat', geo[1]);
        fillDMS('tlon', geo[0]);
    }
}
// Variable global para guardar la distancia calculada actual
let distanciaTiroGlobal = 0;

document.addEventListener('DOMContentLoaded', () => {
    // ... (listeners anteriores) ...
    document.getElementById('inputMode').addEventListener('change', toggleInputs);
    document.getElementById('btnFuego').addEventListener('click', calcularYDibujar);
    document.getElementById('btnCalcularObs').addEventListener('click', calcularTargetDesdeObservador);
    document.getElementById('btnCorregir').addEventListener('click', aplicarCorreccion);

    // NUEVO: Cuando cambies la carga manualmente, recalcula solo los datos balísticos
    document.getElementById('sel_carga').addEventListener('change', (e) => {
        const cargaManual = e.target.value;
        if (distanciaTiroGlobal > 0 && cargaManual !== '-') {
            actualizarDatosPorCarga(distanciaTiroGlobal, cargaManual);
        }
    });

    const inputsMeteo = document.querySelectorAll('.input-cyan');
    inputsMeteo.forEach(input => input.addEventListener('input', calcularYDibujar));
    document.getElementById('tipoGranada').addEventListener('change', calcularYDibujar);

    dibujarRadar(0, 0, 0, 0, NaN, NaN);
});

// ... (toggleInputs, calcularTargetDesdeObservador, dmsToDecimal IGUALES) ...

function calcularYDibujar() {
    // ... (Parte 1: Obtener Coordenadas y Topografía - IGUAL QUE ANTES) ...
    const mode = document.getElementById('inputMode').value;
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
    if (isNaN(mx) || isNaN(tx)) return;

    // Topografía Base
    const deltaX = tx - mx;
    const deltaY = ty - my;
    const distanciaMapa = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    let azRad = Math.atan2(deltaX, deltaY);
    let azGrados = azRad * (180 / Math.PI);
    if (azGrados < 0) azGrados += 360;
    const azMilsBase = (azGrados * 6400) / 360;

    // --- CÁLCULO DE CORRECCIONES (VIENTO/TEMP) ---
    // Usamos una carga 'dummy' (la 0) solo para obtener factores y corregir distancia
    const tipoGranada = document.getElementById('tipoGranada').value;
    const datosBase = calcularBalistica(distanciaMapa, tipoGranada, 0);

    // Recuperar datos meteo
    const vientoDir = parseFloat(document.getElementById('meteo_dir').value) || 0;
    const vientoVel = parseFloat(document.getElementById('meteo_vel').value) || 0;
    const tempAire = parseFloat(document.getElementById('meteo_temp').value) || 15;
    const difPeso = parseFloat(document.getElementById('meteo_peso').value) || 0;

    // Factores (Si no hay DB completa, usa 0)
    const fact = datosBase.factores || { v_cola: 0, v_traves: 0, t_aire: 0, peso: 0 };

    // Calcular Viento
    const angVientoRad = vientoDir * (Math.PI / 180);
    const angTiroRad = azGrados * (Math.PI / 180);
    const angRelativo = angVientoRad - angTiroRad;
    const vCola = vientoVel * Math.cos(angRelativo);
    const vTraves = vientoVel * Math.sin(angRelativo);

    // Corregir Distancia
    const corrViento = vCola * fact.v_cola;
    const corrTemp = (tempAire - 15) * fact.t_aire;
    const corrPeso = difPeso * fact.peso;

    distanciaTiroGlobal = distanciaMapa - (corrViento + corrTemp + corrPeso); // GUARDAR GLOBAL

    // Corregir Azimut (Deriva)
    const corrDerivaMils = vTraves * fact.v_traves;
    const azimutFinal = azMilsBase + corrDerivaMils;

    // Mostrar Azimut y Distancia (Estos no cambian con la carga)
    document.getElementById('resAzimutMils').textContent = Math.round(azimutFinal).toString().padStart(4, '0');
    document.getElementById('resAzimutDeg').textContent = `${((azimutFinal * 360) / 6400).toFixed(1)}°`;
    document.getElementById('resDist').textContent = Math.round(distanciaMapa); // Mostramos la del mapa

    // --- NUEVO: LLENAR TABLA DE CARGAS Y SELECTOR ---
    llenarOpcionesDeCarga(distanciaTiroGlobal, tipoGranada);

    dibujarRadar(mx, my, tx, ty, parseFloat(document.getElementById('ox').value), parseFloat(document.getElementById('oy').value));
}

// ... (resto del código igual)

function llenarOpcionesDeCarga(distancia, tipoID) {
    const BD = ARSENAL[tipoID];
    const select = document.getElementById('sel_carga');
    const tablaDiv = document.getElementById('tabla-cargas');
    const recDiv = document.getElementById('recomendacion-msg'); // Caja del mensaje

    select.innerHTML = "";
    tablaDiv.innerHTML = `<div class="charge-row header"><span>CARGA</span><span>ELEVACIÓN</span><span>SEGURIDAD</span></div>`;
    tablaDiv.classList.remove('hidden');
    recDiv.classList.remove('hidden');

    let mejorCarga = -1;
    let mejorBuffer = -1;
    let motivo = "";

    // Barrido de Cargas
    for (const c in BD.rangos) {
        if (distancia >= BD.rangos[c].min && distancia <= BD.rangos[c].max) {

            const datos = calcularBalistica(distancia, tipoID, c);
            if (datos.status === "OK") {
                const buffer = BD.rangos[c].max - distancia;

                // Agregar al SELECT
                const option = document.createElement('option');
                option.value = c;
                option.text = `CARGA ${c}`;
                select.appendChild(option);

                // Agregar a la TABLA
                const row = document.createElement('div');
                row.className = "charge-row";
                row.innerHTML = `
                    <span>CARGA ${c}</span>
                    <span style="color:#ffff00">${Math.round(datos.elev)}</span>
                    <span>${Math.round(buffer)}m</span>
                `;
                tablaDiv.appendChild(row);

                // LÓGICA DE RECOMENDACIÓN (Explicación para tu papá)
                if (mejorCarga === -1) {
                    mejorCarga = c;
                    mejorBuffer = buffer;
                    motivo = "Es la carga más baja posible (Menor desgaste).";
                    if (buffer < 100) motivo += " (PERO ESTÁ AL LÍMITE).";
                } else {
                    // Si encontramos una carga mejor (más segura)
                    if (mejorBuffer < 100 && buffer > mejorBuffer) {
                        mejorCarga = c;
                        mejorBuffer = buffer;
                        motivo = `Mayor margen de seguridad (${Math.round(buffer)}m libres).`;
                    }
                }
            }
        }
    }

    // Aplicar Selección y Mostrar Mensaje
    if (mejorCarga !== -1) {
        select.value = mejorCarga;
        actualizarDatosPorCarga(distancia, mejorCarga);

        // Escribir el mensaje en la pantalla
        recDiv.innerHTML = `> RECOMENDACIÓN: CARGA ${mejorCarga}<br>> MOTIVO: ${motivo}`;
    } else {
        select.innerHTML = "<option>FUERA</option>";
        recDiv.innerHTML = "> ALERTA: OBJETIVO FUERA DE ALCANCE.";
        recDiv.style.color = "red";
        recDiv.style.borderColor = "red";
    }
}

// ... (resto del código igual)

function actualizarDatosPorCarga(distancia, cargaID) {
    const tipoGranada = document.getElementById('tipoGranada').value;

    // Forzamos el cálculo balístico con la carga seleccionada manualmente
    // (Nota: Necesitamos modificar ligeramente calcularBalistica para aceptar carga forzada)
    const datos = calcularBalistica(distancia, tipoGranada, cargaID);

    // Angulo de Situación (Altura)
    let altPieza = parseFloat(document.getElementById('alt_pieza').value) || 0;
    let altObj = parseFloat(document.getElementById('alt_obj').value);
    if (isNaN(altObj)) altObj = altPieza;
    const diffAlt = altObj - altPieza;
    const angSitRad = Math.atan(diffAlt / distancia);
    const angSitMils = (angSitRad * 6400) / (2 * Math.PI);

    let elevFinal = datos.elev + angSitMils;

    document.getElementById('bal_elev').textContent = Math.round(elevFinal);
    document.getElementById('bal_time').textContent = datos.tiempo;

    // Resaltar en la tabla la carga activa
    const filas = document.querySelectorAll('.charge-row');
    filas.forEach(f => f.classList.remove('active'));
    // Buscar la fila que contiene el texto de la carga y activarla (simple visual)
    for (let f of filas) {
        if (f.textContent.includes(`CARGA ${cargaID}`)) f.classList.add('active');
    }
}