document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnCalcularObs').addEventListener('click', calcularCoordenadasDesdeObs);
    document.getElementById('btnFuego').addEventListener('click', calcularSolucionDeTiro);
});

function calcularCoordenadasDesdeObs() {
    const ox = parseFloat(document.getElementById('ox').value);
    const oy = parseFloat(document.getElementById('oy').value);
    const dist = parseFloat(document.getElementById('distObs').value);
    const az = parseFloat(document.getElementById('azObs').value);

    if (isNaN(ox) || isNaN(oy) || isNaN(dist) || isNaN(az)) {
        alert("Faltan datos del observador.");
        return;
    }

    const azRad = az * (Math.PI / 180);
    const tx = ox + (dist * Math.sin(azRad));
    const ty = oy + (dist * Math.cos(azRad));

    document.getElementById('tx').value = tx.toFixed(1);
    document.getElementById('ty').value = ty.toFixed(1);
}

function calcularSolucionDeTiro() {
    const mx = parseFloat(document.getElementById('mx').value);
    const my = parseFloat(document.getElementById('my').value);
    const tx = parseFloat(document.getElementById('tx').value);
    const ty = parseFloat(document.getElementById('ty').value);

    if (isNaN(mx) || isNaN(my) || isNaN(tx) || isNaN(ty)) {
        alert("Faltan las coordenadas del Mortero o del Objetivo.");
        return;
    }

    const deltaX = tx - mx;
    const deltaY = ty - my;
    const distancia = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY));

    const azRad = Math.atan2(deltaX, deltaY);
    let azGrados = azRad * (180 / Math.PI);

    if (azGrados < 0) {
        azGrados += 360;
    }

    document.getElementById('resAzimut').textContent = azGrados.toFixed(1);
    document.getElementById('resDist').textContent = Math.round(distancia);
    document.getElementById('resultado').classList.remove('hidden');

    const ox = parseFloat(document.getElementById('ox').value);
    const oy = parseFloat(document.getElementById('oy').value);

    dibujarRadar(mx, my, tx, ty, ox, oy);
}

function dibujarRadar(mx, my, tx, ty, ox, oy) {
    const canvas = document.getElementById('radarCanvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#003300';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 0); ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
    ctx.stroke();

    const deltaTx = tx - mx;
    const deltaTy = ty - my;
    const distTarget = Math.sqrt(deltaTx * deltaTx + deltaTy * deltaTy);

    let maxDist = distTarget;
    if (!isNaN(ox)) {
        const deltaOx = ox - mx;
        const deltaOy = oy - my;
        const distObs = Math.sqrt(deltaOx * deltaOx + deltaOy * deltaOy);
        maxDist = Math.max(distTarget, distObs);
    }

    const escala = (width / 2 * 0.8) / (maxDist || 1);

    const getX = (realX) => centerX + (realX - mx) * escala;
    const getY = (realY) => centerY - (realY - my) * escala;

    ctx.fillStyle = '#00ff41';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 5);
    ctx.lineTo(centerX - 5, centerY + 5);
    ctx.lineTo(centerX + 5, centerY + 5);
    ctx.fill();
    ctx.fillText("M", centerX + 8, centerY + 12);

    const canvasTx = getX(tx);
    const canvasTy = getY(ty);

    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvasTx - 5, canvasTy - 5); ctx.lineTo(canvasTx + 5, canvasTy + 5);
    ctx.moveTo(canvasTx + 5, canvasTy - 5); ctx.lineTo(canvasTx - 5, canvasTy + 5);
    ctx.stroke();
    ctx.fillStyle = '#ff3333';
    ctx.fillText("T", canvasTx + 8, canvasTy);

    ctx.strokeStyle = 'rgba(0, 255, 65, 0.4)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(canvasTx, canvasTy);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!isNaN(ox) && !isNaN(oy)) {
        const canvasOx = getX(ox);
        const canvasOy = getY(oy);

        ctx.fillStyle = '#aaaaff';
        ctx.beginPath();
        ctx.arc(canvasOx, canvasOy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText("Obs", canvasOx + 8, canvasOy);

        ctx.strokeStyle = 'rgba(100, 100, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(canvasOx, canvasOy);
        ctx.lineTo(canvasTx, canvasTy);
        ctx.stroke();
    }
}