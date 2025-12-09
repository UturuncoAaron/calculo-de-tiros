proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");
let map;
let layerGroup;
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    const selector = document.getElementById('inputMode');
    selector.addEventListener('change', toggleInputs);
    document.getElementById('btnFuego').addEventListener('click', calcularYDibujar);
    document.getElementById('btnCalcularObs').addEventListener('click', calcularTargetDesdeObservador);
});

function initMap() {
    map = L.map('map').setView([-12.046, -77.042], 13);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy;OpenStreetMap',
        subdomains: 'abcd'
    }).addTo(map);

    layerGroup = L.layerGroup().addTo(map);
}

function toggleInputs() {
    const mode = document.getElementById('inputMode').value;
    const ids = ['mortero', 'target', 'obs'];

    ids.forEach(id => {
        if (mode === 'utm') {
            document.getElementById(`${id}-utm`).classList.remove('hidden');
            document.getElementById(`${id}-dms`).classList.add('hidden');
        } else {
            document.getElementById(`${id}-utm`).classList.add('hidden');
            document.getElementById(`${id}-dms`).classList.remove('hidden');
        }
    });
}
function calcularTargetDesdeObservador() {
    const mode = document.getElementById('inputMode').value;
    const dist = parseFloat(document.getElementById('distObs').value);
    const az = parseFloat(document.getElementById('azObs').value);

    if (isNaN(dist) || isNaN(az)) {
        alert("Ingresa distancia y azimut del observador."); return;
    }

    let obsX, obsY;
    if (mode === 'utm') {
        obsX = parseFloat(document.getElementById('ox').value);
        obsY = parseFloat(document.getElementById('oy').value);
    } else {
        const lat = dmsToDecimal('olat');
        const lon = dmsToDecimal('olon');
        if (isNaN(lat) || isNaN(lon)) { alert("Revisa coordenadas del observador"); return; }

        const utm = proj4("EPSG:4326", "EPSG:32718", [lon, lat]);
        obsX = utm[0];
        obsY = utm[1];
    }

    if (isNaN(obsX) || isNaN(obsY)) { alert("Faltan coordenadas del observador"); return; }
    const azRad = az * (Math.PI / 180);
    const targetX = obsX + (dist * Math.sin(azRad));
    const targetY = obsY + (dist * Math.cos(azRad));
    document.getElementById('tx').value = targetX.toFixed(0);
    document.getElementById('ty').value = targetY.toFixed(0);
    if (mode === 'dms') {
        const geo = proj4("EPSG:32718", "EPSG:4326", [targetX, targetY]);
        const latDMS = decimalToDms(geo[1]);
        const lonDMS = decimalToDms(geo[0]);

        // Llenar inputs DMS del Objetivo
        document.getElementById('tlat_d').value = latDMS.d;
        document.getElementById('tlat_m').value = latDMS.m;
        document.getElementById('tlat_s').value = latDMS.s;

        document.getElementById('tlon_d').value = lonDMS.d;
        document.getElementById('tlon_m').value = lonDMS.m;
        document.getElementById('tlon_s').value = lonDMS.s;
    }

    alert("¡Objetivo Localizado! Coordenadas actualizadas.");
}
function calcularYDibujar() {
    const mode = document.getElementById('inputMode').value;
    let mx, my, tx, ty;
    let mLat, mLon, tLat, tLon;

    // Obtener Coordenadas en UTM
    if (mode === 'dms') {
        const mLatDec = dmsToDecimal('mlat');
        const mLonDec = dmsToDecimal('mlon');
        const tLatDec = dmsToDecimal('tlat');
        const tLonDec = dmsToDecimal('tlon');

        if (isNaN(mLatDec) || isNaN(mLonDec) || isNaN(tLatDec) || isNaN(tLonDec)) {
            alert("Faltan datos DMS"); return;
        }
        mLat = mLatDec; mLon = mLonDec;
        tLat = tLatDec; tLon = tLonDec;

        const mUTM = proj4("EPSG:4326", "EPSG:32718", [mLon, mLat]);
        const tUTM = proj4("EPSG:4326", "EPSG:32718", [tLon, tLat]);

        mx = mUTM[0]; my = mUTM[1];
        tx = tUTM[0]; ty = tUTM[1];

        document.getElementById('conversionInfo').innerHTML =
            `UTM CALCULADO:<br>M: ${mx.toFixed(0)} / ${my.toFixed(0)} <br> T: ${tx.toFixed(0)} / ${ty.toFixed(0)}`;
    } else {
        mx = parseFloat(document.getElementById('mx').value);
        my = parseFloat(document.getElementById('my').value);
        tx = parseFloat(document.getElementById('tx').value);
        ty = parseFloat(document.getElementById('ty').value);

        if (isNaN(mx) || isNaN(my) || isNaN(tx) || isNaN(ty)) {
            alert("Faltan coordenadas UTM"); return;
        }
        const mGeo = proj4("EPSG:32718", "EPSG:4326", [mx, my]);
        const tGeo = proj4("EPSG:32718", "EPSG:4326", [tx, ty]);
        mLon = mGeo[0]; mLat = mGeo[1];
        tLon = tGeo[0]; tLat = tGeo[1];

        document.getElementById('conversionInfo').innerHTML = "";
    }

    // CÁLCULOS
    const deltaX = tx - mx;
    const deltaY = ty - my;
    const distancia = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    let azRad = Math.atan2(deltaX, deltaY);
    let azGrados = azRad * (180 / Math.PI);
    if (azGrados < 0) azGrados += 360;

    document.getElementById('resAzimut').textContent = azGrados.toFixed(1);
    document.getElementById('resDist').textContent = Math.round(distancia);
    document.getElementById('resultado').classList.remove('hidden');

    layerGroup.clearLayers();

    const iconM = L.divIcon({ className: '', html: '<div style="background:#0f0; width:12px; height:12px; border:2px solid #fff; border-radius:50%;"></div>' });
    const iconT = L.divIcon({ className: '', html: '<div style="background:#f00; width:12px; height:12px; border:2px solid #fff; transform:rotate(45deg);"></div>' });

    L.marker([mLat, mLon], { icon: iconM }).addTo(layerGroup).bindPopup("MORTERO").openPopup();
    L.marker([tLat, tLon], { icon: iconT }).addTo(layerGroup).bindPopup("OBJETIVO");

    L.polyline([[mLat, mLon], [tLat, tLon]], { color: 'red', weight: 2, dashArray: '5, 5' }).addTo(layerGroup);

    map.fitBounds([[mLat, mLon], [tLat, tLon]], { padding: [50, 50] });
}

function dmsToDecimal(prefix) {
    const d = parseFloat(document.getElementById(`${prefix}_d`).value) || 0;
    const m = parseFloat(document.getElementById(`${prefix}_m`).value) || 0;
    const s = parseFloat(document.getElementById(`${prefix}_s`).value) || 0;
    return -1 * (d + m / 60 + s / 3600);
}

function decimalToDms(deg) {
    deg = Math.abs(deg); 
    const d = Math.floor(deg);
    const minFloat = (deg - d) * 60;
    const m = Math.floor(minFloat);
    const s = Math.round((minFloat - m) * 60);
    return { d, m, s };
}