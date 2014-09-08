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

cube.addCubesToScene = function (item, scene, renderer) {

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

