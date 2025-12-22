if (typeof proj4 !== 'undefined') {
    proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");
}

/* * Función Principal: calcularBalistica
 * Calcula la solución de tiro (Elevación, Tiempo, Factores) para una distancia dada.
 * Realiza interpolación lineal entre los datos de la tabla de tiro.
 */
function calcularBalistica(distancia, tipoID, cargaForzada = null) {
    const BD = ARSENAL[tipoID];
    
    if (!BD) return { status: "ERROR", carga: "NO DB", elev: 0, tiempo: "-" };

    let cargaElegida = -1;
    const rangos = BD.rangos;

    // 1. Lógica de Selección de Carga
    if (cargaForzada !== null && cargaForzada !== undefined && cargaForzada !== "-") {
        cargaElegida = cargaForzada;
    } 
    else {
        // Selección Automática (Busca la más segura)
        let mejorCarga = -1;
        let mejorBuffer = -1;

        for (const c in rangos) {
            const min = rangos[c].min;
            const max = rangos[c].max;

            if (distancia >= min && distancia <= max) {
                const buffer = max - distancia; 
                
                if (mejorCarga === -1) {
                    mejorCarga = c;
                    mejorBuffer = buffer;
                } else {
                    if (mejorBuffer < 100 && buffer > mejorBuffer) {
                        mejorCarga = c;
                        mejorBuffer = buffer;
                    }
                }
            }
        }
        cargaElegida = mejorCarga;
    }

    if (cargaElegida === -1) return { status: "ERROR", carga: "FUERA", elev: 0, tiempo: "-" };

    // 2. Obtención de datos de la tabla
    const datosCarga = BD.cargas[cargaElegida];
    let tablaCarga = [];
    let factores = { v_traves: 0, v_cola: 0, t_aire: 0, peso: 0 }; 

    if (Array.isArray(datosCarga)) {
        tablaCarga = datosCarga;
    } else {
        tablaCarga = datosCarga.tabla;
        if (datosCarga.factores) { 
            factores = datosCarga.factores;
        } else if (datosCarga.factores_genericos) {
            factores = datosCarga.factores_genericos;
        }
    }

    if (!tablaCarga || tablaCarga.length === 0) return { status: "ERROR", carga: cargaElegida, elev: 0, tiempo: "NO DATA" };

    // 3. Interpolación Lineal (Matemática)
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
        
        // Cálculo Elevación
        const elev = fila1.elev + factor * (fila2.elev - fila1.elev);
        
        // Cálculo Tiempo
        const t1 = fila1.t || 0;
        const t2 = fila2.t || 0;
        const t = t1 + factor * (t2 - t1);

        // Obtención Factores (Prioridad Específico > Genérico)
        const f_vtraves = (fila1.v_traves !== undefined) ? fila1.v_traves : factores.v_traves;
        const f_vcola = (fila1.v_cola !== undefined) ? fila1.v_cola : factores.v_cola;
        const f_temp = factores.t_aire || 0;
        const f_peso = factores.peso || 0;

        return { 
            status: "OK", 
            carga: cargaElegida, 
            elev: elev, 
            tiempo: t > 0 ? t.toFixed(1) : "--",
            factores: { 
                v_traves: f_vtraves, 
                v_cola: f_vcola, 
                t_aire: f_temp, 
                peso: f_peso 
            }
        };
    }

    return { status: "ERROR", carga: cargaElegida, elev: 0, tiempo: "ERR INT" };
}