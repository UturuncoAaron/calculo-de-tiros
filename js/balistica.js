/**
 * Calcula la solución de tiro, interpolando datos y aplicando correcciones meteorológicas si el interruptor está activo.
 */
function calcularBalistica(distancia, tipoID, cargaForzada = null) {
    const BD = ARSENAL[tipoID];
    if (!BD) return { status: "ERROR", carga: "NO DB", elev: 0, tiempo: "-" };

    let cargaElegida = -1;
    if (cargaForzada && cargaForzada !== "-" && BD.cargas[cargaForzada]) {
        cargaElegida = cargaForzada;
    } else {
        let mejorBuffer = -1;
        for (const c in BD.rangos) {
            const min = BD.rangos[c].min;
            const max = BD.rangos[c].max;
            if (distancia >= min && distancia <= max) {
                const buffer = max - distancia;
                if (cargaElegida === -1 || (mejorBuffer < 200 && buffer > mejorBuffer)) {
                    cargaElegida = c;
                    mejorBuffer = buffer;
                }
            }
        }
    }

    if (cargaElegida === -1) return { status: "ERROR", carga: "FUERA", elev: 0, tiempo: "--" };

    const tabla = BD.cargas[cargaElegida];

    function interpolarFila(distObj) {
        let f1 = tabla[0], f2 = tabla[tabla.length - 1];
        for (let i = 0; i < tabla.length - 1; i++) {
            if (distObj >= tabla[i][0] && distObj <= tabla[i + 1][0]) {
                f1 = tabla[i];
                f2 = tabla[i + 1];
                break;
            }
        }
        const rango = f2[0] - f1[0];
        const factor = (rango === 0) ? 0 : (distObj - f1[0]) / rango;
        return f1.map((val, idx) => val + (f2[idx] - val) * factor);
    }

    const datosBase = interpolarFila(distancia);

    let tiempoBase = datosBase[2];
    let f_vTrav = datosBase[3];
    let f_vCola = datosBase[4];
    let f_Vi = datosBase[5];
    let f_Temp = datosBase[6];
    let f_Peso = datosBase[7];
    let f_Pres = datosBase[8];

    const switchLibre = !document.getElementById('check_bloqueo')?.checked;

    let vientoVel, vientoDir, tempAire, presion, difPeso, difVel;

    if (switchLibre) {
        vientoVel = parseFloat(document.getElementById('meteo_vel').value) || 0;
        vientoDir = parseFloat(document.getElementById('meteo_dir').value) || 0;
        tempAire = parseFloat(document.getElementById('meteo_temp').value) || 15;
        presion = parseFloat(document.getElementById('meteo_pres')?.value) || 750;
        difPeso = parseFloat(document.getElementById('dif_peso')?.value) || 0;
        difVel = parseFloat(document.getElementById('dif_vel')?.value) || 0;
    } else {
        vientoVel = 0;
        vientoDir = 0;
        tempAire = 15;
        presion = 750;
        difPeso = 0;
        difVel = 0;
    }

    const azimutTiroMils = parseFloat(document.getElementById('resAzimutMils').textContent) || 0;
    const azTiroGrados = azimutTiroMils * (360 / 6400);
    const anguloRelativo = (vientoDir - azTiroGrados) * (Math.PI / 180);

    const vColaComp = vientoVel * Math.cos(anguloRelativo);
    const vTravComp = vientoVel * Math.sin(anguloRelativo);

    let err_Viento = vColaComp * f_vCola;
    let err_Temp = (tempAire - 15) * f_Temp;
    let err_Pres = (750 - presion) * f_Pres;
    let err_Vi = difVel * f_Vi;
    let err_Peso = difPeso * f_Peso;

    let totalErrorAlcance = err_Viento + err_Temp + err_Pres + err_Vi + err_Peso;
    let distanciaFicticia = distancia - totalErrorAlcance;

    const datosFinales = interpolarFila(distanciaFicticia);
    let elevFinal = datosFinales[1];
    let corrDerivaMils = vTravComp * f_vTrav;

    return {
        status: "OK",
        carga: cargaElegida,
        elev: elevFinal,
        tiempo: tiempoBase.toFixed(1),
        corrDeriva: corrDerivaMils
    };
}