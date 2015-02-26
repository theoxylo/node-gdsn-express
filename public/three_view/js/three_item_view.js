function TIV_Cube(item, size, material) {
  this.mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material)
  this.item = item
}

TIV_Cube.prototype.update = function (dt) {
  this.mesh.rotation.y += dt * 4
}

function init_three_view($div, items) {
  console.log('init_three_view ', $div)
  console.log('init view items ', items && items.length && items.join('|'))

  //if (!Detector.webgl) return Detector.addGetWebGLMessage();

  var camera, controls, scene, renderer, sphere, cubes
  var prevTime = Date.now()

  //var stats

  init()

  animate()

  
  function animate() {

    requestAnimationFrame(animate)

    controls.update()

    var deltaTime = Date.now() - prevTime
    prevTime += deltaTime
    deltaTime /= 1000
    //console.log('dt ', deltaTime) // DEBUG
    sphere.rotation.y += deltaTime * 5

    if (cubes) cubes.forEach(function (cube) {
      if (cube) cube.update(deltaTime)
    })

    renderer.render(scene, camera)
    //stats.update();
  }

  function init() {

    if ($div && $div.empty) $div.empty()

    var origin  = new THREE.Vector3(0.0, 0.0, 0.0)
    var gravity = new THREE.Vector3(0.0, 0.0, 0.0)

    var aspect = 4.0/3.0 // window.innerWidth/window.innerHeight

    camera = new THREE.PerspectiveCamera(60, aspect, 1, 1000)
    camera.position.z = 500

    controls = new THREE.OrbitControls(camera)
    controls.damping = 0.2

    scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0xcccccc, 0.002)

    renderer = new THREE.WebGLRenderer({antialias: false})
    renderer.setClearColor( scene.fog.color, 1 );
    renderer.setSize(800, 600)

    //var renderer = new THREE.CanvasRenderer()
    //renderer.setClearColor(0xffffff)
    //renderer.setSize(window.innerWidth, window.innerHeight)

    if ($div) $div[0].appendChild(renderer.domElement)
    else document.body.appendChild(renderer.domElement)

    /*
    stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.top = '0px';
    stats.domElement.style.zIndex = 100;
    $div[0].appendChild(stats.domElement);
    */

    sphere = new THREE.Mesh(new THREE.SphereGeometry(50,10,10), new THREE.MeshNormalMaterial())
    //sphere.position.set(-0.05, -0.05, -0.05)
    console.log('sphere pos ' + JSON.stringify(sphere.position))
    console.log('sphere rot ' + JSON.stringify(sphere.rotation))
    scene.add(sphere)


    cubes = items.map(function (item) {
      console.log('items map each ' + item.gtin)
      var material, size
      var url = item && item.images && item.images[0]
      console.log('cube img url: ' + url)
      // testing with local img:
      url = '/icon_camera.jpg'
      if (url) {
        var texture = THREE.ImageUtils.loadTexture(url)
        texture.anisotropy = renderer.getMaxAnisotropy()
        material = new THREE.MeshBasicMaterial( { map: texture } )
        size = 0.5
      }
      else {
        material = new THREE.MeshNormalMaterial()
        size = 0.4
      }
      var cube = new TIV_Cube(item, size, material)
      scene.add(cube.mesh)
      return cube
    })
    console.log('cubes ', cubes)
    cubes.forEach(function(cube) {
      console.log('cubes each test init gtin ' + cube.item.gtin)
    })
  }

}
