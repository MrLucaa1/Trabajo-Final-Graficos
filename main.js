var gl;
var carProgram, groundProgram;
var cubeModel, wheelModel, groundModel;

// Estado del juego
var carPos = [0, 0, 0];
var carSpeed = 0.0;
var maxSpeed = 0.1; // 0.1 * 200 = 20 km/h
var acceleration = 0.002;
var friction = 0.001;
var isAccelerating = false;

// Cámara
var camera = { dist: 6.0, yaw: Math.PI, pitch: 0.3 };
var drag = false, lastX = 0, lastY = 0;

// Modelos
function createCube() {
    let s = 0.5;
    let vertices = [
        // Front
        -s, -s, s, 0, 0, 1, s, -s, s, 0, 0, 1, s, s, s, 0, 0, 1, -s, s, s, 0, 0, 1,
        // Back
        -s, -s, -s, 0, 0, -1, -s, s, -s, 0, 0, -1, s, s, -s, 0, 0, -1, s, -s, -s, 0, 0, -1,
        // Top
        -s, s, -s, 0, 1, 0, -s, s, s, 0, 1, 0, s, s, s, 0, 1, 0, s, s, -s, 0, 1, 0,
        // Bottom
        -s, -s, -s, 0, -1, 0, s, -s, -s, 0, -1, 0, s, -s, s, 0, -1, 0, -s, -s, s, 0, -1, 0,
        // Right
        s, -s, -s, 1, 0, 0, s, s, -s, 1, 0, 0, s, s, s, 1, 0, 0, s, -s, s, 1, 0, 0,
        // Left
        -s, -s, -s, -1, 0, 0, -s, -s, s, -1, 0, 0, -s, s, s, -1, 0, 0, -s, s, -s, -1, 0, 0
    ];
    let indices = [];
    for (let i = 0; i < 24; i += 4) indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return { vertices, indices };
}

function createCylinder(n = 20) {
    let vertices = [];
    let indices = [];
    let r = 1.0, h = 1.0;
    // Lado
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
    let size = 100.0;
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
    model.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(model.indices), gl.STATIC_DRAW);
}

function compileShader(id, type) {
    let str = document.getElementById(id).textContent;
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

function init() {
    let canvas = document.getElementById("myCanvas");
    gl = canvas.getContext("webgl2");
    if (!gl) return alert("WebGL 2 not supported");

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.02, 0.02, 0.05, 1.0);

    // Programas
    carProgram = createProgram("carVertexShader", "carFragmentShader");
    groundProgram = createProgram("groundVertexShader", "groundFragmentShader");

    // Uniforms Car
    carProgram.uModel = gl.getUniformLocation(carProgram, "modelMatrix");
    carProgram.uView = gl.getUniformLocation(carProgram, "viewMatrix");
    carProgram.uProj = gl.getUniformLocation(carProgram, "projectionMatrix");
    carProgram.uNorm = gl.getUniformLocation(carProgram, "normalMatrix");
    carProgram.uLight = gl.getUniformLocation(carProgram, "lightPos");
    carProgram.uColor = gl.getUniformLocation(carProgram, "carColor");

    // Uniforms Ground
    groundProgram.uMV = gl.getUniformLocation(groundProgram, "modelViewMatrix");
    groundProgram.uProj = gl.getUniformLocation(groundProgram, "projectionMatrix");
    groundProgram.uWorldZ = gl.getUniformLocation(groundProgram, "worldZ");
    groundProgram.uTime = gl.getUniformLocation(groundProgram, "time");

    // Modelos
    cubeModel = createCube(); initBuffers(cubeModel);
    wheelModel = createCylinder(); initBuffers(wheelModel);
    groundModel = createGround(); initBuffers(groundModel);

    // Eventos
    window.onkeydown = e => { if (e.key.toLowerCase() === 'w') isAccelerating = true; };
    window.onkeyup = e => { if (e.key.toLowerCase() === 'w') isAccelerating = false; };

    canvas.onpointerdown = e => { drag = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointerup = e => { drag = false; };
    canvas.onpointermove = e => {
        if (!drag) return;
        camera.yaw += (e.clientX - lastX) * 0.005;
        camera.pitch = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, camera.pitch + (e.clientY - lastY) * 0.005));
        lastX = e.clientX; lastY = e.clientY;
    };
    window.onresize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.onresize();

    requestAnimationFrame(render);
}

function drawModel(model, program, isCar = true) {
    gl.bindBuffer(gl.ARRAY_BUFFER, model.vbo);
    // Pos: loc 0, Norm: loc 1
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
    time *= 0.001;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Lógica de movimiento
    if (isAccelerating) carSpeed = Math.min(maxSpeed, carSpeed + acceleration);
    else carSpeed = Math.max(0, carSpeed - friction);
    carPos[2] -= carSpeed;

    document.getElementById("speed-value").innerText = Math.round(carSpeed * 200);

    // Matrices Cámara (Sigue al coche)
    let eye = [
        carPos[0] + camera.dist * Math.cos(camera.pitch) * Math.sin(camera.yaw),
        carPos[1] + camera.dist * Math.sin(camera.pitch),
        carPos[2] + camera.dist * Math.cos(camera.pitch) * Math.cos(camera.yaw)
    ];
    let view = mat4.create();
    mat4.lookAt(view, eye, [carPos[0], carPos[1] + 1, carPos[2]], [0, 1, 0]);

    let proj = mat4.create();
    mat4.perspective(proj, Math.PI / 3, gl.canvas.width / gl.canvas.height, 0.1, 1000.0);

    // ---- DIBUJAR SUELO ----
    gl.useProgram(groundProgram);
    gl.uniformMatrix4fv(groundProgram.uProj, false, proj);
    gl.uniform1f(groundProgram.uWorldZ, carPos[2]);
    gl.uniform1f(groundProgram.uTime, time);

    let mGround = mat4.create();
    mat4.translate(mGround, mGround, [0, 0, carPos[2]]);
    let mvGround = mat4.multiply(mat4.create(), view, mGround);
    gl.uniformMatrix4fv(groundProgram.uMV, false, mvGround);

    drawModel(groundModel, groundProgram, false);

    // ---- DIBUJAR COCHE ----
    gl.useProgram(carProgram);
    gl.uniformMatrix4fv(carProgram.uView, false, view);
    gl.uniformMatrix4fv(carProgram.uProj, false, proj);
    gl.uniform3fv(carProgram.uLight, [5, 10, carPos[2] + 5]);
    gl.uniform3fv(carProgram.uColor, [0.1, 0.1, 0.4]); // Azul oscuro base

    // Cuerpo
    let mBody = mat4.create();
    mat4.translate(mBody, mBody, [carPos[0], carPos[1] + 0.4, carPos[2]]);
    mat4.scale(mBody, mBody, [1.2, 0.4, 2.0]);
    updateCarUniforms(mBody);
    drawModel(cubeModel, carProgram);

    // Cabina
    let mCabin = mat4.create();
    mat4.translate(mCabin, mCabin, [carPos[0], carPos[1] + 0.8, carPos[2] + 0.2]);
    mat4.scale(mCabin, mCabin, [0.8, 0.4, 0.8]);
    updateCarUniforms(mCabin);
    drawModel(cubeModel, carProgram);

    // Ruedas
    gl.uniform3fv(carProgram.uColor, [0.05, 0.05, 0.05]); // Ruedas negras
    let wheelOffsets = [[0.7, 0, 0.6], [-0.7, 0, 0.6], [0.7, 0, -0.6], [-0.7, 0, -0.6]];
    wheelOffsets.forEach(off => {
        let mWheel = mat4.create();
        mat4.translate(mWheel, mWheel, [carPos[0] + off[0], carPos[1] + 0.2, carPos[2] + off[2]]);
        mat4.rotateZ(mWheel, mWheel, Math.PI / 2);
        // Rotación de rodamiento basada en posición Z
        mat4.rotateY(mWheel, mWheel, carPos[2] * 2);
        mat4.scale(mWheel, mWheel, [0.3, 0.2, 0.3]);
        updateCarUniforms(mWheel);
        drawModel(wheelModel, carProgram);
    });

    requestAnimationFrame(render);
}

function updateCarUniforms(modelMatrix) {
    gl.uniformMatrix4fv(carProgram.uModel, false, modelMatrix);
    let nm = mat3.create();
    mat3.normalFromMat4(nm, modelMatrix);
    gl.uniformMatrix3fv(carProgram.uNorm, false, nm);
}

window.onload = init;
