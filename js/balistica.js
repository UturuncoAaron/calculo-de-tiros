if (typeof proj4 !== 'undefined') {
    proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");
}

function calcularBalistica(distancia, tipoID) {
    const BD = ARSENAL[tipoID];
    if (!BD) return { status: "ERROR", carga: "NO DB", elev: 0, tiempo: "-" };

    let cargaElegida = -1;
    const rangos = BD.rangos;

    for (const c in rangos) {
        if (distancia >= rangos[c].min && distancia <= rangos[c].max) {
            cargaElegida = c;
            break; 
        }
    }

    if (cargaElegida === -1) return { status: "ERROR", carga: "FUERA", elev: 0, tiempo: "-" };

    const tablaCarga = BD.cargas[cargaElegida];
    if (!tablaCarga || tablaCarga.length === 0) return { status: "ERROR", carga: cargaElegida, elev: 0, tiempo: "NO DATA" };

    let fila1 = null, fila2 = null;
    for (let i = 0; i < tablaCarga.length - 1; i++) {
        if (distancia >= tablaCarga[i].m && distancia <= tablaCarga[i+1].m) {
            fila1 = tablaCarga[i];
            fila2 = tablaCarga[i+1];
            break;
        }
    }

    if (fila1 && fila2) {
        const factor = (distancia - fila1.m) / (fila2.m - fila1.m);
        const elev = fila1.elev + factor * (fila2.elev - fila1.elev);
        const t = fila1.t + factor * (fila2.t - fila1.t);
        return { status: "OK", carga: cargaElegida, elev: elev, tiempo: t.toFixed(1) };
    }

    return { status: "ERROR", carga: cargaElegida, elev: 0, tiempo: "ERR INT" };
}

function calcularVectorCorreccion(distanciaObsTarget, milsLateral, metrosAlcance, dirLat, dirAlc) {
    const desviacionMetros = (distanciaObsTarget * milsLateral) / 1000;
    
    let moveLat = (dirLat === 'right') ? -desviacionMetros : desviacionMetros; 
    let moveAlc = (dirAlc === 'over') ? -metrosAlcance : metrosAlcance; 

    return { lat: moveLat, alc: moveAlc };
}

function dmsToDecimal(idPrefix) {
    const d = parseFloat(document.getElementById(idPrefix+'_d').value) || 0;
    const m = parseFloat(document.getElementById(idPrefix+'_m').value) || 0;
    const s = parseFloat(document.getElementById(idPrefix+'_s').value) || 0; // Opcional si borraste input s
    return -1 * (d + m/60 + s/3600);
}

function fillDMS(idPrefix, val) {
    val = Math.abs(val);
    const d = Math.floor(val);
    const rem = (val - d) * 60;
    const m = Math.floor(rem);
    document.getElementById(idPrefix+'_d').value = d;
    document.getElementById(idPrefix+'_m').value = m;
}