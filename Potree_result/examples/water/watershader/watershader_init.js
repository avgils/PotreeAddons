var parameters = {
	width: 100,
	height: 100,
};

var INITIAL_WATER_HEIGHT = 0.2,
		MIN_WATER_HEIGHT = -2.0,
		MAX_WATER_HEIGHT = 2.0;

var waterNormals, water;
var scene_water, scene_skybox;
var waterHeight = INITIAL_WATER_HEIGHT;
var watershader = false;

function initWaterShader() {
	watershader = true;

	adaptPotreeJS();

	initWaterScene();
	initSkyboxScene();
}

function onPointCloudLoaded() {
	if (watershader) {
		onLoaded();
	}
}

function onLoaded() {
	adaptViewerJS();
	viewer.pointcloud.waterHeight = waterHeight;
}

function initWaterScene() {
	scene_water = new THREE.Scene();
	scene_skybox = new THREE.Scene();
	var light = new THREE.AmbientLight( 0x555555 );

	waterNormals = new THREE.ImageUtils.loadTexture("water/watershader/waternormals.jpg");
	waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

	water = new THREE.Water(viewer.renderer, viewer.camera, scene_water, {
		textureWidth: 512,
		textureHeight: 512,
		waterNormals: waterNormals,
		alpha: 1.0,
		sunDirection: light.position.clone().normalize(),
		sunColor: 0xffffff,
		waterColor: 0x001e0f,
		distortionScale: 50.0,
	});
	scene_water.add(water);

	mirrorMesh = new THREE.Mesh(
		new THREE.PlaneBufferGeometry(parameters.width, parameters.height),
		water.material
	);

	mirrorMesh.add(water);
	mirrorMesh.rotation.x = -Math.PI * 0.5;
	mirrorMesh.position.y = waterHeight;
	scene_water.add(mirrorMesh);
}

function initSkyboxScene() {
	var cubeMap = new THREE.CubeTexture([]);
	cubeMap.format = THREE.RGBFormat;

	var loader = new THREE.ImageLoader();
	loader.load("water/skybox/skyboxsun25degtest.png", function(image) {

		var getSide = function(x, y) {
			var size = 1024;

			var canvas = document.createElement("canvas");
			canvas.width = size;
			canvas.height = size;

			var context = canvas.getContext("2d");
			context.drawImage(image, -x * size, -y * size);

			return canvas;
		};

		cubeMap.images[0] = getSide(2, 1); // px
		cubeMap.images[1] = getSide(0, 1); // nx
		cubeMap.images[2] = getSide(1, 0); // py
		cubeMap.images[3] = getSide(1, 2); // ny
		cubeMap.images[4] = getSide(1, 1); // pz
		cubeMap.images[5] = getSide(3, 1); // nz
		cubeMap.needsUpdate = true;
	});

	var cubeShader = THREE.ShaderLib["cube"];
	var uniforms = THREE.UniformsUtils.clone(cubeShader.uniforms);
	uniforms["tCube"].value = cubeMap;

	var skyBoxMaterial = new THREE.ShaderMaterial({
		fragmentShader: cubeShader.fragmentShader,
		vertexShader: cubeShader.vertexShader,
		uniforms: uniforms,
		depthWrite: false,
		side: THREE.BackSide
	});

	var skyBox = new THREE.Mesh(
		new THREE.BoxGeometry(1000000, 1000000, 1000000),
		skyBoxMaterial
	);

	scene_skybox.add(skyBox);
}

function adaptViewerJS() {
	// Add listener function which is called before the pointcloud is rendered.
	viewer.addBeforePointCloudRenderer(renderWaterShader);

	// Add a gui slider for the water height to the viewer.
	params["waterHeight"] = waterHeight;
	var pHeightShader = viewer.gui.__folders.Appearance.add(
			params, "waterHeight", MIN_WATER_HEIGHT, MAX_WATER_HEIGHT);
	pHeightShader.onChange(function(value) {
	  waterHeight = value;
	});
}

function adaptPotreeJS() {
	adaptClipping();
	addProperty();
}

// Add clipping lines to the vertex shader, so that point below water are clipped.
function adaptClipping() {
	var lines = Potree.Shaders["pointcloud.vs"].split("\n");
	var insertInitAtIdx = 0;
	var insertClippingAtIdx = 0;

	for (var idx = 0; idx < lines.length; idx++) {
		if (lines[idx].indexOf("CLIPPING") > -1) {
			insertClippingAtIdx = idx + 2;
		} else if (lines[idx].indexOf("uniform float heightMin;") > -1) {
			insertInitAtIdx = idx - 1;
		}
	}

	var linesToInsertInit = [
		"uniform float waterHeight;",
	];

	var linesToInsertClipping = [
		"	",
		"	// CLIP IF POINT IS UNDER WATERLEVEL",
		"	if (worldPosition.y < waterHeight) {",
		"		gl_Position = vec4(1000.0, 1000.0, 1000.0, 1.0);",
		"	}"
	];

	insertLines(linesToInsertInit, lines, insertInitAtIdx);
	insertLines(linesToInsertClipping, lines, insertClippingAtIdx);
	Potree.Shaders["pointcloud.vs"] = lines.join("\n");
}

// Add the waterHeight property to the pointcloud material.
function addProperty() {
	Object.defineProperty(Potree.PointCloudMaterial.prototype, "waterHeight", {
		get: function(){
			if (!this.uniforms.waterHeight) {
				this.uniforms.waterHeight = { type: "f", value: 0.0 };
			}
			return this.uniforms.waterHeight.value;
		},
		set: function(value){
			if (!this.uniforms.waterHeight) {
				this.uniforms.waterHeight = { type: "f", value: 0.0 };
			}
			this.uniforms.waterHeight.value = value;
		}
	});
}

function insertLines(lines, array, atIndex) {
	for (var i = 0; i < lines.length; i++) {
		array.splice(atIndex + i, 0, lines[i]);
	}
}

// Render listener function
function renderWaterShader(renderer, camera) {
	// Render water and skybox
	renderer.render(scene_water, camera);
	renderer.render(scene_skybox, camera);

	// Reset to the current waterHeight.
	mirrorMesh.position.y = waterHeight;
	viewer.pointcloud.waterHeight = waterHeight;

	// Render the water movement.
	water.render();
	water.material.uniforms.time.value += 1.0 / 60.0;
}
