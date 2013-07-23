(function (mc) {
    var extend = function (base, ex) {
        for (var key in ex) {
            if (ex.hasOwnProperty(key)) {
                base[key] = ex[key];
            }
        }
    };

    var mod = function (n1, n2) {
        return ((n1 % n2) + n2) % n2;
    }

    mc.textures = {
        terrain: THREE.ImageUtils.loadTexture('img/terrain.png')
    };
    mc.textures.terrain.magFilter = THREE.NearestFilter;
    mc.shaders.terrain.map = mc.textures.terrain;
    mc.shaders.terrain.uniforms.map.value = mc.textures.terrain;
    mc.materials = {
        terrain: mc.shaders.terrain
    };

    mc.Minecraft = function (container, width, height) {
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0xbfd1e5);

        this.element = this.renderer.domElement;
        this.element.setAttribute('tabindex', '0');

        var keysDown = this.keysDown = [];
        var mouseMovement = this.mouseMovement = new THREE.Vector2(0, 0);

        for (var i = 0; i < 255; i++) {
            this.keysDown[i] = false;
        }

        var self = this;
        
        this.element.addEventListener('click', function (e) {
            self.element.webkitRequestPointerLock();
        });
        this.element.addEventListener('keydown', function (e) {
            keysDown[e.keyCode] = true;
        }, false);

        this.element.addEventListener('keyup', function (e) {
            keysDown[e.keyCode] = false;
        }, false);

        this.element.addEventListener('mousemove', function (e) {
            mouseMovement.x = e.webkitMovementX;
            mouseMovement.y = e.webkitMovementY;
        }, false);

        this.scene = new THREE.Scene();

        this.scene.add(new THREE.AmbientLight(0x666644));

        var light = new THREE.PointLight(0x4c3d26, 6, 8);
        this.scene.add(light);
        /*var l1 = new THREE.Mesh(new THREE.SphereGeometry( 0.125, 16, 8 ), new THREE.MeshBasicMaterial({ color: 0xff0040 }));
        l1.position = light.position;
        this.scene.add(l1);*/

        this.world = new mc.World(this, region);
        this.player = new mc.Player(this.world, 'Player', new THREE.PerspectiveCamera(120, width / height, 0.001, 20000));

        this.player.camera.position.set(318, 89, 143);
        light.position = this.player.object.position;

        container.appendChild(this.renderer.domElement);
        this.render();
    };
    extend(mc.Minecraft.prototype, {
        render: function () {
            var render;
            render = (function () {
                webkitRequestAnimationFrame(render);
                this.player.step();
                this.step();
                this.renderer.render(this.scene, this.player.camera);
            }).bind(this);
            render();
        },
        step: function () {
            this.mouseMovement.x = 0;
            this.mouseMovement.y = 0;
        }
    });

    mc.Player = function (world, name, camera) {
        this.world = world;
        this.name = name;
        if (camera) {
            this.camera = camera;
        }
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.object = camera;
        this.target = new THREE.Vector3(0, 0, 0);
        this.lon = 0;
        this.lat = 0;
        this.phi = 0;
        this.theta = 0;
        this.speed = 0.1;

        this.world.mc.element.addEventListener('keypress', function (e) {
            switch (String.fromCharCode(e.keyCode)) {
            case 'f':
                this.flying = !this.flying;
                break;
            }
        }.bind(this));
    };
    extend(mc.Player.prototype, {
        step: function () {
            var lookSpeed = 0.5;

            this.lon += this.world.mc.mouseMovement.x * lookSpeed;
            this.lat -= this.world.mc.mouseMovement.y * lookSpeed;

            this.lat = THREE.Math.clamp(this.lat, -89.9, 89.9);
            this.phi = (90 - this.lat) * Math.PI / 180;
            this.theta = this.lon * Math.PI / 180;

            var targetPosition = this.target,
                position = this.object.position;

            targetPosition.x = position.x + 100 * Math.sin(this.phi) * Math.cos(this.theta);
            targetPosition.y = position.y + 100 * Math.cos(this.phi);
            targetPosition.z = position.z + 100 * Math.sin(this.phi) * Math.sin(this.theta);
            this.object.lookAt(targetPosition);

            if (this.flying) {
                this.velocity.set(0, 0, 0);
                if (this.world.mc.keysDown[32]) { // up
                    this.velocity.y = this.speed;
                }
                if (this.world.mc.keysDown[16]) { // down
                    this.velocity.y = -this.speed;
                }
            } else {
                this.velocity.x = 0;
                this.velocity.y -= 0.01;
                this.velocity.z = 0;
                if (this.world.mc.keysDown[32] && this.onGround) { // jump
                    this.velocity.y = Math.sqrt(0.02);
                }
            }

            var horizontal = new THREE.Vector3();
            var c = Math.cos(this.theta);
            var s = Math.sin(this.theta);
            if (this.world.mc.keysDown[65]) { // left
                horizontal.x += s;
                horizontal.z -= c;
            }
            if (this.world.mc.keysDown[68]) { // right
                horizontal.x -= s;
                horizontal.z += c;
            }
            if (this.world.mc.keysDown[87]) { // forward
                horizontal.x += c;
                horizontal.z += s;
            }
            if (this.world.mc.keysDown[83]) { // backward
                horizontal.x -= c;
                horizontal.z -= s;
            }
            this.velocity.add(horizontal.normalize().multiplyScalar(this.speed));

            this.object.position.add(this.velocity);

            if (!this.flying) {
                this.correctCollision();
            }

            var chunks = this.world.chunks;
            var cx = this.object.position.x >> 4;
            var cy = this.object.position.z >> 4;
            var chunk;

            var self = this;
            Object.keys(chunks).forEach(function (c) {
                var chunk = chunks[c];
                if ((chunk.x < cx - 4) || (chunk.x > cx + 4) || (chunk.y < cy - 4) || (chunk.y > cy + 4)) {
                    self.world.unloadChunk(chunk.x, chunk.y);
                }
            });
            for (var x = cx - 3; x < cx + 3; x++) {
                for (var y = cy - 3; y < cy + 3; y++) {
                    if (!this.world.getChunk(x, y)) {
                        this.world.loadChunk(x, y);
                    }
                }
            }
            this.world.rebuildDirty();
        },
        correctCollision: function () {
            var oldbb = this.getBoundingBox().translate(this.velocity.clone().negate());
            var newbb = this.getBoundingBox(),
                bb = oldbb.clone().union(newbb),
                blocks = [];
            for (var x = Math.floor(bb.min.x); x < bb.max.x; x++) {
                for (var y = Math.floor(bb.min.y); y < bb.max.y; y++) {
                    for (var z = Math.floor(bb.min.z); z < bb.max.z; z++) {
                        if (this.world.isBlockSolid(x, y, z)) {
                            blocks.push(new THREE.Box3(new THREE.Vector3(x, y, z), new THREE.Vector3(x + 1, y + 1, z + 1)));
                        }
                    }
                }
            }

            function intersects(a, b) {
                var epsilon = 0.0001;
                return !(a.max.x <= b.min.x + epsilon || a.min.x >= b.max.x - epsilon || a.max.y <= b.min.y + epsilon || a.min.y >= b.max.y - epsilon)
            }

            var dir;
            var playerFace;
            var axes = [['x', 'y', 'z', 0.2, -0.2], ['y', 'x', 'z', 1.5, -0.3], ['z', 'x', 'y', 0.2, -0.2]];
            while (true) {
                var min = {
                    axis: -1,
                    time: Infinity,
                    pos: 0
                };
                for (var a = 0; a < axes.length; a++) {
                    var axis = axes[a];
                    if (this.velocity[axis[0]]) {
                        dir = this.velocity[axis[0]] > 0 ? 'min' : 'max';
                        playerFace = {
                            pos: oldbb[this.velocity[axis[0]] < 0 ? 'min' : 'max'][axis[0]],
                            box: new THREE.Box2(new THREE.Vector2(oldbb.min[axis[1]], oldbb.min[axis[2]]), new THREE.Vector2(oldbb.max[axis[1]], oldbb.max[axis[2]]))
                        };
                        var n = this.velocity[axis[0]] > 0 ? Infinity : -Infinity,
                            minT = Infinity;
                        for (var i = 0; i < blocks.length; i++) {
                            var block = blocks[i],
                                face = {
                                    pos: block[dir][axis[0]],
                                    box: new THREE.Box2(new THREE.Vector2(block.min[axis[1]], block.min[axis[2]]), new THREE.Vector2(block.max[axis[1]], block.max[axis[2]]))
                                },
                                t = (face.pos - playerFace.pos) / this.velocity[axis[0]];
                            if (t >= 0 && intersects(face.box, playerFace.box.clone().translate(new THREE.Vector2(this.velocity[axis[1]] * t, this.velocity[axis[2]] * t)))) {
                                n = Math[dir](face.pos, n);
                                minT = Math.min(minT, t);
                            }
                        }
                        if (axis[0] === 'y') {
                            this.onGround = isFinite(n) && this.velocity.y < 0;
                        }
                        if (isFinite(n)) {
                            if (min.time > minT) {
                                min = {
                                    axis: a,
                                    time: minT,
                                    pos: n + (this.velocity[axis[0]] < 0 ? axis[3] + 0.0001: axis[4] - 0.0001)
                                }
                            }
                        }
                    }
                }
                if (min.axis === -1) {
                    break;
                } else {
                    var axis = axes[min.axis];
                    this.object.position[axis[0]] = min.pos;
                    this.velocity[axis[0]] = 0;
                    axes.splice(min.axis, 1);
                    min.axis = -1;
                }
            }
        },
        getBoundingBox: function () {
            var p = this.object.position;
            return new THREE.Box3(new THREE.Vector3(p.x - 0.2, p.y - 1.5, p.z - 0.2), new THREE.Vector3(p.x + 0.2, p.y + 0.3, p.z + 0.2));
        }
    });

    mc.Server = function (address) {
        this.address = address;
        this.socket = new WebSocket(address);
        this.socket.onmessage = this.onmessage;
    };
    extend(mc.Server.prototype, {
        onmessage: function (data) {
            console.log(data);
        }
    })

    mc.World = function (inst, data) {
        this.mc = inst;
        this.chunks = {};
        this.chunkLoader = new mc.AnvilChunkLoader(this, data);
    };
    mc.CHUNK_SIZE = 16;
    mc.WORLD_HEIGHT = 256;
    extend(mc.World.prototype, {
        loadChunk: function (x, y) {
            var chunk = new mc.Chunk(this, x, y, this.chunkLoader.load(x, y));
            this.setChunk(x, y, chunk);

            var c = this.getChunk(x + 1, y);
            if (c) c.dirty = true;
            c = this.getChunk(x - 1, y);
            if (c) c.dirty = true;
            c = this.getChunk(x, y + 1);
            if (c) c.dirty = true;
            c = this.getChunk(x, y - 1);
            if (c) c.dirty = true;
        },
        unloadChunk: function (x, y) {
            var mesh = this.getChunk(x, y).mesh;
            if (!mesh) {
                return;
            }
            this.mc.scene.remove(mesh);
            for (var i = 0; i < 16; i++) {
                mesh.children[i].geometry.dispose();
            }
            delete this.chunks[this.chunkKey(x, y)];
        },
        chunkKey: function (x, y) {
            return x + '_' + y;
        },
        rebuildDirty: function () {
            var chunks = this.chunks;
            Object.keys(chunks).forEach(function (v) {
                var chunk = chunks[v];
                if (chunk.dirty) {
                    chunk.buildMesh();
                }
            });
        },

        getChunk: function (x, y) {
            return this.chunks[this.chunkKey(x, y)];
        },
        setChunk: function (x, y, chunk) {
            return this.chunks[this.chunkKey(x, y)] = chunk;
        },

        getBlock: function (x, y, z) {
            var mx = mod(x, mc.CHUNK_SIZE);
            var mz = mod(z, mc.CHUNK_SIZE);
            var chunk = this.getChunk((x - mx) / mc.CHUNK_SIZE, (z - mz) / mc.CHUNK_SIZE);
            return chunk ? chunk.getBlock(mx, y, mz) : 0;
        },
        isBlockSolid: function (x, y, z) {
            var mx = mod(x, mc.CHUNK_SIZE);
            var mz = mod(z, mc.CHUNK_SIZE);
            var chunk = this.getChunk((x - mx) / mc.CHUNK_SIZE, (z - mz) / mc.CHUNK_SIZE);
            return chunk ? chunk.isBlockSolid(mx, y, mz) : 0;
        },

        updateGeometry: function (chunk) {
            if (chunk.oldMesh) {
                this.mc.scene.remove(chunk.oldMesh);
            }

            chunk.mesh.position.x = chunk.x * mc.CHUNK_SIZE;
            chunk.mesh.position.z = chunk.y * mc.CHUNK_SIZE;
            this.mc.scene.add(chunk.mesh);
        }
    });
    
    mc.AnvilChunkLoader = function (world, data) {
        this.world = world;
        this.data = data;
        this.stream = new Streams.ReadStream(data);
        this.chunks = [];
    },
    extend(mc.AnvilChunkLoader.prototype, {
        load: function (x, y) {
            this.stream.index = 4 * (x + y * 32);
            var offset = this.stream.uint24();
            if (!offset || x < 0 || y < 0) {
                return new Uint8Array(16*16*256);
            }
            this.stream.index = offset * 0x1000;
            var size = this.stream.uint32();
            var method = this.stream.uint8();
            var chunk = mc.nbt.read(new Zlib.Inflate(new Uint8Array(this.stream.arrayBuffer(size))).decompress());
            var data = new Uint8Array(16*16*256);
            var sections = [];
            chunk.Level.Sections.forEach(function (s) {
                sections[s.Y] = s;
            });
            var section;
            for (var _x = 0; _x < 16; _x++) {
                for (var _y = 0; _y < 256; _y++) {
                    for (var _z = 0; _z < 16; _z++) {
                        section = sections[_y >> 4];
                        data[_z + _x * 16 + _y * 256] = section ? section.Blocks[(((_y % 16) * 16 + _z) * 16 + _x)] : 0;
                    }
                }
            }
            return data;
        }
    }),

    mc.Chunk = function (world, x, y, data) {
        this.world = world;
        this.x = x;
        this.y = y;
        this.data = data;
        this.dirty = true;
    }
    extend(mc.Chunk.prototype, {
        setBlock: function (x, y, z, id) {
            this.data[z + x * mc.CHUNK_SIZE + y * mc.CHUNK_SIZE * mc.CHUNK_SIZE] = id;
        },
        getBlock: function (x, y, z) {
            if (x < 0 || x >= mc.CHUNK_SIZE || y < 0 || y > mc.WORLD_HEIGHT || z < 0 || z >= mc.CHUNK_SIZE) {
                return -1;
            }
            return this.data[z + x * mc.CHUNK_SIZE + y * mc.CHUNK_SIZE * mc.CHUNK_SIZE];
        },
        
        isBlockSolid: function (x, y, z) {
            var id = this.getBlock(x, y, z);
            if (mc.models.blocks[id]) {
                return mc.models.blocks[id].solid;
            } else if (id === -1) {
                return true;
            }
            return false;
        },

        buildMesh: function () {
            if (!this.data.buffer) {
                return;
            }
            var self = this;
            var worker = new Worker('js/worker.js');
            worker.onmessage = function (e) {
                var obj = new THREE.Object3D();
                self.data = e.data.data;
                for (var i = 0; i < 16; i++) {
                    var geometry = new THREE.BufferGeometry();
                    geometry.dynamic = true;
                    geometry.attributes = e.data.attributes[i];
                    geometry.offsets = [{
                        start: 0,
                        count: geometry.attributes.index.array.length,
                        index: 0
                    }];
                    geometry.computeBoundingBox();
                    geometry.computeBoundingSphere();
                    geometry.computeVertexNormals();
                    var mesh = new THREE.Mesh(geometry, mc.materials.terrain);
                    obj.add(mesh);
                }
                self.oldMesh = self.mesh;
                self.dirty = false;
                self.mesh = obj;
                self.world.updateGeometry(self);
            }
            worker.postMessage(this.data, [self.data.buffer]);
        }
    });
    
    mc.nbt = {
        read: function (data) {
            var stream = new Streams.ReadStream(new Uint8Array(data).buffer);
            
            var id = stream.uint8();
            mc.nbt.tags.read[8](stream);
            return mc.nbt.tags.read[id](stream);
        },
        
        tags: {
            read: {
                1: function (stream) {
                    return stream.int8();
                },
                2: function (stream) {
                    return stream.int16();
                },
                3: function (stream) {
                    return stream.int32();
                },
                4: function (stream) {
                    return stream.int64();
                },
                5: function (stream) {
                    return stream.float32();
                },
                6: function (stream) {
                    return stream.float64();
                },
                7: function (stream) {
                    var size = stream.int32();
                    var array = [];
                    while (size--) {
                        array.push(stream.int8());
                    }
                    return array;
                },
                8: function (stream) {
                    return stream.utf8(stream.uint16());
                },
                9: function (stream) {
                    var id = stream.uint8();
                    var size = stream.uint32();
                    var array = [];
                    while (size--) {
                        array.push(mc.nbt.tags.read[id](stream));
                    }
                    return array;
                },
                10: function (stream) {
                    var obj = {};
                    while (true) {
                        var id = stream.uint8();
                        if (!id) {
                            break;
                        }
                        var n = mc.nbt.tags.read[8](stream);
                        var v = mc.nbt.tags.read[id](stream);
                        obj[n] = v;
                    }
                    return obj;
                },
                11: function (stream) {
                    var size = stream.int32();
                    var array = [];
                    while (size--) {
                        array.push(stream.int32());
                    }
                    return array;
                }
            }    
        }
    };
}) (mc);
 