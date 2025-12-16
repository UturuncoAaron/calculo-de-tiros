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