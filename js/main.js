let distanciaTiroGlobal = 0;
let contadorReglajes = 0;
let historialImpactos = [];

// Variable para guardar la variación fija de la misión (cuando se bloquea)
let variacionCongelada = 0;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Fecha Automática
    const inputFecha = document.getElementById('fecha_tiro');
    if (inputFecha) {
        const hoy = new Date();
        const fechaLocal = new Date(hoy.getTime() - (hoy.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        inputFecha.value = fechaLocal;
    }

    // 2. Listener del BLOQUEO
    const checkBloqueo = document.getElementById('check_bloqueo');
    if (checkBloqueo) {
        checkBloqueo.addEventListener('change', () => {
            if (checkBloqueo.checked) {
                variacionCongelada = parseFloat(document.getElementById('input_variacion').value) || 0;
            }
            gestionarBloqueo();
            calcularYDibujar();
        });
    }

    // 3. Listener del Checkbox "APLICAR VARIACIÓN"
    const checkAplicarVar = document.getElementById('check_aplicar_variacion');
    if (checkAplicarVar) {
        checkAplicarVar.addEventListener('change', calcularYDibujar);
    }

    // 4. LISTENERS DEL OBSERVADOR (AUTOMÁTICO)
    const inputsObs = ['ox', 'oy', 'distObs', 'azObs', 'azObsUnit'];
    inputsObs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', calcularTargetDesdeObservador);
            if (id === 'azObsUnit') el.addEventListener('change', calcularTargetDesdeObservador);
        }
    });

    // 5. Resto de Listeners
    const inputMode = document.getElementById('inputMode');
    if (inputMode) inputMode.addEventListener('change', toggleInputs);

    const btnCorregir = document.getElementById('btnCorregir');
    if (btnCorregir) btnCorregir.addEventListener('click', aplicarCorreccion);

    const btnReset = document.getElementById('btnResetHistorial');
    if (btnReset) btnReset.addEventListener('click', reiniciarHistorial);

    // --- CÁLCULO AUTOMÁTICO GENERAL ---
    const inputsCoordenadas = ['mx', 'my', 'alt_pieza', 'tx', 'ty', 'alt_obj'];
    inputsCoordenadas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', calcularYDibujar);
    });

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

    // Cambio de Carga
    const selCarga = document.getElementById('sel_carga');
    if (selCarga) {
        selCarga.addEventListener('change', (e) => {
            if (distanciaTiroGlobal > 0 && e.target.value !== '-') {
                actualizarDatosPorCarga(distanciaTiroGlobal, e.target.value);
            }
        });
    }

    // Inicialización
    calcularVariacionMagnetica();
    gestionarBloqueo();
    toggleMetodoReglaje();
    dibujarRadar(0, 0, 0, 0, NaN, NaN);
});

// --- FUNCIONES ---

function gestionarBloqueo() {
    const isLocked = document.getElementById('check_bloqueo').checked;
    const labelStatus = document.getElementById('lock-text');
    const headerBox = document.querySelector('.tactical-header-box');

    const idsToLock = ['fecha_tiro', 'decl_grados', 'decl_minutos', 'zona_utm', 'orientacion_base'];
    idsToLock.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = isLocked;
    });

    if (isLocked) {
        if (labelStatus) {
            labelStatus.textContent = "BLOQUEADO (EN MISIÓN)";
            labelStatus.className = "status-text text-red-alert";
        }
        if (headerBox) headerBox.classList.add('locked-mode');
    } else {
        if (labelStatus) {
            labelStatus.textContent = "ABIERTO (EDITABLE)";
            labelStatus.className = "status-text text-green";
        }
        if (headerBox) headerBox.classList.remove('locked-mode');
    }
}

function toggleInputs() {
    const mode = document.getElementById('inputMode').value;
    const isUtm = mode === 'utm';

    document.querySelectorAll('.utm-group').forEach(d => d.classList.toggle('hidden', !isUtm));
    document.querySelectorAll('.dms-group').forEach(d => d.classList.toggle('hidden', isUtm));

    const obsUtm = document.getElementById('obs-utm');
    if (obsUtm) obsUtm.classList.toggle('hidden', !isUtm);
}

function toggleMetodoReglaje() {
    const metodo = document.getElementById('metodo_reglaje').value;
    const isMedicion = metodo === 'medicion';
    document.getElementById('inputs_apreciacion').classList.toggle('hidden', isMedicion);
    document.getElementById('inputs_medicion').classList.toggle('hidden', !isMedicion);
    const btn = document.getElementById('btnCorregir');
    if (btn) btn.textContent = isMedicion ? "CALCULAR UBICACIÓN Y CORREGIR" : "APLICAR CORRECCIÓN";
}

function reiniciarHistorial() {
    contadorReglajes = 0;
    historialImpactos = [];
    const lista = document.getElementById('lista-historial');
    if (lista) lista.innerHTML = '';
    const panel = document.getElementById('historial-panel');
    if (panel) panel.classList.add('hidden');
    calcularYDibujar();
}

function agregarAlHistorial(textoCorreccion) {
    contadorReglajes++;
    const panel = document.getElementById('historial-panel');
    if (panel) panel.classList.remove('hidden');
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
    if (lista) {
        lista.appendChild(row);
        lista.scrollTop = lista.scrollHeight;
    }
}

function obtenerGeometria() {
    const mx = parseFloat(document.getElementById('mx').value);
    const my = parseFloat(document.getElementById('my').value);
    const tx = parseFloat(document.getElementById('tx').value);
    const ty = parseFloat(document.getElementById('ty').value);

    if (isNaN(mx) || isNaN(tx) || isNaN(my) || isNaN(ty)) return null;

    const dx = tx - mx;
    const dy = ty - my;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Azimut Geométrico (Grid)
    let azRad = Math.atan2(dx, dy);
    let azGrados = azRad * (180 / Math.PI);
    if (azGrados < 0) azGrados += 360;
    const azMils = (azGrados * 6400) / 360;

    return { mx, my, tx, ty, dist, azMils, azGrados };
}

function calcularTargetDesdeObservador() {
    const mode = document.getElementById('inputMode').value;
    const dist = parseFloat(document.getElementById('distObs').value);
    const azInput = parseFloat(document.getElementById('azObs').value);
    const azUnit = document.getElementById('azObsUnit').value;

    if (isNaN(dist) || isNaN(azInput)) return;

    let obsX, obsY;
    if (mode === 'utm') {
        obsX = parseFloat(document.getElementById('ox').value);
        obsY = parseFloat(document.getElementById('oy').value);
    }

    if (isNaN(obsX) || isNaN(obsY)) return;

    let azRad = (azUnit === 'mils') ? azInput * (2 * Math.PI / 6400) : azInput * (Math.PI / 180);
    const tx = obsX + (dist * Math.sin(azRad));
    const ty = obsY + (dist * Math.cos(azRad));

    document.getElementById('tx').value = tx.toFixed(0);
    document.getElementById('ty').value = ty.toFixed(0);

    calcularYDibujar();
}

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

    if (!document.getElementById('check_bloqueo').checked) {
        calcularYDibujar();
    }
}

function calcularYDibujar() {
    const geo = obtenerGeometria();
    if (!geo) return;

    // 1. Variación
    let valorVariacionBase = document.getElementById('check_bloqueo').checked ? variacionCongelada : (parseFloat(document.getElementById('input_variacion').value) || 0);
    const chk = document.getElementById('check_aplicar_variacion');
    const aplicarVariacion = chk ? chk.checked : true;
    const variacionEfectiva = aplicarVariacion ? valorVariacionBase : 0;

    // 2. Cálculo Azimut
    const variacionEnMils = variacionEfectiva * 17.777778;
    let azimutFinalMils = geo.azMils + variacionEnMils;
    azimutFinalMils = ((azimutFinalMils % 6400) + 6400) % 6400;

    // 3. Renderizado Pantalla Principal
    document.getElementById('topo_az').textContent = Math.round(geo.azMils).toString().padStart(4, '0');
    document.getElementById('topo_dist').textContent = Math.round(geo.dist);

    const altP = parseFloat(document.getElementById('alt_pieza').value) || 0;
    const altO = parseFloat(document.getElementById('alt_obj').value) || 0;
    document.getElementById('topo_alt').textContent = Math.round(altO - altP);

    document.getElementById('resAzimutMils').textContent = Math.round(azimutFinalMils).toString().padStart(4, '0');

    if (aplicarVariacion) {
        document.getElementById('resAzimutMag').textContent = "MAGNÉTICO";
        document.getElementById('resAzimutMag').style.color = "#ffff00";
    } else {
        document.getElementById('resAzimutMag').textContent = "GRID (GEO)";
        document.getElementById('resAzimutMag').style.color = "#ccc";
    }

    dibujarRadar(geo.mx, geo.my, geo.tx, geo.ty, parseFloat(document.getElementById('ox').value), parseFloat(document.getElementById('oy').value));

    // 4. Balística
    const tipoGranada = document.getElementById('tipoGranada').value;
    if (typeof ARSENAL === 'undefined') {
        console.error("Base de datos Balística no cargada");
        return;
    }

    distanciaTiroGlobal = geo.dist;
    llenarOpcionesDeCarga(distanciaTiroGlobal, tipoGranada);
}

function llenarOpcionesDeCarga(distanciaBalistica, tipoID) {
    const BD = ARSENAL[tipoID];
    const select = document.getElementById('sel_carga');
    const tablaDiv = document.getElementById('tabla-cargas');
    const recDiv = document.getElementById('recomendacion-msg');

    select.innerHTML = "";
    if (tablaDiv) tablaDiv.innerHTML = `<div class="charge-row header"><span>CARGA</span><span>ELEVACIÓN</span><span>SEGURIDAD</span></div>`;
    if (tablaDiv) tablaDiv.classList.remove('hidden');
    if (recDiv) recDiv.classList.remove('hidden');

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

                if (tablaDiv) {
                    const row = document.createElement('div');
                    row.className = "charge-row";
                    row.innerHTML = `<span>CARGA ${c}</span><span style="color:#ffff00">${Math.round(datos.elev)}</span><span>${Math.round(buffer)}m</span>`;
                    tablaDiv.appendChild(row);
                }

                if (mejorCarga === -1) {
                    mejorCarga = c; mejorBuffer = buffer; motivo = "Carga óptima por menor desgaste.";
                } else if (mejorBuffer < 100 && buffer > mejorBuffer) {
                    mejorCarga = c; mejorBuffer = buffer; motivo = `Mayor margen de seguridad (${Math.round(buffer)}m).`;
                }
            }
        }
    }

    if (mejorCarga !== -1) {
        select.value = mejorCarga;
        actualizarDatosPorCarga(distanciaBalistica, mejorCarga);

        if (recDiv) {
            recDiv.innerHTML = `> RECOMENDACIÓN: CARGA ${mejorCarga}<br>> MOTIVO: ${motivo}`;
            recDiv.style.color = "#4dff88";
            recDiv.style.borderColor = "#4dff88";
        }
    } else {
        select.innerHTML = "<option value='FUERA'>FUERA DE RANGO</option>";
        if (recDiv) {
            recDiv.innerHTML = `> ALERTA: FUERA DE ALCANCE BALÍSTICO (${Math.round(distanciaBalistica)}m).`;
            recDiv.style.color = "#ff5555";
            recDiv.style.borderColor = "#ff5555";
        }
        actualizarDatosPorCarga(distanciaBalistica, 'FUERA');
    }
}

// --- FUNCIÓN CORREGIDA PARA QUE NO SE BLOQUEE SI FALTAN CAMPOS ---
function actualizarDatosPorCarga(distanciaBalistica, cargaID) {
    const tipoGranada = document.getElementById('tipoGranada').value;
    const geo = obtenerGeometria();
    if (!geo) return;

    // Recalculo de Azimut
    let valorVariacionBase = document.getElementById('check_bloqueo').checked ? variacionCongelada : (parseFloat(document.getElementById('input_variacion').value) || 0);
    const chk = document.getElementById('check_aplicar_variacion');
    const aplicarVariacion = chk ? chk.checked : true;
    const variacionEfectiva = aplicarVariacion ? valorVariacionBase : 0;

    let azimutDeTiro = geo.azMils + (variacionEfectiva * 17.777778);
    azimutDeTiro = ((azimutDeTiro % 6400) + 6400) % 6400;

    const orientacion = parseFloat(document.getElementById('orientacion_base').value) || 0;

    let diffDerivaRaw = orientacion - azimutDeTiro;
    let derivaCmd = diffDerivaRaw;
    while (derivaCmd < 0) derivaCmd += 6400;
    while (derivaCmd >= 6400) derivaCmd -= 6400;

    // --- ACTUALIZACIÓN DOM SEGURA (Aquí está la corrección clave) ---
    // Usamos 'if (elemento)' para verificar que existe antes de escribir

    const elOrient = document.getElementById('cmd_orient');
    if (elOrient) elOrient.textContent = Math.round(orientacion); // Si no existe, no pasa nada

    const elDeriva = document.getElementById('cmd_deriva');
    if (elDeriva) elDeriva.textContent = Math.round(derivaCmd).toString().padStart(4, '0');

    const elDist = document.getElementById('cmd_dist');
    if (elDist) elDist.textContent = Math.round(distanciaBalistica);

    // Mini Excel (opcional)
    const miniTabla = document.getElementById('mini-resumen');
    if (miniTabla) {
        miniTabla.classList.remove('hidden');
        const elExcelDir = document.getElementById('excel_dir_rec');
        if (elExcelDir) elExcelDir.textContent = Math.round(azimutDeTiro).toString().padStart(4, '0');

        const elExcelMag = document.getElementById('excel_az_mag');
        if (elExcelMag) elExcelMag.textContent = aplicarVariacion ? Math.round(azimutDeTiro).toString().padStart(4, '0') : "---";

        const elExcelDiff = document.getElementById('excel_diff_deriva');
        if (elExcelDiff) {
            let valorAbs = Math.abs(Math.round(diffDerivaRaw)).toString().padStart(4, '0');
            elExcelDiff.textContent = (diffDerivaRaw < 0 ? "-" : "") + valorAbs;
        }

        const elExcelD = document.getElementById('excel_dist');
        if (elExcelD) elExcelD.textContent = Math.round(geo.dist);
    }

    if (cargaID === 'FUERA') {
        const elElev = document.getElementById('cmd_elev');
        if (elElev) elElev.textContent = "---";
        const elTime = document.getElementById('cmd_time');
        if (elTime) elTime.textContent = "---";
        return;
    }

    const datos = calcularBalistica(distanciaBalistica, tipoGranada, cargaID);

    // Angulo de Sitio
    let altPieza = parseFloat(document.getElementById('alt_pieza').value) || 0;
    let altObj = parseFloat(document.getElementById('alt_obj').value) || 0;
    const diffAlt = altObj - altPieza;
    const angSitRad = Math.atan(diffAlt / geo.dist);
    const angSitMils = (angSitRad * 6400) / (2 * Math.PI);

    let elevFinal = datos.elev - angSitMils;

    const elElev = document.getElementById('cmd_elev');
    if (elElev) elElev.textContent = isNaN(elevFinal) ? "---" : Math.round(elevFinal);

    const elTime = document.getElementById('cmd_time');
    if (elTime) elTime.textContent = datos.tiempo;

    const filas = document.querySelectorAll('.charge-row');
    filas.forEach(f => f.classList.remove('active'));
    for (let f of filas) {
        if (f.textContent.includes(`CARGA ${cargaID}`)) f.classList.add('active');
    }
}

function aplicarCorreccion() {
    const geo = obtenerGeometria();
    if (!geo) { alert("Defina coordenadas primero."); return; }

    let ox = parseFloat(document.getElementById('ox').value);
    let oy = parseFloat(document.getElementById('oy').value);
    if (isNaN(ox) || isNaN(oy)) { ox = geo.mx; oy = geo.my; }

    const metodo = document.getElementById('metodo_reglaje').value;
    let newTx, newTy, descripcionCorreccion = "", impactoX, impactoY;

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
        let moveAlc = (dirAlc === 'over') ? shiftAlcance : -shiftAlcance;
        let moveLat = (dirLat === 'right') ? shiftLateral : -shiftLateral;

        const shiftImpactoX = (moveAlc * Math.sin(azOTRad)) + (moveLat * Math.cos(azOTRad));
        const shiftImpactoY = (moveAlc * Math.cos(azOTRad)) - (moveLat * Math.sin(azOTRad));

        impactoX = geo.tx + shiftImpactoX;
        impactoY = geo.ty + shiftImpactoY;
        newTx = geo.tx - shiftImpactoX;
        newTy = geo.ty - shiftImpactoY;

        document.getElementById('corr_lat_val').value = "";
        document.getElementById('corr_metros').value = "";
    } else {
        const impAz = parseFloat(document.getElementById('impacto_az').value);
        const impDist = parseFloat(document.getElementById('impacto_dist').value);
        const impUnit = document.getElementById('impacto_az_unit').value;
        if (isNaN(impAz) || isNaN(impDist)) { alert("Faltan datos de impacto."); return; }

        const unitText = (impUnit === 'mils') ? 'mils' : '°';
        descripcionCorreccion = `Imp: AZ ${impAz}${unitText}, Dist ${impDist}m`;
        let impAzRad = (impUnit === 'mils') ? impAz * (2 * Math.PI / 6400) : impAz * (Math.PI / 180);

        impactoX = ox + (impDist * Math.sin(impAzRad));
        impactoY = oy + (impDist * Math.cos(impAzRad));
        newTx = geo.tx - (impactoX - geo.tx);
        newTy = geo.ty - (impactoY - geo.ty);

        document.getElementById('impacto_az').value = "";
        document.getElementById('impacto_dist').value = "";
    }

    historialImpactos.push({ x: impactoX, y: impactoY, id: contadorReglajes + 1 });
    document.getElementById('tx').value = newTx.toFixed(0);
    document.getElementById('ty').value = newTy.toFixed(0);
    calcularYDibujar();
    agregarAlHistorial(descripcionCorreccion);
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

    // Retícula
    ctx.strokeStyle = '#004400'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.2, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.4, 0, 2 * Math.PI); ctx.stroke();

    if (isNaN(mx) || isNaN(tx)) return;

    let maxDist = Math.sqrt(Math.pow(tx - mx, 2) + Math.pow(ty - my, 2));
    historialImpactos.forEach(pt => {
        let d = Math.sqrt(Math.pow(pt.x - mx, 2) + Math.pow(pt.y - my, 2));
        if (d > maxDist) maxDist = d;
    });

    const rangeLimit = Math.max(6000, maxDist * 1.2);
    const scale = (w / 2) / rangeLimit;
    function plot(x, y) { return { x: cx + (x - mx) * scale, y: cy - (y - my) * scale }; }

    const tPos = plot(tx, ty);
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)'; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tPos.x, tPos.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#00ff41'; ctx.fillText('M', cx + 5, cy - 5); ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 2 * Math.PI); ctx.fill();

    historialImpactos.forEach(imp => {
        const iPos = plot(imp.x, imp.y);
        ctx.fillStyle = '#ffaa00'; ctx.fillText(imp.id, iPos.x + 4, iPos.y - 4);
        ctx.beginPath(); ctx.arc(iPos.x, iPos.y, 2, 0, 2 * Math.PI); ctx.fill();
    });

    ctx.fillStyle = 'red'; ctx.fillText('T', tPos.x + 6, tPos.y - 6);
    ctx.strokeStyle = 'red'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tPos.x - 4, tPos.y - 4); ctx.lineTo(tPos.x + 4, tPos.y + 4); ctx.moveTo(tPos.x + 4, tPos.y - 4); ctx.lineTo(tPos.x - 4, tPos.y + 4); ctx.stroke();

    if (!isNaN(ox) && !isNaN(oy)) {
        const oPos = plot(ox, oy);
        ctx.fillStyle = 'cyan'; ctx.fillText('Obs', oPos.x + 5, oPos.y - 5);
        ctx.fillStyle = 'cyan'; ctx.fillRect(oPos.x - 2, oPos.y - 2, 4, 4);
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

if (typeof proj4 !== 'undefined') {
    proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");
}