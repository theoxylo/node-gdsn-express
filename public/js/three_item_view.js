if (window.innerWidth === 0) {
    console.log('chrome fix **************************************')
  window.innerWidth = parent.innerWidth
  window.innerHeight = parent.innerHeight
}

//alert('loading init_three_view')

var previous_init_three_view;

function init_three_view($div, items) {

    console.log('init_three_view ', $div)
    $div.empty()

    var origin  = new THREE.Vector3(0.0, 0.0, 0.0)
    var gravity = new THREE.Vector3(0.0, 0.0, 0.0)

    var scene = new THREE.Scene()

    var aspect = 4.0/3.0 // window.innerWidth/window.innerHeight

    //var camera = new THREE.Camera()
    var camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)

    //var renderer = new THREE.WebGLRenderer()
    var renderer = new THREE.CanvasRenderer()
    //renderer.setClearColor(0xffffee)
    renderer.setClearColor(0xffffff)
    
    //renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setSize(800, 600)

    $div.append($(renderer.domElement))
    //document.body.appendChild(renderer.domElement)

    var sphere = new THREE.Mesh(new THREE.SphereGeometry(.1,10,10), new THREE.MeshNormalMaterial())
    //sphere.position.set(-0.05, -0.05, -0.05)
    console.log('sphere pos ' + sphere.position)
    scene.add(sphere)

    var cubes = items.map(function (item) {
      console.log('items each ' + item.gtin)
      return addCubesToScene(item, scene, renderer)
    })
    cubes = _.flatten(cubes)
    console.log('flatten cubes ' + cubes)

    //camera.position.z = 7
    camera.position.z = 1.5
    //camera.position.z = 1.9
    camera.lookAt(origin)

    var max_x = 1.0
    var max_y = 1.0

    var prevTime = Date.now()
    var deltaTime = 0

    var render = function () {
        requestAnimationFrame(render)

        deltaTime = Date.now() - prevTime
        prevTime += deltaTime
        deltaTime /= 1000

        sphere.rotation.y += 0.05

        cubes.forEach(function (cube) {
          cube.update(deltaTime)
        })

        renderer.render(scene, camera)
    }

    render()

    return {
      // api goes here
    }
}

function addCubesToScene(item, scene, renderer) {

  var cubes_per_item = 1

  var images = ['']
  if (item.images && item.images.length) {
    images = item.images
  }

  var cubes = []
  images.forEach(function (url) {

    if (cubes.length >= cubes_per_item) return

    var material, size

    if (url) {
      console.log(url)
      var texture = THREE.ImageUtils.loadTexture(url)
      texture.anisotropy = renderer.getMaxAnisotropy()
      material = new THREE.MeshBasicMaterial( { map: texture } )
      size = 0.5
    }
    else {
      material = new THREE.MeshNormalMaterial()
      size = 0.1
    }

    var cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material)

    var cube = new Cube(cubeMesh, scene)
    cubes.push(cube)
  })

  console.log('added ' + cubes.length + ' cubes for item ' + item.gtin)
  return cubes
}

function Cube(cubeMesh, scene) {

    this.max_speed = 0.2

    var pos_x = pos_x || (Math.random() - 0.5)
    var pos_y = pos_y || (Math.random() - 0.5)
    var pos_z = pos_z || (Math.random() - 0.5)

    this.acceleration = new THREE.Vector3()
    this.velocity     = new THREE.Vector3()
    this.position     = new THREE.Vector3(pos_x, pos_y, pos_z)

    cubeMesh.position.set(pos_x, pos_y, pos_z)
    cubeMesh.rotation.set(pos_x, pos_y, pos_z)
    this.mesh = cubeMesh

    scene.add(this.mesh)
}


Cube.prototype.update = function (deltaTime) {

  //console.log('cube update')
  this.rotate(0.01, 0.01, 0.01)

  // start with gravity towards the center
  this.acceleration.copy(this.position)
  this.acceleration.negate().divideScalar(this.position.length())

  this.velocity.add(this.acceleration.multiplyScalar(deltaTime))
  if (this.velocity.length > this.max_speed) this.velocity.setLength(this.max_speed)

  this.position.add(this.velocity.clone().multiplyScalar(deltaTime))

  this.mesh.position.set(this.position.x, this.position.y, this.position.z)
}

Cube.prototype.rotate = function (x, y, z) {
  this.mesh.rotation.x += x
  this.mesh.rotation.y += y
  this.mesh.rotation.z += y
}

Cube.prototype.limitPosition = function (max_x, max_y, max_z) {

  if (this.position.x > max_x) {
      this.position.x = max_x
      this.velocity.x *= -1
  }
  else if (this.position.x < -max_x) {
      this.position.x = -max_x
      this.velocity.x *= -1
  }
  else if (this.position.x) {
  }

  if (this.position.y > max_y) {
      this.position.y = max_y
      this.velocity.y *= -1
  }
  else if (this.position.y < -max_y) {
      this.position.y = -max_y
      this.velocity.y *= -1
  }

  this.mesh.position.set(this.position.x, this.position.y, this.position.z)
}
