if (typeof proj4 !== 'undefined') {
    proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");
}

function calcularBalistica(distancia, tipoID, cargaForzada = null) {
    const BD = ARSENAL[tipoID];

    // 1. Verificación básica: ¿Existe el arma?
    if (!BD) return { status: "ERROR", carga: "NO DB", elev: 0, tiempo: "-" };

    let cargaElegida = -1;
    const rangos = BD.rangos;

    // 2. LÓGICA DE SELECCIÓN DE CARGA

    // A) SELECCIÓN MANUAL (Lo que dice tu papá manda)
    // Si se pasa un valor válido en cargaForzada, usamos esa sin preguntar.
    if (cargaForzada !== null && cargaForzada !== undefined && cargaForzada !== "-") {
        // (Opcional) Podríamos verificar si la distancia entra en el rango, 
        // pero en combate a veces se fuerza, así que permitimos el cálculo.
        cargaElegida = cargaForzada;
    }
    // B) SELECCIÓN AUTOMÁTICA INTELIGENTE (Tu lógica)
    else {
        let mejorCarga = -1;
        let mejorBuffer = -1; // "Colchón" de seguridad (metros restantes antes del límite)

        for (const c in rangos) {
            const min = rangos[c].min;
            const max = rangos[c].max;

            // ¿La distancia entra en esta carga?
            if (distancia >= min && distancia <= max) {
                const buffer = max - distancia; // Cuántos metros me sobran antes de llegar al límite (Elev 800)

                // Si es la primera que encontramos, la guardamos.
                if (mejorCarga === -1) {
                    mejorCarga = c;
                    mejorBuffer = buffer;
                } else {
                    // Si ya tenemos una candidata, pero esta nueva tiene mejor "colchón"
                    // y la anterior estaba muy justa (menos de 100m de margen), cambiamos.
                    if (mejorBuffer < 100 && buffer > mejorBuffer) {
                        mejorCarga = c;
                        mejorBuffer = buffer;
                    }
                }
            }
        }
        cargaElegida = mejorCarga;
    }

    // Si después de todo no hay carga válida (estamos fuera de rango de todas)
    if (cargaElegida === -1) return { status: "ERROR", carga: "FUERA", elev: 0, tiempo: "-" };

    // 3. OBTENCIÓN DE DATOS DE LA TABLA
    const datosCarga = BD.cargas[cargaElegida];

    // Manejo de compatibilidad (Tabla Antigua vs Tabla Nueva Resumida)
    let tablaCarga = [];
    let factores = { v_traves: 0, v_cola: 0, t_aire: 0, peso: 0 };

    if (Array.isArray(datosCarga)) {
        // Formato Array directo (Antiguo)
        tablaCarga = datosCarga;
    } else {
        // Formato Objeto con Factores (Nuevo - Híbrido)
        tablaCarga = datosCarga.tabla;
        if (datosCarga.factores) {
            factores = datosCarga.factores;
        } else if (datosCarga.factores_genericos) {
            factores = datosCarga.factores_genericos;
        }
    }

    if (!tablaCarga || tablaCarga.length === 0) return { status: "ERROR", carga: cargaElegida, elev: 0, tiempo: "NO DATA" };

    // 4. CÁLCULO MATEMÁTICO (REGLA DE 3 / INTERPOLACIÓN)
    let fila1 = null, fila2 = null;

    // Buscamos los dos valores entre los que está nuestra distancia
    for (let i = 0; i < tablaCarga.length - 1; i++) {
        if (distancia >= tablaCarga[i].m && distancia <= tablaCarga[i + 1].m) {
            fila1 = tablaCarga[i];
            fila2 = tablaCarga[i + 1];
            break;
        }
    }

    if (fila1 && fila2) {
        // Factor de interpolación (0.0 a 1.0)
        // Ejemplo: Si dist=2250, entre 2200 y 2300, factor = 0.5
        const factor = (distancia - fila1.m) / (fila2.m - fila1.m);

        // Calculamos Elevación exacta
        const elev = fila1.elev + factor * (fila2.elev - fila1.elev);

        // Calculamos Tiempo (si existe, si no 0)
        const t1 = fila1.t || 0;
        const t2 = fila2.t || 0;
        const t = t1 + factor * (t2 - t1);

        // 5. GESTIÓN DE FACTORES DE CORRECCIÓN (PRIORIDAD ESPECÍFICA VS GENÉRICA)
        // Si la fila tiene dato específico (W87 detallada), úsalo. Si no, usa el genérico (Resumida).
        const f_vtraves = (fila1.v_traves !== undefined) ? fila1.v_traves : factores.v_traves;
        const f_vcola = (fila1.v_cola !== undefined) ? fila1.v_cola : factores.v_cola;

        // Factores extra meteorológicos
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