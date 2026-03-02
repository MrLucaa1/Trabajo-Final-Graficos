var gl;
var carProgram, groundProgram, rainProgram;
var cubeModel, wheelModel, groundModel, rainModel;

// Estado del juego
var carPos = [0, 0, 0];
var carSpeed = 0.0;
var maxSpeed = 0.3; // 0.3 * 166 ≈ 50 km/h
var acceleration = 0.003;
var friction = 0.0015;
var fogActive = 0;
var rainActive = 0;
var rainFactor = 0.0;

// Teclas
var keys = { w: false, a: false, s: false, d: false };

// Cámara
var camera = { dist: 7.5, yaw: Math.PI, pitch: 0.3 };
var drag = false, lastX = 0, lastY = 0;

// Edificios
var buildings = [];

function generateBuildings() {
    buildings = [];
    const CITY_LENGTH = -15000;
    const ROAD_MARGIN = 4.0; // Carretera es ±3.0, margen de seguridad

    for (let z = 100; z > CITY_LENGTH; z -= 15) {
        for (let row = 0; row < 3; row++) {
            let side = (Math.random() > 0.5) ? 1 : -1;

            let height = 5 + Math.random() * 60;
            let width = 6 + Math.random() * 12;
            let depth = 6 + Math.random() * 12;

            // Garantizar que el borde del edificio esté fuera de la carretera (Ancho ±3.0)
            let minX = 3.0 + (width / 2) + 0.5; // Carretera + medio edificio + margen
            let xPos = (minX + Math.random() * 25) * side;

            let color = [Math.random() * 0.3, 0.05, 0.5 + Math.random() * 0.5];
            if (Math.random() > 0.5) color = [0.5 + Math.random() * 0.5, 0.05, Math.random() * 0.3];

            buildings.push({
                pos: [xPos, height / 2, z + Math.random() * 15],
                scale: [width, height, depth],
                color: color
            });

            if (Math.random() > 0.7) {
                buildings.push({
                    pos: [xPos, height + 4, z + Math.random() * 10],
                    scale: [width * 0.6, 8, depth * 0.6],
                    color: [color[0] * 1.4, color[1] * 1.4, color[2] * 1.4]
                });
            }
        }
    }
}

function createRain(count = 2000) {
    let vertices = [];
    for (let i = 0; i < count; i++) {
        let x = (Math.random() - 0.5) * 60;
        let y = Math.random() * 20;
        let z = (Math.random() - 0.5) * 60;
        // Línea corta para la gota
        vertices.push(x, y, z);
        vertices.push(x, y + 0.5, z);
    }
    let vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    return { vbo: vbo, count: count * 2 };
}

function createCube() {
    let s = 0.5;
    let vertices = [
        -s, -s, s, 0, 0, 1, s, -s, s, 0, 0, 1, s, s, s, 0, 0, 1, -s, s, s, 0, 0, 1,
        -s, -s, -s, 0, 0, -1, -s, s, -s, 0, 0, -1, s, s, -s, 0, 0, -1, s, -s, -s, 0, 0, -1,
        -s, s, -s, 0, 1, 0, -s, s, s, 0, 1, 0, s, s, s, 0, 1, 0, s, s, -s, 0, 1, 0,
        -s, -s, -s, 0, -1, 0, s, -s, -s, 0, -1, 0, s, -s, s, 0, -1, 0, -s, -s, s, 0, -1, 0,
        s, -s, -s, 1, 0, 0, s, s, -s, 1, 0, 0, s, s, s, 1, 0, 0, s, -s, s, 1, 0, 0,
        -s, -s, -s, -1, 0, 0, -s, -s, s, -1, 0, 0, -s, s, s, -1, 0, 0, -s, s, -s, -1, 0, 0
    ];
    let indices = [];
    for (let i = 0; i < 24; i += 4) indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return { vertices, indices };
}

function createCylinder(n = 24) {
    let vertices = []; let indices = [];
    let r = 1.0, h = 1.0;
    for (let i = 0; i <= n; i++) {
        let a = i / n * Math.PI * 2;
        let c = Math.cos(a), s = Math.sin(a);
        vertices.push(c * r, -h / 2, s * r, c, 0, s);
        vertices.push(c * r, h / 2, s * r, c, 0, s);
    }
    for (let i = 0; i < n; i++) {
        let b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    return { vertices, indices };
}

function createGround() {
    let size = 200.0;
    let vertices = [
        -size, 0, -size, 0, 1, 0,
        size, 0, -size, 0, 1, 0,
        size, 0, size, 0, 1, 0,
        -size, 0, size, 0, 1, 0
    ];
    let indices = [0, 1, 2, 0, 2, 3];
    return { vertices, indices };
}

function initBuffers(model) {
    model.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, model.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(model.vertices), gl.STATIC_DRAW);
    if (model.indices) {
        model.ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(model.indices), gl.STATIC_DRAW);
    }
}

function compileShader(id, type) {
    let el = document.getElementById(id);
    if (!el) return null;
    let str = el.textContent;
    let s = gl.createShader(type);
    gl.shaderSource(s, str);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
}

function createProgram(vId, fId) {
    let p = gl.createProgram();
    gl.attachShader(p, compileShader(vId, gl.VERTEX_SHADER));
    gl.attachShader(p, compileShader(fId, gl.FRAGMENT_SHADER));
    gl.linkProgram(p);
    return p;
}

function checkCollision(pos) {
    let carHalfW = 0.65, carHalfL = 1.05;
    for (let b of buildings) {
        let bHalfW = b.scale[0] / 2, bHalfL = b.scale[2] / 2;
        if (Math.abs(pos[0] - b.pos[0]) < carHalfW + bHalfW && Math.abs(pos[2] - b.pos[2]) < carHalfL + bHalfL) return true;
    }
    return false;
}

function init() {
    let canvas = document.getElementById("myCanvas");
    gl = canvas.getContext("webgl2");
    if (!gl) return;

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.01, 0.01, 0.03, 1.0);

    carProgram = createProgram("carVertexShader", "carFragmentShader");
    groundProgram = createProgram("groundVertexShader", "groundFragmentShader");
    rainProgram = createProgram("rainVertexShader", "rainFragmentShader");

    carProgram.uModel = gl.getUniformLocation(carProgram, "modelMatrix");
    carProgram.uView = gl.getUniformLocation(carProgram, "viewMatrix");
    carProgram.uProj = gl.getUniformLocation(carProgram, "projectionMatrix");
    carProgram.uNorm = gl.getUniformLocation(carProgram, "normalMatrix");
    carProgram.uColor = gl.getUniformLocation(carProgram, "carColor");
    carProgram.uFogActive = gl.getUniformLocation(carProgram, "uFogActive");
    carProgram.uTime = gl.getUniformLocation(carProgram, "time");
    carProgram.uIsBuilding = gl.getUniformLocation(carProgram, "isBuilding");

    groundProgram.uMV = gl.getUniformLocation(groundProgram, "modelViewMatrix");
    groundProgram.uProj = gl.getUniformLocation(groundProgram, "projectionMatrix");
    groundProgram.uWorldZ = gl.getUniformLocation(groundProgram, "worldZ");
    groundProgram.uTime = gl.getUniformLocation(groundProgram, "time");
    groundProgram.uFogActive = gl.getUniformLocation(groundProgram, "uFogActive");

    rainProgram.uView = gl.getUniformLocation(rainProgram, "viewMatrix");
    rainProgram.uProj = gl.getUniformLocation(rainProgram, "projectionMatrix");
    rainProgram.uOffset = gl.getUniformLocation(rainProgram, "rainOffset");
    rainProgram.uCarZ = gl.getUniformLocation(rainProgram, "carZ");

    cubeModel = createCube(); initBuffers(cubeModel);
    wheelModel = createCylinder(); initBuffers(wheelModel);
    groundModel = createGround(); initBuffers(groundModel);
    rainModel = createRain();
    generateBuildings();

    window.onkeydown = e => {
        if (e.key.toLowerCase() === 'w') keys.w = true;
        if (e.key.toLowerCase() === 's') keys.s = true;
        if (e.key.toLowerCase() === 'a') keys.a = true;
        if (e.key.toLowerCase() === 'd') keys.d = true;
        if (e.key.toLowerCase() === 'r') fogActive = 1 - fogActive;
        if (e.key.toLowerCase() === 'l') rainActive = 1 - rainActive;
    };
    window.onkeyup = e => {
        if (e.key.toLowerCase() === 'w') keys.w = false;
        if (e.key.toLowerCase() === 's') keys.s = false;
        if (e.key.toLowerCase() === 'a') keys.a = false;
        if (e.key.toLowerCase() === 'd') keys.d = false;
    };

    canvas.onpointerdown = e => { drag = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointerup = e => drag = false;
    canvas.onpointermove = e => {
        if (!drag) return;
        camera.yaw += (e.clientX - lastX) * 0.005;
        camera.pitch = Math.max(0.1, Math.min(1.4, camera.pitch + (e.clientY - lastY) * 0.005));
        lastX = e.clientX; lastY = e.clientY;
    };
    window.onresize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.onresize();
    requestAnimationFrame(render);
}

function drawModel(model, isCar = true) {
    gl.bindBuffer(gl.ARRAY_BUFFER, model.vbo);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(0);
    if (isCar) {
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        gl.enableVertexAttribArray(1);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.ibo);
    gl.drawElements(gl.TRIANGLES, model.indices.length, gl.UNSIGNED_SHORT, 0);
}

function render(time) {
    let dt = time * 0.001;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (keys.w) carSpeed = Math.min(maxSpeed, carSpeed + acceleration);
    else if (keys.s) carSpeed = Math.max(-maxSpeed / 2, carSpeed - acceleration);
    else carSpeed *= 0.985;

    // Movimiento lateral limitado a la carretera
    let steerSpeed = 0.06;
    let nextX = carPos[0];
    if (keys.a) nextX -= steerSpeed;
    if (keys.d) nextX += steerSpeed;

    // Límite de la carretera (Ancho 3.0 - media anchura coche 0.65)
    nextX = Math.max(-2.35, Math.min(2.35, nextX));

    let newPos = [nextX, carPos[1], carPos[2] - carSpeed];
    if (!checkCollision(newPos)) carPos = newPos; else carSpeed = 0;

    document.getElementById("speed-value").innerText = Math.round(Math.abs(carSpeed) * 166);

    let eye = [carPos[0] + camera.dist * Math.cos(camera.pitch) * Math.sin(camera.yaw), carPos[1] + camera.dist * Math.sin(camera.pitch), carPos[2] + camera.dist * Math.cos(camera.pitch) * Math.cos(camera.yaw)];
    let view = mat4.create(); mat4.lookAt(view, eye, [carPos[0], carPos[1] + 1, carPos[2]], [0, 1, 0]);
    let proj = mat4.create(); mat4.perspective(proj, Math.PI / 3, gl.canvas.width / gl.canvas.height, 0.1, 1000.0);

    // DIBUJAR LLUVIA 3D
    if (rainActive) {
        gl.useProgram(rainProgram);
        gl.uniformMatrix4fv(rainProgram.uView, false, view);
        gl.uniformMatrix4fv(rainProgram.uProj, false, proj);
        gl.uniform1f(rainProgram.uOffset, dt * 15.0); // Velocidad caída
        gl.uniform1f(rainProgram.uCarZ, carPos[2]);
        gl.bindBuffer(gl.ARRAY_BUFFER, rainModel.vbo);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        gl.drawArrays(gl.LINES, 0, rainModel.count);
    }

    // DIBUJAR SUELO
    gl.useProgram(groundProgram);
    gl.uniformMatrix4fv(groundProgram.uProj, false, proj);
    gl.uniform1f(groundProgram.uWorldZ, carPos[2]);
    gl.uniform1f(groundProgram.uTime, dt);
    gl.uniform1i(groundProgram.uFogActive, fogActive);
    let mG = mat4.create(); mat4.translate(mG, mG, [0, 0, carPos[2]]);
    gl.uniformMatrix4fv(groundProgram.uMV, false, mat4.multiply(mat4.create(), view, mG));
    drawModel(groundModel, false);

    // DIBUJAR EDIFICIOS Y COCHE
    gl.useProgram(carProgram);
    gl.uniformMatrix4fv(carProgram.uView, false, view);
    gl.uniformMatrix4fv(carProgram.uProj, false, proj);
    gl.uniform1i(carProgram.uFogActive, fogActive);
    gl.uniform1f(carProgram.uTime, dt);

    gl.uniform1i(carProgram.uIsBuilding, 1);
    buildings.forEach(b => {
        if (Math.abs(b.pos[2] - carPos[2]) < 500) {
            gl.uniform3fv(carProgram.uColor, b.color);
            let m = mat4.create(); mat4.translate(m, m, b.pos); mat4.scale(m, m, b.scale);
            gl.uniformMatrix4fv(carProgram.uModel, false, m);
            let nm = mat3.create(); mat3.normalFromMat4(nm, m);
            gl.uniformMatrix3fv(carProgram.uNorm, false, nm);
            drawModel(cubeModel, true);
        }
    });

    gl.uniform1i(carProgram.uIsBuilding, 0);
    gl.uniform3fv(carProgram.uColor, [0.1, 0.1, 0.4]);
    let mB = mat4.create(); mat4.translate(mB, mB, [carPos[0], carPos[1] + 0.4, carPos[2]]); mat4.scale(mB, mB, [1.2, 0.4, 2.0]);
    updateCarUniforms(mB); drawModel(cubeModel, true);
    let mC = mat4.create(); mat4.translate(mC, mC, [carPos[0], carPos[1] + 0.8, carPos[2] + 0.2]); mat4.scale(mC, mC, [0.8, 0.4, 0.8]);
    updateCarUniforms(mC); drawModel(cubeModel, true);

    gl.uniform3fv(carProgram.uColor, [0.05, 0.05, 0.05]);
    [[0.7, 0, 0.6], [-0.7, 0, 0.6], [0.7, 0, -0.6], [-0.7, 0, -0.6]].forEach(off => {
        let mW = mat4.create(); mat4.translate(mW, mW, [carPos[0] + off[0], carPos[1] + 0.2, carPos[2] + off[2]]);
        mat4.rotateZ(mW, mW, Math.PI / 2); mat4.rotateY(mW, mW, carPos[2] * 2); mat4.scale(mW, mW, [0.3, 0.2, 0.3]);
        updateCarUniforms(mW); drawModel(wheelModel, true);
    });
    requestAnimationFrame(render);
}

function updateCarUniforms(m) {
    gl.uniformMatrix4fv(carProgram.uModel, false, m);
    let nm = mat3.create(); mat3.normalFromMat4(nm, m);
    gl.uniformMatrix3fv(carProgram.uNorm, false, nm);
}

window.onload = init;
